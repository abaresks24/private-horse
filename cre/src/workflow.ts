// ============================================================================
//  Sieve CRE workflow — THE HERO OF THE CRE BOUNTY.
// ============================================================================
//
//  Every ~30s (cron):
//    1. Read new deposits from the Solana program via HTTP RPC  (CRE Solana = write-only,
//       so reads go through the http capability hitting a Solana RPC endpoint).
//    2. For each deposit, each DON node independently traces the funds' PROVENANCE across
//       multiple sources (TRM / Elliptic / OFAC / ...). Off-chain, disagreeing data => the DON
//       is load-bearing, not ceremony.
//    3. k-of-n decision per deposit -> the clean set. APPEND-ONLY (never removes).
//    4. Compute the ASP Merkle root. DON reaches consensus on the root (identical aggregation —
//       all honest nodes compute the same deterministic root).
//    5. Write a DON-signed report to the Anchor program's on_report via the Keystone Forwarder.
//
//  NOTE: this targets the @chainlink/cre-sdk surface we verified (runInNodeMode + consensus
//  aggregation + http + solana write). Pin the SDK version and adjust import names to match your
//  installed @chainlink/cre-sdk; the control flow is what matters.

import {
  cre,
  consensusIdenticalAggregation,
  type Runtime,
} from "@chainlink/cre-sdk";
import config from "../config.json" assert { type: "json" };
import { traceAddress, isClean, disagreement, type ProvenanceSource } from "./provenance.js";
import { AppendOnlyMerkleTree } from "./merkle.js";

// --- RPC helpers (read-only; CRE cannot natively read Solana yet) -----------------------------

interface DepositRecord {
  commitment: bigint;
  depositor: string;
  leafIndex: number;
}

// DepositRecord account size: 8 (disc) + 32 (depositor) + 8 (leaf_index) + 32 (commitment) + 8 (slot)
const DEPOSIT_RECORD_SIZE = 88;

/** Fetch DepositRecord accounts via getProgramAccounts over HTTP RPC (filtered by exact size). */
async function fetchDeposits(
  runtime: Runtime,
  rpcUrl: string,
  programId: string
): Promise<DepositRecord[]> {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getProgramAccounts",
    params: [programId, { encoding: "base64", filters: [{ dataSize: DEPOSIT_RECORD_SIZE }] }],
  };
  const res = await runtime.http.sendRequest({
    url: rpcUrl,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = JSON.parse(res.body);
  return (json.result ?? [])
    .map((acct: any) => decodeDepositRecord(acct))
    .sort((a: DepositRecord, b: DepositRecord) => a.leafIndex - b.leafIndex);
}

/** Decode a base64 DepositRecord account into { commitment, depositor(base58), leafIndex }. */
function decodeDepositRecord(acct: any): DepositRecord {
  const data = Buffer.from(acct.account.data[0], "base64");
  // layout (little-endian for u64, raw bytes for pubkey, big-endian field for commitment):
  //   [0..8] disc | [8..40] depositor | [40..48] leaf_index u64 LE | [48..80] commitment BE | [80..88] slot
  const depositor = bs58encode(data.subarray(8, 40));
  const leafIndex = Number(data.readBigUInt64LE(40));
  const commitment = BigInt("0x" + data.subarray(48, 80).toString("hex")); // big-endian
  return { commitment, depositor, leafIndex };
}

// Minimal base58 (Bitcoin alphabet) encoder for pubkeys — avoids pulling a dep into the workflow.
function bs58encode(bytes: Uint8Array): string {
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let x = BigInt("0x" + Buffer.from(bytes).toString("hex"));
  let out = "";
  while (x > 0n) {
    const r = Number(x % 58n);
    x /= 58n;
    out = A[r] + out;
  }
  for (const b of bytes) {
    if (b === 0) out = "1" + out;
    else break;
  }
  return out;
}

// --- Main workflow ----------------------------------------------------------------------------

// Clean set persists across cron runs (append-only). In CRE, persist via the workflow's durable
// store; kept module-level here for the simulator.
let cleanTree: AppendOnlyMerkleTree | null = null;
let epoch = 0;

async function onCron(runtime: Runtime) {
  const { rpcUrl, programId } = config.solana;
  const sources = config.provenance.sources as ProvenanceSource[];
  const quorum = config.provenance.quorum;

  if (!cleanTree) cleanTree = await AppendOnlyMerkleTree.create();

  // 1. Read new deposits (via RPC over the http capability).
  const deposits = await fetchDeposits(runtime, rpcUrl, programId);

  // 2+3. Per node, trace provenance and compute the APPEND-ONLY clean set, then agree on the ROOT.
  //      runInNodeMode: each DON node runs this; consensusIdenticalAggregation forces all honest
  //      nodes to agree on the exact same deterministic root (or no report is produced).
  const aspRootHex = await runtime
    .runInNodeMode(async () => {
      for (const d of deposits) {
        const verdicts = await traceAddress(d.depositor, sources, (url) =>
          runtime.http.sendRequest({ url, method: "GET" }).then((r) => JSON.parse(r.body))
        );
        if (disagreement(verdicts)) {
          runtime.log(`⚖️  sources disagree on ${d.depositor} — consensus decides`);
        }
        if (isClean(verdicts, quorum)) {
          cleanTree!.add(d.commitment); // append-only: never removed
        }
      }
      return cleanTree!.rootHex();
    }, consensusIdenticalAggregation())()
    .then((r) => r.result());

  // 4. Build the report. Epoch is monotonic (enforced on-chain in on_report).
  epoch += 1;
  const report = encodeAspReport({
    aspRoot: hexTo32Bytes(aspRootHex),
    epoch,
    cleanCount: cleanTree.count,
  });

  // 5. Write the DON-signed report to Solana via the Keystone Forwarder -> on_report.
  await runtime.solana.writeReport({
    programId,
    instruction: "on_report",
    report,
  });

  runtime.log(`✅ ASP root written · epoch=${epoch} · clean=${cleanTree.count} · root=${aspRootHex}`);
}

// --- Report encoding (MUST match programs/sieve/src/state.rs::AspReport, Borsh) ----------------

function encodeAspReport(r: { aspRoot: Uint8Array; epoch: number; cleanCount: number }): Uint8Array {
  // Borsh: [32]u8 asp_root || u64 epoch (LE) || u64 clean_count (LE)
  const out = new Uint8Array(32 + 8 + 8);
  out.set(r.aspRoot, 0);
  new DataView(out.buffer).setBigUint64(32, BigInt(r.epoch), true);
  new DataView(out.buffer).setBigUint64(40, BigInt(r.cleanCount), true);
  return out;
}

function hexTo32Bytes(hex: string): Uint8Array {
  const h = hex.replace(/^0x/, "").padStart(64, "0");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Register the cron-triggered workflow.
export default cre.workflow({
  triggers: [cre.cron({ schedule: config.schedule })],
  handler: onCron,
});

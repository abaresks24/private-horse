// ============================================================================
//  Private Horse CRE workflow — the DON that maintains the clean set.
// ============================================================================
//
//  Every cron tick:
//    1. Read all DepositRecord accounts straight from the Solana program
//       (SolanaClient.getProgramAccounts — a DON-consensus read, no trusted RPC proxy).
//    2. For each depositor, each node traces provenance across multiple sources over HTTP.
//       Sources are off-chain and can DISAGREE, which is exactly why a DON — not one server —
//       is load-bearing. A deposit is clean iff >= quorum sources agree.
//    3. Append the newly-clean commitments to the association set and recompute the Poseidon
//       Merkle root. The computation is deterministic, so consensusIdenticalAggregation forces
//       every honest node onto the exact same root — or no report is produced.
//    4. Wrap the Borsh AspReport in a keystone ForwarderReport (account hash + payload), have the
//       DON sign it (runtime.report), and write it to the program's on_report via SolanaClient.
//
//  Targets @chainlink/cre-sdk v1.23.0.

import {
  cre,
  consensusIdenticalAggregation,
  type Runtime,
  type HTTPSendRequester,
  type CronPayload,
  SolanaClient,
  solanaAddressToBytes,
  solanaAccountMeta,
  solanaAccountMetasToJson,
  calculateAccountsHash,
  encodeForwarderReport,
  prepareSolanaReportRequest,
} from "@chainlink/cre-sdk";
import { AppendOnlyMerkleTree } from "./merkle";

export type Source = { name: string; url: string };
export type Config = {
  schedule: string;
  programId: string;
  poolPda: string;
  quorum: number;
  sources: Source[];
};

const DEPOSIT_RECORD_SIZE = 88; // 8 disc + 32 depositor + 8 leaf_index + 32 commitment + 8 slot

type Deposit = { depositor: string; leafIndex: number; commitmentHex: string };
type CleanSet = { clean: string[] };

// --- small byte helpers -----------------------------------------------------------------------

const toB64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

function hexTo32(hex: string): Uint8Array {
  const h = hex.replace(/^0x/, "").padStart(64, "0");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// Minimal base58 (Bitcoin alphabet) encoder — avoids pulling a dep into the workflow bundle.
function bs58(bytes: Uint8Array): string {
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let x = BigInt("0x" + Buffer.from(bytes).toString("hex"));
  let out = "";
  while (x > 0n) { out = A[Number(x % 58n)] + out; x /= 58n; }
  for (const b of bytes) { if (b === 0) out = "1" + out; else break; }
  return out;
}

/** Borsh AspReport — MUST match programs/sieve/src/state.rs: [32]u8 root || u64 epoch || u64 clean_count (LE). */
function encodeAspReport(aspRoot: Uint8Array, epoch: bigint, cleanCount: bigint): Uint8Array {
  const out = new Uint8Array(32 + 8 + 8);
  out.set(aspRoot, 0);
  const dv = new DataView(out.buffer);
  dv.setBigUint64(32, epoch, true);
  dv.setBigUint64(40, cleanCount, true);
  return out;
}

// --- per-node provenance trace (runs inside the HTTP capability, consensus-aggregated) --------

const traceCleanSet = (
  http: HTTPSendRequester,
  arg: { deposits: Deposit[]; sources: Source[]; quorum: number },
): CleanSet => {
  const clean: string[] = [];
  for (const d of arg.deposits) {
    let votes = 0;
    for (const s of arg.sources) {
      const resp = http.sendRequest({ method: "GET", url: `${s.url}${d.depositor}` }).result();
      if (resp.statusCode === 200) {
        try {
          const body = JSON.parse(Buffer.from(resp.body).toString("utf-8"));
          if (body?.clean) votes++;
        } catch { /* malformed source -> no vote (fail closed) */ }
      }
    }
    if (votes >= arg.quorum) clean.push(d.commitmentHex);
  }
  return { clean };
};

// --- main handler -----------------------------------------------------------------------------

export const onCronTrigger = (runtime: Runtime<Config>, _payload: CronPayload): string => {
  const cfg = runtime.config;
  const solana = new SolanaClient(SolanaClient.SUPPORTED_CHAIN_SELECTORS["solana-devnet"]);

  // 1. Read every DepositRecord straight from the program (consensus read).
  const reply = solana
    .getProgramAccounts(runtime, {
      program: toB64(solanaAddressToBytes(cfg.programId)),
      opts: {
        encoding: "ENCODING_TYPE_BASE64",
        commitment: "COMMITMENT_TYPE_CONFIRMED",
        filters: [{ dataSize: String(DEPOSIT_RECORD_SIZE) }],
      },
    })
    .result();

  const deposits: Deposit[] = (reply.value ?? [])
    .map((ka): Deposit => {
      const body = ka.account?.data?.body;
      const data = Buffer.from(body?.case === "raw" ? body.value : new Uint8Array(0));
      return {
        depositor: bs58(data.subarray(8, 40)),
        leafIndex: Number(data.readBigUInt64LE(40)),
        commitmentHex: "0x" + data.subarray(48, 80).toString("hex"),
      };
    })
    .sort((a, b) => a.leafIndex - b.leafIndex);

  runtime.log(`read ${deposits.length} deposit(s) from ${cfg.programId}`);

  // 2+3. Trace provenance over HTTP; identical aggregation forces one agreed clean set & root.
  const http = new cre.capabilities.HTTPClient();
  const { clean } = http
    .sendRequest(runtime, traceCleanSet, consensusIdenticalAggregation<CleanSet>())({
      deposits,
      sources: cfg.sources,
      quorum: cfg.quorum,
    })
    .result();

  const tree = new AppendOnlyMerkleTree();
  for (const h of clean) tree.add(BigInt(h));
  const rootHex = tree.rootHex();
  const epoch = BigInt(deposits.length); // monotonic as the pool grows; on_report rejects regressions
  runtime.log(`clean set: ${clean.length}/${deposits.length} · ASP root ${rootHex}`);

  // 4. Wrap in a keystone ForwarderReport, DON-sign it, and write to on_report on Solana.
  const accounts = [solanaAccountMeta(cfg.poolPda, true)];
  const forwarderPayload = encodeForwarderReport({
    accountHash: calculateAccountsHash(accounts),
    payload: encodeAspReport(hexTo32(rootHex), epoch, BigInt(tree.count)),
  });
  const report = runtime.report(prepareSolanaReportRequest(forwarderPayload)).result();

  solana
    .writeReport(runtime, {
      receiver: toB64(solanaAddressToBytes(cfg.programId)),
      remainingAccounts: solanaAccountMetasToJson(accounts),
      report,
    })
    .result();

  runtime.log(`✅ ASP root written · epoch=${epoch} · clean=${tree.count}`);
  return rootHex;
};

export function initWorkflow(config: Config) {
  const cron = new cre.capabilities.CronCapability();
  return [cre.handler(cron.trigger({ schedule: config.schedule }), onCronTrigger)];
}

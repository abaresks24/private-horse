// Keeper: publish the ASP (clean-set) Merkle root on-chain via on_report, signed by the forwarder
// authority. For the deployed demo the clean set = all current deposits (faucet funds are clean;
// the DON gatekeeper's dirty-flipping is the local demo). This is the serverless route's logic.
//   ANCHOR_PROVIDER_URL=<helius> ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/keeper.ts
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { buildPoseidon } from "circomlibjs";
const idl = require("../target/idl/sieve.json");

const PID = new PublicKey("4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X");
const seed = (s: string) => new TextEncoder().encode(s);
const LEVELS = 20;
const feToBytes = (x: bigint) => { const h = x.toString(16).padStart(64, "0"); return (h.match(/.{2}/g) as string[]).map((b) => parseInt(b, 16)); };

async function merkleRoot(leaves: bigint[], p: any): Promise<bigint> {
  const F = p.F; const H = (a: bigint, b: bigint) => F.toObject(p([a, b]));
  const zeros = [0n]; for (let i = 1; i <= LEVELS; i++) zeros.push(H(zeros[i - 1], zeros[i - 1]));
  let lvl = leaves.length ? [...leaves] : [0n];
  for (let h = 0; h < LEVELS; h++) {
    const n: bigint[] = [];
    for (let i = 0; i < lvl.length; i += 2) n.push(H(lvl[i], i + 1 < lvl.length ? lvl[i + 1] : zeros[h]));
    lvl = n.length ? n : [zeros[h + 1]];
  }
  return lvl[0];
}

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl as anchor.Idl, provider as any);
  const conn = provider.connection;
  const forwarder = Keypair.fromSeed(Uint8Array.from(new Array(32).fill(7)));

  const [pool] = PublicKey.findProgramAddressSync([seed("pool2")], PID);

  // read all deposits (size-88 accounts), commitments at bytes [48..80] big-endian, sorted by leafIndex
  const accts = await conn.getProgramAccounts(PID, { filters: [{ dataSize: 88 }] });
  const deposits = accts.map(({ account }) => {
    const d = account.data as Buffer;
    return { leafIndex: Number(d.readBigUInt64LE(40)), commitment: BigInt("0x" + d.subarray(48, 80).toString("hex")) };
  }).sort((a, b) => a.leafIndex - b.leafIndex);

  const p = await buildPoseidon();
  const root = await merkleRoot(deposits.map((d) => d.commitment), p);
  const rootBytes = feToBytes(root);

  const poolAcc: any = await (program.account as any).pool.fetch(pool);
  const known: boolean = poolAcc.aspRoots.some((r: number[]) => r.every((b, i) => b === rootBytes[i]));
  console.log(`deposits=${deposits.length} root=0x${root.toString(16)} known=${known} epoch=${poolAcc.aspEpoch}`);

  if (known) { console.log("root already published — nothing to do"); return; }

  const sig = await program.methods
    .onReport({ aspRoot: rootBytes, epoch: new anchor.BN(poolAcc.aspEpoch.toNumber() + 1), cleanCount: new anchor.BN(deposits.length) })
    .accounts({ pool, forwarder: forwarder.publicKey })
    .signers([forwarder])
    .rpc();
  console.log(`✅ ASP root published · epoch=${poolAcc.aspEpoch.toNumber() + 1} · clean=${deposits.length} · sig ${sig}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error("❌", e.message || e); process.exit(1); });

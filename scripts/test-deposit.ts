// Direct single deposit against the live v2 pool (0.1 SOL) — to diagnose the browser hang.
//   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json \
//     npx ts-node scripts/test-deposit.ts
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import { buildPoseidon } from "circomlibjs";
const idl = require("../target/idl/sieve.json");

const PID = new PublicKey("4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X");
const seed = (s: string) => new TextEncoder().encode(s);
const DENOM = 100_000_000n;
const feToBytes = (x: bigint) => { const h = x.toString(16).padStart(64, "0"); return (h.match(/.{2}/g) as string[]).map((b) => parseInt(b, 16)); };

async function main() {
  const t0 = Date.now();
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl as anchor.Idl, provider as any);

  const [pool] = PublicKey.findProgramAddressSync([seed("pool2")], PID);
  const [vault] = PublicKey.findProgramAddressSync([seed("vault2")], PID);

  const poolAcc: any = await (program.account as any).pool.fetch(pool);
  const idx = poolAcc.nextIndex.toNumber();
  console.log(`pool2 nextIndex=${idx} denom=${poolAcc.denomination.toString()} (${Date.now() - t0}ms to fetch pool)`);

  const p = await buildPoseidon();
  const secret = 12345678901234567890n, nullifier = 98765432109876543210n;
  const commitment = p.F.toObject(p([secret, nullifier, DENOM]));
  const c = feToBytes(commitment);
  const [rec] = PublicKey.findProgramAddressSync([seed("deposit2"), new anchor.BN(idx).toArrayLike(Buffer, "le", 8)], PID);

  console.log("sending deposit…");
  const t1 = Date.now();
  const sig = await program.methods.deposit(c)
    .accounts({ pool, depositRecord: rec, vault, depositor: provider.wallet.publicKey, systemProgram: SystemProgram.programId })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
    .rpc();
  console.log(`✅ deposit confirmed in ${Date.now() - t1}ms · sig ${sig}`);

  const after: any = await (program.account as any).pool.fetch(pool);
  console.log(`nextIndex now ${after.nextIndex.toString()}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error("❌", e.message || e); process.exit(1); });

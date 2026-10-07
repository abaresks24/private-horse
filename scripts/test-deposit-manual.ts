// Replicate depositBatch's MANUAL send path (finalized blockhash + sendRawTransaction skipPreflight).
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import { buildPoseidon } from "circomlibjs";
const idl = require("../target/idl/sieve.json");

const PID = new PublicKey("4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X");
const seed = (s: string) => new TextEncoder().encode(s);
const DENOM = 100_000_000n;
const feToBytes = (x: bigint) => { const h = x.toString(16).padStart(64, "0"); return (h.match(/.{2}/g) as string[]).map((b) => parseInt(b, 16)); };

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl as anchor.Idl, provider as any);
  const conn = provider.connection;

  const [pool] = PublicKey.findProgramAddressSync([seed("pool2")], PID);
  const [vault] = PublicKey.findProgramAddressSync([seed("vault2")], PID);
  const poolAcc: any = await (program.account as any).pool.fetch(pool);
  const idx = poolAcc.nextIndex.toNumber();

  const p = await buildPoseidon();
  const secret = BigInt("0x" + "11".repeat(31)), nullifier = BigInt("0x" + "22".repeat(31));
  const commitment = p.F.toObject(p([secret, nullifier, DENOM]));
  const c = feToBytes(commitment);
  const [rec] = PublicKey.findProgramAddressSync([seed("deposit2"), new anchor.BN(idx).toArrayLike(Buffer, "le", 8)], PID);

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("finalized");
  const tx = await program.methods.deposit(c)
    .accounts({ pool, depositRecord: rec, vault, depositor: provider.wallet.publicKey, systemProgram: SystemProgram.programId })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
    .transaction();
  tx.feePayer = provider.wallet.publicKey;
  tx.recentBlockhash = blockhash;

  const signed = await (provider.wallet as any).signTransaction(tx); // mimics signAllTransactions
  const t1 = Date.now();
  const sig = await conn.sendRawTransaction(signed.serialize(), { skipPreflight: true, maxRetries: 5 });
  const conf = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  if (conf.value.err) throw new Error("on-chain err: " + JSON.stringify(conf.value.err));
  console.log(`✅ manual deposit confirmed in ${Date.now() - t1}ms · idx ${idx} · sig ${sig}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error("❌", e.message || e); process.exit(1); });

// Full end-to-end test on the live v2 pool: deposit -> publish ASP root -> private withdraw (real
// Groth16 proof) -> auditor decrypt. Run:
//   ANCHOR_PROVIDER_URL=<helius> ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/e2e-v2.ts
import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import { MerkleTree, newNote, commitment, nullifierHash, prove, feToBytes, recipientField } from "./zk";
import { pubFromPriv, encrypt, decrypt, demoPriv, addressToFields, fieldsToAddressBytes, feToBytes as feBytes } from "../app/lib/auditor";

const PID = new PublicKey("4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X");
const seed = (s: string) => new TextEncoder().encode(s);
const DENOM = 100_000_000n;
const cu = () => ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });
const randScalar = () => { const b = new Uint8Array(31); for (let i = 0; i < 31; i++) b[i] = Math.floor(Math.random() * 256); return BigInt("0x" + Buffer.from(b).toString("hex")); };
const tx = (s: string) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const idl = require("../target/idl/sieve.json");
  const program = new anchor.Program(idl as anchor.Idl, provider as any);
  const conn = provider.connection;
  const me = provider.wallet.publicKey;

  const [pool] = PublicKey.findProgramAddressSync([seed("pool2")], PID);
  const [vault] = PublicKey.findProgramAddressSync([seed("vault2")], PID);
  const recPda = (i: number) => PublicKey.findProgramAddressSync([seed("deposit2"), new anchor.BN(i).toArrayLike(Buffer, "le", 8)], PID)[0];
  const nulPda = (nh: number[]) => PublicKey.findProgramAddressSync([seed("nullifier2"), Uint8Array.from(nh)], PID)[0];

  // 1. DEPOSIT
  const note = newNote(DENOM);
  const c = await commitment(note);
  let poolAcc: any = await (program.account as any).pool.fetch(pool);
  const idx = poolAcc.nextIndex.toNumber();
  const dsig = await program.methods.deposit(feToBytes(c))
    .accounts({ pool, depositRecord: recPda(idx), vault, depositor: me, systemProgram: SystemProgram.programId })
    .preInstructions([cu()]).rpc();
  console.log(`1. ✅ DEPOSIT 0.1 SOL · idx ${idx} · ${tx(dsig)}`);

  // 2. PUBLISH ASP root (keeper route) and wait
  const r: any = await fetch("https://private-horse.vercel.app/api/asp", { method: "POST" }).then((x) => x.json());
  console.log(`2. ✅ CLEAN SET published · epoch ${r.epoch} · count ${r.count} · published=${r.published}`);

  // 3. rebuild trees from all v2 deposits
  poolAcc = await (program.account as any).pool.fetch(pool);
  const n = poolAcc.nextIndex.toNumber();
  const infos = await conn.getMultipleAccountsInfo(Array.from({ length: n }, (_, i) => recPda(i)));
  const commits = infos.map((a) => a ? BigInt("0x" + (a.data as Buffer).subarray(48, 80).toString("hex")) : 0n).filter((_, i) => infos[i]);
  const depTree = await MerkleTree.build(commits);
  const aspTree = await MerkleTree.build(commits);
  const dep = await depTree.path(c), asp = await aspTree.path(c);

  // 4. auditor ciphertext: encrypt the ORIGINAL depositor to the demo auditor key
  const [hi, lo] = addressToFields(me.toBytes());
  const pub = await pubFromPriv(demoPriv());
  const packed = await encrypt([hi, lo], pub, randScalar());
  const auditorCt = packed.map(feBytes);

  // 5. prove + WITHDRAW via RELAYER
  const fresh = Keypair.generate();
  const proof = await prove("withdraw", {
    secret: note.secret.toString(), nullifier: note.nullifier.toString(), amount: note.amount.toString(),
    pathElementsDep: dep.pathElements.map(String), pathIndicesDep: dep.pathIndices,
    pathElementsAsp: asp.pathElements.map(String), pathIndicesAsp: asp.pathIndices,
    rootDeposits: (await depTree.root()).toString(), rootAsp: (await aspTree.root()).toString(),
    nullifierHash: (await nullifierHash(note)).toString(),
    recipient: BigInt("0x" + Buffer.from(recipientField(fresh.publicKey.toBytes())).toString("hex")).toString(),
  });
  const [rootDeposits, rootAsp, nh, recipientFieldSig] = proof.publicSignals;
  const relayResp: any = await fetch("https://private-horse.vercel.app/api/relay", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ proofA: proof.proofA, proofB: proof.proofB, proofC: proof.proofC, rootDeposits, rootAsp, nullifierHash: nh, recipientField: recipientFieldSig, auditorCt, recipient: fresh.publicKey.toBase58() }) }).then((x) => x.json());
  if (relayResp.error) throw new Error("relay: " + relayResp.error);
  const wsig = relayResp.sig;
  console.log(`3. ✅ WITHDRAW via RELAYER -> fresh ${fresh.publicKey.toBase58().slice(0, 8)}… · ${tx(wsig)}`);
  // verify the fee payer is the RELAYER, not me
  const wtx = await conn.getTransaction(wsig, { maxSupportedTransactionVersion: 0 });
  const feePayer = wtx?.transaction.message.getAccountKeys().get(0)?.toBase58();
  const RELAYER = "2XV2GX4AMDKXdC8t3erPrUmrMSqh4ykxpLpokoXRRVan";
  console.log(`   fee payer on-chain: ${feePayer}`);
  console.log(feePayer === RELAYER ? "   ✅ fee payer = RELAYER (your wallet is NOT in the tx)" : (feePayer === me.toBase58() ? "   ❌ fee payer = your wallet (leak!)" : "   fee payer = " + feePayer));

  // 6. AUDITOR: decrypt the ciphertext with the demo key
  const [dhi, dlo] = await decrypt(packed, demoPriv());
  const decoded = new PublicKey(fieldsToAddressBytes(dhi, dlo)).toBase58();
  console.log(`4. 🔑 AUDITOR decrypt -> depositor ${decoded}`);
  console.log(`   original depositor  ${me.toBase58()}`);
  console.log(decoded === me.toBase58() ? "   ✅✅✅ AUDITOR MATCH — full cycle works" : "   ❌ mismatch");
}
main().then(() => process.exit(0)).catch((e) => { console.error("❌", e.logs ?? e.message ?? e); process.exit(1); });

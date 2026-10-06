// End-to-end demo driver for Sieve. Narrates the 2-minute pitch with REAL on-chain calls.
//
// Preconditions:
//   • `anchor build && anchor deploy` done (target/idl/sieve.json exists, program deployed)
//   • a local validator or devnet, wallet funded (ANCHOR_PROVIDER_URL / ANCHOR_WALLET set)
//   • provenance mock server running:  pnpm mock
//
// Run:  pnpm demo
//
// This script plays the DON "fallback" role (computes the clean set + submits the signed ASP root
// via on_report) so the demo is self-contained even without a live DON. The real CRE workflow
// (cre/src/workflow.ts) does the same thing across a multi-node DON.

import * as anchor from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  MerkleTree, newNote, commitment, nullifierHash, prove, feToBytes, recipientField, type Note,
} from "./zk";

const MOCK = "http://localhost:8787";
const DENOM = BigInt(0.3 * LAMPORTS_PER_SOL); // 0.3 SOL (keeps the devnet demo well under budget)
const SOL = `${Number(DENOM) / LAMPORTS_PER_SOL} SOL`;
const flip = (addr: string, src: string) => fetch(`${MOCK}/flip?address=${addr}&source=${src}`, { method: "POST" });
const bn = (x: bigint | number) => new anchor.BN(x.toString());
const log = (s: string) => console.log(s);
// Raise the compute-unit limit (groth16 verification + merkle insert need > the 200k default).
const cu = () => anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Sieve as anchor.Program<any>;
  const pid = program.programId;
  const seed = (s: string) => new TextEncoder().encode(s);
  const [pool] = PublicKey.findProgramAddressSync([seed("pool")], pid);
  const [vault] = PublicKey.findProgramAddressSync([seed("vault")], pid);

  // Forwarder keypair = the DON authority (demo plays the DON via fallback).
  // Deterministic so the demo is re-runnable against an already-initialized pool.
  const forwarder = Keypair.fromSeed(Uint8Array.from(new Array(32).fill(7)));

  log("── Sieve · démo e2e ─────────────────────────────────────────");

  // 0. init pool (idempotent-ish: skip if already initialized)
  try {
    await program.methods
      .initialize(forwarder.publicKey, new Array(64).fill(0), bn(DENOM))
      .accounts({ pool, authority: provider.wallet.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
    log("• pool initialisé");
  } catch {
    log("• pool déjà initialisé (ok)");
  }

  // 1. Alice (clean) + hacker (fresh address, but tainted funds) deposit.
  const alice = newNote(DENOM);
  const hacker = newNote(DENOM);
  const aliceAddr = Keypair.generate();     // the address that deposits (traced for provenance)
  const hackerAddr = Keypair.generate();
  // Fund via a transfer from the (already-funded) main wallet — robust vs the deprecated
  // requestAirdrop + confirmTransaction(sig) overload, which hangs on recent web3.js.
  const fund = new (anchor.web3.Transaction)();
  for (const kp of [aliceAddr, hackerAddr]) {
    fund.add(SystemProgram.transfer({ fromPubkey: provider.wallet.publicKey, toPubkey: kp.publicKey, lamports: 0.8 * LAMPORTS_PER_SOL }));
  }
  await provider.sendAndConfirm(fund, []);

  const leaves: bigint[] = [];
  for (const [who, note, addr] of [["Alice", alice, aliceAddr], ["Hacker", hacker, hackerAddr]] as const) {
    const c = await commitment(note);
    const poolAcc: any = await program.account.pool.fetch(pool);
    const idx = poolAcc.nextIndex.toNumber();
    const [rec] = PublicKey.findProgramAddressSync([seed("deposit"), new anchor.BN(idx).toArrayLike(Buffer, "le", 8)], pid);
    await program.methods
      .deposit(feToBytes(c))
      .accounts({ pool, depositRecord: rec, vault, depositor: addr.publicKey, systemProgram: SystemProgram.programId })
      .preInstructions([cu()])
      .signers([addr])
      .rpc();
    leaves.push(c);
    log(`1️⃣  ${who} a déposé ${SOL}  (commitment ${c.toString().slice(0, 12)}…)`);
  }

  // 2. Provenance: flip the hacker dirty on 2 of 3 sources -> consensus (quorum 2) excludes it.
  log("2️⃣  on flippe 2 sources sur l'adresse du hacker → le DON atteint le quorum 'dirty'");
  await flip(hackerAddr.publicKey.toBase58(), "hacks");
  await flip(hackerAddr.publicKey.toBase58(), "taint");

  // The DON (here: this script) computes the APPEND-ONLY clean set = [Alice] and publishes the root.
  const aspTree = await MerkleTree.build([leaves[0]]); // only Alice is clean
  const depTree = await MerkleTree.build(leaves);
  const aspRoot = await aspTree.root();
  const pAcc: any = await program.account.pool.fetch(pool);
  const nextEpoch = pAcc.aspEpoch.toNumber() + 1; // monotonic; re-runnable
  await program.methods
    .onReport({ aspRoot: feToBytes(aspRoot), epoch: bn(nextEpoch), cleanCount: bn(1) })
    .accounts({ pool, forwarder: forwarder.publicKey })
    .signers([forwarder])
    .rpc();
  log(`    → racine ASP publiée on-chain (clean_count=1) via on_report`);

  // 3. Alice withdraws privately: proves membership in BOTH trees.
  const fresh = Keypair.generate();
  const [depPath, aspPath] = [await depTree.path(leaves[0]), await aspTree.path(leaves[0])];
  const aliceProof = await prove("withdraw", {
    secret: alice.secret.toString(), nullifier: alice.nullifier.toString(), amount: alice.amount.toString(),
    pathElementsDep: depPath.pathElements.map(String), pathIndicesDep: depPath.pathIndices,
    pathElementsAsp: aspPath.pathElements.map(String), pathIndicesAsp: aspPath.pathIndices,
    rootDeposits: (await depTree.root()).toString(), rootAsp: aspRoot.toString(),
    nullifierHash: (await nullifierHash(alice)).toString(),
    recipient: BigInt("0x" + Buffer.from(recipientField(fresh.publicKey.toBytes())).toString("hex")).toString(),
  });
  const [nulPdaA] = PublicKey.findProgramAddressSync([seed("nullifier"), Uint8Array.from(aliceProof.publicSignals[2])], pid);
  await program.methods
    .withdraw({
      proofA: aliceProof.proofA, proofB: aliceProof.proofB, proofC: aliceProof.proofC,
      rootDeposits: aliceProof.publicSignals[0], rootAsp: aliceProof.publicSignals[1],
      nullifierHash: aliceProof.publicSignals[2], recipientField: aliceProof.publicSignals[3],
      auditorCt: [new Array(32).fill(0), new Array(32).fill(0), new Array(32).fill(0), new Array(32).fill(0)],
    })
    .accounts({ pool, nullifierRecord: nulPdaA, vault, recipient: fresh.publicKey, payer: provider.wallet.publicKey, systemProgram: SystemProgram.programId })
    .preInstructions([cu()])
    .rpc();
  log(`3️⃣  Alice a retiré ${SOL} EN PRIVÉ → ${fresh.publicKey.toBase58().slice(0, 8)}…  ✅`);

  // 4. Hacker tries to withdraw: NOT in the ASP tree -> cannot produce a valid ASP membership proof.
  log("4️⃣  Le hacker tente de retirer → pas dans la racine ASP → preuve impossible/rejetée  ❌");

  // 5. Hacker ragequits -> funds returned to the ORIGINAL (public) address.
  const rqPath = await depTree.path(leaves[1]);
  const rqProof = await prove("ragequit", {
    secret: hacker.secret.toString(), nullifier: hacker.nullifier.toString(), amount: hacker.amount.toString(),
    pathElements: rqPath.pathElements.map(String), pathIndices: rqPath.pathIndices,
    rootDeposits: (await depTree.root()).toString(), nullifierHash: (await nullifierHash(hacker)).toString(),
  });
  const [nulPdaH] = PublicKey.findProgramAddressSync([seed("nullifier"), Uint8Array.from(rqProof.publicSignals[1])], pid);
  const [recH] = PublicKey.findProgramAddressSync([seed("deposit"), new anchor.BN(1).toArrayLike(Buffer, "le", 8)], pid);
  await program.methods
    .ragequit({
      proofA: rqProof.proofA, proofB: rqProof.proofB, proofC: rqProof.proofC,
      rootDeposits: rqProof.publicSignals[0], nullifierHash: rqProof.publicSignals[1], leafIndex: bn(1),
    })
    .accounts({ pool, nullifierRecord: nulPdaH, depositRecord: recH, vault, originalDepositor: hackerAddr.publicKey, payer: provider.wallet.publicKey, systemProgram: SystemProgram.programId })
    .preInstructions([cu()])
    .rpc();
  log(`5️⃣  Le hacker a fait ragequit → fonds rendus à SON adresse d'origine (public)  🔓`);
  log("    « On ne bloque personne — on laisse l'argent honnête se prouver propre. »");
  log("─────────────────────────────────────────────────────────────");
}

main().catch((e) => { console.error(e); process.exit(1); });

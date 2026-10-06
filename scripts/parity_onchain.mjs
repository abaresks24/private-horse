// FOOTGUN #1 — on-chain Poseidon parity. Calls poseidon_debug(1,2) on the deployed program and
// compares the logged bytes to circomlibjs Poseidon([1,2]). If equal, the native Bn254X5 syscall
// is circom-compatible and all three layers (circuit / client / on-chain) agree.
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { buildPoseidon } from "circomlibjs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import os from "node:os";

const PROGRAM_ID = new PublicKey("4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X");
const conn = new Connection("http://localhost:8899", "confirmed");
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(`${os.homedir()}/.config/solana/id.json`))));

const be32 = (n) => { const b = Buffer.alloc(32); b.writeBigUInt64BE(BigInt(n), 24); return b; };
const disc = (name) => createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);

const left = be32(1), right = be32(2);
const data = Buffer.concat([disc("poseidon_debug"), left, right]);
const ix = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: false }],
  data,
});

const sim = await conn.simulateTransaction(new Transaction().add(ix), [payer]);
const logs = sim.value.logs ?? [];
const line = logs.find((l) => l.includes("poseidon_debug:"));
if (!line) { console.error("no poseidon_debug log; logs:\n" + logs.join("\n")); process.exit(1); }

// parse "Program log: poseidon_debug: [a, b, c, ...]"
const onchain = JSON.parse(line.slice(line.indexOf("[")));
const onchainHex = Buffer.from(onchain).toString("hex");

const poseidon = await buildPoseidon();
const expected = poseidon.F.toObject(poseidon([1n, 2n]));
const expectedHex = expected.toString(16).padStart(64, "0");

console.log("on-chain  Poseidon(1,2) =", onchainHex);
console.log("circomlib Poseidon(1,2) =", expectedHex);
const ok = onchainHex === expectedHex;
console.log(ok ? "✅ PARITÉ OK — syscall natif == circomlib" : "❌ MISMATCH — paramètres Poseidon différents !");
process.exit(ok ? 0 : 1);

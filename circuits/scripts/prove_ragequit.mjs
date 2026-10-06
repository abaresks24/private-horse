// Smoke test for the ragequit circuit (single-leaf tree). Proves + verifies a real proof.
import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";
import { readFileSync } from "node:fs";

const LEVELS = 20;
const poseidon = await buildPoseidon();
const F = poseidon.F;
const H = (a) => F.toObject(poseidon(a));

const secret = 7n, nullifier = 99n, amount = 1_000_000_000n;
const commitment = H([secret, nullifier, amount]);
const nullifierHash = H([nullifier]);

const zeros = [0n];
for (let i = 1; i <= LEVELS; i++) zeros.push(H([zeros[i - 1], zeros[i - 1]]));
let cur = commitment;
const pathElements = [], pathIndices = [];
for (let i = 0; i < LEVELS; i++) { pathElements.push(zeros[i].toString()); pathIndices.push(0); cur = H([cur, zeros[i]]); }

const input = {
  secret: secret.toString(), nullifier: nullifier.toString(), amount: amount.toString(),
  pathElements, pathIndices,
  rootDeposits: cur.toString(), nullifierHash: nullifierHash.toString(),
};
const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, "build/ragequit_js/ragequit.wasm", "build/ragequit_final.zkey");
const ok = await snarkjs.groth16.verify(JSON.parse(readFileSync("build/ragequit_vk.json")), publicSignals, proof);
console.log("publicSignals:", publicSignals);
console.log(ok ? "✅ ragequit proof VERIFIED" : "❌ ragequit proof FAILED");
process.exit(ok ? 0 : 1);

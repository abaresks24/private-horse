// End-to-end ZK smoke test: build a note, a single-leaf Merkle tree, generate a real Groth16
// proof for `withdraw`, and verify it with snarkjs. Proves circuit + trusted setup are sound.
import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";
import { readFileSync } from "node:fs";

const LEVELS = 20;
const poseidon = await buildPoseidon();
const F = poseidon.F;
const H = (arr) => F.toObject(poseidon(arr));

// Note + derived values
const secret = 11n, nullifier = 22n, amount = 1_000_000_000n;
const commitment = H([secret, nullifier, amount]);
const nullifierHash = H([nullifier]);

// Precomputed zero subtree (matches merkle.rs / merkle.ts)
const zeros = [0n];
for (let i = 1; i <= LEVELS; i++) zeros.push(H([zeros[i - 1], zeros[i - 1]]));

// Single leaf at index 0 => all path bits 0, siblings are the zero subtrees.
let cur = commitment;
const pathElements = [], pathIndices = [];
for (let i = 0; i < LEVELS; i++) {
  pathElements.push(zeros[i].toString());
  pathIndices.push(0);
  cur = H([cur, zeros[i]]);
}
const root = cur;

// Deposit tree == ASP tree here (the deposit is clean). recipient bound as a field element.
const input = {
  secret: secret.toString(),
  nullifier: nullifier.toString(),
  amount: amount.toString(),
  pathElementsDep: pathElements,
  pathIndicesDep: pathIndices,
  pathElementsAsp: pathElements,
  pathIndicesAsp: pathIndices,
  rootDeposits: root.toString(),
  rootAsp: root.toString(),
  nullifierHash: nullifierHash.toString(),
  recipient: "12345678901234567890",
};

console.log("commitment   =", commitment.toString());
console.log("nullifierHash=", nullifierHash.toString());
console.log("root         =", root.toString());

const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  input,
  "build/withdraw_js/withdraw.wasm",
  "build/withdraw_final.zkey"
);
const vk = JSON.parse(readFileSync("build/withdraw_vk.json"));
const ok = await snarkjs.groth16.verify(vk, publicSignals, proof);

console.log("\npublicSignals:", publicSignals);
console.log(ok ? "✅ withdraw proof VERIFIED" : "❌ withdraw proof FAILED");
process.exit(ok ? 0 : 1);

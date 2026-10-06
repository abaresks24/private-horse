// THE FOOTGUN CHECK — run this at H4, before building anything else.
//
// The on-chain tree (light-poseidon, Bn254X5), the circuit (circomlib Poseidon), and the client
// (circomlibjs) must produce the SAME hash. If they don't, roots never match and nothing works.
//
// This test compares circomlibjs against KNOWN circom Poseidon test vectors. Then, after
// `anchor build`, extend it to call an on-chain `poseidon_debug` ix (add one temporarily) and
// compare bytes. Parity across all three = green light.

import { buildPoseidon } from "circomlibjs";
import assert from "node:assert";

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  // circomlib Poseidon known vectors (circom-compatible, BN254):
  // Poseidon([1,2]) and Poseidon([1,2,3]) — canonical values from circomlib tests.
  const h2 = F.toObject(poseidon([1n, 2n]));
  const h3 = F.toObject(poseidon([1n, 2n, 3n]));

  console.log("Poseidon(1,2)   =", h2.toString());
  console.log("Poseidon(1,2,3) =", h3.toString());

  // Reference values from circomlib (sanity — verify against your installed circomlib version):
  const EXPECTED_2 = 7853200120776062878684798364095072458815029376092732009249414926327459813530n;
  assert.strictEqual(h2, EXPECTED_2, "Poseidon(2) mismatch — circomlibjs params differ from circomlib!");

  console.log("✅ circomlibjs Poseidon(2) matches circomlib reference.");
  console.log("➡️  Next: add a temporary on-chain poseidon_debug ix and assert light-poseidon gives the same bytes.");
}

main().catch((e) => {
  console.error("❌ Poseidon parity FAILED:", e.message);
  process.exit(1);
});

// Auditor selective-disclosure encryption: ECIES over BabyJubjub (circom-compatible curve).
// The withdrawer encrypts (recipient, amount) to the auditor's public key; only the auditor can
// decrypt. Recovers ARBITRARY field values (no discrete-log / BSGS) via a Poseidon-derived mask.
//
// Scheme (standard ElGamal/ECIES hybrid):
//   setup:   auditor privkey a, pubkey A = a·G
//   encrypt: pick r; C1 = r·G; shared = r·A; mask_i = Poseidon(shared.x, i); ct_i = v_i + mask_i
//   decrypt: shared = a·C1 (= r·A); recover v_i = ct_i - Poseidon(shared.x, i)
//
// This is exactly what the in-circuit binding (withdraw_audit.circom) proves: that ct honestly
// encrypts the real (recipient, amount) under A — so the auditor's decryption is trustworthy.

import { buildBabyjub, buildPoseidon } from "circomlibjs";
import { randomBytes } from "node:crypto";

const babyJub = await buildBabyjub();
const poseidon = await buildPoseidon();
const F = babyJub.F;
const P = babyJub.p;                 // BN254 scalar field prime
const G = babyJub.Base8;             // generator
const SUBORDER = babyJub.subOrder;   // scalar order

const randScalar = () => (BigInt("0x" + Buffer.from(randomBytes(32)).toString("hex")) % (SUBORDER - 1n)) + 1n;
const Hmask = (sx, i) => poseidon.F.toObject(poseidon([sx, BigInt(i)]));

export function keygen() {
  const priv = randScalar();
  const pub = babyJub.mulPointEscalar(G, priv); // [x,y] field elements
  return { priv, pub };
}

/** Encrypt an array of field-element values to the auditor pubkey. Returns {c1, ct}. */
export function encrypt(values, pub) {
  const r = randScalar();
  const c1 = babyJub.mulPointEscalar(G, r);
  const shared = babyJub.mulPointEscalar(pub, r); // r·A
  const sx = F.toObject(shared[0]);
  const ct = values.map((v, i) => (((v % P) + Hmask(sx, i)) % P));
  return { c1, ct };
}

/** Decrypt with the auditor private key. */
export function decrypt(c1, ct, priv) {
  const shared = babyJub.mulPointEscalar(c1, priv); // a·(r·G) = r·A
  const sx = F.toObject(shared[0]);
  return ct.map((c, i) => (((c - Hmask(sx, i)) % P) + P) % P);
}

// ---- self-test ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const { priv, pub } = keygen();
  const recipient = 12345678901234567890n;
  const amount = 300000000n;
  const { c1, ct } = encrypt([recipient, amount], pub);
  const [rDec, aDec] = decrypt(c1, ct, priv);

  console.log("recipient  in/out:", recipient, rDec);
  console.log("amount     in/out:", amount, aDec);

  // a wrong key must NOT recover the values
  const wrong = keygen();
  const [rBad] = decrypt(c1, ct, wrong.priv);
  const ok = rDec === recipient && aDec === amount && rBad !== recipient;
  console.log(ok ? "✅ auditor encrypt/decrypt OK (et une mauvaise clé échoue)" : "❌ FAIL");
  process.exit(ok ? 0 : 1);
}

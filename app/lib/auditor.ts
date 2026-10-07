// Auditor selective disclosure — ECIES over BabyJubjub (circom-compatible).
// On a private withdrawal the client encrypts the ORIGINAL DEPOSITOR address to the auditor's
// public key (stored in the WithdrawEvent as auditor_ct). Only the auditor, holding the private
// key, can decrypt the link between a (public) withdrawal and the real depositor behind it.
//
// Scheme: C1 = r·G ; shared = r·A ; mask_i = Poseidon(shared.x, i) ; ct_i = v_i + mask_i.
// The 32-byte depositor is packed as two field elements (hi/lo 16 bytes), so auditor_ct holds
// [C1.x, C1.y, ct_hi, ct_lo] — exactly the on-chain [[u8;32];4].

import { buildBabyjub, buildPoseidon } from "circomlibjs";

// Fixed DEMO auditor private key (a scalar < the BabyJubjub subgroup order, ~2^251).
// Shown in the UI so judges can paste it; in production the auditor holds it privately and the pool
// is initialized with the matching public key.
export const DEMO_AUDITOR_PRIV = "0x02b9f4c7d1e3a5b8c0d2f4a6e8b1c3d5f7a9e0b2d4f6180a2c4e608a0c2e4061";

let _jub: any = null, _pos: any = null;
async function init() {
  if (!_jub) _jub = await buildBabyjub();
  if (!_pos) _pos = await buildPoseidon();
  return { jub: _jub, pos: _pos };
}

const bytesToBig = (b: Uint8Array) => BigInt("0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""));
const bigTo = (x: bigint, n: number) => { const h = x.toString(16).padStart(n * 2, "0"); return Uint8Array.from((h.match(/.{2}/g) as string[]).map((v) => parseInt(v, 16))); };
export const feToBytes = (x: bigint) => Array.from(bigTo(x, 32));
export const bytesToFe = (a: number[] | Uint8Array) => bytesToBig(Uint8Array.from(a));

export async function pubFromPriv(priv: bigint): Promise<[bigint, bigint]> {
  const { jub } = await init();
  const p = jub.mulPointEscalar(jub.Base8, priv);
  return [jub.F.toObject(p[0]), jub.F.toObject(p[1])];
}

/** Encrypt field values to the auditor pubkey (point). Returns [C1x, C1y, ...ct]. */
export async function encrypt(values: bigint[], pub: [bigint, bigint], rand: bigint): Promise<bigint[]> {
  const { jub, pos } = await init();
  const F = jub.F, p = jub.p;
  const pubPt = [F.e(pub[0]), F.e(pub[1])];
  const c1 = jub.mulPointEscalar(jub.Base8, rand);
  const shared = jub.mulPointEscalar(pubPt, rand);
  const sx = F.toObject(shared[0]);
  const mask = (i: number) => pos.F.toObject(pos([sx, BigInt(i)]));
  const ct = values.map((v, i) => ((v % p) + mask(i)) % p);
  return [F.toObject(c1[0]), F.toObject(c1[1]), ...ct];
}

export async function decrypt(packed: bigint[], priv: bigint): Promise<bigint[]> {
  const { jub, pos } = await init();
  const F = jub.F, p = jub.p;
  const c1 = [F.e(packed[0]), F.e(packed[1])];
  const shared = jub.mulPointEscalar(c1, priv);
  const sx = F.toObject(shared[0]);
  const mask = (i: number) => pos.F.toObject(pos([sx, BigInt(i)]));
  return packed.slice(2).map((c, i) => (((c - mask(i)) % p) + p) % p);
}

/** Pack a 32-byte Solana address into two field elements (hi/lo). */
export const addressToFields = (bytes: Uint8Array): [bigint, bigint] => [bytesToBig(bytes.slice(0, 16)), bytesToBig(bytes.slice(16, 32))];
/** Reconstruct the 32-byte address from the two decrypted field elements. */
export function fieldsToAddressBytes(hi: bigint, lo: bigint): Uint8Array {
  const out = new Uint8Array(32);
  out.set(bigTo(hi, 16), 0);
  out.set(bigTo(lo, 16), 16);
  return out;
}

export const demoPriv = () => BigInt(DEMO_AUDITOR_PRIV);
export const randScalar = () => {
  const b = crypto.getRandomValues(new Uint8Array(31));
  return (bytesToBig(b) % (2n ** 240n)) + 1n;
};

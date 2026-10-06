// Client-side proving: build a Groth16 proof with snarkjs and format it for groth16-solana.
//
// The two formatting gotchas that waste hours:
//   1. proof_a (G1) must be NEGATED for groth16-solana (negate the y-coordinate mod p).
//   2. G2 coordinates use c1||c0 ordering (swap), matching parse_vk_to_rust.js.

import { groth16 } from "snarkjs";

const BN254_P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

const to32 = (dec: string | bigint): number[] => {
  const hex = BigInt(dec).toString(16).padStart(64, "0");
  return (hex.match(/.{2}/g) as string[]).map((b) => parseInt(b, 16));
};

/** G1 x||y (64 bytes). */
const g1 = (p: string[]): number[] => [...to32(p[0]), ...to32(p[1])];
/** G1 with negated y (for proof_a). */
const g1Neg = (p: string[]): number[] => [...to32(p[0]), ...to32((BN254_P - BigInt(p[1])) % BN254_P)];
/** G2 x(c1||c0) || y(c1||c0) (128 bytes). */
const g2 = (p: string[][]): number[] => [
  ...to32(p[0][1]), ...to32(p[0][0]),
  ...to32(p[1][1]), ...to32(p[1][0]),
];

export interface FormattedProof {
  proofA: number[]; // 64
  proofB: number[]; // 128
  proofC: number[]; // 64
  publicSignals: number[][]; // each 32
}

export async function prove(
  circuit: "withdraw" | "ragequit",
  input: Record<string, unknown>
): Promise<FormattedProof> {
  const wasm = `/circuits/${circuit}.wasm`;
  const zkey = `/circuits/${circuit}_final.zkey`;
  const { proof, publicSignals } = await groth16.fullProve(input, wasm, zkey);

  return {
    proofA: g1Neg(proof.pi_a),
    proofB: g2(proof.pi_b),
    proofC: g1(proof.pi_c),
    publicSignals: publicSignals.map((s: string) => to32(s)),
  };
}

/** Reduce a Solana pubkey (bytes) to a field element, matching withdraw.rs::reduce_pubkey. */
export function recipientField(pubkeyBytes: Uint8Array): number[] {
  const b = Array.from(pubkeyBytes);
  b[0] &= 0x1f; // zero top 3 bits => < 2^253 < p
  return b;
}

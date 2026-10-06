// Shared ZK helpers for the demo + tests: Poseidon Merkle tree, note derivation, proof generation
// with groth16-solana formatting. Mirrors circuits/*.circom and programs/sieve/src/merkle.rs.

import { buildPoseidon } from "circomlibjs";
import { groth16 } from "snarkjs";

export const LEVELS = 20;
const BN254_P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

let poseidon: any = null;
async function P() {
  if (!poseidon) poseidon = await buildPoseidon();
  return poseidon;
}
export async function H(inputs: bigint[]): Promise<bigint> {
  const p = await P();
  return p.F.toObject(p(inputs));
}

export interface Note { secret: bigint; nullifier: bigint; amount: bigint; }
export const randField = () => {
  const b = require("node:crypto").randomBytes(32);
  return BigInt("0x" + b.toString("hex")) % BN254_P;
};
export const newNote = (amount: bigint): Note => ({ secret: randField(), nullifier: randField(), amount });
export const commitment = (n: Note) => H([n.secret, n.nullifier, n.amount]);
export const nullifierHash = (n: Note) => H([n.nullifier]);

/** Fixed-height Poseidon Merkle tree with path extraction. Matches merkle.circom / merkle.rs. */
export class MerkleTree {
  private constructor(public leaves: bigint[], private zeros: bigint[]) {}
  static async build(leaves: bigint[]): Promise<MerkleTree> {
    const zeros = [0n];
    for (let i = 1; i <= LEVELS; i++) zeros.push(await H([zeros[i - 1], zeros[i - 1]]));
    return new MerkleTree(leaves, zeros);
  }
  async root(): Promise<bigint> {
    let level = this.leaves.length ? [...this.leaves] : [0n];
    for (let h = 0; h < LEVELS; h++) {
      const next: bigint[] = [];
      for (let i = 0; i < level.length; i += 2)
        next.push(await H([level[i], i + 1 < level.length ? level[i + 1] : this.zeros[h]]));
      level = next.length ? next : [this.zeros[h + 1]];
    }
    return level[0];
  }
  async path(leaf: bigint): Promise<{ pathElements: bigint[]; pathIndices: number[] }> {
    let idx = this.leaves.indexOf(leaf);
    if (idx < 0) throw new Error("leaf not in tree");
    const pathElements: bigint[] = [], pathIndices: number[] = [];
    let level = [...this.leaves];
    for (let h = 0; h < LEVELS; h++) {
      const isRight = idx % 2;
      const sib = isRight ? idx - 1 : idx + 1;
      pathElements.push(sib < level.length ? level[sib] : this.zeros[h]);
      pathIndices.push(isRight);
      const next: bigint[] = [];
      for (let i = 0; i < level.length; i += 2)
        next.push(await H([level[i], i + 1 < level.length ? level[i + 1] : this.zeros[h]]));
      level = next;
      idx = Math.floor(idx / 2);
    }
    return { pathElements, pathIndices };
  }
}

// --- proof formatting for groth16-solana (negate proof_a; G2 c1||c0 swap) --------------------
const to32 = (dec: string | bigint): number[] => {
  const hex = BigInt(dec).toString(16).padStart(64, "0");
  return (hex.match(/.{2}/g) as string[]).map((b) => parseInt(b, 16));
};
const g1 = (p: string[]) => [...to32(p[0]), ...to32(p[1])];
const g1Neg = (p: string[]) => [...to32(p[0]), ...to32((BN254_P - BigInt(p[1])) % BN254_P)];
const g2 = (p: string[][]) => [...to32(p[0][1]), ...to32(p[0][0]), ...to32(p[1][1]), ...to32(p[1][0])];

export interface FormattedProof { proofA: number[]; proofB: number[]; proofC: number[]; publicSignals: number[][]; }

export async function prove(circuit: "withdraw" | "ragequit", input: Record<string, unknown>): Promise<FormattedProof> {
  const base = `${__dirname}/../circuits/build`;
  const { proof, publicSignals } = await groth16.fullProve(
    input, `${base}/${circuit}_js/${circuit}.wasm`, `${base}/${circuit}_final.zkey`
  );
  return {
    proofA: g1Neg(proof.pi_a),
    proofB: g2(proof.pi_b),
    proofC: g1(proof.pi_c),
    publicSignals: publicSignals.map((s: string) => to32(s)),
  };
}

export const feToBytes = (x: bigint) => to32(x);
export const recipientField = (pubkeyBytes: Uint8Array) => {
  const b = Array.from(pubkeyBytes); b[0] &= 0x1f; return b;
};

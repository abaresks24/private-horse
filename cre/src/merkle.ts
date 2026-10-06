// Append-only association-set Merkle tree, Poseidon(2) over BN254 — MUST match merkle.circom and
// the on-chain tree (programs/sieve/src/merkle.rs). Same hash, same height, same zero values, or
// the roots will never line up.
//
// Append-only invariant: once a commitment is added to the clean set it is NEVER removed. New
// epochs only ADD leaves. This is the anti-freeze guarantee: a deposit that was ever clean stays
// provable forever.

import { buildPoseidon } from "circomlibjs";

export const TREE_HEIGHT = 20;

let poseidon: any = null;
async function P() {
  if (!poseidon) poseidon = await buildPoseidon();
  return poseidon;
}
const toHex = (x: bigint) => "0x" + x.toString(16).padStart(64, "0");

export class AppendOnlyMerkleTree {
  private leaves: bigint[] = [];
  private zeros: bigint[] = [];

  private constructor(private p: any) {}

  static async create(initialLeaves: bigint[] = []): Promise<AppendOnlyMerkleTree> {
    const t = new AppendOnlyMerkleTree(await P());
    // zeros[0] = 0, zeros[i] = Poseidon(zeros[i-1], zeros[i-1])  (matches merkle.rs::zeros)
    let z = 0n;
    t.zeros.push(z);
    for (let i = 1; i <= TREE_HEIGHT; i++) {
      z = t.hash(z, z);
      t.zeros.push(z);
    }
    t.leaves = [...initialLeaves];
    return t;
  }

  private hash(a: bigint, b: bigint): bigint {
    return this.p.F.toObject(this.p([a, b]));
  }

  /** Add a clean commitment (idempotent: ignores duplicates to preserve append-only + determinism). */
  add(commitment: bigint) {
    if (!this.leaves.includes(commitment)) this.leaves.push(commitment);
  }

  get count(): number {
    return this.leaves.length;
  }

  /** Compute the current root. Deterministic => every honest DON node gets the same value. */
  root(): bigint {
    let level = this.leaves.length ? [...this.leaves] : [0n];
    for (let h = 0; h < TREE_HEIGHT; h++) {
      const next: bigint[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const l = level[i];
        const r = i + 1 < level.length ? level[i + 1] : this.zeros[h];
        next.push(this.hash(l, r));
      }
      level = next.length ? next : [this.zeros[h + 1]];
    }
    return level[0];
  }

  rootHex(): string {
    return toHex(this.root());
  }

  /** Merkle path for a given commitment, for the client to build a withdrawal proof. */
  path(commitment: bigint): { pathElements: bigint[]; pathIndices: number[] } {
    let idx = this.leaves.indexOf(commitment);
    if (idx < 0) throw new Error("commitment not in clean set");
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    let level = [...this.leaves];
    for (let h = 0; h < TREE_HEIGHT; h++) {
      const isRight = idx % 2;
      const sibIdx = isRight ? idx - 1 : idx + 1;
      pathElements.push(sibIdx < level.length ? level[sibIdx] : this.zeros[h]);
      pathIndices.push(isRight);
      const next: bigint[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const l = level[i];
        const r = i + 1 < level.length ? level[i + 1] : this.zeros[h];
        next.push(this.hash(l, r));
      }
      level = next;
      idx = Math.floor(idx / 2);
    }
    return { pathElements, pathIndices };
  }
}

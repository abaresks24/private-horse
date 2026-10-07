// Append-only association-set Merkle tree, Poseidon(2) over BN254 — MUST match merkle.circom and
// the on-chain tree (programs/sieve/src/merkle.rs). Same hash, same height, same zero values, or
// the roots will never line up.
//
// poseidon-lite is circomlib-compatible (identical BN254 constants) and SYNCHRONOUS + pure-JS, so
// it runs inside the CRE workflow runtime without pulling a WASM dependency — while staying
// byte-identical to the circuit and the native sol_poseidon syscall used on-chain.

import { poseidon2 } from "poseidon-lite";

export const TREE_HEIGHT = 20;

const hash = (a: bigint, b: bigint): bigint => poseidon2([a, b]);
const toHex = (x: bigint) => "0x" + x.toString(16).padStart(64, "0");

export class AppendOnlyMerkleTree {
  private leaves: bigint[] = [];
  private zeros: bigint[] = [];

  constructor(initialLeaves: bigint[] = []) {
    // zeros[0] = 0, zeros[i] = Poseidon(zeros[i-1], zeros[i-1])  (matches merkle.rs::zeros)
    let z = 0n;
    this.zeros.push(z);
    for (let i = 1; i <= TREE_HEIGHT; i++) {
      z = hash(z, z);
      this.zeros.push(z);
    }
    this.leaves = [...initialLeaves];
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
        next.push(hash(l, r));
      }
      level = next.length ? next : [this.zeros[h + 1]];
    }
    return level[0];
  }

  rootHex(): string {
    return toHex(this.root());
  }
}

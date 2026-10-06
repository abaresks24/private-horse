//! Incremental (Tornado-style) Merkle tree over BN254 using Solana's NATIVE Poseidon syscall.
//!
//! We use the native `poseidon` syscall (Parameters::Bn254X5) rather than a Rust Poseidon crate:
//! it's a syscall (no 30KB round-constant tables on the BPF stack) and uses the circom-compatible
//! Light Protocol parameters. Parity with circomlib/circomlibjs is confirmed via the temporary
//! `poseidon_debug` instruction (footgun #1).

use crate::errors::SieveError;
use crate::state::{Pool, TREE_HEIGHT};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::poseidon::{hashv, Endianness, Parameters};

/// Poseidon(2): hash two field elements (big-endian 32-byte each) into one.
pub fn hash_pair(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    hashv(Parameters::Bn254X5, Endianness::BigEndian, &[left, right])
        .expect("poseidon syscall")
        .to_bytes()
}

/// Insert a leaf into the pool's incremental tree, returning the new root.
///
/// O(TREE_HEIGHT) hashes: we carry the running zero-subtree value (`zero` = zeros[level]) and
/// advance it each level, instead of recomputing zeros(level) from scratch — that recomputation
/// was O(TREE_HEIGHT^2) Poseidon calls and blew the compute-unit budget.
/// zeros[0] = 0, zeros[i] = Poseidon(zeros[i-1], zeros[i-1]) — matches merkle.circom / zk.ts.
pub fn insert(pool: &mut Pool, leaf: [u8; 32]) -> Result<[u8; 32]> {
    require!((pool.next_index as usize) < (1usize << TREE_HEIGHT), SieveError::TreeFull);

    let mut index = pool.next_index as usize;
    let mut current = leaf;
    let mut zero = [0u8; 32]; // zeros[0]

    for level in 0..TREE_HEIGHT {
        let (left, right) = if index % 2 == 0 {
            // left child; right sibling is the zero subtree. Remember ourselves at this level.
            pool.filled_subtrees[level] = current;
            (current, zero)
        } else {
            // right child; left sibling is the last filled subtree at this level.
            (pool.filled_subtrees[level], current)
        };
        current = hash_pair(&left, &right);
        zero = hash_pair(&zero, &zero); // advance zeros[level] -> zeros[level+1]
        index /= 2;
    }

    pool.next_index += 1;
    pool.push_deposit_root(current);
    Ok(current)
}

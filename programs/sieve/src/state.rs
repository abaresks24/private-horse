use anchor_lang::prelude::*;

/// Merkle tree height. 2^20 = ~1M deposits. Keep in sync with the Circom circuit `LEVELS`.
pub const TREE_HEIGHT: usize = 20;
/// Number of recent roots retained for each tree (lets in-flight proofs stay valid across inserts).
/// Kept modest so the Pool account stays well under the 4KB BPF stack frame on deserialization.
pub const ROOT_HISTORY_SIZE: usize = 16;

/// Global pool account (PDA, seeds = [b"pool2"]). Holds config + both Merkle commitments.
#[account]
pub struct Pool {
    pub authority: Pubkey,
    /// Authorized Keystone Forwarder signer — only reports from this key are accepted in on_report.
    pub forwarder_authority: Pubkey,
    /// Auditor BabyJubjub public key (x||y, 32+32 bytes) for selective disclosure (stretch).
    pub auditor_pubkey: [u8; 64],
    /// Fixed deposit denomination in lamports (or token base units).
    pub denomination: u64,

    // --- Deposit Merkle tree (incremental, Tornado-style) ---
    pub next_index: u64,
    pub filled_subtrees: [[u8; 32]; TREE_HEIGHT],
    pub deposit_roots: [[u8; 32]; ROOT_HISTORY_SIZE],
    pub deposit_root_index: u64,

    // --- Association-set (ASP) roots, written by the CRE DON (append-only) ---
    pub asp_roots: [[u8; 32]; ROOT_HISTORY_SIZE],
    pub asp_root_index: u64,
    /// Monotonic epoch of the last accepted ASP report.
    pub asp_epoch: u64,

    pub bump: u8,
}

impl Pool {
    pub const SEED: &'static [u8] = b"pool2";

    pub const SIZE: usize = 8          // discriminator
        + 32                           // authority
        + 32                           // forwarder_authority
        + 64                           // auditor_pubkey
        + 8                            // denomination
        + 8                            // next_index
        + 32 * TREE_HEIGHT             // filled_subtrees
        + 32 * ROOT_HISTORY_SIZE       // deposit_roots
        + 8                            // deposit_root_index
        + 32 * ROOT_HISTORY_SIZE       // asp_roots
        + 8                            // asp_root_index
        + 8                            // asp_epoch
        + 1; // bump

    pub fn is_known_deposit_root(&self, root: &[u8; 32]) -> bool {
        self.deposit_roots.iter().any(|r| r == root)
    }

    pub fn is_known_asp_root(&self, root: &[u8; 32]) -> bool {
        self.asp_roots.iter().any(|r| r == root)
    }

    pub fn push_deposit_root(&mut self, root: [u8; 32]) {
        self.deposit_root_index = (self.deposit_root_index + 1) % ROOT_HISTORY_SIZE as u64;
        self.deposit_roots[self.deposit_root_index as usize] = root;
    }

    pub fn push_asp_root(&mut self, root: [u8; 32]) {
        self.asp_root_index = (self.asp_root_index + 1) % ROOT_HISTORY_SIZE as u64;
        self.asp_roots[self.asp_root_index as usize] = root;
    }
}

/// One PDA per spent nullifier (seeds = [b"nullifier2", nullifier_hash]). Its mere existence marks
/// the note as spent — prevents double-withdraw without revealing which commitment was spent.
#[account]
pub struct NullifierRecord {
    pub spent: bool,
}

impl NullifierRecord {
    pub const SEED: &'static [u8] = b"nullifier2";
    pub const SIZE: usize = 8 + 1;
}

/// Records the original depositor for each leaf index, so `ragequit` can only refund the origin.
/// PDA seeds = [b"deposit2", leaf_index_le]. Also the hook the CRE workflow reads (via RPC) to know
/// which address to trace for provenance.
#[account]
pub struct DepositRecord {
    pub depositor: Pubkey,
    pub leaf_index: u64,
    pub commitment: [u8; 32],
    pub slot: u64,
}

impl DepositRecord {
    pub const SEED: &'static [u8] = b"deposit2";
    pub const SIZE: usize = 8 + 32 + 8 + 32 + 8;
}

/// DON-signed report delivered by the Keystone Forwarder. Mirror this struct EXACTLY in the CRE
/// workflow's Borsh encoding (cf. cre-templates/solana-read-write). Borsh mismatch = silent failure.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AspReport {
    /// New append-only association-set Merkle root.
    pub asp_root: [u8; 32],
    /// Monotonic epoch (must be strictly greater than the stored epoch).
    pub epoch: u64,
    /// Number of clean deposits in the set at this epoch (for the UI / sanity, not trust-bearing).
    pub clean_count: u64,
}

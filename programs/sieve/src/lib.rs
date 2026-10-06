//! Sieve — provenance-proven, decentralized, auditable privacy pool on Solana.
//!
//! Flow:
//!   deposit(commitment)                 -> inserts a leaf in the on-chain deposit Merkle tree
//!   [CRE DON] on_report(asp_root)       -> append-only update of the clean "association set" root
//!   withdraw(proof, ...)                -> ZK proof of membership in BOTH trees -> private payout
//!   ragequit(proof, ...)                -> excluded user exits to their ORIGINAL address (public)
//!
//! The CRE workflow is the hero: it traces the *provenance* of deposited funds across multiple
//! sources, reaches DON consensus, and writes the clean-set Merkle root here via the Keystone
//! Forwarder. This program only trusts a DON-signed report delivered to `on_report`.

use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod merkle;
pub mod state;
pub mod verifying_key;

use instructions::*;
use state::AspReport;

declare_id!("4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X");

#[program]
pub mod sieve {
    use super::*;

    /// One-time setup. Stores the authorized Keystone Forwarder signer (the DON authority),
    /// the auditor public key (BabyJubjub point, for selective disclosure), and the fixed
    /// denomination of the pool (single denomination => maximal anonymity set).
    pub fn initialize(
        ctx: Context<Initialize>,
        forwarder_authority: Pubkey,
        auditor_pubkey: [u8; 64],
        denomination: u64,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, forwarder_authority, auditor_pubkey, denomination)
    }

    /// Deposit the fixed denomination and insert `commitment = Poseidon(secret, nullifier, amount)`
    /// as a leaf in the deposit Merkle tree. The depositor address + slot are recorded so the CRE
    /// workflow can trace provenance off-chain.
    pub fn deposit(ctx: Context<Deposit>, commitment: [u8; 32]) -> Result<()> {
        instructions::deposit::handler(ctx, commitment)
    }

    /// Append-only update of the association-set root, delivered by the CRE DON via the Keystone
    /// Forwarder. A root, once published, is retained in a ring buffer forever (no retroactive
    /// freeze: a withdrawal proves against any historical ASP root >= its deposit).
    pub fn on_report(ctx: Context<OnReport>, report: AspReport) -> Result<()> {
        instructions::on_report::handler(ctx, report)
    }

    /// Private withdrawal. Verifies a Groth16 proof that the caller's commitment is a member of
    /// BOTH the deposit tree and a published ASP root, that `nullifier_hash = Poseidon(nullifier)`,
    /// and (stretch) that `auditor_ct` honestly encrypts (recipient, amount) under the auditor key.
    pub fn withdraw(ctx: Context<Withdraw>, args: WithdrawArgs) -> Result<()> {
        instructions::withdraw::handler(ctx, args)
    }

    /// Escape hatch for a deposit that the clean set never included. Proves ownership of the
    /// commitment and sends funds back to the ORIGINAL depositing address (public, no privacy).
    /// Guarantees no user is ever permanently frozen.
    pub fn ragequit(ctx: Context<Ragequit>, args: RagequitArgs) -> Result<()> {
        instructions::ragequit::handler(ctx, args)
    }

    /// TEMPORARY — Poseidon parity check (delete before real deploy). Logs on-chain Poseidon(l,r).
    pub fn poseidon_debug(ctx: Context<PoseidonDebug>, left: [u8; 32], right: [u8; 32]) -> Result<()> {
        instructions::poseidon_debug::handler(ctx, left, right)
    }
}

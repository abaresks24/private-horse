//! TEMPORARY debug instruction — closes the Poseidon parity check (on-chain vs circomlib/circomlibjs).
//! Call with the same (left,right) used off-chain and compare the logged bytes.
//! DELETE before any real deployment.

use crate::merkle::hash_pair;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct PoseidonDebug<'info> {
    /// Only needed so the ix has a fee payer; not read.
    pub signer: Signer<'info>,
}

pub fn handler(_ctx: Context<PoseidonDebug>, left: [u8; 32], right: [u8; 32]) -> Result<()> {
    let h = hash_pair(&left, &right);
    // Big-endian field element bytes — compare to F.toObject(poseidon([l,r])) rendered as 32B BE.
    msg!("poseidon_debug: {:?}", h);
    Ok(())
}

use crate::errors::SieveError;
use crate::state::{AspReport, Pool};
use anchor_lang::prelude::*;

/// Entry point for DON-signed reports delivered by the Keystone Forwarder.
///
/// In production the Keystone Forwarder CPIs into this instruction and the `forwarder` signer is
/// the DON's on-chain authority. For the hackathon fallback (simulation + manually-submitted
/// signed report), the same `forwarder_authority` key signs — the on-chain trust check is identical.
#[derive(Accounts)]
pub struct OnReport<'info> {
    #[account(mut, seeds = [Pool::SEED], bump = pool.bump)]
    pub pool: Box<Account<'info, Pool>>,

    /// Must equal `pool.forwarder_authority`. This is the ONLY trust assumption on-chain: the
    /// report came from the authorized DON forwarder.
    pub forwarder: Signer<'info>,
}

pub fn handler(ctx: Context<OnReport>, report: AspReport) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    require_keys_eq!(
        ctx.accounts.forwarder.key(),
        pool.forwarder_authority,
        SieveError::UnauthorizedForwarder
    );

    // Append-only / monotonic: each epoch's root is a superset of the previous clean set, so a
    // deposit once included can never be retroactively removed (anti-freeze guarantee).
    require!(report.epoch > pool.asp_epoch, SieveError::StaleReport);

    pool.asp_epoch = report.epoch;
    pool.push_asp_root(report.asp_root);

    emit!(AspRootUpdated {
        asp_root: report.asp_root,
        epoch: report.epoch,
        clean_count: report.clean_count,
    });
    msg!(
        "ASP root updated · epoch={} · clean_count={}",
        report.epoch,
        report.clean_count
    );
    Ok(())
}

#[event]
pub struct AspRootUpdated {
    pub asp_root: [u8; 32],
    pub epoch: u64,
    pub clean_count: u64,
}

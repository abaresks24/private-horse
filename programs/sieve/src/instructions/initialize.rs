use crate::state::Pool;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = Pool::SIZE,
        seeds = [Pool::SEED],
        bump
    )]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    forwarder_authority: Pubkey,
    auditor_pubkey: [u8; 64],
    denomination: u64,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    pool.authority = ctx.accounts.authority.key();
    pool.forwarder_authority = forwarder_authority;
    pool.auditor_pubkey = auditor_pubkey;
    pool.denomination = denomination;
    pool.next_index = 0;
    pool.filled_subtrees = [[0u8; 32]; crate::state::TREE_HEIGHT];
    pool.deposit_roots = [[0u8; 32]; crate::state::ROOT_HISTORY_SIZE];
    pool.deposit_root_index = 0;
    pool.asp_roots = [[0u8; 32]; crate::state::ROOT_HISTORY_SIZE];
    pool.asp_root_index = 0;
    pool.asp_epoch = 0;
    pool.bump = ctx.bumps.pool;
    msg!("Sieve pool initialized · denomination={} · forwarder={}", denomination, forwarder_authority);
    Ok(())
}

use crate::merkle;
use crate::state::{DepositRecord, Pool};
use anchor_lang::prelude::*;
use anchor_lang::system_program;

#[derive(Accounts)]
#[instruction(commitment: [u8; 32])]
pub struct Deposit<'info> {
    #[account(mut, seeds = [Pool::SEED], bump = pool.bump)]
    pub pool: Box<Account<'info, Pool>>,

    /// Per-leaf record of the depositor (origin for ragequit) + the hook the CRE workflow reads
    /// via RPC to know which address to trace for provenance.
    #[account(
        init,
        payer = depositor,
        space = DepositRecord::SIZE,
        seeds = [DepositRecord::SEED, &pool.next_index.to_le_bytes()],
        bump
    )]
    pub deposit_record: Account<'info, DepositRecord>,

    /// Vault PDA that custodies deposited lamports (seeds = [b"vault2"]).
    /// CHECK: system-owned PDA used only as a lamport sink/source.
    #[account(mut, seeds = [b"vault2"], bump)]
    pub vault: SystemAccount<'info>,

    #[account(mut)]
    pub depositor: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Deposit>, commitment: [u8; 32]) -> Result<()> {
    let denomination = ctx.accounts.pool.denomination;

    // Transfer the fixed denomination into the vault.
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.depositor.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        denomination,
    )?;

    let leaf_index = ctx.accounts.pool.next_index;
    let pool = &mut ctx.accounts.pool;
    let new_root = merkle::insert(pool, commitment)?;

    let record = &mut ctx.accounts.deposit_record;
    record.depositor = ctx.accounts.depositor.key();
    record.leaf_index = leaf_index;
    record.commitment = commitment;
    record.slot = Clock::get()?.slot;

    emit!(DepositEvent {
        commitment,
        leaf_index,
        depositor: ctx.accounts.depositor.key(),
        new_root,
    });
    Ok(())
}

#[event]
pub struct DepositEvent {
    pub commitment: [u8; 32],
    pub leaf_index: u64,
    pub depositor: Pubkey,
    pub new_root: [u8; 32],
}

use crate::errors::SieveError;
use crate::state::{DepositRecord, NullifierRecord, Pool};
use crate::verifying_key::RAGEQUIT_VK;
use anchor_lang::prelude::*;
use groth16_solana::groth16::Groth16Verifier;

/// Escape hatch: a deposit the clean set never included can always be recovered — but ONLY to the
/// original depositing address (public, no privacy). Guarantees no user is ever frozen.
///
/// The ragequit circuit proves knowledge of (secret, nullifier) for a commitment that is a member
/// of the deposit tree, WITHOUT requiring ASP membership. Funds go to `deposit_record.depositor`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RagequitArgs {
    pub proof_a: [u8; 64],
    pub proof_b: [u8; 128],
    pub proof_c: [u8; 64],
    pub root_deposits: [u8; 32],
    pub nullifier_hash: [u8; 32],
    pub leaf_index: u64,
}

#[derive(Accounts)]
#[instruction(args: RagequitArgs)]
pub struct Ragequit<'info> {
    #[account(mut, seeds = [Pool::SEED], bump = pool.bump)]
    pub pool: Box<Account<'info, Pool>>,

    #[account(
        init,
        payer = payer,
        space = NullifierRecord::SIZE,
        seeds = [NullifierRecord::SEED, args.nullifier_hash.as_ref()],
        bump
    )]
    pub nullifier_record: Account<'info, NullifierRecord>,

    #[account(
        seeds = [DepositRecord::SEED, &args.leaf_index.to_le_bytes()],
        bump,
        constraint = deposit_record.depositor == original_depositor.key() @ SieveError::NotOriginalDepositor,
    )]
    pub deposit_record: Account<'info, DepositRecord>,

    /// CHECK: system-owned vault PDA.
    #[account(mut, seeds = [b"vault"], bump)]
    pub vault: SystemAccount<'info>,

    /// CHECK: must be the original depositor recorded at deposit time.
    #[account(mut)]
    pub original_depositor: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Ragequit>, args: RagequitArgs) -> Result<()> {
    let pool = &ctx.accounts.pool;
    require!(pool.is_known_deposit_root(&args.root_deposits), SieveError::UnknownDepositRoot);

    let public_inputs: [[u8; 32]; 2] = [args.root_deposits, args.nullifier_hash];
    let mut verifier =
        Groth16Verifier::new(&args.proof_a, &args.proof_b, &args.proof_c, &public_inputs, &RAGEQUIT_VK)
            .map_err(|_| error!(SieveError::InvalidProof))?;
    verifier.verify().map_err(|_| error!(SieveError::InvalidProof))?;

    ctx.accounts.nullifier_record.spent = true;

    let amount = pool.denomination;
    let bump = ctx.bumps.vault;
    let seeds: &[&[u8]] = &[b"vault", &[bump]];
    anchor_lang::system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.original_depositor.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;
    msg!("Ragequit · funds returned to original depositor (public exit)");
    Ok(())
}

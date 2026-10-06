use crate::errors::SieveError;
use crate::state::{NullifierRecord, Pool};
use crate::verifying_key::WITHDRAW_VK;
use anchor_lang::prelude::*;
use groth16_solana::groth16::Groth16Verifier;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WithdrawArgs {
    // Groth16 proof (snarkjs export, already prepared: proof_a negated for groth16-solana).
    pub proof_a: [u8; 64],
    pub proof_b: [u8; 128],
    pub proof_c: [u8; 64],

    // Public signals — ORDER MUST MATCH the circuit's public input order.
    pub root_deposits: [u8; 32],
    pub root_asp: [u8; 32],
    pub nullifier_hash: [u8; 32],
    /// recipient reduced mod the BN254 scalar field, as bound in-circuit.
    pub recipient_field: [u8; 32],
    /// (stretch) ElGamal ciphertext (c1x,c1y,c2x,c2y) encrypting (recipient,amount) to auditor key.
    pub auditor_ct: [[u8; 32]; 4],
}

#[derive(Accounts)]
#[instruction(args: WithdrawArgs)]
pub struct Withdraw<'info> {
    #[account(mut, seeds = [Pool::SEED], bump = pool.bump)]
    pub pool: Box<Account<'info, Pool>>,

    /// `init` fails if the nullifier PDA already exists => double-withdraw is impossible, without
    /// revealing which commitment was spent.
    #[account(
        init,
        payer = payer,
        space = NullifierRecord::SIZE,
        seeds = [NullifierRecord::SEED, args.nullifier_hash.as_ref()],
        bump
    )]
    pub nullifier_record: Account<'info, NullifierRecord>,

    /// CHECK: system-owned vault PDA holding deposits.
    #[account(mut, seeds = [b"vault"], bump)]
    pub vault: SystemAccount<'info>,

    /// CHECK: funds destination; must match `recipient_field` (reduced pubkey) bound in the proof.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,

    /// Relayer or the user; pays rent for the nullifier record. Can be anyone (supports relayers).
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Withdraw>, args: WithdrawArgs) -> Result<()> {
    let pool = &ctx.accounts.pool;

    // 1. Both roots must be known (membership proofs are against published roots).
    require!(pool.is_known_deposit_root(&args.root_deposits), SieveError::UnknownDepositRoot);
    require!(pool.is_known_asp_root(&args.root_asp), SieveError::UnknownAspRoot);

    // 2. Bind the on-chain recipient account to the recipient committed in the proof.
    //    (pubkey reduced mod field, matching the circuit's representation.)
    let recipient_field = reduce_pubkey(&ctx.accounts.recipient.key());
    require!(recipient_field == args.recipient_field, SieveError::RecipientMismatch);

    // 3. Verify the Groth16 proof. Public inputs ORDER must match the circuit.
    let public_inputs: [[u8; 32]; 4] = [
        args.root_deposits,
        args.root_asp,
        args.nullifier_hash,
        args.recipient_field,
    ];
    let mut verifier =
        Groth16Verifier::new(&args.proof_a, &args.proof_b, &args.proof_c, &public_inputs, &WITHDRAW_VK)
            .map_err(|_| error!(SieveError::InvalidProof))?;
    verifier.verify().map_err(|_| error!(SieveError::InvalidProof))?;

    // 4. Mark nullifier spent (the `init` above already guarantees uniqueness).
    ctx.accounts.nullifier_record.spent = true;

    // 5. Pay out the fixed denomination from the vault to the private recipient.
    let amount = pool.denomination;
    let bump = ctx.bumps.vault;
    let seeds: &[&[u8]] = &[b"vault", &[bump]];
    anchor_lang::system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.recipient.to_account_info(),
            },
            &[seeds],
        ),
        amount,
    )?;

    // 6. (stretch) auditor_ct is persisted off this ix via an event for the auditor to decrypt.
    emit!(WithdrawEvent {
        nullifier_hash: args.nullifier_hash,
        recipient: ctx.accounts.recipient.key(),
        auditor_ct: args.auditor_ct,
    });
    Ok(())
}

/// Reduce a 32-byte pubkey into the BN254 scalar field by zeroing the top 3 bits (< 2^253 < p).
/// Must match the circuit's `recipient` representation. Simple + deterministic for the hackathon.
fn reduce_pubkey(key: &Pubkey) -> [u8; 32] {
    let mut bytes = key.to_bytes();
    bytes[0] &= 0x1f;
    bytes
}

#[event]
pub struct WithdrawEvent {
    pub nullifier_hash: [u8; 32],
    pub recipient: Pubkey,
    /// Selective-disclosure ciphertext; only the designated auditor can decrypt it.
    pub auditor_ct: [[u8; 32]; 4],
}

use anchor_lang::prelude::*;

#[error_code]
pub enum SieveError {
    #[msg("Merkle tree is full")]
    TreeFull,
    #[msg("Unknown or stale deposit Merkle root")]
    UnknownDepositRoot,
    #[msg("Unknown association-set (ASP) root")]
    UnknownAspRoot,
    #[msg("Nullifier has already been spent")]
    NullifierAlreadySpent,
    #[msg("Invalid Groth16 proof")]
    InvalidProof,
    #[msg("Report is not signed by the authorized DON forwarder")]
    UnauthorizedForwarder,
    #[msg("ASP report is stale (epoch not newer than stored)")]
    StaleReport,
    #[msg("ASP root must be append-only (new root must extend the previous set)")]
    NonMonotonicRoot,
    #[msg("Incorrect deposit denomination")]
    BadDenomination,
    #[msg("Recipient account does not match proof public input")]
    RecipientMismatch,
    #[msg("Ragequit must send to the original depositor")]
    NotOriginalDepositor,
}

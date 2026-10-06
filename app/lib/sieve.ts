// Anchor client for the Sieve program. Import the IDL from target/idl/sieve.json after `anchor build`.
// These helpers mirror the on-chain instructions and consume the FormattedProof from prover.ts.

import { Program, BN, web3 } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";
import type { FormattedProof } from "./prover";

export const PROGRAM_ID = "4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X";

const seed = (s: string) => new TextEncoder().encode(s);
const SYS = web3.SystemProgram.programId;

export function pdas(programId: PublicKey) {
  const [pool] = web3.PublicKey.findProgramAddressSync([seed("pool")], programId);
  const [vault] = web3.PublicKey.findProgramAddressSync([seed("vault")], programId);
  return { pool, vault };
}

export const nullifierPda = (programId: PublicKey, nullifierHash: number[]) =>
  web3.PublicKey.findProgramAddressSync([seed("nullifier"), Uint8Array.from(nullifierHash)], programId)[0];

export const depositRecordPda = (programId: PublicKey, leafIndex: number) =>
  web3.PublicKey.findProgramAddressSync(
    [seed("deposit"), new BN(leafIndex).toArrayLike(Buffer, "le", 8)],
    programId
  )[0];

/** deposit(commitment): sends the fixed denomination + inserts the leaf. */
export async function deposit(program: Program, commitment: number[], depositor: PublicKey) {
  const { pool, vault } = pdas(program.programId);
  const poolAcc: any = await (program.account as any).pool.fetch(pool);
  const record = depositRecordPda(program.programId, poolAcc.nextIndex.toNumber());
  return program.methods
    .deposit(commitment)
    .accounts({ pool, depositRecord: record, vault, depositor, systemProgram: SYS })
    .rpc();
}

const ZERO_CT: number[][] = [new Array(32).fill(0), new Array(32).fill(0), new Array(32).fill(0), new Array(32).fill(0)];

/**
 * withdraw: publicSignals order = [rootDeposits, rootAsp, nullifierHash, recipientField].
 * auditorCt optional (stretch); defaults to zeros.
 */
export async function withdraw(
  program: Program,
  proof: FormattedProof,
  recipient: PublicKey,
  payer: PublicKey,
  auditorCt: number[][] = ZERO_CT
) {
  const { pool, vault } = pdas(program.programId);
  const [rootDeposits, rootAsp, nullifierHash, recipientField] = proof.publicSignals;
  const args = {
    proofA: proof.proofA,
    proofB: proof.proofB,
    proofC: proof.proofC,
    rootDeposits,
    rootAsp,
    nullifierHash,
    recipientField,
    auditorCt,
  };
  return program.methods
    .withdraw(args)
    .accounts({
      pool,
      nullifierRecord: nullifierPda(program.programId, nullifierHash),
      vault,
      recipient,
      payer,
      systemProgram: SYS,
    })
    .rpc();
}

/** ragequit: publicSignals order = [rootDeposits, nullifierHash]. Refunds the original depositor. */
export async function ragequit(
  program: Program,
  proof: FormattedProof,
  leafIndex: number,
  originalDepositor: PublicKey,
  payer: PublicKey
) {
  const { pool, vault } = pdas(program.programId);
  const [rootDeposits, nullifierHash] = proof.publicSignals;
  const args = {
    proofA: proof.proofA,
    proofB: proof.proofB,
    proofC: proof.proofC,
    rootDeposits,
    nullifierHash,
    leafIndex: new BN(leafIndex),
  };
  return program.methods
    .ragequit(args)
    .accounts({
      pool,
      nullifierRecord: nullifierPda(program.programId, nullifierHash),
      depositRecord: depositRecordPda(program.programId, leafIndex),
      vault,
      originalDepositor,
      payer,
      systemProgram: SYS,
    })
    .rpc();
}

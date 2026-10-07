// Deterministic note derivation — the "account" model, so the user stores NOTHING.
//
// A note's (secret, nullifier) is derived from a signature the wallet produces over a fixed
// message. ed25519 signatures are deterministic (RFC 8032), so re-signing the same message yields
// the same seed → the same notes. Deposit: derive the next free indices and lock them. Withdraw:
// re-sign, re-derive, scan the chain to find which deposits are yours (and which are spent).
//
// Privacy is preserved: the signature never leaves the browser, and the on-chain commitment reveals
// nothing. The wallet seed phrase IS the backup.

import { Connection } from "@solana/web3.js";
import { commitment as noteCommitment, nullifierHash as noteNullifierHash, type Note } from "./notes";
import { fetchDeposits, nullifierPda, type Deposit } from "./protocol";

const BN254_P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** The fixed message the wallet signs to derive the account seed. Bump the version to rotate. */
export const DERIVATION_MESSAGE = new TextEncoder().encode(
  "Private Horse — deterministic note derivation — v1"
);

const feToBytes = (x: bigint): number[] => {
  const h = x.toString(16).padStart(64, "0");
  return (h.match(/.{2}/g) as string[]).map((b) => parseInt(b, 16));
};

async function field(seed: Uint8Array, label: string, index: number): Promise<bigint> {
  const lab = new TextEncoder().encode(label);
  const idx = new Uint8Array(4);
  new DataView(idx.buffer).setUint32(0, index, true);
  const buf = new Uint8Array(seed.length + lab.length + idx.length);
  buf.set(seed, 0);
  buf.set(lab, seed.length);
  buf.set(idx, seed.length + lab.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  const x = BigInt("0x" + Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join(""));
  return x % BN254_P;
}

/** Derive note #index for this seed, for a given fixed denomination. */
export async function deriveNote(seed: Uint8Array, index: number, amount: bigint): Promise<Note> {
  return {
    secret: await field(seed, "secret", index),
    nullifier: await field(seed, "nullifier", index),
    amount,
  };
}

/** Pick the next `count` derivation indices whose commitment isn't already on-chain. */
export async function freeNotes(
  connection: Connection,
  seed: Uint8Array,
  amount: bigint,
  count: number,
  maxScan = 256,
): Promise<Note[]> {
  const onchain = new Set((await fetchDeposits(connection)).map((d) => d.commitment));
  const notes: Note[] = [];
  for (let i = 0; i < maxScan && notes.length < count; i++) {
    const note = await deriveNote(seed, i, amount);
    if (!onchain.has(await noteCommitment(note))) notes.push(note);
  }
  return notes;
}

export interface MyDeposit { index: number; note: Note; leafIndex: number; spent: boolean; }

/** Scan the chain for deposits belonging to this seed, flagging which are already spent. */
export async function discoverDeposits(
  connection: Connection,
  seed: Uint8Array,
  amount: bigint,
  maxScan = 128,
): Promise<MyDeposit[]> {
  const byCommit = new Map<bigint, Deposit>();
  for (const d of await fetchDeposits(connection)) byCommit.set(d.commitment, d);

  const out: MyDeposit[] = [];
  let miss = 0;
  for (let i = 0; i < maxScan && miss < 10; i++) {
    const note = await deriveNote(seed, i, amount);
    const dep = byCommit.get(await noteCommitment(note));
    if (!dep) { miss++; continue; }
    miss = 0;
    const nh = feToBytes(await noteNullifierHash(note));
    const spent = (await connection.getAccountInfo(nullifierPda(nh))) !== null;
    out.push({ index: i, note, leafIndex: dep.leafIndex, spent });
  }
  return out;
}

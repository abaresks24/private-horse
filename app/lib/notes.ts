// Note management: generate the secret/nullifier, compute the commitment, and the nullifier hash.
// Poseidon MUST match merkle.circom / merkle.rs (BN254, circom params).

import { buildPoseidon } from "circomlibjs";

const BN254_P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

let poseidon: any = null;
async function P() {
  if (!poseidon) poseidon = await buildPoseidon();
  return poseidon;
}

export interface Note {
  secret: bigint;
  nullifier: bigint;
  amount: bigint;
}

function randomField(): bigint {
  const b = crypto.getRandomValues(new Uint8Array(32));
  let x = 0n;
  for (const byte of b) x = (x << 8n) | BigInt(byte);
  return x % BN254_P;
}

export function newNote(amount: bigint): Note {
  return { secret: randomField(), nullifier: randomField(), amount };
}

/** commitment = Poseidon(secret, nullifier, amount) — matches withdraw.circom. */
export async function commitment(note: Note): Promise<bigint> {
  const p = await P();
  return p.F.toObject(p([note.secret, note.nullifier, note.amount]));
}

/** nullifierHash = Poseidon(nullifier). */
export async function nullifierHash(note: Note): Promise<bigint> {
  const p = await P();
  return p.F.toObject(p([note.nullifier]));
}

export const toHex = (x: bigint) => "0x" + x.toString(16).padStart(64, "0");

/** Serialize a note to a backup string the user must keep to withdraw later. */
export const serializeNote = (n: Note) =>
  `sieve-${n.secret.toString(16)}-${n.nullifier.toString(16)}-${n.amount.toString()}`;

export function parseNote(s: string): Note {
  const [, secret, nullifier, amount] = s.split("-");
  return { secret: BigInt("0x" + secret), nullifier: BigInt("0x" + nullifier), amount: BigInt(amount) };
}

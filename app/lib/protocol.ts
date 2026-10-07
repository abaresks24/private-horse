// Browser orchestration of the Private Horse protocol on devnet:
// deposit / private withdraw (Groth16 in-browser) / ragequit. Reconstructs the deposit tree from
// on-chain DepositRecords and the ASP (clean) tree by re-running the provenance check — matching
// what the CRE keeper writes on-chain, so the proof's roots verify.

import { AnchorProvider, Program, BN, EventParser, BorshCoder, type Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram, Keypair, Transaction, ComputeBudgetProgram } from "@solana/web3.js";
import { buildPoseidon } from "circomlibjs";
import idl from "./idl/sieve.json";
import { prove, recipientField, type FormattedProof } from "./prover";
import { commitment as noteCommitment, nullifierHash as noteNullifierHash, type Note } from "./notes";
import { encrypt, decrypt, pubFromPriv, demoPriv, addressToFields, fieldsToAddressBytes, feToBytes as feBytes, bytesToFe, randScalar } from "./auditor";

const ZERO_CT: number[][] = [Array(32).fill(0), Array(32).fill(0), Array(32).fill(0), Array(32).fill(0)];

export const PROGRAM_ID = new PublicKey("4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X");
export const DEVNET_RPC = "https://api.devnet.solana.com";
export const MOCK_URL = "http://localhost:8787"; // provenance mock (dev)
const LEVELS = 20;
const QUORUM = 2;
const SOURCES = ["trace", "ofac", "hacks"];
const DEPOSIT_RECORD_SIZE = 88;

const seed = (s: string) => new TextEncoder().encode(s);
export const pool = () => PublicKey.findProgramAddressSync([seed("pool2")], PROGRAM_ID)[0];
export const vault = () => PublicKey.findProgramAddressSync([seed("vault2")], PROGRAM_ID)[0];
export const nullifierPda = (nh: number[]) => PublicKey.findProgramAddressSync([seed("nullifier2"), Uint8Array.from(nh)], PROGRAM_ID)[0];
export const depositRecordPda = (i: number) => PublicKey.findProgramAddressSync([seed("deposit2"), new BN(i).toArrayLike(Buffer, "le", 8)], PROGRAM_ID)[0];

export function getProgram(connection: Connection, wallet: any): Program {
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return new Program(idl as Idl, provider);
}

// ---- Poseidon Merkle tree (matches merkle.circom / merkle.rs) ----
let _p: any = null;
async function P() { if (!_p) _p = await buildPoseidon(); return _p; }
const feToBytes = (x: bigint) => { const h = x.toString(16).padStart(64, "0"); return (h.match(/.{2}/g) as string[]).map((b) => parseInt(b, 16)); };
// Poseidon Merkle insert (deposit) and Groth16 verify (withdraw/ragequit) blow past the 200k
// default compute budget — bump it (matches scripts/demo.ts).
const cu = () => ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });

class MerkleTree {
  private constructor(public leaves: bigint[], private zeros: bigint[], private p: any) {}
  static async build(leaves: bigint[]) {
    const p = await P(); const F = p.F; const H = (a: bigint, b: bigint) => F.toObject(p([a, b]));
    const zeros = [0n]; for (let i = 1; i <= LEVELS; i++) zeros.push(H(zeros[i - 1], zeros[i - 1]));
    return new MerkleTree(leaves, zeros, p);
  }
  private H(a: bigint, b: bigint) { return this.p.F.toObject(this.p([a, b])); }
  root(): bigint {
    let lvl = this.leaves.length ? [...this.leaves] : [0n];
    for (let h = 0; h < LEVELS; h++) { const n: bigint[] = []; for (let i = 0; i < lvl.length; i += 2) n.push(this.H(lvl[i], i + 1 < lvl.length ? lvl[i + 1] : this.zeros[h])); lvl = n.length ? n : [this.zeros[h + 1]]; }
    return lvl[0];
  }
  path(leaf: bigint) {
    let idx = this.leaves.indexOf(leaf); if (idx < 0) throw new Error("not in tree");
    const pathElements: bigint[] = [], pathIndices: number[] = []; let lvl = [...this.leaves];
    for (let h = 0; h < LEVELS; h++) {
      const r = idx % 2, sib = r ? idx - 1 : idx + 1;
      pathElements.push(sib < lvl.length ? lvl[sib] : this.zeros[h]); pathIndices.push(r);
      const n: bigint[] = []; for (let i = 0; i < lvl.length; i += 2) n.push(this.H(lvl[i], i + 1 < lvl.length ? lvl[i + 1] : this.zeros[h]));
      lvl = n; idx = Math.floor(idx / 2);
    }
    return { pathElements, pathIndices };
  }
}

export interface Deposit { commitment: bigint; depositor: string; leafIndex: number; }

export async function fetchDeposits(connection: Connection): Promise<Deposit[]> {
  const accts = await connection.getProgramAccounts(PROGRAM_ID, { filters: [{ dataSize: DEPOSIT_RECORD_SIZE }] });
  return accts
    .map(({ account }) => {
      const d = account.data;
      return {
        depositor: new PublicKey(d.subarray(8, 40)).toBase58(),
        leafIndex: Number(d.readBigUInt64LE(40)),
        commitment: BigInt("0x" + Buffer.from(d.subarray(48, 80)).toString("hex")),
      };
    })
    .sort((a, b) => a.leafIndex - b.leafIndex);
}

/** Re-run provenance (mock) to rebuild the clean set — same k-of-n the CRE keeper uses. */
async function cleanSet(deposits: Deposit[]): Promise<bigint[]> {
  const clean: bigint[] = [];
  for (const d of deposits) {
    let ok = 0;
    for (const s of SOURCES) {
      try { const r = await fetch(`${MOCK_URL}/${s}?address=${d.depositor}`); const j = await r.json(); if (j.clean) ok++; } catch { /* source down */ }
    }
    if (ok >= QUORUM) clean.push(d.commitment);
  }
  return clean;
}

/** Build the Groth16 withdraw proof + the auditor ciphertext (encrypts the ORIGINAL depositor). */
export async function proveWithdraw(connection: Connection, note: Note, recipient: PublicKey): Promise<{ proof: FormattedProof; auditorCt: number[][] }> {
  const deposits = await fetchDeposits(connection);
  const c = await noteCommitment(note);
  const depTree = await MerkleTree.build(deposits.map((d) => d.commitment));
  const aspTree = await MerkleTree.build(await cleanSet(deposits));
  const dep = depTree.path(c), asp = aspTree.path(c);
  const recBytes = recipientField(recipient.toBytes());
  const proof = await prove("withdraw", {
    secret: note.secret.toString(), nullifier: note.nullifier.toString(), amount: note.amount.toString(),
    pathElementsDep: dep.pathElements.map(String), pathIndicesDep: dep.pathIndices,
    pathElementsAsp: asp.pathElements.map(String), pathIndicesAsp: asp.pathIndices,
    rootDeposits: depTree.root().toString(), rootAsp: aspTree.root().toString(),
    nullifierHash: (await noteNullifierHash(note)).toString(),
    recipient: BigInt("0x" + Buffer.from(recBytes).toString("hex")).toString(),
  });

  // Selective disclosure: encrypt the original depositor's address to the auditor key.
  let auditorCt = ZERO_CT;
  const mine = deposits.find((d) => d.commitment === c);
  if (mine) {
    const [hi, lo] = addressToFields(new PublicKey(mine.depositor).toBytes());
    const pub = await pubFromPriv(demoPriv());
    const packed = await encrypt([hi, lo], pub, randScalar());
    auditorCt = packed.map(feBytes);
  }
  return { proof, auditorCt };
}

export async function proveRagequit(connection: Connection, note: Note): Promise<{ proof: FormattedProof; leafIndex: number; depositor: PublicKey }> {
  const deposits = await fetchDeposits(connection);
  const c = await noteCommitment(note);
  const mine = deposits.find((d) => d.commitment === c);
  if (!mine) throw new Error("commitment introuvable on-chain");
  const depTree = await MerkleTree.build(deposits.map((d) => d.commitment));
  const p = depTree.path(c);
  const proof = await prove("ragequit", {
    secret: note.secret.toString(), nullifier: note.nullifier.toString(), amount: note.amount.toString(),
    pathElements: p.pathElements.map(String), pathIndices: p.pathIndices,
    rootDeposits: depTree.root().toString(), nullifierHash: (await noteNullifierHash(note)).toString(),
  });
  return { proof, leafIndex: mine.leafIndex, depositor: new PublicKey(mine.depositor) };
}

// ---- on-chain actions (wallet signs) ----
export async function deposit(program: Program, wallet: PublicKey, note: Note) {
  const poolAcc: any = await (program.account as any).pool.fetch(pool());
  const idx = poolAcc.nextIndex.toNumber();
  const c = feToBytes(await noteCommitment(note));
  return program.methods.deposit(c)
    .accounts({ pool: pool(), depositRecord: depositRecordPda(idx), vault: vault(), depositor: wallet, systemProgram: SystemProgram.programId })
    .rpc();
}

/**
 * Mix flow: ONE wallet signature → N fixed-denomination deposit txs.
 * Builds all N deposits against sequential leaf indices, signs them in a single wallet approval
 * (signAllTransactions), then broadcasts sequentially (each confirmed so the on-chain nextIndex
 * matches the precomputed depositRecord PDAs). Returns the signatures in order.
 */
export async function depositBatch(
  program: Program,
  connection: Connection,
  wallet: PublicKey,
  signAll: (txs: Transaction[]) => Promise<Transaction[]>,
  notes: Note[],
  onProgress?: (done: number, total: number, sig: string) => void,
): Promise<string[]> {
  const poolAcc: any = await (program.account as any).pool.fetch(pool());
  const base = poolAcc.nextIndex.toNumber();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  const txs: Transaction[] = [];
  for (let k = 0; k < notes.length; k++) {
    const c = feToBytes(await noteCommitment(notes[k]));
    const tx = await program.methods.deposit(c)
      .accounts({ pool: pool(), depositRecord: depositRecordPda(base + k), vault: vault(), depositor: wallet, systemProgram: SystemProgram.programId })
      .preInstructions([cu()])
      .transaction();
    tx.feePayer = wallet;
    tx.recentBlockhash = blockhash;
    txs.push(tx);
  }

  const signed = await signAll(txs); // single approval in the wallet
  const sigs: string[] = [];
  for (let k = 0; k < signed.length; k++) {
    const sig = await connection.sendRawTransaction(signed[k].serialize(), { maxRetries: 5 });
    const conf = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    if (conf.value.err) throw new Error(`deposit ${k + 1}/${signed.length} failed on-chain: ${JSON.stringify(conf.value.err)}`);
    sigs.push(sig);
    onProgress?.(k + 1, signed.length, sig);
  }
  return sigs;
}

/** Advisory provenance pre-check on the depositor's own wallet: how many sources trace it clean. */
export async function provenanceCheck(address: string): Promise<{ up: boolean; votes: number; total: number; quorum: number }> {
  const total = SOURCES.length;
  try {
    const results = await Promise.all(SOURCES.map((s) =>
      fetch(`${MOCK_URL}/${s}?address=${address}`).then((r) => r.json()).then((j) => !!j.clean).catch(() => null)
    ));
    if (results.every((r) => r === null)) return { up: false, votes: 0, total, quorum: QUORUM };
    const votes = results.filter((r) => r === true).length;
    return { up: true, votes, total, quorum: QUORUM };
  } catch {
    return { up: false, votes: 0, total, quorum: QUORUM };
  }
}

export async function withdraw(program: Program, wallet: PublicKey, proof: FormattedProof, recipient: PublicKey, auditorCt: number[][] = ZERO_CT) {
  const [rootDeposits, rootAsp, nullifierHash, recipientField] = proof.publicSignals;
  return program.methods.withdraw({ proofA: proof.proofA, proofB: proof.proofB, proofC: proof.proofC, rootDeposits, rootAsp, nullifierHash, recipientField, auditorCt })
    .accounts({ pool: pool(), nullifierRecord: nullifierPda(nullifierHash), vault: vault(), recipient, payer: wallet, systemProgram: SystemProgram.programId })
    .preInstructions([cu()])
    .rpc();
}

export interface AuditRow { sig: string; recipient: string; auditorCt: bigint[]; }

/** Read recent WithdrawEvents (sig + public recipient + auditor ciphertext). Read-only, no wallet. */
export async function fetchWithdrawals(connection: Connection, limit = 40): Promise<AuditRow[]> {
  const parser = new EventParser(PROGRAM_ID, new BorshCoder(idl as Idl));
  const sigs = await connection.getSignaturesForAddress(PROGRAM_ID, { limit });
  const rows: AuditRow[] = [];
  for (const { signature } of sigs) {
    try {
      const txr = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });
      const logs = txr?.meta?.logMessages;
      if (!logs) continue;
      for (const ev of parser.parseLogs(logs)) {
        const isWithdraw = ev.name === "withdrawEvent" || ev.name === "WithdrawEvent";
        const raw = ev.data?.auditorCt as any[] | undefined;
        if (!isWithdraw || !Array.isArray(raw) || !ev.data?.recipient) continue;
        const ct = raw.map((a) => bytesToFe(Array.from(a as number[])));
        rows.push({ sig: signature, recipient: (ev.data.recipient as PublicKey).toBase58(), auditorCt: ct });
      }
    } catch { /* skip txs whose logs can't be parsed (deploys, unrelated events, etc.) */ }
  }
  return rows;
}

/** Decrypt one withdrawal's auditor ciphertext into the original depositor address. */
export async function auditDecrypt(auditorCt: bigint[], priv: bigint): Promise<string> {
  const [hi, lo] = await decrypt(auditorCt, priv);
  return new PublicKey(fieldsToAddressBytes(hi, lo)).toBase58();
}

export async function ragequit(program: Program, wallet: PublicKey, r: { proof: FormattedProof; leafIndex: number; depositor: PublicKey }) {
  const [rootDeposits, nullifierHash] = r.proof.publicSignals;
  return program.methods.ragequit({ proofA: r.proof.proofA, proofB: r.proof.proofB, proofC: r.proof.proofC, rootDeposits, nullifierHash, leafIndex: new BN(r.leafIndex) })
    .accounts({ pool: pool(), nullifierRecord: nullifierPda(nullifierHash), depositRecord: depositRecordPda(r.leafIndex), vault: vault(), originalDepositor: r.depositor, payer: wallet, systemProgram: SystemProgram.programId })
    .preInstructions([cu()])
    .rpc();
}

export const freshRecipient = () => Keypair.generate().publicKey;

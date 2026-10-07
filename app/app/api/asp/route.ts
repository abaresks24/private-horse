// Keeper-as-serverless: publish the ASP (clean-set) Merkle root on-chain via on_report, signed by
// the forwarder authority. This is the DEMO STAND-IN for the Chainlink CRE DON — same on-chain
// interface (on_report only accepts the authorized forwarder); in production the forwarder is the
// Keystone Forwarder gated by DON OCR consensus. Clean set = all current deposits (faucet funds are
// clean; the gatekeeper's dirty-flipping is the local demo).
import { NextResponse } from "next/server";
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { buildPoseidon } from "circomlibjs";
import idl from "../../../lib/idl/sieve.json";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
const PID = new PublicKey("4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X");
const seed = (s: string) => new TextEncoder().encode(s);
const LEVELS = 20;
const feToBytes = (x: bigint) => { const h = x.toString(16).padStart(64, "0"); return (h.match(/.{2}/g) as string[]).map((b) => parseInt(b, 16)); };

function merkleRoot(leaves: bigint[], p: any): bigint {
  const F = p.F; const H = (a: bigint, b: bigint) => F.toObject(p([a, b]));
  const zeros = [0n]; for (let i = 1; i <= LEVELS; i++) zeros.push(H(zeros[i - 1], zeros[i - 1]));
  let lvl = leaves.length ? [...leaves] : [0n];
  for (let h = 0; h < LEVELS; h++) {
    const n: bigint[] = [];
    for (let i = 0; i < lvl.length; i += 2) n.push(H(lvl[i], i + 1 < lvl.length ? lvl[i + 1] : zeros[h]));
    lvl = n.length ? n : [zeros[h + 1]];
  }
  return lvl[0];
}

async function publish() {
  const conn = new Connection(RPC, "confirmed");
  const forwarder = Keypair.fromSeed(Uint8Array.from(new Array(32).fill(7)));
  const sign = (tx: any) => { if (tx.version !== undefined) tx.sign([forwarder]); else tx.partialSign(forwarder); return tx; };
  const wallet: any = {
    publicKey: forwarder.publicKey,
    payer: forwarder,
    signTransaction: async (tx: any) => sign(tx),
    signAllTransactions: async (txs: any[]) => txs.map(sign),
  };
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
  const program = new anchor.Program(idl as anchor.Idl, provider);
  const [pool] = PublicKey.findProgramAddressSync([seed("pool2")], PID);

  // v2 pool only: read DepositRecords by deriving their PDAs (seed "deposit2"), not getProgramAccounts
  // (which also returns orphaned old-pool records and would poison the root).
  const poolInfo = await conn.getAccountInfo(pool);
  const nextIndex = poolInfo ? Number(new DataView(poolInfo.data.buffer, poolInfo.data.byteOffset, poolInfo.data.byteLength).getBigUint64(144, true)) : 0;
  const pdas = Array.from({ length: nextIndex }, (_, i) => PublicKey.findProgramAddressSync([seed("deposit2"), new anchor.BN(i).toArrayLike(Buffer, "le", 8)], PID)[0]);
  const infos = nextIndex ? await conn.getMultipleAccountsInfo(pdas) : [];
  const deposits = infos.map((acc, i) => acc ? { leafIndex: i, commitment: BigInt("0x" + (acc.data as Buffer).subarray(48, 80).toString("hex")) } : null)
    .filter(Boolean) as { leafIndex: number; commitment: bigint }[];

  const p = await buildPoseidon();
  const root = merkleRoot(deposits.map((d) => d.commitment), p);
  const rootBytes = feToBytes(root);

  const poolAcc: any = await (program.account as any).pool.fetch(pool);
  const known: boolean = poolAcc.aspRoots.some((r: number[]) => r.every((b, i) => b === rootBytes[i]));
  if (known || deposits.length === 0) {
    return { published: false, root: "0x" + root.toString(16), epoch: poolAcc.aspEpoch.toNumber(), count: deposits.length };
  }

  const epoch = poolAcc.aspEpoch.toNumber() + 1;
  const sig = await program.methods
    .onReport({ aspRoot: rootBytes, epoch: new anchor.BN(epoch), cleanCount: new anchor.BN(deposits.length) })
    .accounts({ pool, forwarder: forwarder.publicKey })
    .rpc();
  return { published: true, root: "0x" + root.toString(16), epoch, count: deposits.length, sig };
}

export async function GET() {
  try { return NextResponse.json(await publish()); }
  catch (e: any) { return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 }); }
}
export async function POST() { return GET(); }

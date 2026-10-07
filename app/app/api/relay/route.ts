// Relayer: submits a private withdrawal paid by a funded relayer account, so the user's wallet
// NEVER appears in the withdraw tx (full unlinkability — the ZK proof is the authorization, the
// recipient is a fresh address). The client generates the proof in-browser and posts it here.
import { NextResponse } from "next/server";
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, Keypair, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import idl from "../../../lib/idl/sieve.json";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
const PID = new PublicKey("4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X");
const seed = (s: string) => new TextEncoder().encode(s);

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const { proofA, proofB, proofC, rootDeposits, rootAsp, nullifierHash, recipientField, auditorCt, recipient } = b;

    const conn = new Connection(RPC, "confirmed");
    const relayer = Keypair.fromSeed(Uint8Array.from(Array.from("private-horse-feepayer-v1".padEnd(32, "!")).map((c) => c.charCodeAt(0))));
    const sign = (tx: any) => { if (tx.version !== undefined) tx.sign([relayer]); else tx.partialSign(relayer); return tx; };
    const wallet: any = { publicKey: relayer.publicKey, payer: relayer, signTransaction: async (t: any) => sign(t), signAllTransactions: async (ts: any[]) => ts.map(sign) };
    const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
    const program = new anchor.Program(idl as anchor.Idl, provider);

    const [pool] = PublicKey.findProgramAddressSync([seed("pool2")], PID);
    const [vault] = PublicKey.findProgramAddressSync([seed("vault2")], PID);
    const [nullifierRecord] = PublicKey.findProgramAddressSync([seed("nullifier2"), Uint8Array.from(nullifierHash)], PID);

    const sig = await program.methods
      .withdraw({ proofA, proofB, proofC, rootDeposits, rootAsp, nullifierHash, recipientField, auditorCt })
      .accounts({ pool, nullifierRecord, vault, recipient: new PublicKey(recipient), payer: relayer.publicKey, systemProgram: SystemProgram.programId })
      .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
      .rpc();

    return NextResponse.json({ sig });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { newNote, commitment, serializeNote, toHex, type Note } from "../lib/notes";
import HorseMark from "../components/HorseMark";
import { LoaderOverlay } from "../components/Loader";

const PROGRAM_ID = "4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X";
const RPC = "https://api.devnet.solana.com";
const EXPLORER = `https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`;

// Pool layout (programs/sieve/src/state.rs): TREE_HEIGHT=20, ROOT_HISTORY_SIZE=16.
const OFF = { denomination: 136, nextIndex: 144, depositRoots: 792, depositRootIndex: 1304, aspRoots: 1312, aspRootIndex: 1824, aspEpoch: 1832 };
const ROOT_HISTORY = 16;

interface PoolState { denomination: bigint; nextIndex: bigint; aspEpoch: bigint; depositRoot: string; aspRoot: string; }
function decodePool(data: Uint8Array): PoolState {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u64 = (o: number) => dv.getBigUint64(o, true);
  const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  const root = (base: number, idx: number) => "0x" + hex(data.slice(base + idx * 32, base + idx * 32 + 32));
  return {
    denomination: u64(OFF.denomination), nextIndex: u64(OFF.nextIndex), aspEpoch: u64(OFF.aspEpoch),
    depositRoot: root(OFF.depositRoots, Number(u64(OFF.depositRootIndex)) % ROOT_HISTORY),
    aspRoot: root(OFF.aspRoots, Number(u64(OFF.aspRootIndex)) % ROOT_HISTORY),
  };
}

export default function Home() {
  const [pool, setPool] = useState<PoolState | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState<Note | null>(null);
  const [commit, setCommit] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setErr("");
      const conn = new Connection(RPC, "confirmed");
      const [poolPda] = PublicKey.findProgramAddressSync([new TextEncoder().encode("pool")], new PublicKey(PROGRAM_ID));
      const acc = await conn.getAccountInfo(poolPda);
      if (!acc) { setErr("pool not initialised on devnet yet"); return; }
      setPool(decodePool(new Uint8Array(acc.data)));
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { refresh(); }, []);

  async function genNote() {
    setBusy(true);
    try {
      const n = newNote(pool ? pool.denomination : 300_000_000n);
      setNote(n);
      setCommit(toHex(await commitment(n)));
    } finally { setBusy(false); }
  }

  return (
    <>
      <LoaderOverlay hidden={!busy} label="Sealing commitment" />

      {/* HERO */}
      <section className="hero">
        <div className="wrap">
          <div className="kicker"><span className="eyebrow" style={{ margin: 0 }}>Solana · Chainlink CRE</span></div>
          <h1 className="display h-xl" style={{ marginTop: 18 }}>
            Private by default.<br /><span className="serif-italic">Clean</span> by proof.
          </h1>
          <p className="lede" style={{ marginTop: 26 }}>
            A privacy pool where the set of <em>clean</em> deposits isn&apos;t held by one company — it&apos;s
            maintained by a decentralized Chainlink&nbsp;CRE oracle. You withdraw by proving your funds
            belong to that set, in zero-knowledge, without revealing which deposit is yours.
          </p>
          <div style={{ display: "flex", gap: 14, marginTop: 30, flexWrap: "wrap" }}>
            <a className="btn" href="#how">See the mechanism</a>
            <a className="btn ghost" href="/demo">Run the demo</a>
          </div>

          <div className="figure" style={{ marginTop: 48 }}>
            <HeroHorse />
          </div>
        </div>
      </section>

      {/* WHY */}
      <section className="band">
        <div className="wrap cols">
          <div>
            <p className="eyebrow">The problem</p>
            <h2 className="display h-l">Tornado mixed the honest with the stolen.</h2>
          </div>
          <div>
            <p style={{ color: "var(--ink-soft)", fontSize: "1.05rem" }}>
              Mixers give privacy — and launder hacks, so they get sanctioned. Privacy Pools fix this: at
              withdrawal you prove membership in a <em>clean</em> set without revealing your deposit. But
              today that clean set is curated by a single operator — the chokepoint is back.
            </p>
            <p style={{ color: "var(--ink-soft)", fontSize: "1.05rem", marginTop: 16 }}>
              <strong>Private Horse decentralizes the gatekeeper.</strong> A Chainlink DON traces fund
              provenance across independent sources, reaches consensus, and writes the clean-set root
              on-chain — append-only, so no one is ever frozen retroactively.
            </p>
          </div>
        </div>
      </section>

      {/* HOW */}
      <section className="band" id="how">
        <div className="wrap">
          <p className="eyebrow">The mechanism</p>
          <h2 className="display h-l" style={{ marginBottom: 34 }}>Four moves.</h2>
          <div className="steps">
            {STEPS.map((s, i) => (
              <div className="step" key={i}>
                <div className="n">{String(i + 1).padStart(2, "0")}</div>
                <div><h3>{s.t}</h3><p>{s.d}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* POOL (live devnet) */}
      <section className="band" id="pool">
        <div className="wrap cols">
          <div className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <p className="eyebrow" style={{ margin: 0 }}>Live · Solana devnet</p>
              <a href={EXPLORER} target="_blank" style={{ color: "var(--gold)", fontSize: 12, fontFamily: "var(--mono)" }}>Explorer ↗</a>
            </div>
            <p className="mono" style={{ color: "#9c9384", marginTop: 10, fontSize: 11 }}>{PROGRAM_ID}</p>
            {err && <p style={{ color: "#e2a08f" }} className="mono">{err}</p>}
            {pool && (
              <div className="statgrid">
                <Stat k="Denomination" v={`${Number(pool.denomination) / 1e9} SOL`} />
                <Stat k="Deposits" v={pool.nextIndex.toString()} />
                <Stat k="ASP epoch" v={pool.aspEpoch.toString()} />
                <Stat k="Deposit root" v={pool.depositRoot.slice(0, 14) + "…"} />
                <Stat k="ASP root (DON)" v={pool.aspRoot.slice(0, 14) + "…"} />
              </div>
            )}
            <button className="btn" style={{ background: "var(--gold)", color: "#17130f" }} onClick={refresh}>Refresh</button>
          </div>

          <div>
            <p className="eyebrow">Try it</p>
            <h2 className="display h-l" style={{ fontSize: "2rem" }}>Seal a deposit note.</h2>
            <p className="muted" style={{ margin: "10px 0 16px" }}>
              Generates <code>Poseidon(secret, nullifier, amount)</code> in your browser. The CRE workflow
              then traces your address&apos; provenance and adds you to the clean set.
            </p>
            <button className="btn" onClick={genNote} disabled={busy}>{busy ? "Sealing…" : "Generate note"}</button>
            {note && (
              <pre className="note" style={{ marginTop: 14 }}>
commitment : {commit}
note (KEEP THIS) : {serializeNote(note)}</pre>
            )}
            <p className="muted" style={{ marginTop: 18, fontSize: 13 }}>
              Private withdrawal (Groth16 proof) + exclusion + ragequit run end-to-end via
              <code> scripts/demo.ts</code>. Control panel: <a href="/demo">/demo</a>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

const STEPS = [
  { t: "Deposit", d: "Lock the fixed denomination; a Poseidon commitment enters the on-chain Merkle tree. Your address is recorded only so the oracle can trace provenance." },
  { t: "CRE attests the clean set", d: "A Chainlink DON traces fund provenance across independent sources, reaches consensus, and writes the clean-set Merkle root on-chain — append-only." },
  { t: "Withdraw, privately", d: "Prove in zero-knowledge that your commitment is in the deposit tree AND the clean-set root — without revealing which. groth16-solana verifies it on-chain; funds go to a fresh address." },
  { t: "Ragequit", d: "Never in the clean set? Recover your funds to your original address (public, no privacy). No one is ever frozen." },
];

const Stat = ({ k, v }: { k: string; v: string }) => (
  <div className="stat"><div className="k">{k}</div><div className="v">{v}</div></div>
);

function HeroHorse() {
  const [noVideo, setNoVideo] = useState(false);
  if (noVideo) return <HorseMark size={120} color="#8a3a2a" />;
  return (
    <video src="/horse-run.mp4" poster="/horse-poster.jpg" autoPlay loop muted playsInline onError={() => setNoVideo(true)} />
  );
}

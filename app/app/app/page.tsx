"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { LoaderOverlay } from "../../components/Loader";
import { newNote, serializeNote, parseNote } from "../../lib/notes";
import {
  getProgram, deposit, proveWithdraw, withdraw, proveRagequit, ragequit,
  pool, freshRecipient, MOCK_URL,
} from "../../lib/protocol";

const tx = (s: string) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;
const short = (s: string) => s.slice(0, 8) + "…" + s.slice(-8);

const OFF = { denomination: 136, nextIndex: 144, aspRoots: 1312, aspRootIndex: 1824, aspEpoch: 1832 };
function decodePool(data: Uint8Array) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u64 = (o: number) => dv.getBigUint64(o, true);
  const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  const idx = Number(u64(OFF.aspRootIndex)) % 16;
  return { denomination: u64(OFF.denomination), nextIndex: u64(OFF.nextIndex), aspEpoch: u64(OFF.aspEpoch), aspRoot: "0x" + hex(data.slice(OFF.aspRoots + idx * 32, OFF.aspRoots + idx * 32 + 32)) };
}

export default function AppPage() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const anchorWallet = useAnchorWallet();
  const program = useMemo(() => (anchorWallet ? getProgram(connection, anchorWallet) : null), [connection, anchorWallet]);

  const [poolInfo, setPoolInfo] = useState<ReturnType<typeof decodePool> | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [log, setLog] = useState<{ kind: "ok" | "err"; msg: string; sig?: string } | null>(null);

  async function refresh() { try { const acc = await connection.getAccountInfo(pool()); if (acc) setPoolInfo(decodePool(new Uint8Array(acc.data))); } catch { /* */ } }
  useEffect(() => { refresh(); const t = setInterval(refresh, 8000); return () => clearInterval(t); }, [connection]);
  const denom = poolInfo ? poolInfo.denomination : 300_000_000n;
  const sol = (v: bigint) => `${Number(v) / 1e9} SOL`;

  async function onDeposit() {
    if (!program || !publicKey) return;
    setBusy("Depositing"); setLog(null);
    try { const n = newNote(denom); const sig = await deposit(program, publicKey, n); setNote(serializeNote(n)); setLog({ kind: "ok", msg: `Deposited ${sol(denom)}. Save your note below.`, sig }); refresh(); }
    catch (e: any) { setLog({ kind: "err", msg: e.message }); } finally { setBusy(""); }
  }
  async function onWithdraw() {
    if (!program || !publicKey) return;
    setBusy("Proving in-browser & withdrawing"); setLog(null);
    try { const n = parseNote(note.trim()); const r = freshRecipient(); const { proof, auditorCt } = await proveWithdraw(connection, n, r); const sig = await withdraw(program, publicKey, proof, r, auditorCt); setLog({ kind: "ok", msg: `Withdrawn privately → fresh address ${r.toBase58().slice(0, 8)}…`, sig }); refresh(); }
    catch (e: any) { setLog({ kind: "err", msg: friendly(e.message) }); } finally { setBusy(""); }
  }
  async function onRagequit() {
    if (!program || !publicKey) return;
    setBusy("Proving & ragequitting"); setLog(null);
    try { const n = parseNote(note.trim()); const r = await proveRagequit(connection, n); const sig = await ragequit(program, publicKey, r); setLog({ kind: "ok", msg: `Ragequit → original address ${r.depositor.toBase58().slice(0, 8)}… (public)`, sig }); refresh(); }
    catch (e: any) { setLog({ kind: "err", msg: friendly(e.message) }); } finally { setBusy(""); }
  }

  return (
    <section className="app-shell">
      <LoaderOverlay hidden={!busy} label={busy || "Working"} />
      <div className="wrap">
        <header className="app-head">
          <p className="kicker"><span className="dot" /> Privacy pool · Solana devnet</p>
          <h1 className="section-title">Deposit. Withdraw privately. Ragequit.</h1>
          <p className="app-sub">
            Lock a fixed denomination, prove membership of the CRE-maintained clean set in your
            browser, and withdraw to a fresh address. No operator ever learns the link between your
            deposit and your withdrawal.
          </p>
        </header>

        <div className="poolbar">
          <div className="pcell"><div className="pk">Denomination</div><div className="pv">{poolInfo ? sol(poolInfo.denomination) : "—"}</div></div>
          <div className="pcell"><div className="pk">Deposits</div><div className="pv">{poolInfo ? poolInfo.nextIndex.toString() : "—"}</div></div>
          <div className="pcell"><div className="pk">ASP epoch · DON</div><div className="pv">{poolInfo ? poolInfo.aspEpoch.toString() : "—"}</div></div>
          <div className="pcell"><div className="pk">ASP root</div><div className="pv">{poolInfo ? poolInfo.aspRoot.slice(0, 12) + "…" : "—"}</div></div>
        </div>

        {!connected && <div className="connect-note">Connect a devnet wallet (Phantom / Solflare) — top&nbsp;right — to deposit and withdraw.</div>}

        <div className="appgrid">
          <div className="actcard">
            <span className="num">01</span>
            <h3>Deposit</h3>
            <p>Lock {sol(denom)} into the pool. You receive a secret note — keep it safe, it&apos;s the only way to withdraw.</p>
            <button className="btn" disabled={!connected || !!busy} onClick={onDeposit}>Deposit {sol(denom)}</button>
          </div>
          <div className="actcard">
            <span className="num">02</span>
            <h3>Withdraw privately</h3>
            <p>Paste your note. A Groth16 proof is built in-browser; funds land at a brand-new address, unlinkable to your deposit.</p>
            <textarea className="field" rows={2} placeholder="horse-… (your secret note)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn" disabled={!connected || !!busy || !note} onClick={onWithdraw}>Prove &amp; withdraw</button>
          </div>
          <div className="actcard">
            <span className="num">03</span>
            <h3>Ragequit</h3>
            <p>Flagged out of the clean set? Recover your funds to your original address — public, but always available.</p>
            <button className="btn ghost" disabled={!connected || !!busy || !note} onClick={onRagequit}>Ragequit to origin</button>
          </div>
        </div>

        {log && (
          <div className={`receipt ${log.kind}`}>
            <div className="receipt-msg">{log.msg}</div>
            {log.sig && (
              <div className="txproof">
                <span className="tag">✓ On-chain proof</span>
                <code>{short(log.sig)}</code>
                <a href={tx(log.sig)} target="_blank" rel="noreferrer">Verify on Solana Explorer ↗</a>
              </div>
            )}
          </div>
        )}
        {note && (
          <div className="notebox">
            <div className="lbl">Your note — copy &amp; keep this</div>
            <pre className="note">{note}</pre>
          </div>
        )}

        <ProvenanceControl />
      </div>
    </section>
  );
}

function ProvenanceControl() {
  const SOURCES = ["trace", "ofac", "hacks"] as const;
  const [addr, setAddr] = useState("");
  const [dirty, setDirty] = useState<string[]>([]);
  const [up, setUp] = useState<boolean | null>(null);
  async function flip(s: string) {
    try { const r = await fetch(`${MOCK_URL}/flip?address=${addr}&source=${s}`, { method: "POST" }); const j = await r.json(); setDirty(j.dirtyOn ?? []); setUp(true); } catch { setUp(false); }
  }
  const clean = SOURCES.length - dirty.length;
  return (
    <div className="donpanel">
      <p className="kicker">Demo control · the DON gatekeeper</p>
      <h3>Provenance consensus</h3>
      <p>
        Flip provenance sources for a depositor; the decentralized oracle network applies a 2-of-3
        quorum to decide whether the address enters the clean set.
        {up === false && <span style={{ color: "#ff8f80" }}> — mock offline: run <code>npx ts-node scripts/provenance-mock-server.ts</code></span>}
      </p>
      <input className="field" placeholder="depositor address" value={addr} onChange={(e) => setAddr(e.target.value)} />
      <div style={{ display: "flex", gap: 10, margin: "14px 0 16px", flexWrap: "wrap" }}>
        {SOURCES.map((s) => { const d = dirty.includes(s); return <button key={s} onClick={() => flip(s)} className="src" style={{ background: d ? "#2a0d0a" : "#0e2a16", color: d ? "#ff8f80" : "#8fd49a", borderColor: d ? "#5a1a14" : "#1c4a2b" }}>{s}: <b>{d ? "DIRTY" : "clean"}</b></button>; })}
      </div>
      <div className="consensus" style={{ color: clean >= 2 ? "#8fd49a" : "#ff8f80" }}>consensus: {clean}/3 clean → {clean >= 2 ? "CLEAN (admitted to ASP root)" : "DIRTY (ragequit only)"}</div>
    </div>
  );
}

function friendly(m: string) {
  if (/not in tree|introuvable/.test(m)) return "This note isn't in the clean set (or not deposited yet). If flagged, use Ragequit.";
  if (/UnknownAspRoot|UnknownDepositRoot/.test(m)) return "Root not yet published on-chain — wait for the next CRE report, then retry.";
  if (/already (in use|been)/.test(m)) return "This note was already spent.";
  return m;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LoaderOverlay } from "../../components/Loader";
import { newNote, serializeNote, parseNote } from "../../lib/notes";
import {
  getProgram, deposit, proveWithdraw, withdraw, proveRagequit, ragequit,
  pool, freshRecipient, MOCK_URL,
} from "../../lib/protocol";

const tx = (s: string) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;

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

  async function onDeposit() {
    if (!program || !publicKey) return;
    setBusy("Depositing"); setLog(null);
    try { const n = newNote(denom); const sig = await deposit(program, publicKey, n); setNote(serializeNote(n)); setLog({ kind: "ok", msg: `Deposited ${Number(denom) / 1e9} SOL. SAVE your note below.`, sig }); refresh(); }
    catch (e: any) { setLog({ kind: "err", msg: e.message }); } finally { setBusy(""); }
  }
  async function onWithdraw() {
    if (!program || !publicKey) return;
    setBusy("Proving in-browser & withdrawing"); setLog(null);
    try { const n = parseNote(note.trim()); const r = freshRecipient(); const proof = await proveWithdraw(connection, n, r); const sig = await withdraw(program, publicKey, proof, r); setLog({ kind: "ok", msg: `Withdrawn PRIVATELY → fresh address ${r.toBase58().slice(0, 8)}…`, sig }); refresh(); }
    catch (e: any) { setLog({ kind: "err", msg: friendly(e.message) }); } finally { setBusy(""); }
  }
  async function onRagequit() {
    if (!program || !publicKey) return;
    setBusy("Proving & ragequitting"); setLog(null);
    try { const n = parseNote(note.trim()); const r = await proveRagequit(connection, n); const sig = await ragequit(program, publicKey, r); setLog({ kind: "ok", msg: `Ragequit → original address ${r.depositor.toBase58().slice(0, 8)}… (public)`, sig }); refresh(); }
    catch (e: any) { setLog({ kind: "err", msg: friendly(e.message) }); } finally { setBusy(""); }
  }

  return (
    <section className="band">
      <LoaderOverlay hidden={!busy} label={busy || "Working"} />
      <div className="wrap">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
          <div>
            <p className="eyebrow">Use the pool · live on devnet</p>
            <h1 className="display h-l">Deposit, withdraw privately, ragequit.</h1>
          </div>
          <WalletMultiButton />
        </div>

        <div className="statgrid" style={{ margin: "28px 0 32px" }}>
          <Stat k="Denomination" v={poolInfo ? `${Number(poolInfo.denomination) / 1e9} SOL` : "…"} />
          <Stat k="Deposits" v={poolInfo ? poolInfo.nextIndex.toString() : "…"} />
          <Stat k="ASP epoch (DON)" v={poolInfo ? poolInfo.aspEpoch.toString() : "…"} />
          <Stat k="ASP root" v={poolInfo ? poolInfo.aspRoot.slice(0, 14) + "…" : "…"} />
        </div>

        {!connected && <p className="muted" style={{ marginBottom: 20 }}>Connect a devnet wallet (Phantom / Solflare) to deposit and withdraw.</p>}

        <div className="appgrid">
          <div className="actcard">
            <h3>1 · Deposit</h3>
            <p className="muted">Lock {Number(denom) / 1e9} SOL. You get a secret note — keep it to withdraw later.</p>
            <button className="btn" disabled={!connected || !!busy} onClick={onDeposit}>Deposit {Number(denom) / 1e9} SOL</button>
          </div>
          <div className="actcard">
            <h3>2 · Withdraw privately</h3>
            <p className="muted">Paste your note. A Groth16 proof is built in your browser; funds go to a fresh address.</p>
            <textarea className="field" rows={2} placeholder="sieve-… (your note)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn" disabled={!connected || !!busy || !note} onClick={onWithdraw}>Prove &amp; withdraw</button>
          </div>
          <div className="actcard">
            <h3>3 · Ragequit</h3>
            <p className="muted">Excluded from the clean set? Recover to your original address (public).</p>
            <button className="btn ghost" disabled={!connected || !!busy || !note} onClick={onRagequit}>Ragequit</button>
          </div>
        </div>

        {log && <div className="logline" style={{ borderColor: log.kind === "ok" ? "var(--line-strong)" : "#c33", color: log.kind === "ok" ? "var(--ink)" : "#a40000" }}>{log.msg} {log.sig && <a href={tx(log.sig)} target="_blank" rel="noreferrer">view tx ↗</a>}</div>}
        {note && <pre className="note" style={{ marginTop: 16 }}>your note (KEEP THIS): {note}</pre>}

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
    <div style={{ marginTop: 46, borderTop: "1px solid var(--line)", paddingTop: 28 }}>
      <p className="eyebrow">Demo control · the DON gatekeeper</p>
      <p className="muted" style={{ maxWidth: "60ch", marginBottom: 14 }}>
        Flip provenance sources for a depositor; the DON applies a 2-of-3 quorum to set the clean set.
        {up === false && <span style={{ color: "#a40000" }}> — mock offline: run <code>npx ts-node scripts/provenance-mock-server.ts</code></span>}
      </p>
      <input className="field" placeholder="depositor address" value={addr} onChange={(e) => setAddr(e.target.value)} style={{ maxWidth: 520 }} />
      <div style={{ display: "flex", gap: 10, margin: "12px 0", flexWrap: "wrap" }}>
        {SOURCES.map((s) => { const d = dirty.includes(s); return <button key={s} onClick={() => flip(s)} className="src" style={{ background: d ? "#2a0d0a" : "#0e2a16", color: d ? "#ff8f80" : "#8fd49a" }}>{s}: <b>{d ? "DIRTY" : "clean"}</b></button>; })}
      </div>
      <div className="mono" style={{ color: clean >= 2 ? "var(--ink)" : "var(--red)" }}>consensus: {clean}/3 clean → {clean >= 2 ? "CLEAN (in ASP root)" : "DIRTY (ragequit only)"}</div>
    </div>
  );
}

const Stat = ({ k, v }: { k: string; v: string }) => (
  <div className="stat" style={{ background: "var(--ink)", color: "var(--paper)", padding: 16 }}>
    <div className="k">{k}</div><div className="v" style={{ color: "var(--paper)" }}>{v}</div>
  </div>
);

function friendly(m: string) {
  if (/not in tree|introuvable/.test(m)) return "This note isn't in the clean set (or not deposited yet). If flagged, use Ragequit.";
  if (/UnknownAspRoot|UnknownDepositRoot/.test(m)) return "Root not yet published on-chain — wait for the next CRE report, then retry.";
  if (/already (in use|been)/.test(m)) return "This note was already spent.";
  return m;
}

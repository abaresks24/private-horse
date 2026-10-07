"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { LoaderOverlay } from "../../components/Loader";
import { newNote, serializeNote, parseNote } from "../../lib/notes";
import {
  getProgram, depositBatch, provenanceCheck, proveWithdraw, withdraw, proveRagequit, ragequit,
  pool, freshRecipient, MOCK_URL,
} from "../../lib/protocol";

const tx = (s: string) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;
const short = (s: string) => s.slice(0, 7) + "…" + s.slice(-7);

const OFF = { denomination: 136, nextIndex: 144, aspRoots: 1312, aspRootIndex: 1824, aspEpoch: 1832 };
function decodePool(data: Uint8Array) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u64 = (o: number) => dv.getBigUint64(o, true);
  const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  const idx = Number(u64(OFF.aspRootIndex)) % 16;
  return { denomination: u64(OFF.denomination), nextIndex: u64(OFF.nextIndex), aspEpoch: u64(OFF.aspEpoch), aspRoot: "0x" + hex(data.slice(OFF.aspRoots + idx * 32, OFF.aspRoots + idx * 32 + 32)) };
}

type Prov = { up: boolean; votes: number; total: number; quorum: number };

export default function AppPage() {
  const { connection } = useConnection();
  const { publicKey, connected, signAllTransactions } = useWallet();
  const anchorWallet = useAnchorWallet();
  const program = useMemo(() => (anchorWallet ? getProgram(connection, anchorWallet) : null), [connection, anchorWallet]);

  const [poolInfo, setPoolInfo] = useState<ReturnType<typeof decodePool> | null>(null);
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [busy, setBusy] = useState("");
  const [log, setLog] = useState<{ kind: "ok" | "err"; msg: string; sigs?: string[] } | null>(null);

  // deposit (mix) state
  const [amount, setAmount] = useState("0.9");
  const [notes, setNotes] = useState<string[]>([]);
  const [prov, setProv] = useState<Prov | null>(null);

  // withdraw state
  const [note, setNote] = useState("");

  async function refresh() { try { const acc = await connection.getAccountInfo(pool()); if (acc) setPoolInfo(decodePool(new Uint8Array(acc.data))); } catch { /* */ } }
  useEffect(() => { refresh(); const t = setInterval(refresh, 8000); return () => clearInterval(t); }, [connection]);

  const denom = poolInfo ? poolInfo.denomination : 300_000_000n;
  const denomSol = Number(denom) / 1e9;
  const sol = (v: bigint) => `${Number(v) / 1e9} SOL`;
  const amt = parseFloat(amount) || 0;
  const chunks = amt > 0 ? Math.max(1, Math.round(amt / denomSol)) : 0;
  const total = chunks * denomSol;

  // advisory provenance pre-check on the connected wallet
  useEffect(() => {
    if (!publicKey) { setProv(null); return; }
    let live = true;
    provenanceCheck(publicKey.toBase58()).then((p) => { if (live) setProv(p); });
    return () => { live = false; };
  }, [publicKey]);

  const provBlocked = !!prov && prov.up && prov.votes < prov.quorum;

  async function onMix() {
    if (!program || !publicKey || !signAllTransactions || chunks < 1) return;
    setBusy(`Depositing 0/${chunks}`); setLog(null); setNotes([]);
    try {
      const ns = Array.from({ length: chunks }, () => newNote(denom));
      const sigs = await depositBatch(program, connection, publicKey, signAllTransactions, ns,
        (done, totalN) => setBusy(`Depositing ${done}/${totalN}`));
      setNotes(ns.map(serializeNote));
      setLog({ kind: "ok", msg: `Mixed ${total.toFixed(2)} SOL as ${chunks} × ${sol(denom)} — one signature.`, sigs });
      refresh();
    } catch (e: any) { setLog({ kind: "err", msg: e.message }); } finally { setBusy(""); }
  }

  async function onWithdraw() {
    if (!program || !publicKey) return;
    setBusy("Proving in-browser & withdrawing"); setLog(null);
    try { const n = parseNote(note.trim()); const r = freshRecipient(); const { proof, auditorCt } = await proveWithdraw(connection, n, r); const sig = await withdraw(program, publicKey, proof, r, auditorCt); setLog({ kind: "ok", msg: `Withdrawn privately → fresh address ${r.toBase58().slice(0, 8)}…`, sigs: [sig] }); refresh(); }
    catch (e: any) { setLog({ kind: "err", msg: friendly(e.message) }); } finally { setBusy(""); }
  }
  async function onRagequit() {
    if (!program || !publicKey) return;
    setBusy("Proving & ragequitting"); setLog(null);
    try { const n = parseNote(note.trim()); const r = await proveRagequit(connection, n); const sig = await ragequit(program, publicKey, r); setLog({ kind: "ok", msg: `Ragequit → original address ${r.depositor.toBase58().slice(0, 8)}… (public)`, sigs: [sig] }); refresh(); }
    catch (e: any) { setLog({ kind: "err", msg: friendly(e.message) }); } finally { setBusy(""); }
  }

  return (
    <section className="app-shell">
      <LoaderOverlay hidden={!busy} label={busy || "Working"} />
      <div className="wrap mixwrap">
        <p className="kicker center"><span className="dot" /> Privacy pool · Solana devnet</p>

        <div className="swapcard">
          <div className="seg">
            <button className={mode === "deposit" ? "active" : ""} onClick={() => { setMode("deposit"); setLog(null); }}>Mix in</button>
            <button className={mode === "withdraw" ? "active" : ""} onClick={() => { setMode("withdraw"); setLog(null); }}>Withdraw</button>
          </div>

          {mode === "deposit" ? (
            <>
              <label className="amountbox">
                <span className="amt-lbl">You mix</span>
                <div className="amt-row">
                  <input className="amt-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.0" />
                  <span className="amt-unit">SOL</span>
                </div>
                <div className="amt-chips">
                  {[0.3, 0.9, 3, 9].map((a) => (
                    <button key={a} className="chip" onClick={() => setAmount(String(a))}>{a}</button>
                  ))}
                </div>
              </label>

              <div className="splitline">
                <span>Split into</span>
                <span className="split-val">{chunks} × {denomSol} SOL</span>
              </div>

              {connected && prov && (
                <div className={`provline ${!prov.up ? "muted" : provBlocked ? "bad" : "good"}`}>
                  {!prov.up
                    ? "Provenance service offline — deposit allowed (advisory check skipped)"
                    : provBlocked
                      ? `⚠ Your funds trace clean on only ${prov.votes}/${prov.total} sources (need ${prov.quorum}). Mixing may not pass the DON clean set.`
                      : `✓ Your funds trace clean on ${prov.votes}/${prov.total} sources — provenance validated by the DON`}
                </div>
              )}

              <button className="bigbtn" disabled={!connected || !!busy || chunks < 1 || provBlocked} onClick={onMix}>
                {!connected ? "Connect wallet to mix" : provBlocked ? "Provenance not validated" : `Mix ${total.toFixed(2)} SOL · 1 signature`}
              </button>
              <p className="fineprint">One wallet approval signs all {chunks || "N"} deposits; they broadcast in sequence. You receive {chunks || "N"} secret notes.</p>
            </>
          ) : (
            <>
              <label className="amountbox">
                <span className="amt-lbl">Your note</span>
                <textarea className="notefield" rows={3} placeholder="horse-… (paste one secret note)" value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <button className="bigbtn" disabled={!connected || !!busy || !note} onClick={onWithdraw}>
                {!connected ? "Connect wallet to withdraw" : "Prove & withdraw privately"}
              </button>
              <button className="linkbtn" disabled={!connected || !!busy || !note} onClick={onRagequit}>Flagged out of the clean set? Ragequit to origin →</button>
              <p className="fineprint">A Groth16 proof is built in your browser; funds land at a brand-new address, unlinkable to your deposit.</p>
            </>
          )}

          {log && (
            <div className={`receipt ${log.kind}`}>
              <div className="receipt-msg">{log.msg}</div>
              {log.sigs && log.sigs.length > 0 && (
                <div className="txproof">
                  <span className="tag">✓ {log.sigs.length} on-chain {log.sigs.length > 1 ? "proofs" : "proof"}</span>
                  {log.sigs.slice(0, 4).map((s, i) => (
                    <a key={i} href={tx(s)} target="_blank" rel="noreferrer">{short(s)} ↗</a>
                  ))}
                  {log.sigs.length > 4 && <span className="more">+{log.sigs.length - 4} more</span>}
                </div>
              )}
            </div>
          )}

          {notes.length > 0 && (
            <div className="notebox">
              <div className="lbl">Save these {notes.length} notes — each withdraws one {denomSol} SOL chunk</div>
              <pre className="note">{notes.join("\n")}</pre>
            </div>
          )}
        </div>

        <div className="poolstrip">
          <span><b>{poolInfo ? denomSol : "—"}</b> SOL denom</span>
          <span><b>{poolInfo ? poolInfo.nextIndex.toString() : "—"}</b> deposits</span>
          <span>DON epoch <b>{poolInfo ? poolInfo.aspEpoch.toString() : "—"}</b></span>
          <span className="rootcell">ASP root <b>{poolInfo ? poolInfo.aspRoot.slice(0, 10) + "…" : "—"}</b></span>
        </div>

        <details className="demobox">
          <summary>Demo · DON provenance gatekeeper</summary>
          <ProvenanceControl />
        </details>
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
      <p>
        Flip provenance sources for a depositor; the DON applies a 2-of-3 quorum to decide whether the
        address enters the clean set.
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

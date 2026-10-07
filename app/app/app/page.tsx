"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { LoaderOverlay } from "../../components/Loader";
import {
  getProgram, depositBatch, provenanceCheck, proveWithdraw, withdraw, proveRagequit, ragequit,
  pool, freshRecipient,
} from "../../lib/protocol";
import { DERIVATION_MESSAGE, freeNotes, discoverDeposits, type MyDeposit } from "../../lib/account";

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
  const { publicKey, connected, signAllTransactions, signMessage } = useWallet();
  const anchorWallet = useAnchorWallet();
  const program = useMemo(() => (anchorWallet ? getProgram(connection, anchorWallet) : null), [connection, anchorWallet]);

  const [poolInfo, setPoolInfo] = useState<ReturnType<typeof decodePool> | null>(null);
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [busy, setBusy] = useState("");
  const [log, setLog] = useState<{ kind: "ok" | "err"; msg: string; sigs?: string[] } | null>(null);

  const [amount, setAmount] = useState("0.5");
  const [prov, setProv] = useState<Prov | null>(null);

  // derived "account": the wallet signature is the seed — nothing to store.
  const [seed, setSeed] = useState<Uint8Array | null>(null);
  const [myDeposits, setMyDeposits] = useState<MyDeposit[] | null>(null);

  async function refresh() { try { const acc = await connection.getAccountInfo(pool()); if (acc) setPoolInfo(decodePool(new Uint8Array(acc.data))); } catch { /* */ } }
  useEffect(() => { refresh(); const t = setInterval(refresh, 8000); return () => clearInterval(t); }, [connection]);
  useEffect(() => { setSeed(null); setMyDeposits(null); }, [publicKey]);

  const denom = poolInfo ? poolInfo.denomination : 100_000_000n;
  const denomSol = Number(denom) / 1e9;
  const sol = (v: bigint) => `${Number(v) / 1e9} SOL`;
  const amt = parseFloat(amount) || 0;
  const chunks = amt > 0 ? Math.max(1, Math.round(amt / denomSol)) : 0;
  const total = chunks * denomSol;

  useEffect(() => {
    if (!publicKey) { setProv(null); return; }
    let live = true;
    provenanceCheck(publicKey.toBase58()).then((p) => { if (live) setProv(p); });
    return () => { live = false; };
  }, [publicKey]);

  const provBlocked = !!prov && prov.up && prov.votes < prov.quorum;

  async function ensureSeed(): Promise<Uint8Array> {
    if (seed) return seed;
    if (!signMessage) throw new Error("This wallet can't sign messages — use Phantom or Solflare.");
    const sig = await signMessage(DERIVATION_MESSAGE);
    setSeed(sig);
    return sig;
  }

  async function onMix() {
    if (!program || !publicKey || !signAllTransactions || chunks < 1) return;
    setLog(null);
    try {
      setBusy("Sign to derive your keys");
      const s = await ensureSeed();
      setBusy("Preparing deposits");
      const ns = await freeNotes(connection, s, denom, chunks);
      const sigs = await depositBatch(program, connection, publicKey, signAllTransactions, ns,
        (done, totalN) => setBusy(`Depositing ${done}/${totalN}`));
      setLog({ kind: "ok", msg: `Mixed ${total.toFixed(2)} SOL as ${chunks} × ${sol(denom)}. Nothing to save — reconnect and sign to withdraw.`, sigs });
      refresh();
    } catch (e: any) { setLog({ kind: "err", msg: e.message }); } finally { setBusy(""); }
  }

  async function onLoad() {
    if (!publicKey) return;
    setLog(null);
    try {
      setBusy("Sign to load your deposits");
      const s = await ensureSeed();
      setBusy("Scanning the chain");
      const mine = await discoverDeposits(connection, s, denom);
      setMyDeposits(mine);
      if (!mine.length) setLog({ kind: "err", msg: "No deposits found for this wallet yet." });
    } catch (e: any) { setLog({ kind: "err", msg: e.message }); } finally { setBusy(""); }
  }

  const avail = (myDeposits ?? []).filter((d) => !d.spent);
  const spentCount = (myDeposits ?? []).length - avail.length;

  async function onWithdrawAll() {
    if (!program || !publicKey || !avail.length) return;
    setLog(null);
    const sigs: string[] = [];
    try {
      for (let k = 0; k < avail.length; k++) {
        setBusy(`Proving & withdrawing ${k + 1}/${avail.length}`);
        const r = freshRecipient();
        const { proof, auditorCt } = await proveWithdraw(connection, avail[k].note, r);
        sigs.push(await withdraw(program, publicKey, proof, r, auditorCt));
      }
      setLog({ kind: "ok", msg: `Withdrew ${avail.length} × ${sol(denom)} privately → fresh addresses.`, sigs });
      const s = await ensureSeed(); setMyDeposits(await discoverDeposits(connection, s, denom)); refresh();
    } catch (e: any) { setLog({ kind: "err", msg: friendly(e.message) }); } finally { setBusy(""); }
  }

  async function onRagequitAll() {
    if (!program || !publicKey || !avail.length) return;
    setLog(null);
    const sigs: string[] = [];
    try {
      for (let k = 0; k < avail.length; k++) {
        setBusy(`Ragequitting ${k + 1}/${avail.length}`);
        const r = await proveRagequit(connection, avail[k].note);
        sigs.push(await ragequit(program, publicKey, r));
      }
      setLog({ kind: "ok", msg: `Ragequit ${avail.length} × ${sol(denom)} → origin (public).`, sigs });
      const s = await ensureSeed(); setMyDeposits(await discoverDeposits(connection, s, denom)); refresh();
    } catch (e: any) { setLog({ kind: "err", msg: friendly(e.message) }); } finally { setBusy(""); }
  }

  return (
    <section className="app-shell">
      <LoaderOverlay hidden={!busy} label={busy || "Working"} />
      <div className="wrap mixwrap">
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
                  {[0.1, 0.5, 1, 5].map((a) => (
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
                      ? `⚠ Your funds trace clean on only ${prov.votes}/${prov.total} sources (need ${prov.quorum}).`
                      : `✓ Your funds trace clean on ${prov.votes}/${prov.total} sources — provenance validated by the DON`}
                </div>
              )}

              <button className="bigbtn" disabled={!connected || !!busy || chunks < 1 || provBlocked} onClick={onMix}>
                {!connected ? "Connect wallet to mix" : provBlocked ? "Provenance not validated" : `Mix ${total.toFixed(2)} SOL`}
              </button>
              <p className="fineprint">Sign once to derive your private keys, then approve the {chunks || "N"} deposits. Nothing to save — your wallet is the backup.</p>
            </>
          ) : (
            <>
              {myDeposits === null ? (
                <>
                  <p className="fineprint" style={{ margin: "20px 2px 18px" }}>Your deposits are derived from your wallet — nothing to paste. Sign to load them.</p>
                  <button className="bigbtn" disabled={!connected || !!busy} onClick={onLoad}>
                    {!connected ? "Connect wallet" : "Load my deposits"}
                  </button>
                </>
              ) : (
                <>
                  <div className="amountbox">
                    <span className="amt-lbl">Withdrawable</span>
                    <div className="amt-row">
                      <span className="amt-input">{(avail.length * denomSol).toFixed(1)}</span>
                      <span className="amt-unit">SOL</span>
                    </div>
                    <div className="splitline"><span>{avail.length} available</span><span className="split-val">{spentCount} already withdrawn</span></div>
                  </div>
                  <button className="bigbtn" disabled={!!busy || avail.length < 1} onClick={onWithdrawAll}>
                    {avail.length < 1 ? "Nothing to withdraw" : `Withdraw ${(avail.length * denomSol).toFixed(1)} SOL privately`}
                  </button>
                  <button className="linkbtn" disabled={!!busy || avail.length < 1} onClick={onRagequitAll}>Flagged out of the clean set? Ragequit all to origin →</button>
                </>
              )}
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
        </div>
      </div>
    </section>
  );
}

function friendly(m: string) {
  if (/not in tree|introuvable/.test(m)) return "This note isn't in the clean set yet. If flagged, use Ragequit.";
  if (/UnknownAspRoot|UnknownDepositRoot/.test(m)) return "Root not yet published on-chain — wait for the next CRE report, then retry.";
  if (/already (in use|been)/.test(m)) return "Already spent.";
  return m;
}

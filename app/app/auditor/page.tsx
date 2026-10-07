"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { LoaderOverlay } from "../../components/Loader";
import { fetchWithdrawals, fetchDeposits, auditDecrypt, type AuditRow, type Deposit } from "../../lib/protocol";
import { DEMO_AUDITOR_PRIV } from "../../lib/auditor";

const tx = (s: string) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;
const short = (s: string) => s.slice(0, 6) + "…" + s.slice(-6);
const shortHex = (x: bigint) => { const h = "0x" + x.toString(16).padStart(64, "0"); return h.slice(0, 8) + "…" + h.slice(-6); };

export default function Auditor() {
  const { connection } = useConnection();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState("");
  const [rows, setRows] = useState<{ row: AuditRow; depositor?: string }[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [err, setErr] = useState("");

  // Deposits are public (the depositor is in plaintext on-chain) — load them on mount, no key needed.
  useEffect(() => { fetchDeposits(connection).then(setDeposits).catch(() => {}); }, [connection]);

  async function onAudit() {
    setErr(""); setBusy("Reading withdrawals & decrypting");
    try {
      const priv = BigInt(key.trim());
      const withdrawals = await fetchWithdrawals(connection);
      const out = [];
      for (const row of withdrawals) {
        let depositor: string | undefined;
        try { depositor = await auditDecrypt(row.auditorCt, priv); } catch { /* wrong key / empty ct */ }
        out.push({ row, depositor });
      }
      setRows(out);
      if (!out.length) setErr("No withdrawals found yet on devnet.");
    } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  }

  return (
    <section className="app-shell">
      <LoaderOverlay hidden={!busy} label={busy || "Working"} />
      <div className="wrap" style={{ maxWidth: 920 }}>
        <header className="app-head">
          <p className="kicker"><span className="dot" /> Selective disclosure · by exception</p>
          <h1 className="section-title">See the real address behind a private withdrawal.</h1>
          <p className="app-sub" style={{ maxWidth: "64ch" }}>
            Each private withdrawal encrypts its <strong>original depositor address</strong> to the
            auditor&apos;s key. The recipient is already public; the link to the real identity is not —
            unless you hold the auditor key. Paste it to reveal that link, one transaction at a time.
          </p>
        </header>

        <input className="field" placeholder="auditor private key (0x…)" value={key} onChange={(e) => setKey(e.target.value)} />
        <div style={{ display: "flex", gap: 12, margin: "10px 0 6px", flexWrap: "wrap" }}>
          <button className="btn" disabled={!!busy || !key} onClick={onAudit}>Decrypt withdrawals</button>
          <button className="btn ghost" onClick={() => setKey(DEMO_AUDITOR_PRIV)}>Use demo auditor key</button>
        </div>
        {err && <p className="mono" style={{ color: "#a40000" }}>{err}</p>}

        {deposits.length > 0 && (
          <>
            <h2 className="section-title" style={{ fontSize: "1.25rem", margin: "34px 0 4px" }}>Deposits — public ledger</h2>
            <p className="muted" style={{ fontSize: 13, margin: "0 0 4px" }}>Depositor addresses are on-chain in plaintext — no key needed.</p>
            <table className="audit">
              <thead><tr><th>#</th><th>Depositor (public)</th><th>Commitment</th></tr></thead>
              <tbody>
                {deposits.map((d) => (
                  <tr key={d.leafIndex}>
                    <td className="mono">{d.leafIndex}</td>
                    <td className="mono">{short(d.depositor)}</td>
                    <td className="mono">{shortHex(d.commitment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {rows.length > 0 && (
          <>
          <h2 className="section-title" style={{ fontSize: "1.25rem", margin: "34px 0 4px" }}>Private withdrawals — decrypted</h2>
          <table className="audit">
            <thead><tr><th>Tx</th><th>Public recipient</th><th>Original depositor (decrypted)</th></tr></thead>
            <tbody>
              {rows.map(({ row, depositor }, i) => (
                <tr key={i}>
                  <td><a href={tx(row.sig)} target="_blank" rel="noreferrer">{short(row.sig)} ↗</a></td>
                  <td className="mono">{short(row.recipient)}</td>
                  <td className="mono" style={{ color: depositor ? "var(--red)" : "var(--taupe)" }}>{depositor ? short(depositor) : "— (wrong key / legacy)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}

        <p className="muted" style={{ marginTop: 26, fontSize: 13, maxWidth: "64ch" }}>
          The ciphertext↔value binding is enforced off-chain here; the in-circuit honest-encryption
          constraint is the documented hardening step. Decryption is trustworthy for withdrawals made by this app.
        </p>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { LoaderOverlay } from "../../components/Loader";
import { fetchWithdrawals, auditDecrypt, type AuditRow } from "../../lib/protocol";
import { DEMO_AUDITOR_PRIV } from "../../lib/auditor";

const tx = (s: string) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;
const short = (s: string) => s.slice(0, 6) + "…" + s.slice(-6);

export default function Auditor() {
  const { connection } = useConnection();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState("");
  const [rows, setRows] = useState<{ row: AuditRow; depositor?: string }[]>([]);
  const [err, setErr] = useState("");

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
    <section className="band">
      <LoaderOverlay hidden={!busy} label={busy || "Working"} />
      <div className="wrap" style={{ maxWidth: 920 }}>
        <h1 className="display h-l">See the real address behind a private withdrawal.</h1>
        <p className="lede" style={{ margin: "18px 0 20px", maxWidth: "64ch" }}>
          Each private withdrawal encrypts its <strong>original depositor address</strong> to the
          auditor&apos;s key. The recipient is already public; the link to the real identity is not —
          unless you hold the auditor key. Paste it to reveal that link, one transaction at a time.
        </p>

        <input className="field" placeholder="auditor private key (0x…)" value={key} onChange={(e) => setKey(e.target.value)} />
        <div style={{ display: "flex", gap: 12, margin: "10px 0 6px", flexWrap: "wrap" }}>
          <button className="btn" disabled={!!busy || !key} onClick={onAudit}>Decrypt withdrawals</button>
          <button className="btn ghost" onClick={() => setKey(DEMO_AUDITOR_PRIV)}>Use demo auditor key</button>
        </div>
        {err && <p className="mono" style={{ color: "#a40000" }}>{err}</p>}

        {rows.length > 0 && (
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
        )}

        <p className="muted" style={{ marginTop: 26, fontSize: 13, maxWidth: "64ch" }}>
          The ciphertext↔value binding is enforced off-chain here; the in-circuit honest-encryption
          constraint is the documented hardening step. Decryption is trustworthy for withdrawals made by this app.
        </p>
      </div>
    </section>
  );
}

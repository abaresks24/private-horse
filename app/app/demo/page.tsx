"use client";

import { useState } from "react";

// Demo control panel — flip provenance sources live to show the DON consensus deciding.
// Talks to scripts/provenance-mock-server.ts on :8787.

const MOCK = "http://localhost:8787";
const SOURCES = ["taint", "ofac", "hacks"] as const;

export default function Demo() {
  const [address, setAddress] = useState("HACKERxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
  const [dirtyOn, setDirtyOn] = useState<string[]>([]);
  const quorum = 2;

  async function flip(source: string) {
    try {
      const r = await fetch(`${MOCK}/flip?address=${address}&source=${source}`, { method: "POST" });
      const j = await r.json();
      setDirtyOn(j.dirtyOn ?? []);
    } catch { /* mock server offline */ }
  }

  const clean = SOURCES.length - dirtyOn.length;
  const isClean = clean >= quorum;

  return (
    <section className="band">
      <div className="wrap" style={{ maxWidth: 820 }}>
        <p className="eyebrow">Demo · DON consensus</p>
        <h1 className="display h-l">The gatekeeper, decentralized.</h1>
        <p className="muted" style={{ margin: "14px 0 30px", maxWidth: "52ch" }}>
          Flip provenance sources for an address. The DON applies a {quorum}-of-{SOURCES.length} quorum.
          Show two sources disagreeing — then the consensus decides, and the clean-set root follows.
          Requires the mock server: <code>npx ts-node scripts/provenance-mock-server.ts</code>.
        </p>

        <input className="field" value={address} onChange={(e) => setAddress(e.target.value)} />

        <div style={{ display: "flex", gap: 12, margin: "18px 0" }}>
          {SOURCES.map((s) => {
            const dirty = dirtyOn.includes(s);
            return (
              <button key={s} onClick={() => flip(s)} style={{
                flex: 1, padding: 18, border: "1px solid var(--line-strong)", cursor: "pointer",
                background: dirty ? "#2a1512" : "#13321a", color: dirty ? "#e2a08f" : "#7fae86",
                fontFamily: "var(--mono)", fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase",
              }}>
                {s}<br /><strong style={{ fontSize: 16 }}>{dirty ? "DIRTY" : "clean"}</strong>
              </button>
            );
          })}
        </div>

        <div className="panel">
          <div className="k" style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#9c9384" }}>
            DON consensus — {clean}/{SOURCES.length} clean · quorum {quorum}
          </div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 26, marginTop: 8, color: isClean ? "#7fae86" : "#e2a08f" }}>
            {isClean ? "CLEAN → included in the ASP root" : "DIRTY → excluded (ragequit only)"}
          </div>
        </div>
      </div>
    </section>
  );
}

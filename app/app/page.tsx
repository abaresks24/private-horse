import HeroHorse from "../components/HeroHorse";

const STEPS = [
  { t: "Deposit", d: "Lock the fixed denomination; a Poseidon commitment enters the on-chain Merkle tree. Your address is recorded only so the oracle can trace provenance." },
  { t: "CRE attests the clean set", d: "A Chainlink DON traces fund provenance across independent sources, reaches consensus, and writes the clean-set Merkle root on-chain — append-only." },
  { t: "Withdraw, privately", d: "Prove in zero-knowledge that your commitment is in the deposit tree AND the clean-set root — without revealing which. groth16-solana verifies on-chain; funds go to a fresh address." },
  { t: "Ragequit", d: "Never in the clean set? Recover your funds to your original address (public, no privacy). No one is ever frozen." },
];

export default function Landing() {
  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow" style={{ margin: 0 }}>Solana devnet · Chainlink CRE</p>
          <h1 className="display h-xl" style={{ marginTop: 16 }}>
            Private by default.<br /><span className="serif-italic red">Clean</span> by proof.
          </h1>
          <p className="lede" style={{ marginTop: 24 }}>
            A privacy pool where the set of <em>clean</em> deposits is maintained by a decentralized
            Chainlink&nbsp;CRE oracle — not one company. Withdraw by proving your funds belong to that
            set, in zero-knowledge, without revealing which deposit is yours.
          </p>
          <div style={{ display: "flex", gap: 14, marginTop: 28, flexWrap: "wrap" }}>
            <a className="btn" href="/app">Open the app</a>
            <a className="btn ghost" href="/docs">Read the docs</a>
          </div>
          <div className="figure"><HeroHorse /></div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="band">
        <div className="wrap cols">
          <div>
            <p className="eyebrow">The problem</p>
            <h2 className="display h-l">Tornado mixed the honest with the stolen.</h2>
          </div>
          <div>
            <p style={{ color: "var(--ink-soft)" }}>
              Mixers give privacy — and launder hacks, so they get sanctioned. Privacy Pools fix this:
              at withdrawal you prove membership in a <em>clean</em> set without revealing your deposit.
              But today that clean set is curated by a single operator — the chokepoint is back.
            </p>
            <p style={{ color: "var(--ink-soft)", marginTop: 16 }}>
              <strong>Private Horse decentralizes the gatekeeper.</strong> A Chainlink DON traces fund
              provenance across independent sources, reaches consensus, and writes the clean-set root
              on-chain — append-only, so no one is ever frozen retroactively.
            </p>
          </div>
        </div>
      </section>

      {/* HOW */}
      <section className="band">
        <div className="wrap">
          <p className="eyebrow">The mechanism</p>
          <h2 className="display h-l" style={{ marginBottom: 30 }}>Four moves.</h2>
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

      {/* WHY CRE */}
      <section className="band">
        <div className="wrap cols">
          <div>
            <p className="eyebrow">Why Chainlink CRE</p>
            <h2 className="display h-l">The oracle is the product.</h2>
          </div>
          <div>
            <p style={{ color: "var(--ink-soft)" }}>
              The provenance sources are off-chain, mutable, and disagree — exactly where a
              decentralized oracle network earns its keep. The DON reaches consensus and commits a
              single clean-set root on-chain. Remove the CRE workflow and there is no trustworthy
              root: the protocol stops. No single firm decides who can exit.
            </p>
            <a className="btn" href="/docs" style={{ marginTop: 20 }}>How it's built</a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="band" style={{ background: "var(--red)", color: "#fff", borderBottom: "none" }}>
        <div className="wrap" style={{ textAlign: "center" }}>
          <h2 className="display" style={{ fontSize: "clamp(2rem,5vw,3.4rem)", marginBottom: 20 }}>Try it on devnet.</h2>
          <a className="btn" href="/app" style={{ background: "#fff", color: "var(--red)" }}>Open the app</a>
        </div>
      </section>
    </>
  );
}

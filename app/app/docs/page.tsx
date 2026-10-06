export const metadata = { title: "Private Horse — docs" };

const PROGRAM = "4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X";

export default function Docs() {
  return (
    <section className="band">
      <div className="wrap doc-layout">
        <aside className="toc">
          <p className="eyebrow">Docs</p>
          <nav>
            <a href="#overview">Overview</a>
            <a href="#mechanism">Mechanism</a>
            <a href="#architecture">Architecture</a>
            <a href="#trust">Trust model</a>
            <a href="#security">Security</a>
            <a href="#status">Status &amp; links</a>
          </nav>
        </aside>

        <article className="doc">
          <h1 className="display h-l" style={{ marginBottom: 8 }}>Private Horse</h1>
          <p className="lede" style={{ marginBottom: 40 }}>
            Private by default · clean by proof · auditable by exception. A privacy pool on Solana
            whose clean-set is maintained by a decentralized Chainlink CRE oracle.
          </p>

          <h2 id="overview">Overview</h2>
          <p>
            Mixers give privacy but also launder stolen funds, which is why Tornado was sanctioned.
            The Privacy Pools model (Buterin / 0xbow) fixes this: at withdrawal you prove in
            zero-knowledge that your deposit belongs to a set of <em>clean</em> deposits, without
            revealing which one is yours. The honest dissociate from the thief; the thief cannot
            produce the proof.
          </p>
          <p>
            Today that clean set is curated by a single operator — recentralizing the chokepoint.
            Private Horse hands it to a <strong>Chainlink CRE DON</strong>: it traces fund provenance
            across independent sources, reaches consensus, and writes the clean-set Merkle root
            on-chain, <strong>append-only</strong>. No single firm decides who can exit, and no one is
            ever frozen retroactively.
          </p>

          <h2 id="mechanism">Mechanism</h2>
          <ol>
            <li><strong>Deposit.</strong> Lock the fixed denomination; a commitment
              <code>Poseidon(secret, nullifier, amount)</code> enters the on-chain Merkle tree. Your
              address is recorded only so the oracle can trace provenance.</li>
            <li><strong>CRE attests the clean set.</strong> A DON traces provenance (OFAC, hack
              attribution, risk APIs), reaches a k-of-n consensus, and writes the clean-set Merkle
              root via the Keystone Forwarder → <code>on_report</code>. Append-only.</li>
            <li><strong>Withdraw, privately.</strong> A Groth16 proof shows your commitment is in the
              deposit tree <em>and</em> a published clean-set root, and reveals a nullifier hash —
              without revealing which deposit. <code>groth16-solana</code> verifies on-chain; funds
              go to a fresh address.</li>
            <li><strong>Ragequit.</strong> If the clean set never included you, recover funds to your
              original address (public, no privacy). Nobody is ever stuck.</li>
          </ol>

          <h2 id="architecture">Architecture</h2>
          <h3>Anchor program (<code>sieve</code>)</h3>
          <p>Instructions: <code>initialize</code>, <code>deposit</code> (incremental Poseidon Merkle
            insert via the native <code>sol_poseidon</code> syscall), <code>on_report</code>
            (append-only clean-set root, only from the authorized DON forwarder),
            <code>withdraw</code> (Groth16 verify + nullifier PDA preventing double-spend),
            <code>ragequit</code>.</p>
          <h3>Circom circuits</h3>
          <p><code>withdraw</code> proves dual Merkle membership (deposit tree + ASP root) + nullifier
            (21,822 constraints); <code>ragequit</code> proves deposit-tree membership only. Groth16,
            verified on-chain with native <code>alt_bn128</code>.</p>
          <h3>Chainlink CRE workflow</h3>
          <p>A cron workflow reads new deposits (HTTP RPC — CRE is write-only on Solana), traces each
            depositor's provenance across multiple sources, reaches DON consensus, builds the
            append-only clean-set Merkle root, and writes a signed report to <code>on_report</code>.
            The CRE is load-bearing: remove it and there is no trustworthy root.</p>
          <p className="muted">Note: Poseidon parity between the native Solana syscall and circomlib is
            verified byte-for-byte, so the circuit, client, and on-chain tree agree.</p>

          <h2 id="trust">Trust model</h2>
          <p>The honest claim: this is a <em>composition</em> with a stronger trust root, not a new
            cryptographic primitive. What it is, and isn't, vs prior art:</p>
          <ul>
            <li><strong>vs Privacy Cash / 0xbow</strong> — they run a privacy pool with a
              <em>centralized</em> clean-set operator. We decentralize who computes it (DON
              consensus), make it append-only (no retroactive freeze), and add ragequit.</li>
            <li><strong>vs Cloak</strong> — a shielded pool + viewing key, with no oracle-maintained
              association set. Ours adds the decentralized, provenance-attested clean set.</li>
            <li><strong>vs Chainlink ACE</strong> — per-address compliance booleans. We publish a
              Merkle <em>root</em> of an association set, consumed privately in ZK.</li>
            <li><strong>vs DECO</strong> — proves predicates over web/TLS data the prover opens
              themselves. Our trust root is a multi-source DON consensus, and the value never lands
              on-chain in cleartext.</li>
          </ul>
          <p>Honest limit: the provenance sources are themselves third parties (OFAC/TRM/…). The DON
            removes the <em>single point of capture</em> and surfaces disagreement; it does not make
            provenance trustless.</p>

          <h2 id="security">Security</h2>
          <ul>
            <li><strong>Double-spend</strong> — a per-nullifier PDA is <code>init</code>-ed on
              withdrawal; re-use fails, without revealing which commitment was spent.</li>
            <li><strong>No retroactive freeze</strong> — the ASP root is append-only; once included,
              you stay includable.</li>
            <li><strong>Guaranteed exit</strong> — ragequit always returns funds to the origin.</li>
            <li><strong>Only the DON writes the root</strong> — <code>on_report</code> checks the
              signer equals the authorized forwarder and that the epoch is monotonic.</li>
          </ul>
          <p className="muted">6/6 integration tests cover the on-report guards, deposit, and the
            unknown-root rejection. The full deposit→report→withdraw→ragequit flow has run on devnet.</p>

          <h2 id="status">Status &amp; links</h2>
          <ul>
            <li>Program (Solana devnet): <code>{PROGRAM}</code> —{" "}
              <a href={`https://explorer.solana.com/address/${PROGRAM}?cluster=devnet`} target="_blank" rel="noreferrer">Explorer ↗</a></li>
            <li>Source: <a href="https://github.com/abaresks24/private-horse" target="_blank" rel="noreferrer">github.com/abaresks24/private-horse ↗</a></li>
            <li>Try it: <a href="/app">the app →</a></li>
          </ul>
        </article>
      </div>
    </section>
  );
}

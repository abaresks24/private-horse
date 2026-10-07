import Link from "next/link";

export const metadata = { title: "Private Horse — docs" };

const PROGRAM = "4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X";

export default function Docs() {
  return (
    <section className="app-shell">
      <div className="wrap doc-layout">
        <aside className="toc">
          <p className="kicker">Docs</p>
          <nav>
            <a href="#overview">Overview</a>
            <a href="#lifecycle">Lifecycle</a>
            <a href="#crypto">Cryptography</a>
            <a href="#cre">The CRE oracle</a>
            <a href="#auditor">Selective disclosure</a>
            <a href="#onchain">On-chain program</a>
            <a href="#trust">Trust model</a>
            <a href="#security">Security</a>
            <a href="#status">Status &amp; links</a>
          </nav>
        </aside>

        <article className="doc">
          <p className="kicker"><span className="dot" /> Protocol documentation</p>
          <h1 className="section-title" style={{ marginBottom: 10 }}>How Private Horse works</h1>
          <p className="app-sub" style={{ marginBottom: 44 }}>
            Private by default · clean by proof · auditable by exception. A privacy pool on Solana
            whose clean-set is maintained by a decentralized Chainlink CRE oracle instead of a single
            operator.
          </p>

          <h2 id="overview">Overview</h2>
          <p>
            Mixers give privacy but also launder stolen funds, which is why Tornado Cash was
            sanctioned. The <strong>Privacy Pools</strong> model (Buterin / 0xbow) fixes the incentive:
            at withdrawal you prove in zero-knowledge that your deposit belongs to a set of{" "}
            <em>clean</em> deposits — the <em>association set</em> — without revealing which deposit is
            yours. Honest users dissociate from the thief; the thief cannot produce the proof, so the
            pool stays private for the honest and useless for the launderer.
          </p>
          <p>
            In every existing deployment that clean set is curated by a <strong>single operator</strong>,
            which recreates the chokepoint the pool was meant to remove: one party decides who can exit,
            and could freeze a previously-included deposit. Private Horse hands the job to a{" "}
            <strong>Chainlink CRE DON</strong>. The network traces fund provenance across independent
            sources, reaches consensus, and writes the association-set Merkle root on-chain,{" "}
            <strong>append-only</strong>. No single firm decides who exits, and nobody is ever frozen
            retroactively.
          </p>

          <h2 id="lifecycle">Lifecycle of a deposit</h2>
          <p>
            Each deposit turns on a secret <em>note</em> — but you never copy or store it. Notes are{" "}
            <strong>derived deterministically from a one-time wallet signature</strong>, so your wallet
            is the only backup (the account model). Here is a deposit&apos;s full life:
          </p>
          <ol>
            <li>
              <strong>Deposit.</strong> The wallet signs a fixed message once; that signature (ed25519,
              deterministic) seeds a key tree. For each chunk the client derives{" "}
              <code>secret = H(sig, &quot;secret&quot;, i)</code> and{" "}
              <code>nullifier = H(sig, &quot;nullifier&quot;, i)</code>, then commits{" "}
              <code>C = Poseidon(secret, nullifier, amount)</code> and sends <code>C</code> plus the fixed
              denomination to the program, which inserts <code>C</code> as a Merkle leaf. One wallet
              approval signs the whole batch. The depositor&apos;s address is recorded in a{" "}
              <code>DepositRecord</code> only so the oracle can trace provenance. <strong>Nothing is
              handed to the user to save</strong> — the signature never leaves the browser.
            </li>
            <li>
              <strong>Attestation.</strong> The CRE DON sees the new deposit, traces the depositor&apos;s
              provenance, and — if a quorum of sources agree it is clean — appends <code>C</code> to the
              association set and publishes the new ASP Merkle root on-chain.
            </li>
            <li>
              <strong>Withdraw.</strong> The user re-signs the same message to re-derive their notes, and
              the client scans the chain to find which deposits are theirs (and which are already spent).
              For each, it rebuilds both trees, finds the paths to <code>C</code>, and generates a Groth16
              proof asserting: &ldquo;I know a <code>(secret, nullifier)</code> whose commitment is a leaf
              of the deposit tree <em>and</em> of a published ASP root, and its nullifier hash is{" "}
              <code>h = Poseidon(nullifier)</code>&rdquo; — without revealing <code>C</code>,{" "}
              <code>secret</code>, or which leaf. The program verifies the proof, checks <code>h</code> was
              never seen, and pays the fixed amount to a fresh recipient address.
            </li>
            <li>
              <strong>Ragequit.</strong> If the association set never included <code>C</code> (the
              deposit was flagged), the user proves deposit-tree membership only and recovers the funds
              to their <em>original</em> address — public, no privacy, but always available.
            </li>
          </ol>
          <p className="muted">
            Because notes are re-derivable from the wallet, losing a &ldquo;note&rdquo; is impossible:
            reconnect, sign, and the app rediscovers everything you can still withdraw.
          </p>

          <h2 id="crypto">Cryptography</h2>
          <h3>Poseidon over BN254</h3>
          <p>
            All hashing is <code>Poseidon</code> on the BN254 scalar field — the ZK-friendly hash the
            circuit can prove cheaply. The critical invariant is <strong>parity</strong>: the Rust
            program hashes with Solana&apos;s native <code>sol_poseidon</code> syscall, the circuit uses
            circomlib&apos;s Poseidon, and the browser uses <code>circomlibjs</code>. All three are
            verified to produce byte-identical outputs, so the Merkle root computed on-chain, in the
            client, and inside the proof always agree.
          </p>
          <h3>Two Merkle trees, height 20</h3>
          <p>
            The <strong>deposit tree</strong> holds every commitment ever deposited. The{" "}
            <strong>association-set tree</strong> holds only the commitments the DON has marked clean.
            Both are height-20 (≈ 1,048,576 leaves), use the same zero-subtree constants, and are
            append-only. A withdrawal proves membership in <em>both</em>: deposit-tree membership says
            &ldquo;this is a real deposit&rdquo;; ASP-root membership says &ldquo;and it&apos;s clean&rdquo;.
          </p>
          <h3>Nullifiers prevent double-spend</h3>
          <p>
            Each note carries a <code>nullifier</code>. Withdrawal reveals only{" "}
            <code>h = Poseidon(nullifier)</code>, never the nullifier itself. The program initializes a
            PDA seeded by <code>h</code>; a second withdrawal with the same note tries to init the same
            PDA and fails. This prevents re-spending <em>without</em> revealing which commitment was
            spent — unlinkability is preserved.
          </p>
          <h3>Groth16, verified on-chain</h3>
          <p>
            Proofs are Groth16 over BN254. The <code>withdraw</code> circuit is ≈ 21,822 constraints
            (dual Merkle membership + nullifier); <code>ragequit</code> is ≈ 11,420 (single membership).
            Proving runs entirely in the browser via <code>snarkjs</code>; verification runs on-chain
            via <code>groth16-solana</code> on the native <code>alt_bn128</code> pairing syscalls. The
            proof is reformatted for the syscall (negate A, swap G2 coordinate order) before submission.
          </p>

          <h2 id="cre">The CRE oracle — why the DON is load-bearing</h2>
          <p>
            The clean set is the whole ballgame: whoever computes it holds the censorship lever. Private
            Horse runs that computation as a Chainlink CRE workflow so it is decentralized, not a single
            server. Every cron tick (~30s):
          </p>
          <ol>
            <li>
              <strong>Read deposits.</strong> Each DON node fetches the <code>DepositRecord</code>{" "}
              accounts over an HTTP RPC call (CRE writes to Solana; reads go through the HTTP capability
              hitting a Solana RPC endpoint).
            </li>
            <li>
              <strong>Trace provenance.</strong> For each depositor, every node independently queries
              multiple provenance sources (sanctions / OFAC, hack-attribution, risk-scoring APIs). These
              inputs are off-chain, mutable, and <em>can disagree</em> — which is exactly why a DON, not
              one server, is needed.
            </li>
            <li>
              <strong>k-of-n decision.</strong> A deposit is clean only if ≥ quorum (2-of-3 in the demo)
              sources independently say clean. A single source lying or going down cannot unilaterally
              whitelist or censor a deposit. Disagreement is surfaced, not hidden.
            </li>
            <li>
              <strong>Deterministic root + consensus.</strong> Each node appends the newly-clean
              commitments and recomputes the ASP Merkle root. Because the computation is deterministic,{" "}
              <code>consensusIdenticalAggregation</code> forces all honest nodes to agree on the exact
              same root — or no report is produced.
            </li>
            <li>
              <strong>Write on-chain.</strong> The DON submits a signed report through the Keystone
              Forwarder to the program&apos;s <code>on_report</code> instruction. The account hash and
              Borsh payload match what the receiver verifies on-chain.
            </li>
          </ol>
          <p className="muted">
            Remove the CRE and there is no trustworthy, censorship-resistant root — only a server you
            must trust. That is the sense in which the oracle is load-bearing rather than decorative.
          </p>

          <h2 id="auditor">Selective disclosure — the auditor key</h2>
          <p>
            Full anonymity and regulatory reality are in tension. Private Horse resolves it with{" "}
            <strong>disclosure by exception</strong>. At withdrawal, the client encrypts the{" "}
            <em>original depositor address</em> to a designated auditor public key using ECIES over the
            BabyJubjub curve, and stores the ciphertext alongside the transaction. The public recipient
            is visible to everyone; the <em>link</em> back to the real depositor is visible to no one —
            except the holder of the auditor private key, who can decrypt it one withdrawal at a time.
          </p>
          <p>
            This is the opposite of a backdoor: privacy is the default for everyone, and disclosure is a
            targeted, per-transaction action that never weakens anyone else&apos;s privacy. The{" "}
            <strong>Auditor key</strong> tab lets you paste the key and watch the real addresses resolve.
          </p>

          <h2 id="onchain">On-chain program</h2>
          <p>The Anchor program (codename <code>sieve</code>) exposes five instructions:</p>
          <ul>
            <li><code>initialize</code> — create the pool, set the denomination, the authorized DON
              forwarder authority, and the auditor public key.</li>
            <li><code>deposit</code> — take the fixed denomination, insert the commitment into the deposit
              tree with an O(height) incremental Poseidon insert, and emit a <code>DepositRecord</code>.</li>
            <li><code>on_report</code> — accept a DON-signed report, verify the signer is the authorized
              forwarder and the epoch is monotonic, and append the new ASP root to a bounded ring of
              recent roots (append-only; old roots stay valid).</li>
            <li><code>withdraw</code> — verify the Groth16 proof against a known deposit root and a known
              ASP root, init the nullifier PDA, and pay a fresh recipient.</li>
            <li><code>ragequit</code> — verify deposit-tree membership only and return funds to the
              original depositor.</li>
          </ul>
          <p className="muted">
            The <code>Pool</code> account is boxed and the recent-roots ring is bounded so the program
            fits the SBF stack; roots are kept in a 16-entry history so a proof built against a slightly
            stale root still verifies.
          </p>

          <h2 id="trust">Trust model</h2>
          <p>
            The honest claim: this is a <em>composition</em> with a stronger trust root, not a new
            cryptographic primitive. Where it sits versus prior art:
          </p>
          <ul>
            <li><strong>vs Privacy Cash / 0xbow</strong> — a privacy pool with a <em>centralized</em>
              clean-set operator. We decentralize who computes it (DON consensus), make it append-only
              (no retroactive freeze), and add ragequit.</li>
            <li><strong>vs Cloak</strong> — a shielded pool + viewing key, with no oracle-maintained
              association set. We add the decentralized, provenance-attested clean set.</li>
            <li><strong>vs Chainlink ACE</strong> — per-address compliance booleans. We publish a Merkle{" "}
              <em>root</em> of an association set, consumed privately in ZK.</li>
            <li><strong>vs DECO</strong> — proves predicates over TLS data the prover opens themselves.
              Our trust root is a multi-source DON consensus, and no value lands on-chain in cleartext.</li>
          </ul>
          <p>
            Honest limit: the provenance sources are themselves third parties (OFAC / TRM / …). The DON
            removes the <em>single point of capture</em> and surfaces disagreement; it does not make
            provenance itself trustless. (A natural v2 runs those sources inside a TEE-backed node so
            licensed, non-public risk feeds can be consumed without leaking them.)
          </p>

          <h2 id="security">Security properties</h2>
          <ul>
            <li><strong>Double-spend</strong> — a per-nullifier PDA is <code>init</code>-ed on withdrawal;
              re-use fails, without revealing which commitment was spent.</li>
            <li><strong>No retroactive freeze</strong> — the ASP root is append-only; once included, you
              stay includable forever.</li>
            <li><strong>Guaranteed exit</strong> — ragequit always returns funds to the origin, so a user
              is never trapped by the oracle.</li>
            <li><strong>Only the DON writes the root</strong> — <code>on_report</code> checks the signer
              equals the authorized forwarder and that the epoch is strictly increasing.</li>
            <li><strong>Unlinkability</strong> — withdrawal reveals a fresh recipient and a nullifier
              hash; nothing ties it to a specific deposit.</li>
          </ul>
          <p className="muted">
            Integration tests cover the on-report guards, deposit, and unknown-root rejection. The full
            deposit → report → withdraw → ragequit flow has run on devnet.
          </p>

          <h2 id="status">Status &amp; links</h2>
          <ul>
            <li>Program (Solana devnet): <code>{PROGRAM}</code> —{" "}
              <a href={`https://explorer.solana.com/address/${PROGRAM}?cluster=devnet`} target="_blank" rel="noreferrer">Explorer ↗</a></li>
            <li>Source: <a href="https://github.com/abaresks24/private-horse" target="_blank" rel="noreferrer">github.com/abaresks24/private-horse ↗</a></li>
            <li>Try it: <Link href="/app">the app →</Link></li>
          </ul>
        </article>
      </div>
    </section>
  );
}

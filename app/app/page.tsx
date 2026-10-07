import HeroHorse from "../components/HeroHorse";

export default function Landing() {
  return (
    <section className="landing">
      <div className="inner">
        <div className="horse"><HeroHorse /></div>
        <h1 className="display h-xl">
          Private by default.<br />
          <span className="red">Clean</span> by proof.
        </h1>
        <p className="lede">
          A privacy pool whose clean-set is maintained by a decentralized Chainlink&nbsp;CRE oracle.
          Withdraw by proving your funds are clean — in zero-knowledge, on Solana.
        </p>
        <div className="ctas">
          <a className="btn" href="/app">Launch app</a>
          <a className="btn ghost" href="/docs">Docs</a>
        </div>
      </div>
    </section>
  );
}

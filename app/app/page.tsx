import HeroHorse from "../components/HeroHorse";

export default function Landing() {
  return (
    <section className="landing">
      <div className="inner">
        <div className="horse"><HeroHorse /></div>
        <p className="tagline">
          A privacy pool whose clean-set is kept by a decentralized Chainlink&nbsp;CRE oracle.
          Clean by proof, private by default.
        </p>
        <div className="ctas">
          <a className="btn" href="/app">Launch app</a>
          <a className="btn ghost" href="/docs">Docs</a>
        </div>
      </div>
    </section>
  );
}

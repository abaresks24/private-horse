import HeroHorse from "../components/HeroHorse";

export default function Landing() {
  return (
    <section className="landing">
      <div className="inner">
        <div className="horse"><HeroHorse /></div>
        <h1 className="landing-title">
          Private by default.<br />Clean by proof.
        </h1>
        <div className="ctas">
          <a className="btn" href="/app">Launch app</a>
          <a className="btn ghost" href="/docs">Docs</a>
        </div>
      </div>
    </section>
  );
}

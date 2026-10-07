import HeroHorse from "../components/HeroHorse";

export default function Landing() {
  return (
    <section className="landing">
      <div className="wrap2">
        <div className="copy">
          <div className="headblock">
            <h1 className="landing-title">Private&nbsp;Horse</h1>
            <p className="landing-slogan">Private by default. Clean by proof.</p>
          </div>
          <div className="ctas">
            <a className="btn" href="/app">Launch app</a>
            <a className="btn ghost" href="/docs">Docs</a>
          </div>
        </div>
        <div className="horse"><HeroHorse /></div>
      </div>
    </section>
  );
}

import Link from "next/link";
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
            <Link className="btn" href="/app">Launch app</Link>
            <Link className="btn ghost" href="/docs">Docs</Link>
          </div>
        </div>
        <div className="horse"><HeroHorse /></div>
      </div>
    </section>
  );
}

import HeroHorse from "../components/HeroHorse";

const STATS = [
  { n: "0", l: "trusted operators" },
  { n: "2 / 3", l: "DON consensus" },
  { n: "100%", l: "on-chain ZK" },
];

export default function Landing() {
  return (
    <section className="landing">
      <div className="wrap2">
        <div className="copy">
          <h1 className="landing-title">Private by default.<br />Clean by proof.</h1>
          <div className="stats">
            {STATS.map((s) => (
              <div key={s.l}>
                <div className="stat-n">{s.n}</div>
                <div className="stat-l">{s.l}</div>
              </div>
            ))}
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

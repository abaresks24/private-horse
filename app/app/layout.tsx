import "./globals.css";
import HorseMark from "../components/HorseMark";
import { Loader } from "../components/Loader";
import Providers from "../components/Providers";

export const metadata = {
  title: "Private Horse — private, provably-clean payments on Solana",
  description:
    "A privacy pool whose clean-set is maintained by a decentralized Chainlink CRE oracle. Private by default, clean by proof, auditable by exception.",
};

const EXPLORER = "https://explorer.solana.com/address/4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X?cluster=devnet";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Spectral:ital,wght@0,400;0,500;1,400;1,500&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>
          <Loader minMs={2200}>
            <header className="site">
              <a href="/" className="brand">
                <HorseMark size={30} />
                <span>Private&nbsp;Horse</span>
              </a>
              <nav>
                <a href="/">Home</a>
                <a href="/app">App</a>
                <a href="/auditor">Auditor</a>
                <a href="/docs">Docs</a>
                <a href={EXPLORER} target="_blank" rel="noreferrer" className="nav-devnet">Devnet&nbsp;↗</a>
              </nav>
            </header>
            <main>{children}</main>
            <footer className="site">
              <span>Private Horse</span>
              <span>Solana devnet · Chainlink CRE</span>
              <span>private · clean · auditable</span>
            </footer>
          </Loader>
        </Providers>
      </body>
    </html>
  );
}

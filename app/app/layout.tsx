import "./globals.css";
import HorseMark from "../components/HorseMark";
import { Loader } from "../components/Loader";

export const metadata = {
  title: "Private Horse — private, provably-clean payments on Solana",
  description:
    "A privacy pool whose clean-set is maintained by a decentralized Chainlink CRE oracle. Private by default, clean by proof, auditable by exception.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..600;1,9..144,400..500&family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Loader minMs={1800}>
          <header className="site">
            <a href="/" className="brand">
              <HorseMark size={30} />
              <span>Private&nbsp;Horse</span>
            </a>
            <nav>
              <a href="/#how">Mechanism</a>
              <a href="/#pool">Pool</a>
              <a href="/demo">Demo</a>
              <a href="https://explorer.solana.com/address/4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X?cluster=devnet" target="_blank">
                Devnet&nbsp;↗
              </a>
            </nav>
          </header>
          <main>{children}</main>
          <footer className="site">
            PRIVATE HORSE · SOLANA DEVNET · CHAINLINK CRE — private by default, clean by proof, auditable by exception.
          </footer>
        </Loader>
      </body>
    </html>
  );
}

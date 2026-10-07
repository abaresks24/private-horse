"use client";

import dynamic from "next/dynamic";
import HorseMark from "./HorseMark";

// Connect-wallet button, client-only (wallet-adapter touches window).
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const EXPLORER = "https://explorer.solana.com/address/4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X?cluster=devnet";

export default function HeaderBar() {
  return (
    <header className="site">
      <a href="/" className="brand">
        <HorseMark size={26} />
        <span>Private&nbsp;Horse</span>
      </a>
      <nav>
        <a href="/app">App</a>
        <a href="/auditor">Auditor</a>
        <a href="/docs">Docs</a>
        <a href={EXPLORER} target="_blank" rel="noreferrer">Devnet&nbsp;↗</a>
      </nav>
      <div className="wallet-slot"><WalletMultiButton /></div>
    </header>
  );
}

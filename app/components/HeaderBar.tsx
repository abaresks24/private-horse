"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import HorseMark from "./HorseMark";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const EXPLORER = "https://explorer.solana.com/address/4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X?cluster=devnet";

export default function HeaderBar() {
  const landing = usePathname() === "/";

  // Landing: no bar — just the dark logo top-left and connect-wallet top-right, on beige paper.
  if (landing) {
    return (
      <header className="site landing-head">
        <a href="/" className="brand">
          <HorseMark size={26} src="/logo.png" />
          <span>Private&nbsp;Horse</span>
        </a>
        <div className="wallet-slot"><WalletMultiButton /></div>
      </header>
    );
  }

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

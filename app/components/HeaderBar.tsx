"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import HorseMark from "./HorseMark";

// BaseWalletMultiButton lets us relabel the default "Select Wallet" -> "Connect Wallet".
const BaseWalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.BaseWalletMultiButton),
  { ssr: false }
);

const WALLET_LABELS = {
  "change-wallet": "Change wallet",
  connecting: "Connecting…",
  "copy-address": "Copy address",
  copied: "Copied",
  disconnect: "Disconnect",
  "has-wallet": "Connect Wallet",
  "no-wallet": "Connect Wallet",
} as const;

const WalletMultiButton = () => <BaseWalletMultiButton labels={WALLET_LABELS} />;

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

  const path = usePathname();
  const cls = (p: string) => (path === p ? "active" : "");
  return (
    <header className="site">
      <a href="/" className="brand">
        <HorseMark size={26} />
        <span>Private&nbsp;Horse</span>
      </a>
      <nav className="sectiontabs">
        <a href="/app" className={cls("/app")}>Horse</a>
        <a href="/auditor" className={cls("/auditor")}>Auditor&nbsp;key</a>
        <a href="/docs" className={cls("/docs")}>Docs</a>
      </nav>
      <div className="wallet-slot"><WalletMultiButton /></div>
    </header>
  );
}

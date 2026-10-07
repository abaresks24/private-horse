"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
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
  const path = usePathname();

  // Landing: no bar — just the dark logo top-left and connect-wallet top-right, on beige paper.
  if (path === "/") {
    return (
      <header className="site landing-head">
        <Link href="/" className="brand">
          <HorseMark size={26} src="/logo.png" />
          <span>Private&nbsp;Horse</span>
        </Link>
        <div className="wallet-slot"><WalletMultiButton /></div>
      </header>
    );
  }

  const cls = (p: string) => (path === p ? "active" : "");
  return (
    <header className="site">
      <Link href="/" className="brand">
        <HorseMark size={26} />
        <span>Private&nbsp;Horse</span>
      </Link>
      <nav className="sectiontabs">
        <Link href="/app" className={cls("/app")}>Horse</Link>
        <Link href="/auditor" className={cls("/auditor")}>Auditor&nbsp;key</Link>
        <Link href="/docs" className={cls("/docs")}>Docs</Link>
      </nav>
      <div className="wallet-slot"><WalletMultiButton /></div>
    </header>
  );
}

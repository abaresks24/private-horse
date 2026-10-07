"use client";

import { Buffer } from "buffer";
if (typeof window !== "undefined" && !(window as any).Buffer) (window as any).Buffer = Buffer;

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";

// Override with a better endpoint (e.g. a free Helius devnet URL) via NEXT_PUBLIC_SOLANA_RPC.
export const DEVNET_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";

// The public devnet RPC rate-limits hard (HTTP 429). Retry every RPC call with exponential
// backoff so transient throttling self-heals instead of surfacing as an error.
const retryingFetch: typeof fetch = async (input, init) => {
  let lastRes: Response | undefined;
  for (let attempt = 0; attempt <= 5; attempt++) {
    const res = await fetch(input, init);
    if (res.status !== 429) return res;
    lastRes = res;
    const wait = Math.min(4000, 350 * 2 ** attempt) + Math.floor(Math.random() * 250);
    await new Promise((r) => setTimeout(r, wait));
  }
  return lastRes as Response;
};

export default function Providers({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={DEVNET_RPC} config={{ commitment: "confirmed", fetch: retryingFetch }}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

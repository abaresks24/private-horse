import "./globals.css";
import { Loader } from "../components/Loader";
import Providers from "../components/Providers";
import HeaderBar from "../components/HeaderBar";

export const metadata = {
  title: "Private Horse — private, provably-clean payments on Solana",
  description:
    "A privacy pool whose clean-set is maintained by a decentralized Chainlink CRE oracle. Private by default, clean by proof, auditable by exception.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head />
      <body>
        <Providers>
          <Loader minMs={1600}>
            <HeaderBar />
            <main>{children}</main>
          </Loader>
        </Providers>
      </body>
    </html>
  );
}

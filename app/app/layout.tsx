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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
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

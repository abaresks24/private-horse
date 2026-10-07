// Initialize the fresh v2 pool at 0.1 SOL denomination (devnet).
//   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ANCHOR_WALLET=~/.config/solana/id.json \
//     npx ts-node scripts/init-pool.ts
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const idl = require("../target/idl/sieve.json");

const PID = new PublicKey("4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X");
const seed = (s: string) => new TextEncoder().encode(s);
const DENOM = new anchor.BN(100_000_000); // 0.1 SOL

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl as anchor.Idl, provider as any);

  const [pool] = PublicKey.findProgramAddressSync([seed("pool2")], PID);
  const [vault] = PublicKey.findProgramAddressSync([seed("vault2")], PID);
  // Deterministic forwarder (matches scripts/demo.ts) so on_report demos keep working.
  const forwarder = Keypair.fromSeed(Uint8Array.from(new Array(32).fill(7)));

  console.log("pool2 ", pool.toBase58());
  console.log("vault2", vault.toBase58());
  console.log("forwarder", forwarder.publicKey.toBase58());

  const sig = await (program.methods as any)
    .initialize(forwarder.publicKey, new Array(64).fill(0), DENOM)
    .accounts({ pool, authority: provider.wallet.publicKey, systemProgram: SystemProgram.programId })
    .rpc();
  console.log("initialized · sig", sig);

  const acc: any = await (program.account as any).pool.fetch(pool);
  console.log("denomination", acc.denomination.toString(), "· next_index", acc.nextIndex.toString());
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

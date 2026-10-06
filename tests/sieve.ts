// Anchor integration tests for Sieve. Focus: the security guards the e2e demo doesn't exercise
// (unauthorized forwarder, stale epoch, unknown roots) + the happy-path basics (init, deposit,
// on_report accept). The full ZK withdraw/ragequit happy path is covered by scripts/demo.ts.
//
// Run: anchor test   (spins a fresh local validator)

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import { assert } from "chai";
import { randomBytes } from "node:crypto";

describe("sieve", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Sieve as Program<any>;
  const pid = program.programId;
  const seed = (s: string) => new TextEncoder().encode(s);
  const [pool] = anchor.web3.PublicKey.findProgramAddressSync([seed("pool")], pid);
  const [vault] = anchor.web3.PublicKey.findProgramAddressSync([seed("vault")], pid);

  const forwarder = Keypair.generate();
  const bytes32 = () => Array.from(randomBytes(32));
  // A valid BN254 field element (top byte 0 => < 2^248 < p); the Poseidon syscall rejects inputs >= p.
  const fieldBytes = () => { const b = Array.from(randomBytes(32)); b[0] = 0; return b; };
  const bn = (n: number) => new anchor.BN(n);

  it("initializes the pool with the forwarder authority + denomination", async () => {
    await program.methods
      .initialize(forwarder.publicKey, new Array(64).fill(0), bn(300_000_000))
      .accounts({ pool, authority: provider.wallet.publicKey, systemProgram: anchor.web3.SystemProgram.programId })
      .rpc();
    const acc: any = await program.account.pool.fetch(pool);
    assert.equal(acc.denomination.toString(), "300000000");
    assert.equal(acc.aspEpoch.toString(), "0");
    assert.equal(acc.nextIndex.toString(), "0");
    assert.ok(acc.forwarderAuthority.equals(forwarder.publicKey));
  });

  it("deposit advances next_index and pushes a new deposit root", async () => {
    const depositor = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(depositor.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);

    const [record] = anchor.web3.PublicKey.findProgramAddressSync(
      [seed("deposit"), bn(0).toArrayLike(Buffer, "le", 8)], pid);
    const before: any = await program.account.pool.fetch(pool);

    await program.methods
      .deposit(fieldBytes())
      .accounts({ pool, depositRecord: record, vault, depositor: depositor.publicKey, systemProgram: anchor.web3.SystemProgram.programId })
      .preInstructions([anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })])
      .signers([depositor])
      .rpc();

    const after: any = await program.account.pool.fetch(pool);
    assert.equal(after.nextIndex.toString(), (before.nextIndex.toNumber() + 1).toString());
  });

  it("on_report ACCEPTS a report from the authorized forwarder (epoch 1)", async () => {
    await program.methods
      .onReport({ aspRoot: bytes32(), epoch: bn(1), cleanCount: bn(1) })
      .accounts({ pool, forwarder: forwarder.publicKey })
      .signers([forwarder])
      .rpc();
    const acc: any = await program.account.pool.fetch(pool);
    assert.equal(acc.aspEpoch.toString(), "1");
  });

  it("on_report REJECTS a non-forwarder signer (UnauthorizedForwarder)", async () => {
    const attacker = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(attacker.publicKey, anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
    try {
      await program.methods
        .onReport({ aspRoot: bytes32(), epoch: bn(2), cleanCount: bn(1) })
        .accounts({ pool, forwarder: attacker.publicKey })
        .signers([attacker])
        .rpc();
      assert.fail("should have rejected a non-forwarder signer");
    } catch (e: any) {
      assert.match(e.toString(), /UnauthorizedForwarder/);
    }
  });

  it("on_report REJECTS a stale epoch (StaleReport)", async () => {
    try {
      await program.methods
        .onReport({ aspRoot: bytes32(), epoch: bn(1), cleanCount: bn(1) }) // epoch already 1
        .accounts({ pool, forwarder: forwarder.publicKey })
        .signers([forwarder])
        .rpc();
      assert.fail("should have rejected a stale epoch");
    } catch (e: any) {
      assert.match(e.toString(), /StaleReport/);
    }
  });

  it("withdraw REJECTS an unknown deposit root before touching the proof (UnknownDepositRoot)", async () => {
    const nh = bytes32();
    const [nul] = anchor.web3.PublicKey.findProgramAddressSync([seed("nullifier"), Buffer.from(nh)], pid);
    const recipient = Keypair.generate();
    try {
      await program.methods
        .withdraw({
          proofA: Array(64).fill(0), proofB: Array(128).fill(0), proofC: Array(64).fill(0),
          rootDeposits: bytes32(), // bogus → unknown
          rootAsp: bytes32(), nullifierHash: nh, recipientField: bytes32(),
          auditorCt: [Array(32).fill(0), Array(32).fill(0), Array(32).fill(0), Array(32).fill(0)],
        })
        .accounts({ pool, nullifierRecord: nul, vault, recipient: recipient.publicKey, payer: provider.wallet.publicKey, systemProgram: anchor.web3.SystemProgram.programId })
        .rpc();
      assert.fail("should have rejected an unknown deposit root");
    } catch (e: any) {
      assert.match(e.toString(), /UnknownDepositRoot/);
    }
  });
});

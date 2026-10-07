# Private Horse — CRE workflow (provenance / ASP oracle)

The DON that maintains the clean set. Every cron tick it reads deposits from the Solana program,
traces each depositor's provenance across multiple sources over HTTP, reaches **consensus** on the
append-only Poseidon Merkle root of the clean set, and writes a DON-signed report to the program's
`on_report` via the keystone forwarder.

Targets the real **`@chainlink/cre-sdk` v1.23.0** (not a mock).

```
cre/
  project.yaml                 # targets + Solana devnet RPC
  provenance-asp/
    main.ts                    # Runner entry
    workflow.ts                # cron -> getProgramAccounts -> provenance HTTP (consensus) -> root -> writeReport
    merkle.ts                  # append-only Poseidon(2)/BN254 tree (parity with circuit + on-chain)
    config.json                # programId, poolPda, quorum, provenance sources
    workflow.yaml
```

## Status

- ✅ **Compiles against the real SDK** — `bun install && bunx tsc --noEmit` is clean.
- ✅ **Simulator loads and runs the workflow** — `cre workflow simulate ./provenance-asp` spins up the
  fake Solana chain for selector `16423721717087811551` (solana-devnet), the OCR consensus signers,
  and the cron/http/consensus capabilities, then executes the handler through consensus.
- ✅ **Real Solana read + write surface wired** — `SolanaClient.getProgramAccounts` for reads and
  `writeReport` + keystone `encodeForwarderReport` / `calculateAccountsHash` /
  `prepareSolanaReportRequest` for the signed on-chain write; transmitter is a funded devnet keypair
  (`CRE_SOLANA_PRIVATE_KEY`).

### Two known simulator-specific gaps (not code bugs)

1. **`poseidon-lite` traps the cre-cli WASM JS runtime** on import. The tree math is correct; the
   pure-JS Poseidon needs to be swapped for a build the restricted runtime accepts (or the root can
   be computed on-chain by the program's native `sol_poseidon`, removing Poseidon from the workflow
   entirely — a small `on_report` change).
2. **`GetProgramAccounts` is "not implemented in cre-cli simulate"** (the CLI says so explicitly).
   For local simulation the deposit read should go through the HTTP capability hitting a Solana RPC
   `getProgramAccounts` JSON-RPC call; the native capability is intended for a live DON.

Neither blocks a live deployment; both are about the local simulator. Deploy to a DON needs
`cre account` deploy access (GA request, not early-access).

## Run

```bash
cd provenance-asp && bun install
# provenance mock (from repo root): bun scripts/provenance-mock-server.ts
CRE_SOLANA_PRIVATE_KEY=$HOME/.config/solana/id.json \
  cre workflow simulate ./provenance-asp --target staging-settings
```

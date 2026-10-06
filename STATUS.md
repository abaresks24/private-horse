# État du build — Sieve

_Toolchain Solana+Anchor installée ; programme déployé et démo e2e exécutée sur validateur local._

## ✅✅ Validé ON-CHAIN (exécuté cette session)

| Élément | Preuve |
|---|---|
| **Toolchain** | solana-cli 4.3.0 + anchor 0.30.1 (via avm) installés |
| **`anchor build`** | `target/deploy/sieve.so` (356KB) + `target/idl/sieve.json` + `target/types/sieve.ts` générés, 6 instructions |
| **Déploiement** | déployé sur validateur local à `4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X` |
| **🔑 Parité Poseidon ON-CHAIN** | `node scripts/parity_onchain.mjs` → le syscall natif `Bn254X5` == circomlib, **octet pour octet** (footgun n°1 FERMÉ) |
| **DÉMO E2E COMPLÈTE ON-CHAIN** | deposit ×2 → `on_report` (rôle DON, racine ASP) → **withdraw privé avec preuve Groth16 vérifiée on-chain** → ragequit. Tout en vrai sur le validateur. |

## ✅ Validé off-chain (toujours vrai)

| Élément | Preuve |
|---|---|
| Circuits compilent | `withdraw` 21 822 contraintes, `ragequit` 11 420 |
| Trusted setup + VK Rust réelle | `verifying_key.rs` générée depuis le setup |
| Preuves `withdraw` + `ragequit` vérifiées | `prove_test.mjs` / `prove_ragequit.mjs` |

## Correctifs appliqués cette session (pour mémoire)

- **Enfer des deps edition2024/MSRV** : résolu via le resolver MSRV-aware (`rust-version = "1.75"` + `.cargo/config.toml` `incompatible-rust-versions = "fallback"`) + pins ciblés (blake3 1.5.5, proc-macro2 1.0.94, borsh 1.5.3, proc-macro-crate 3.2.0…). Cargo.lock maintenu en v3.
- **anchor-spl retiré** (inutile — que des transferts SOL natifs).
- **Poseidon → syscall natif Solana** (au lieu de light-poseidon qui chargeait 30KB de constantes sur la stack).
- **Compte `Pool` boxé** (`Box<Account<Pool>>`) + `ROOT_HISTORY_SIZE` 64→16 (stack BPF < 4KB).
- **Merkle insert** passé de O(hauteur²) à O(hauteur) appels Poseidon (budget CU).
- **Profil release** : retiré `lto="fat"`/`codegen-units=1` (causait « Branch target out of insn range » en SBF).
- Program ID réconcilié sur une vraie keypair (`anchor keys sync`).

## ⏳ Reste bloqué (facteurs externes, pas de conception)

1. **Déploiement devnet** (`anchor deploy --provider.cluster devnet`) : le RPC devnet timeoutait depuis cette machine. Fonctionnellement prouvé sur localnet ; relancer quand le réseau coopère.
2. **@chainlink/cre-sdk** : pas sur le npm public (Early Access Chainlink validé par le DevRel). Le workflow `cre/src/workflow.ts` est écrit ; la démo joue le rôle du DON via le fallback `on_report` (prouve le chemin on-chain). Brancher le SDK quand les creds sont dispos.

## Pour rejouer la démo (localnet)

```bash
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana-test-validator --reset --quiet --ledger test-ledger &   # fresh ledger
solana config set --url localhost && solana airdrop 100
anchor build && solana program deploy target/deploy/sieve.so --program-id target/deploy/sieve-keypair.json
npx ts-node scripts/provenance-mock-server.ts &               # mock provenance
ANCHOR_PROVIDER_URL=http://localhost:8899 ANCHOR_WALLET=~/.config/solana/id.json \
  npx ts-node --transpile-only scripts/demo.ts
# note: ~8 min (génération de 3 preuves Groth16) ; run sur un ledger FRAIS (indices de feuilles 0,1).
```

## 🧩 TODO fonctionnels restants dans le code (volontaires)

- `cre/src/workflow.ts` : aligner les noms d'import exacts sur la version installée de `@chainlink/cre-sdk` (le flux est correct ; `decodeDepositRecord` + `fetchDeposits` sont câblés, filtre `dataSize=88`).
- `circuits/withdraw_audit.circom` : **stretch** auditor key (ElGamal BabyJubjub) — squelette non instancié, à lifter verbatim depuis `ec-elgamal-circom` si le planning le permet (cf. PLAN.md, cut à H24 si besoin).
- `programs/sieve/src/instructions/poseidon_debug.rs` : **à supprimer** avant un vrai déploiement.

## Commandes utiles

```bash
# ZK (fonctionne tel quel)
cd circuits && npm install && ./scripts/compile.sh && ./scripts/setup.sh
node scripts/prove_test.mjs        # withdraw
node scripts/prove_ragequit.mjs    # ragequit

# Rust (fonctionne tel quel)
cargo check -p sieve

# Besoin de anchor+solana :
anchor build && anchor deploy --provider.cluster devnet
pnpm mock & pnpm demo
```

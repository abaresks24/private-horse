# Plan 36h — Sieve

Équipe ≤4. Rôles : **A** Anchor · **B** Circuit/ZK (toi) · **C** CRE · **D** Front/démo.

Priorité absolue : **le workflow CRE est le héros (bounty n°1)**. L'auditor key est un **stretch isolé**, cuttable sans toucher au reste.

| Phase | A · Anchor | B · ZK (toi) | C · CRE | D · Front/démo |
|---|---|---|---|---|
| **H0-4** | ⚠️ **SPIKE CRE→Solana** : deploy `on_report` + 1 write devnet confirmé (template `solana-read-write` verbatim). Puis `initialize` + PDA vault. | `pnpm circuits` : compile `withdraw`+`ragequit`, vérifie le nb de contraintes, `setup.sh` → VK Rust générée | setup `@chainlink/cre-sdk`, `cre workflow simulate` hello-world | scaffold Next.js + wallet adapter |
| **H4-10** | `deposit` + insert Merkle (Poseidon natif) + `DepositRecord` | **parité Poseidon** (`tests/poseidon_parity.ts`) : syscall Solana == circomlib == circomlibjs | `fetchDeposits` via RPC + decode Borsh `DepositRecord` | UI deposit (génère secret/nullifier, calcule commitment) |
| **H10-18** | `withdraw` + vérif `groth16-solana` câblée + PDA nullifier | preuve `withdraw` e2e off-chain (snarkjs) + format proof pour groth16-solana (négation proof_a) | `traceAddress` + consensus + `AppendOnlyMerkleTree` root + `writeReport` | `lib/prover.ts` (fullProve + format) |
| **H18-24** | `on_report` append-only + `ragequit` | preuve `ragequit` | provenance réelle 2-3 sources + mock server | 1er **e2e : deposit→CRE→withdraw** |
| **H24-30** | intégration + edge cases | 🟠 **STRETCH** : `withdraw_audit` (ElGamal BabyJubjub) — lifter verbatim ; si ça déborde, CUT ici | durcir fraîcheur/epoch | panneau de contrôle démo (flip source clean/dirty) + UI ragequit |
| **H30-34** | tests Anchor | buffer bugs ZK | — | **vidéo fallback** du write CRE, répétition 2 min |
| **H34-36** | — | — | — | README + diagramme, soumission, slides |

## Checklist de dé-risquage (à faire AVANT tout le reste)
- [ ] **H0** : `anchor build` passe (VK placeholders OK au début).
- [ ] **H0-4** : un write CRE arrive dans `on_report` en devnet (sinon fallback report signé manuel).
- [ ] **H4** : parité Poseidon à 3 niveaux (Rust syscall / circomlib / circomlibjs) — **le footgun n°1**.
- [ ] **H10** : une preuve `withdraw` vérifie on-chain (format proof_a négé correct).

## Règle de scope
Si à **H24** l'auditor key n'est pas câblé proprement → **CUT**, shippe la v1 sans. Le CRE + double-membership + ragequit suffisent à gagner le bounty. Ne sacrifie jamais le e2e CRE pour l'auditor key.

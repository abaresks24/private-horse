# Private Horse — privacy pool prouvé-propre, décentralisé et auditable

<sub>Nom de code du programme on-chain : `sieve`. Nom public du projet : **Private Horse** (alt. envisagé : *Dark Horse*).</sub>

> **Privé par défaut · propre par preuve (CRE) · auditable par exception.**
>
> Un privacy pool sur Solana où l'ensemble des dépôts « propres » n'est pas tenu par une
> entreprise centralisée, mais par un **workflow Chainlink CRE** qui trace la provenance des
> fonds sur plusieurs sources et se met d'accord par consensus. Au retrait, l'utilisateur
> prouve en ZK que ses fonds appartiennent à l'ensemble propre — sans révéler lesquels.
> Une **clé d'audit** optionnelle permet une divulgation sélective à un régulateur désigné.

Hackathon : **TOKEN2049 Origins** · tracks **Best Workflow with CRE** + **Best Use of Solana**.

## ✅ Statut (vérifié on-chain)

- **Déployé sur Solana devnet** : [`4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X`](https://explorer.solana.com/address/4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X?cluster=devnet)
- **Démo e2e exécutée sur devnet** : deposit → `on_report` (racine ASP du DON) → retrait privé (preuve Groth16 vérifiée on-chain) → ragequit.
- **Parité Poseidon** syscall natif Solana ↔ circomlib : validée **à l'octet**.
- **Tests d'intégration** : 6/6 passent (`anchor test`) — garde-fous `on_report` (forwarder autorisé, rejet non-autorisé, rejet epoch périmé), dépôt, rejet de racine inconnue.

👉 Pitch + script démo 2 min + parades aux questions du jury : **[`PITCH.md`](./PITCH.md)** · état détaillé : **[`STATUS.md`](./STATUS.md)**.

---

## Pourquoi (le pitch en 3 phrases)

1. Tornado a été sanctionné parce qu'il ne séparait pas l'argent propre du sale. Privacy Pools
   (Buterin/0xbow) corrige ça — mais la liste propre est tenue par **un opérateur central**.
2. Sieve confie cette liste à un **DON Chainlink** : traçage de provenance multi-sources,
   consensus, racine Merkle écrite on-chain. **Aucune firme unique ne décide qui peut sortir.**
3. Racine **append-only** (zéro gel rétroactif) + **ragequit** (sortie garantie) + **auditor key**
   (disclosure sélective). On ne bloque personne — on laisse l'argent honnête se *prouver* propre.

## Architecture

```
  Déposant ──deposit(commitment)──▶ Programme Anchor (arbre Merkle des dépôts)
                                            │
                                   (lecture via HTTP RPC)
                                            ▼
  Workflow CRE (cron) ── trace la provenance sur N sources ── consensus DON
                                            │
                                   racine ASP (append-only)
                                            ▼
                     Keystone Forwarder ──▶ on_report(asp_root)   [vérifie signature DON]
                                            │
  Retirant ──withdraw(proof, …)──▶ groth16-solana vérifie :
        • commitment ∈ arbre dépôts  ET  ∈ arbre ASP        (double appartenance Merkle)
        • nullifier_hash = Poseidon(nullifier)              (anti double-retrait, PDA dédiée)
        • auditor_ct = ElGamal(auditor_pk, recipient|amount) (stretch — disclosure sélective)
                                            ▼
                               fonds → adresse vierge (privé)
  Exclu ──ragequit(proof)──▶ fonds → adresse d'origine (public, sans privacy)
```

## Monorepo

| Dossier       | Rôle |
|---------------|------|
| `programs/sieve` | Programme Anchor : `initialize` / `deposit` / `withdraw` / `ragequit` / `on_report`. Arbre de Merkle incrémental (Poseidon natif), PDAs de nullifier, vérif Groth16 (`groth16-solana`). |
| `circuits`    | Circuits Circom : `withdraw` (double appartenance + nullifier), `ragequit`, + `withdraw_audit` (stretch, auditor key ElGamal/BabyJubjub). |
| `cre`         | Workflow Chainlink CRE (TS) : lit les dépôts via RPC, trace la provenance multi-sources, consensus, construit la racine ASP append-only, écrit via Keystone Forwarder. |
| `app`         | Front Next.js : deposit / withdraw / ragequit + panneau de contrôle démo + disclosure auditeur. |
| `scripts`     | Serveur mock de provenance (flip propre/sale sur scène) + script de démo e2e. |
| `tests`       | Tests d'intégration Anchor. |

## Démarrage

```bash
# 1. Circuits — compile + trusted setup + génère la verifying key Rust
cd circuits && npm install && ./scripts/compile.sh && ./scripts/setup.sh && cd ..
node circuits/scripts/prove_test.mjs        # (optionnel) prouve+vérifie withdraw off-chain

# 2. Programme Anchor — build + deploy
anchor build
anchor deploy --provider.cluster devnet     # (ou localnet)

# 3. Tests d'intégration (valide les garde-fous sur un validateur local frais)
anchor test --provider.cluster localnet     # 6/6 ✓

# 4. Démo e2e (2 terminaux)
npx ts-node scripts/provenance-mock-server.ts            # terminal 1 : mock provenance
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
  ANCHOR_WALLET=~/.config/solana/id.json \
  npx ts-node --transpile-only scripts/demo.ts           # terminal 2 : deposit→on_report→withdraw→ragequit

# 5. Parité Poseidon on-chain (footgun #1) — après deploy sur un validateur
node scripts/parity_onchain.mjs             # "✅ PARITÉ OK — syscall natif == circomlib"

# 6. Workflow CRE (nécessite @chainlink/cre-sdk, Early Access)
cd cre && npm install && npm run cre:simulate

# 7. Front
cd app && npm install && npm run dev
```

> ⚠️ `anchor build` nécessite des pins de deps pour le toolchain 1.75 des platform-tools
> (resolver MSRV-aware + `rust-version = "1.75"` + `.cargo/config.toml`). Voir `STATUS.md` si tu
> repars d'un `Cargo.lock` frais.

## ⚠️ Notes de réalité (lues cette session, à respecter)

- **CRE Solana = write-only.** Le workflow lit les dépôts via **HTTP RPC Solana**, pas de read
  natif. L'écriture se fait via le **Keystone Forwarder → `on_report`**.
- **`cre workflow simulate` est mono-nœud** → le consensus est *simulé*. Ne JAMAIS prétendre un
  consensus multi-nœuds live sur une démo en simulation. Fallback (comme StratosNotes) :
  simulation + report signé soumis à `on_report` en devnet → règlement on-chain réel ; le DON
  live est déployé par Chainlink. **Le DevRel a validé l'Early Access** → viser le DON live.
- **Footgun Poseidon** : les paramètres du syscall Solana (`Bn254X5`) doivent correspondre à
  ceux de circomlib. `light-poseidon` est circom-compatible — vérifier au plus tôt (cf.
  `tests/poseidon_parity.ts`).
- **Footgun Borsh** : partir du struct `on_report` du template `cre-templates/solana-read-write`
  **verbatim**, le modifier en dernier.

## Plan 36h

Voir [`PLAN.md`](./PLAN.md).

## Positionnement démo

Ne PAS pitcher « un privacy pool sur Solana » (Privacy Cash l'a fait, $210M). **Mener par le
workflow CRE** : deux sources de provenance en désaccord → consensus → exclusion → la preuve de
retrait échoue → `ragequit` public → (stretch) l'auditeur déchiffre une tx. Phrase de clôture :
*« personne n'est bloqué ni gelé rétroactivement, aucune firme unique ne décide, et un régulateur
peut auditer une tx sans casser la privacy de tous. »*

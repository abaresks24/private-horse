# Sieve — pitch & demo

**Sieve : le gardien de conformité d'un privacy pool, décentralisé par Chainlink CRE.**
Privé par défaut · propre par preuve · auditable par exception.

Déployé et vérifié sur **Solana devnet** : `4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X`
→ https://explorer.solana.com/address/4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X?cluster=devnet

---

## Le pitch (30 s — à dire au juge)

> « Tornado a été sanctionné parce qu'il mélangeait l'argent honnête et l'argent volé. Privacy Pools corrige ça : au retrait, tu prouves en ZK que tes fonds appartiennent à un ensemble de dépôts *propres*, sans révéler lesquels. **Mais aujourd'hui cette liste propre est tenue par une seule entreprise** — on a recentralisé le point sensible. Sieve la confie à un **réseau d'oracles Chainlink (CRE)** : le DON trace la provenance des fonds sur plusieurs sources, se met d'accord par consensus, et écrit la racine Merkle on-chain. **Aucune firme unique ne décide qui peut sortir, personne n'est gelé rétroactivement, et un régulateur peut auditer une transaction sans casser la privacy de tous.** Et ça tourne, là, sur devnet. »

## Pourquoi CRE (le cœur, pour le track « Best Workflow with CRE »)

Le CRE est **load-bearing, pas décoratif** : les sources de provenance (OFAC, listes d'attribution de hacks, API de scoring) sont **off-chain, mutables et peuvent diverger**. C'est exactement le cas d'usage honnête d'un oracle — adjuger une vérité disputable en un engagement on-chain unique. Retire le workflow CRE et il n'y a plus de racine fiable : le protocole ne fonctionne plus. La racine ASP **gate directement les retraits** (elle est un public input du circuit) — ce n'est pas un feed cosmétique, c'est la frontière d'autorisation du protocole.

Le workflow fait les 3 capacités CRE d'un coup : **agrège** des données multi-sources, atteint un **consensus DON**, **écrit** un report signé sur Solana via le Keystone Forwarder → `on_report`.

---

## Démo 2 min (déroulé)

**Setup** : programme déployé sur devnet, pool initialisé, mock de provenance (3 sources) tournant.

1. **(0:00) Le dépôt propre.** Alice dépose. Montre le commitment `Poseidon(secret, nullifier, montant)` inséré dans l'arbre de Merkle on-chain.
2. **(0:30) Le workflow CRE.** Le hacker dépose depuis une adresse neuve. On **flippe 2 sources sur 3** en « dirty » pour son adresse → le DON atteint le **quorum** → sa provenance est sale → **exclu de la racine ASP** (append-only). La racine est écrite on-chain via `on_report`.
3. **(1:00) Le retrait privé.** Alice génère une preuve Groth16 qu'elle est **dans l'arbre des dépôts ET dans la racine ASP**, sans révéler laquelle. `groth16-solana` vérifie on-chain → fonds envoyés à une **adresse vierge**. (Explorer en live.)
4. **(1:30) L'exclusion + le ragequit.** Le hacker tente de retirer → **preuve ASP impossible** → bloqué. Il fait **`ragequit`** → récupère ses fonds vers **son adresse d'origine** (public, sans privacy).
5. **(1:50) La punchline.** *« On ne bloque personne — on laisse l'argent honnête se prouver propre. Aucune firme unique ne décide, personne n'est gelé rétroactivement. Et c'est signé par un consensus DON, pas par un opérateur. »*

Le moment wow : montrer **les 2 sources en désaccord → le consensus tranche → la preuve échoue → le ragequit sauve quand même les fonds.** C'est ce qui prouve que le CRE est le cœur et que personne n'est jamais gelé.

---

## Les 4 questions qui tuent — et les parades

**Q1. « C'est Privacy Cash / 0xbow. »**
→ Privacy Cash = un privacy pool dont la liste propre est tenue par un screener centralisé (CipherOwl). 0xbow = un ASP contrôlé par un multisig 2/4. **Notre contribution = décentraliser *qui* calcule la liste propre** (consensus DON multi-sources) + **la rendre append-only** (pas de gel rétroactif) + **ragequit** (sortie garantie). On n'invente pas le privacy pool ; on retire son point de capture unique.

**Q2. « C'est Cloak. »**
→ Cloak = un shielded pool + viewing key. Il n'a **pas** d'ensemble d'association maintenu par un oracle. Nous, le *clean set* est décentralisé, attesté par un DON, append-only. C'est la couche conformité que Cloak n'a pas.

**Q3. « C'est Chainlink ACE / DECO. »**
→ ACE fait du screening par *adresse* (booléen). Nous écrivons une **racine Merkle d'ensemble d'association** (pas un booléen par adresse), consommée en ZK. DECO prouve des prédicats sur des données *web/TLS* ancrées sur une session que le prouveur ouvre lui-même ; notre racine de confiance est un **consensus DON multi-sources**, et la donnée ne touche jamais la chaîne en clair.

**Q4. « Un DON sur Chainalysis/TRM, c'est juste agréger du taint centralisé. »**
→ Honnête : on ne prétend pas *trustless*. Mais (a) le multi-sources **fait surgir les désaccords** et empêche qu'une firme **censure unilatéralement** ; (b) l'append-only supprime le **gel rétroactif** ; (c) le ragequit garantit une **sortie**. On supprime le *point de capture unique* — c'est la leçon Tornado.

**Q5 (bonus). « Le hacker prend une adresse neuve. »**
→ On trace la **provenance des *fonds***, pas le label de l'adresse : une adresse fraîche qui détient des fonds volés reste traçable jusqu'au hack. Et on ne *bloque* pas — on laisse l'honnête se *dissocier*.

---

## Ce qui est réel vs mocké (à dire honnêtement)

- **Réel on-chain (devnet)** : programme Anchor, arbre de Merkle Poseidon natif, vérif Groth16 (`groth16-solana`), PDAs de nullifier, `on_report` append-only, ragequit. Démo e2e exécutée.
- **Réel ZK** : circuits Circom à double appartenance + nullifier, trusted setup, preuves générées et vérifiées on-chain. **Parité Poseidon syscall natif ↔ circomlib validée à l'octet.**
- **Rôle du DON joué par un fallback** (comme StratosNotes) : le workflow CRE tourne en simulation / le report signé est soumis à `on_report` ; le déploiement sur un DON live est post-event (Early Access validé par le DevRel). Le chemin on-chain est 100 % réel.
- **Mocké** : les API de provenance (endpoints contrôlables pour flipper clean/dirty sur scène). En prod → TRM / Elliptic / OFAC.
- **Stretch non livré** : auditor key (ElGamal in-circuit). Honnêtement cuttée — Cloak a déjà la viewing key, ce n'est pas le différenciateur.

## Positionnement honnête (pour toi, pas pour le juge)

Nouveauté = **composition inédite + racine de confiance plus forte**, pas primitive inventée. Plafond réaliste : **fort sur le bounty CRE** (exécution ZK difficile + CRE indispensable + déployé live = profil gagnant-de-track prouvé), pas garanti grand prix. Mener par le workflow CRE, jamais par « un privacy pool ».

# Private Horse — Script de démo (~3 min)

**Live:** https://private-horse.vercel.app · **Programme (devnet):** `4R4FwpZK1Tj9wAFnyfx17bDTa14hKEoLc5dhjsHhtA1X`

🗣️ = ce que tu dis · 👉 = ce que tu cliques/montres

---

## 0. Hook (15s) — sur la landing
👉 *La landing (cheval au galop).*
🗣️ « Les mixers donnent de la confidentialité, mais ils blanchissent aussi les fonds volés — c'est pour ça que Tornado a été sanctionné. **Private Horse** résout ça : un privacy pool sur Solana où l'ensemble "propre" est maintenu par un **oracle décentralisé Chainlink CRE**, pas par un opérateur central. Private by default, clean by proof, auditable by exception. »

---

## 1. Le dépôt — "1 signature, N dépôts" (30s)
👉 *Launch app. Onglet **Mix in**. Entre `0.3` SOL.*
🗣️ « Je veux mixer 0.3 SOL. Le protocole découpe en coupures fixes de 0.1 — **les montants fixes sont ce qui rend les retraits indistinguables**. »
👉 *Clique **Mix 0.3 SOL**. Une signature wallet.*
🗣️ « **Une seule signature** signe les 3 dépôts d'un coup. Et surtout : **rien à sauvegarder**. Mes notes secrètes sont **dérivées de ma signature wallet** — mon wallet est le backup. Fini le copier-coller de secrets qu'on perd. »
👉 *Montre la preuve on-chain (✓ On-chain proof + liens explorer).*
🗣️ « Dépôts confirmés on-chain. »

---

## 2. Le retrait privé via RELAYER (40s)
👉 *Onglet **Withdraw** → **Load my deposits** (re-signature) → **Withdraw all privately**.*
🗣️ « Pour retirer, je re-signe — l'app **re-dérive mes notes et scanne la chaîne** pour retrouver mes dépôts. Puis une **preuve Groth16 générée dans mon navigateur** prouve que mon dépôt est dans le clean set — **sans révéler lequel**. »
🗣️ « Les fonds partent vers une **adresse fraîche**, et la tx est **payée par un relayer** — **mon wallet n'apparaît nulle part** dans le retrait. »

👉 *Ouvre l'explorer sur les deux tx (préparer les onglets à l'avance).*
🗣️ « Regardez : sur le **dépôt**, mon adresse est publique. Sur le **retrait**, on voit seulement le relayer qui paie et une adresse neuve. **Impossible de relier les deux** — ni au dépôt (ZK), ni à moi (relayer). C'est ce qui manquait à Tornado sans relayer. »

---

## 3. La selective disclosure — l'auditeur (30s)
👉 *Onglet **Auditor key** → **Use demo auditor key** → **Decrypt withdrawals**.*
🗣️ « La confidentialité totale et la réalité réglementaire sont en tension. On résout ça par **disclosure par exception** : chaque retrait chiffre le déposant original pour une clé auditeur. »
👉 *Montre la ligne déchiffrée (déposant en rouge) + le registre public des dépôts au-dessus.*
🗣️ « Avec sa clé — et **seulement** avec sa clé — l'auditeur lève le voile, une transaction à la fois. Privacy par défaut pour tout le monde, disclosure ciblée en exception. »

---

## 4. Le cœur : le CRE (30s)
🗣️ « Le point clé : **qui décide qu'un dépôt est propre ?** Aujourd'hui c'est un opérateur central — on recrée le point de contrôle qu'on voulait supprimer. Nous, on confie ça à un **DON Chainlink CRE** : il trace la provenance sur plusieurs sources, atteint un **consensus** (2-of-3), et écrit la racine du clean set on-chain, **append-only** — personne ne peut être gelé rétroactivement. »
🗣️ « Notre workflow CRE est **réel** : il compile contre `@chainlink/cre-sdk` v1.23.0 et tourne dans le simulateur officiel à travers le consensus, en utilisant la capability Solana native. »

---

## 5. Honnêteté + close (20s)
🗣️ « Transparence totale : **on-chain, la seule hypothèse de confiance c'est "le report vient du forwarder autorisé".** En prod, ce forwarder = le Keystone Forwarder gated par le consensus DON. Sur le site live, on joue le rôle du DON avec un **keeper** — même interface `on_report` — parce qu'un déploiement DON live demande un deploy-access qu'on n'obtient pas en 36h. Basculer vers le vrai DON = changer une adresse. »
🗣️ « Donc : un privacy pool **complet et fonctionnel** — dépôt, retrait privé via relayer, ragequit anti-gel, auditeur — avec un clean-set oracle décentralisé par design. **Private Horse.** »

---

## Appendice — preuves (à garder sous la main)
Cycle complet validé on-chain (devnet) :
- Deposit → Clean set (`on_report`) → Withdraw via relayer → Auditor decrypt = **MATCH**.
- Retrait via relayer : fee payer = relayer, **wallet user absent** (vérifié).

## Q&A — la question qui tue
**« Mais le keeper c'est pas le CRE / c'est centralisé ? »**
→ « Exact, le keeper est un **stand-in assumé** du DON pour le site live. L'archi on-chain est identique : `on_report` ne fait confiance qu'au forwarder autorisé. La décentralisation est **en amont**, dans le DON (consensus OCR) → c'est le Keystone Forwarder en prod. Notre workflow CRE qui simule EST cette version décentralisée ; il ne manque que le deploy-access, un grant Chainlink hors de notre contrôle. On utilise la bonne primitive pour chaque besoin : **ZK** pour l'unlinkability (sans confiance), **DON** pour l'intégrité du clean set, **relayer** pour effacer le wallet, **auditeur** pour la disclosure. »

**« La preuve est on-chain, on voit les détails ? »**
→ « La preuve Groth16 est on-chain mais **zero-knowledge** : elle prouve l'appartenance au clean set sans dire quel dépôt. Le lien dépôt↔retrait est caché ; le wallet est effacé par le relayer. »

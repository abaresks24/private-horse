# Assets à déposer ici

La DA est câblée pour utiliser ces fichiers dès que tu les déposes (fallback gracieux sinon) :

- **`horse-run.mp4`** — la vidéo du cheval qui court (extraite du pin Pinterest).
  Jouée en plein écran pendant le chargement (`components/Loader.tsx`) + dans le hero.
  Si absente → fallback sur le logo SVG animé. Format conseillé : muet, boucle propre, ~1080p, <5 Mo.

- **`horse-poster.jpg`** — 1ère frame de la vidéo (poster, évite le flash noir).

- **`logo.png`** — le logo extrait de la vidéo. Pour l'activer :
  dans `components/HorseMark.tsx`, passe `USE_LOGO_PNG = true`.
  En attendant, un logo cheval vectoriel (SVG, type cavalier d'échecs) sert de placeholder.

- **`favicon.ico`** / `icon.png` — optionnel.

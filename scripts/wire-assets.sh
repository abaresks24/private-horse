#!/usr/bin/env bash
# Wire the downloaded horse video into the app's DA.
#   - finds the first video (mp4/mov/webm) dropped anywhere under the repo (or a path you pass)
#   - web-encodes it to app/public/horse-run.mp4 (H.264, muted, faststart)
#   - extracts a poster frame → app/public/horse-poster.jpg
#   - extracts a clean mid-frame logo candidate → app/public/logo-frame.png
# Then rebuild + commit.  Usage: ./scripts/wire-assets.sh [path/to/video]
set -euo pipefail
cd "$(dirname "$0")/.."
PUB=app/public
mkdir -p "$PUB"

SRC="${1:-}"
if [ -z "$SRC" ]; then
  SRC=$(find . -maxdepth 3 -type f \( -iname '*.mp4' -o -iname '*.mov' -o -iname '*.webm' \) \
        -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path "*/$PUB/horse-run.mp4" \
        2>/dev/null | head -1)
fi
[ -z "$SRC" ] && { echo "❌ aucune vidéo trouvée — passe le chemin en argument."; exit 1; }
echo "▶ source : $SRC"

if command -v ffmpeg >/dev/null 2>&1; then
  echo "▶ encode → $PUB/horse-run.mp4"
  ffmpeg -y -i "$SRC" -an -vcodec libx264 -profile:v high -pix_fmt yuv420p \
    -movflags +faststart -vf "scale='min(1280,iw)':-2" "$PUB/horse-run.mp4" >/dev/null 2>&1
  echo "▶ poster → $PUB/horse-poster.jpg"
  ffmpeg -y -ss 0.4 -i "$SRC" -frames:v 1 -q:v 3 "$PUB/horse-poster.jpg" >/dev/null 2>&1
  echo "▶ logo candidate → $PUB/logo-frame.png (mid-frame; recadre/détoure si besoin, puis renomme logo.png)"
  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC" 2>/dev/null || echo 1)
  MID=$(awk "BEGIN{print ($DUR+0)/2}")
  ffmpeg -y -ss "$MID" -i "$SRC" -frames:v 1 "$PUB/logo-frame.png" >/dev/null 2>&1
else
  echo "⚠ ffmpeg absent — copie brute (pas de poster/logo)."
  cp "$SRC" "$PUB/horse-run.mp4"
fi

echo "✅ assets câblés dans $PUB :"
ls -lh "$PUB" | grep -iE 'horse|logo'
echo "→ pour activer le logo image : dans app/components/HorseMark.tsx passe USE_LOGO_PNG=true et renomme logo-frame.png en logo.png"

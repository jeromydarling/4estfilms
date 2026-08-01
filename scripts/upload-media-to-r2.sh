#!/usr/bin/env bash
# Push the heavy Instagram video archive to R2 so it stays out of the git
# repo and out of the Cloudflare Pages build.
#
# Bucket "4estfilms-media" already exists (created 2026-08-01, ENAM).
#
# Needs wrangler + a Cloudflare API token with R2 write:
#   npm i -g wrangler
#   export CLOUDFLARE_API_TOKEN=...      # or: wrangler login
#   bash scripts/upload-media-to-r2.sh
#
# Objects land as  instagram/<account>/<...>  and, once the bucket has a
# public domain attached, are served from
#   https://<your-r2-domain>/instagram/<account>/<file>

set -euo pipefail
BUCKET=4estfilms-media
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/assets/instagram"

command -v wrangler >/dev/null || { echo "wrangler not found: npm i -g wrangler"; exit 1; }
[ -d "$SRC" ] || { echo "no $SRC — nothing to upload"; exit 1; }

count=0
while IFS= read -r -d '' f; do
  key="instagram/${f#"$SRC/"}"
  echo "→ $key"
  wrangler r2 object put "$BUCKET/$key" --file "$f" --remote
  count=$((count+1))
done < <(find "$SRC" \( -name '*.mp4' -o -name '*.mov' \) -print0)

echo "uploaded $count objects to $BUCKET"
echo
echo "Next: attach a public domain to the bucket (Cloudflare dashboard →"
echo "R2 → $BUCKET → Settings → Public access), then set MEDIA_BASE in"
echo "site/src/data/site.ts to that origin."

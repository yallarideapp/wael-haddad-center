#!/bin/bash
# Build the public static site from the same live package used for delivery.
set -euo pipefail
TOOLS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$TOOLS/../.." && pwd)"
OUT="$ROOT/.pages-output"

bash "$TOOLS/package-store.sh"
mkdir -p "$OUT"
find "$OUT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
unzip -q "$ROOT/WaelHaddad-complete-with-demo/WaelHaddad/wael-haddad-hostinger-upload.zip" -d "$OUT"
grep -q "^  mode: 'live',$" "$OUT/data.js"
test -f "$OUT/index.html"
touch "$OUT/.nojekyll"
printf 'Pages output: %s\n' "$OUT"

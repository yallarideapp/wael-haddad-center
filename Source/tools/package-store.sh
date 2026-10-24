#!/bin/bash
# Builds Demo/, the Hostinger upload ZIP, the source ZIP and the delivery folder + ZIP for Wael Haddad Center.
# Run from anywhere: bash Source/tools/package-store.sh   (or double-click UPDATE-PACKAGE.command)
# Needs only bash and the `zip` / `unzip` commands (built into macOS). No build step: the site is plain HTML/CSS/JS.
set -euo pipefail

TOOLS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$(cd "$TOOLS/.." && pwd)"
ROOT="$(cd "$SOURCE/.." && pwd)"
NAME="WaelHaddad"
SLUG="wael-haddad"
DELIVERY_PARENT="$ROOT/$NAME-complete-with-demo"
DELIVERY="$DELIVERY_PARENT/$NAME"
WORK="$ROOT/.package-tmp"
RUNTIME=(index.html styles.css data.js app.js admin.js assets/favicon.svg assets/coupe-studio.webp assets/coupe-studio-mobile.webp assets/engine-bay.webp assets/hood-underside.webp assets/audi-rings.svg assets/volkswagen-emblem.svg assets/porsche-crest.png)

inside() { case "$1" in "$ROOT"/*) return 0;; *) echo "Refusing path outside the project: $1" >&2; exit 1;; esac; }
for p in "$DELIVERY_PARENT" "$WORK" "$ROOT/Demo"; do inside "$p"; done
command -v zip >/dev/null || { echo "zip is not installed" >&2; exit 1; }
for f in "${RUNTIME[@]}"; do [ -f "$SOURCE/$f" ] || { echo "Missing Source/$f" >&2; exit 1; }; done
grep -q "^  mode: 'demo',$" "$SOURCE/data.js" || { echo "Source/data.js must keep  mode: 'demo',  (the package script switches it for Hostinger)" >&2; exit 1; }

echo "1/7 checks"
if command -v node >/dev/null; then for f in data.js app.js admin.js; do node --check "$SOURCE/$f"; done; else echo "   (node not installed: syntax check skipped)"; fi

echo "2/7 Demo/"
rm -rf "$ROOT/Demo"; mkdir -p "$ROOT/Demo/assets"
for f in "${RUNTIME[@]}"; do cp "$SOURCE/$f" "$ROOT/Demo/$f"; done
cat > "$ROOT/Demo/Open-demo.html" <<'HTML'
<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=index.html#"><title>مركز وائل حداد — نسخة عرض</title></head>
<body><p><a href="index.html#">افتح الموقع</a> · <a href="index.html#admin">لوحة التحكم</a></p></body></html>
HTML
printf '#!/bin/bash\ncd "$(dirname "$0")" && open "Open-demo.html"\n' > "$ROOT/Demo/START-DEMO.command"
chmod +x "$ROOT/Demo/START-DEMO.command"
printf '@echo off\r\nstart "" "%%~dp0Open-demo.html"\r\n' > "$ROOT/Demo/START-DEMO.cmd"
cat > "$ROOT/Demo/README-AR.md" <<'MD'
# نسخة العرض — مركز وائل حداد

1. فك ضغط المجلد كامل (ما تفتحه من جوا الـ ZIP).
2. دبل كليك على `Open-demo.html` (أو `START-DEMO.command` على الماك، `START-DEMO.cmd` على الويندوز). الأفضل Chrome أو Safari أو Edge.
3. لوحة التحكم: من زر «نسخة عرض · لوحة التحكم» تحت، أو من القائمة على الموبايل. ما بدها كلمة سر بنسخة العرض.

- اسم المركز، العنوان، الأرقام، الماركات والعرض الشتوي من صفحة المهندس وائل حداد على فيسبوك.
- السيارات والزباين والأسعار بتقرير الفحص وسجل السيارة **أمثلة** ومعلّمة «مثال».
- أي حجز أو تعديل بضل على هالمتصفح بس. زر واتساب بفتح محادثة حقيقية مع رقم المركز.
- الخطوط من Google Fonts بدها إنترنت، وبدونها بتطلع خطوط الجهاز.
MD

echo "3/7 Hostinger upload ZIP (live mode)"
rm -rf "$WORK"; mkdir -p "$WORK/upload/assets" "$WORK/stage/$NAME"
for f in "${RUNTIME[@]}"; do cp "$SOURCE/$f" "$WORK/upload/$f"; done
sed "s/^  mode: 'demo',$/  mode: 'live',/" "$SOURCE/data.js" > "$WORK/upload/data.js"
grep -q "^  mode: 'live',$" "$WORK/upload/data.js" || { echo "Could not switch the upload to live mode" >&2; exit 1; }
UP_ZIP="$WORK/$SLUG-hostinger-upload.zip"
(cd "$WORK/upload" && zip -qrX "$UP_ZIP.tmp" . -x '.DS_Store' && mv "$UP_ZIP.tmp" "$UP_ZIP")

echo "4/7 source ZIP"
S="$WORK/stage/$NAME"
mkdir -p "$S/Source/tools" "$S/Source/assets" "$S/Documents"
for f in "${RUNTIME[@]}" README-AR.md MAINTENANCE-AR.md ASSET-SOURCES.md tools/package-store.sh tools/build-pages.sh tools/delivery-README-AR.md; do cp "$SOURCE/$f" "$S/Source/$f"; done
# The optional full-size image master stays local; runtime images are sufficient to rebuild.
if [ -f "$SOURCE/assets/coupe-studio-master.png" ]; then cp "$SOURCE/assets/coupe-studio-master.png" "$S/Source/assets/"; fi
if [ -d "$SOURCE/tests" ]; then
  mkdir -p "$S/Source/tests"
  for f in "$SOURCE"/tests/*.mjs "$SOURCE/tests/package.json" "$SOURCE/tests/README.md" "$SOURCE/tests/.gitignore"; do
    if [ -f "$f" ]; then cp "$f" "$S/Source/tests/"; fi
  done
fi
for item in README-AR.md Hostinger-guide.md START-DEMO.command UPDATE-PACKAGE.command .gitignore; do [ -e "$ROOT/$item" ] && cp "$ROOT/$item" "$S/"; done
cp "$SOURCE/ASSET-SOURCES.md" "$S/Documents/ASSET-SOURCES.md"
for item in README-AR.md SOURCES.md IMAGE-ASSETS.md; do [ -e "$ROOT/Documents/$item" ] && cp "$ROOT/Documents/$item" "$S/Documents/"; done
SRC_ZIP="$WORK/$NAME-website-source.zip"
(cd "$WORK/stage" && zip -qrX "$SRC_ZIP.tmp" "$NAME" -x '*.DS_Store' && mv "$SRC_ZIP.tmp" "$SRC_ZIP")

echo "5/7 delivery folder"
rm -rf "$DELIVERY_PARENT.tmp"; mkdir -p "$DELIVERY_PARENT.tmp/$NAME/Documents"
D="$DELIVERY_PARENT.tmp/$NAME"
cp "$SRC_ZIP" "$UP_ZIP" "$D/"
cp -R "$ROOT/Demo" "$D/Demo"
for item in README-AR.md SOURCES.md IMAGE-ASSETS.md; do [ -e "$ROOT/Documents/$item" ] && cp "$ROOT/Documents/$item" "$D/Documents/"; done
cp "$SOURCE/ASSET-SOURCES.md" "$D/Documents/ASSET-SOURCES.md"
cp "$SOURCE/tools/delivery-README-AR.md" "$D/README-AR.md"
cp "$ROOT/Hostinger-guide.md" "$D/Hostinger-guide.md"
find "$DELIVERY_PARENT.tmp" -name '.DS_Store' -delete 2>/dev/null || true
rm -rf "$DELIVERY_PARENT"; mv "$DELIVERY_PARENT.tmp" "$DELIVERY_PARENT"

echo "6/7 complete ZIP"
ALL_ZIP="$ROOT/$NAME-complete-with-demo.zip"
(cd "$ROOT" && rm -f "$ALL_ZIP.tmp" && zip -qrX "$ALL_ZIP.tmp" "$NAME-complete-with-demo" && mv "$ALL_ZIP.tmp" "$ALL_ZIP")

echo "7/7 verify"
bad='AGENTS\.md|CONTEXT\.md|Evidence/|Archives/|\.env|node_modules|\.log$|\.package-tmp'
for z in "$SRC_ZIP" "$UP_ZIP" "$ALL_ZIP"; do
  if unzip -Z1 "$z" | grep -E "$bad" >/dev/null; then echo "Internal file inside $(basename "$z")" >&2; unzip -Z1 "$z" | grep -E "$bad" >&2; exit 1; fi
done
unzip -Z1 "$UP_ZIP" | grep -x 'index.html' >/dev/null || { echo "index.html is not at the root of the upload ZIP" >&2; exit 1; }
unzip -p "$UP_ZIP" data.js | grep "^  mode: 'live',$" >/dev/null || { echo "upload ZIP is not in live mode" >&2; exit 1; }
for need in "$NAME-website-source.zip" "$SLUG-hostinger-upload.zip" "Demo/index.html" "Demo/Open-demo.html" "README-AR.md" "Hostinger-guide.md" "Documents/ASSET-SOURCES.md"; do
  unzip -Z1 "$ALL_ZIP" | grep -x "$NAME-complete-with-demo/$NAME/$need" >/dev/null || { echo "Missing from the delivery: $need" >&2; exit 1; }
done
# assistant/tool names, split so this script does not match itself
traces="cl""aude|anth""ropic|open""ai|chat""gpt|co""dex|rep""lit|co""pilot"
if grep -rliE "$traces" "$DELIVERY_PARENT" "$WORK/stage" "$WORK/upload" >/dev/null 2>&1; then echo "A tool name is inside the delivery:" >&2; grep -rliE "$traces" "$DELIVERY_PARENT" "$WORK/stage" "$WORK/upload" >&2; exit 1; fi
rm -rf "$WORK"

# keep the folder view clean on a Mac: only the delivery folder and its ZIP stay visible
if command -v chflags >/dev/null; then
  for item in Source Demo Documents AGENTS.md WAELHADDAD-CONTEXT.md README.md README-AR.md Hostinger-guide.md UPDATE-PACKAGE.command START-DEMO.command .gitignore ar-phone-light.png; do
    [ -e "$ROOT/$item" ] && chflags hidden "$ROOT/$item"
  done
fi

size() { wc -c < "$1" | tr -d ' '; }
count() { unzip -Z1 "$1" | wc -l | tr -d ' '; }
printf '{"sourceZip":{"files":%s,"bytes":%s},"hostingerZip":{"files":%s,"bytes":%s},"completeZip":{"path":"%s","files":%s,"bytes":%s},"demoFiles":%s}\n' \
  "$(count "$DELIVERY/$NAME-website-source.zip")" "$(size "$DELIVERY/$NAME-website-source.zip")" \
  "$(count "$DELIVERY/$SLUG-hostinger-upload.zip")" "$(size "$DELIVERY/$SLUG-hostinger-upload.zip")" \
  "$NAME-complete-with-demo.zip" "$(count "$ALL_ZIP")" "$(size "$ALL_ZIP")" "$(find "$ROOT/Demo" -type f | wc -l | tr -d ' ')"

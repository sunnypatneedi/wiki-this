#!/bin/sh
# Builds the bundled HTTP caching sample wiki as a smoke test.
# Usage: sh build-sample.sh <out-dir>
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
SKILL="$(dirname "$HERE")"
OUT="$1"
[ -n "$OUT" ] || { echo "usage: sh build-sample.sh <out-dir>"; exit 1; }
[ ! -e "$OUT" ] || [ -z "$(ls -A "$OUT")" ] || { echo "build-sample: $OUT is not empty"; exit 1; }
# Validate the committed classic-script data against its canonical JSON source.
# Neither the build nor the generated lesson fetches a remote resource.
node "$SKILL/scripts/compile-learning-pack.mjs" --check
mkdir -p "$OUT/assets/shell" "$OUT/assets/learning" "$OUT/assets/glossary/fonts" "$OUT/references/sample" "$OUT/examples"
cp "$SKILL"/assets/shell/* "$OUT/assets/shell/"
cp "$SKILL"/assets/learning/* "$OUT/assets/learning/"
cp "$SKILL"/assets/glossary/map.js "$SKILL"/assets/glossary/map.css \
  "$SKILL"/assets/glossary/dict-tokens.css "$SKILL"/assets/glossary/glossary-shell.css \
  "$SKILL"/assets/glossary/wire.js "$SKILL"/assets/glossary/PIN.md \
  "$OUT/assets/glossary/"
cp "$SKILL"/assets/glossary/fonts/* "$OUT/assets/glossary/fonts/"
cp "$SKILL"/references/sample/*.js "$OUT/references/sample/"
cp "$SKILL"/references/sample/learning-pack.json "$OUT/references/sample/"
cp "$SKILL"/examples/*.html "$OUT/examples/"
echo "sample wiki: $OUT/examples/article.html"

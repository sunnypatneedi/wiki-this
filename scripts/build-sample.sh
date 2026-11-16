#!/bin/sh
# Builds the bundled HTTP caching sample wiki as a smoke test.
# Usage: sh build-sample.sh <out-dir>
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
SKILL="$(dirname "$HERE")"
OUT="$1"
[ -n "$OUT" ] || { echo "usage: sh build-sample.sh <out-dir>"; exit 1; }
[ ! -e "$OUT" ] || [ -z "$(ls -A "$OUT")" ] || { echo "build-sample: $OUT is not empty"; exit 1; }
mkdir -p "$OUT/assets/shell" "$OUT/references/sample" "$OUT/examples"
cp "$SKILL"/assets/shell/* "$OUT/assets/shell/"
cp "$SKILL"/references/sample/*.js "$OUT/references/sample/"
cp "$SKILL"/examples/*.html "$OUT/examples/"
echo "sample wiki: $OUT/examples/article.html"

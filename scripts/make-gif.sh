#!/usr/bin/env bash
# Converts the Playwright session recording (webm) into docs/demo.gif.
# Requires ffmpeg. Run after scripts/capture-demo.mjs.
set -euo pipefail

OUT_DIR="${OUT_DIR:-docs}"
WEBM=$(ls -t "$OUT_DIR"/*.webm 2>/dev/null | head -1 || true)

if [ -z "$WEBM" ]; then
  echo "No recording found in $OUT_DIR (run capture-demo.mjs first)" >&2
  exit 1
fi

# Two-pass palette GIF: good quality at a reasonable size. The demo is
# recorded deliberately slowly; 5 fps / 820px keeps the file readable and
# small enough for the README.
ffmpeg -y -loglevel error -i "$WEBM" \
  -vf "fps=5,scale=820:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" \
  "$OUT_DIR/demo.gif"

echo "Wrote $OUT_DIR/demo.gif ($(du -h "$OUT_DIR/demo.gif" | cut -f1))"

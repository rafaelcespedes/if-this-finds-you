#!/bin/sh
# Turn the frames from production.mjs into PNG/ICO with headless Chrome (+ Pillow for the .ico).
# Usage: node brand/wordmark/production.mjs && sh brand/wordmark/rasterize.sh
set -e
cd "$(dirname "$0")/../.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
F="$PWD/out/brand-frames"; P="$PWD/app/public/brand"
shot() { # frame w h out (Chrome can exit non-zero on teardown after writing the file, so check the file instead)
  rm -f "$4"
  perl -e 'alarm 60; exec @ARGV' "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --default-background-color=00000000 --virtual-time-budget=6000 \
    --window-size="$2,$3" --screenshot="$4" "file://$F/$1.html" >/dev/null 2>&1 || true
  [ -s "$4" ] || { echo "screenshot failed: $1"; exit 1; }
}
for v in "" "-5"; do
  shot apple-touch-icon$v 180 180 "$P/apple-touch-icon$v.png"
  shot icon$v-192 192 192 "$P/icon$v-192.png"
  shot icon$v-512 512 512 "$P/icon$v-512.png"
  shot og-image$v 1200 630 "$P/og-image$v.png"
  # tiny windows can hang Chrome: shoot favicons in a 400 px window, crop in Python below
  for s in 16 32 48; do shot favicon$v-$s 400 400 "$F/favicon$v-$s.png"; done
done
python3 - "$F" "$P" <<'PY'
import sys
from PIL import Image
f, p = sys.argv[1], sys.argv[2]
for v in ("", "-5"):
    imgs = [Image.open(f"{f}/favicon{v}-{s}.png").convert("RGBA").crop((0, 0, s, s)) for s in (32, 16)]
    imgs[0].save(f"{p}/favicon{v}.ico", format="ICO", sizes=[(32, 32), (16, 16)], append_images=imgs[1:])
    for name in (f"apple-touch-icon{v}", f"icon{v}-192", f"icon{v}-512", f"og-image{v}"):
        im = Image.open(f"{p}/{name}.png").convert("RGB")   # no alpha: solid paper ground
        im.save(f"{p}/{name}.png", optimize=True)
        print(name, im.size)
PY

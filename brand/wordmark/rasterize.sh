#!/bin/sh
# Turn the frames from production.mjs into PNG/ICO with headless Chrome (+ Pillow for the .ico).
# Usage: node brand/wordmark/production.mjs && sh brand/wordmark/rasterize.sh
set -e
cd "$(dirname "$0")/../.."
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
F="$PWD/out/brand-frames"; P="$PWD/app/public/brand"
shot() { # frame w h out (Chrome can exit non-zero on teardown after writing the file, so check the file instead)
  rm -f "$4"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --virtual-time-budget=6000 \
    --window-size="$2,$3" --screenshot="$4" "file://$F/$1.html" >/dev/null 2>&1 || true
  [ -s "$4" ] || { echo "screenshot failed: $1"; exit 1; }
}
shot apple-touch-icon 180 180 "$P/apple-touch-icon.png"
shot icon-192 192 192 "$P/icon-192.png"
shot icon-512 512 512 "$P/icon-512.png"
shot og-image 1200 630 "$P/og-image.png"
for s in 16 32 48; do shot favicon-$s $s $s "$F/favicon-$s.png"; done
python3 - "$F" "$P" <<'PY'
import sys
from PIL import Image
f, p = sys.argv[1], sys.argv[2]
imgs = [Image.open(f"{f}/favicon-{s}.png").convert("RGBA") for s in (32, 16, 48)]
imgs[0].save(f"{p}/favicon.ico", format="ICO", sizes=[(32, 32), (16, 16), (48, 48)], append_images=imgs[1:])
for name in ("apple-touch-icon", "icon-192", "icon-512", "og-image"):
    im = Image.open(f"{p}/{name}.png").convert("RGB")   # no alpha: solid paper ground
    im.save(f"{p}/{name}.png", optimize=True)
    print(name, im.size)
PY

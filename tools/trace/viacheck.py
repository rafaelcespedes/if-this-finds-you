"""viacheck.py — large overlay of one glyph's waypoints and snapped strokes on its plate, with a pixel grid.

    tools/trace/.venv/bin/python -I tools/trace/viacheck.py <hand.json> <char> [x0 y0 x1 y1] [--scale 1.5] [--out f.png]

Waypoints are numbered dots; the snapped path is drawn in colour. Use it to place `via` waypoints.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import trace as T  # noqa: E402


def main(a):
    hand = T.load_json(a[0])
    ch = a[1]
    opts = dict(zip(a[2::2], a[3::2])) if len(a) > 2 and a[2].startswith('--') else dict(zip(a[6::2], a[7::2]))
    gl = [g for g in hand['glyphs'] if g['ch'] == ch and not g.get('skip')][0]
    ex = T.extract_glyph(hand, gl, {})
    row = T.guides(hand, gl)
    path = T.image_path(hand, row['img'])
    if len(a) > 5 and not a[2].startswith('--'):
        x0, y0, x1, y1 = map(int, a[2:6])
    else:
        xs = [p[0] for s in ex['strokes'] for p in s['pts']] + [p[0] for s in gl.get('via', []) for p in (s['line'] if isinstance(s, dict) else s)]
        ys = [p[1] for s in ex['strokes'] for p in s['pts']] + [p[1] for s in gl.get('via', []) for p in (s['line'] if isinstance(s, dict) else s)]
        x0, y0, x1, y1 = int(min(xs)) - 30, int(min(ys)) - 30, int(max(xs)) + 30, int(max(ys)) + 30
    sc = float(opts.get('--scale', 1.5))
    out = opts.get('--out', '/tmp/via.png')
    im = Image.open(path).convert('RGB').crop((x0, y0, x1, y1))
    im = Image.blend(im, Image.new('RGB', im.size, 'white'), 0.45)
    im = im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    f = T.font(13)
    for x in range((x0 // 10 + 1) * 10, x1, 10):
        X = (x - x0) * sc
        d.line([(X, 0), (X, im.height)], fill=(150, 190, 255) if x % 50 else (60, 120, 255), width=1)
        if x % 50 == 0:
            d.text((X + 2, 2), str(x), fill=(0, 60, 200), font=f)
    for y in range((y0 // 10 + 1) * 10, y1, 10):
        Y = (y - y0) * sc
        d.line([(0, Y), (im.width, Y)], fill=(255, 210, 170) if y % 50 else (255, 120, 0), width=1)
        if y % 50 == 0:
            d.text((2, Y + 1), str(y), fill=(200, 70, 0), font=f)
    tf = lambda p: ((p[0] - x0) * sc, (p[1] - y0) * sc)
    T.draw_strokes(d, [s['pts'] for s in ex['strokes']], tf, 2, True, f)
    for si, s in enumerate(gl.get('via', [])):
        for i, p in enumerate(s['line'] if isinstance(s, dict) else s):
            X, Y = tf(p)
            d.ellipse([X - 3, Y - 3, X + 3, Y + 3], outline=(0, 0, 0))
            d.text((X + 4, Y - 6), str(i), fill=(0, 0, 0), font=f)
    im.save(out)
    print(out, im.size, (x0, y0, x1, y1))


if __name__ == '__main__':
    main(sys.argv[1:])

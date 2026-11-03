"""thumbsheet.py — tile page thumbnails into numbered contact sheets, to find the alphabet plates.

    tools/trace/.venv/bin/python -I tools/trace/thumbsheet.py <dir-of-images> <out-prefix> [--cols 6] [--per 24] [--w 260]

Images are sorted by the number in their file name. Each tile is labelled with that file name.
"""
import os
import re
import sys

from PIL import Image, ImageDraw


def main(argv):
    src, out = argv[0], argv[1]
    cols = int(argv[argv.index('--cols') + 1]) if '--cols' in argv else 6
    per = int(argv[argv.index('--per') + 1]) if '--per' in argv else 24
    tw = int(argv[argv.index('--w') + 1]) if '--w' in argv else 260
    files = [f for f in os.listdir(src) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    files.sort(key=lambda f: [int(x) for x in re.findall(r'\d+', f)] or [0])
    for k in range(0, len(files), per):
        chunk = files[k:k + per]
        tiles = []
        for f in chunk:
            im = Image.open(os.path.join(src, f)).convert('L')
            im.thumbnail((tw, int(tw * 1.6)))
            tiles.append((f, im))
        th = max(t[1].height for t in tiles) + 16
        rows = (len(tiles) + cols - 1) // cols
        sheet = Image.new('L', (cols * (tw + 6), rows * th), 255)
        d = ImageDraw.Draw(sheet)
        for i, (f, im) in enumerate(tiles):
            x, y = (i % cols) * (tw + 6), (i // cols) * th
            sheet.paste(im, (x, y + 14))
            d.text((x + 2, y), f, fill=0)
        sheet.save(f'{out}-{k // per:02d}.png')
        print(f'{out}-{k // per:02d}.png', chunk[0], '…', chunk[-1])


if __name__ == '__main__':
    main(sys.argv[1:])

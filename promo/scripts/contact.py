# contact.py: tile PNG stills into one sheet (for reviewing). python3 scripts/contact.py out.png cols w in1.png in2.png ...
import sys
from PIL import Image, ImageDraw
out, cols, w = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
ims = [Image.open(p).convert('RGB') for p in sys.argv[4:]]
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w + (cols + 1) * 8, rows * w + (rows + 1) * 8), (200, 198, 192))
for i, im in enumerate(ims):
    im = im.resize((w, int(im.height * w / im.width)), Image.LANCZOS)
    sheet.paste(im, (8 + (i % cols) * (w + 8), 8 + (i // cols) * (w + 8)))
sheet.save(out)

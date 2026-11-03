"""htr.py — pull labelled letters out of handwritten-text-recognition ground truth (ALTO XML + page image).

    PY=tools/trace/.venv/bin/python
    $PY -I tools/trace/htr.py letters <source-id> <page> [<page> ...] --writer <key> [--out cands.json]
        For each transcribed line: crop the line, binarize, drop ruled lines, group ink into letter
        clusters (dots and accents join the letter below), and when the cluster count equals the number
        of characters in the transcription (spaces excluded), label each cluster with its character.
        Writes every labelled letter with its line's baseline and x-height.
    $PY -I tools/trace/htr.py pick <cands.json> [--per 1] [--chars abc...] --hand <hand.json>
        Choose the most typical instance of each character per writer and append glyph entries
        (box + guides + writer tag + source) to a hand file for trace.py build.
    $PY -I tools/trace/htr.py sheet <cands.json> <out.png>
        Contact sheet of the labelled letters, to check the alignment by eye.

Only print hands align well: in joined writing one cluster holds a whole word. Lines that don't match
are skipped, never forced. Letterforms only: the text itself is never stored or displayed.
"""
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage.morphology import binary_opening, rectangle

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import skel  # noqa: E402

NS = {'a': 'http://www.loc.gov/standards/alto/ns-v4#'}
XLETTERS = set('acemnorsuvwxz')


def raw(src):
    return os.path.join(HERE, 'raw', src)


def parse_alto(path):
    root = ET.parse(path).getroot()
    lines = []
    for tl in root.iter('{%s}TextLine' % NS['a']):
        st = tl.find('a:String', NS)
        text = st.get('CONTENT') if st is not None else ''
        poly = tl.find('a:Shape/a:Polygon', NS)
        pts = [int(v) for v in poly.get('POINTS').split()] if poly is not None else []
        bl = [int(v) for v in (tl.get('BASELINE') or '').split()]
        lines.append({'id': tl.get('ID'), 'text': text,
                      'poly': list(zip(pts[0::2], pts[1::2])),
                      'baseline': list(zip(bl[0::2], bl[1::2])),
                      'box': [int(tl.get('HPOS')), int(tl.get('VPOS')),
                              int(tl.get('HPOS')) + int(tl.get('WIDTH')), int(tl.get('VPOS')) + int(tl.get('HEIGHT'))]})
    return lines


def base_at(bl, x):
    if len(bl) < 2:
        return bl[0][1] if bl else None
    for (x0, y0), (x1, y1) in zip(bl, bl[1:]):
        if x0 <= x <= x1 or (x < bl[0][0] and (x0, y0) == bl[0]) or (x > bl[-1][0] and (x1, y1) == bl[-1]):
            return y0 + (y1 - y0) * (x - x0) / max(1, (x1 - x0))
    return bl[-1][1]


def clean_text(t):
    # transcription conventions: >crossed out< and >< (unreadable) — skip such lines entirely
    if '>' in t or '<' in t:
        return None
    return t


def line_clusters(gray, line, cfg):
    x0, y0, x1, y1 = line['box']
    pad = 6
    H, W = gray.shape
    X0, Y0, X1, Y1 = max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)
    crop = gray[Y0:Y1, X0:X1]
    ink = skel.binarize(crop, cfg)
    # mask to the line polygon (neighbouring lines' descenders and ascenders stay out)
    m = Image.new('L', (X1 - X0, Y1 - Y0), 0)
    if line['poly']:
        ImageDraw.Draw(m).polygon([(px - X0, py - Y0) for px, py in line['poly']], fill=1)
        ink &= np.asarray(m, dtype=bool)
    # ruled lines: long, thin horizontal runs
    long = binary_opening(ink, rectangle(1, 70))
    thick = binary_opening(long, rectangle(5, 1))
    ink &= ~(long & ~thick)
    if cfg.get('close'):
        ink = ndi.binary_closing(ink, structure=np.ones((cfg['close'], cfg['close'])))
    lab, n = ndi.label(ink, structure=np.ones((3, 3)))
    objs = ndi.find_objects(lab)
    comps = []
    for i, sl in enumerate(objs, 1):
        if sl is None:
            continue
        area = int((lab[sl] == i).sum())
        if area < cfg.get('minArea', 12):
            continue
        ys, xs = sl
        comps.append({'box': [xs.start + X0, ys.start + Y0, xs.stop + X0, ys.stop + Y0], 'area': area})
    comps.sort(key=lambda c: (c['box'][0] + c['box'][2]) / 2)
    # merge components that share most of their x-range (i-dots, accents, a t-bar drawn apart)
    clusters = []
    for c in comps:
        b = c['box']
        merged = False
        for cl in clusters[-3:]:
            cb = cl['box']
            ov = min(b[2], cb[2]) - max(b[0], cb[0])
            narrow = min(b[2] - b[0], cb[2] - cb[0])
            if ov > 0.55 * narrow:
                cl['box'] = [min(b[0], cb[0]), min(b[1], cb[1]), max(b[2], cb[2]), max(b[3], cb[3])]
                cl['n'] += 1
                cl['area'] += c['area']
                merged = True
                break
        if not merged:
            clusters.append({'box': list(b), 'n': 1, 'area': c['area']})
    return clusters


def align_words(text, cl, base_fn=None, xh=None):
    """split the line's clusters into words at its widest gaps; keep the words whose cluster count equals
    their letter count. Returns [(char, cluster)] for the words that match (may be empty)."""
    words = text.split()
    if not words or not cl:
        return []
    if len(words) == 1:
        groups = [cl]
    else:
        gaps = [(cl[i + 1]['box'][0] - cl[i]['box'][2], i) for i in range(len(cl) - 1)]
        top = sorted(gaps, reverse=True)
        k = len(words) - 1
        if len(top) < k:
            return []
        if len(top) > k and top[k - 1][0] < 1.1 * max(1, top[k][0]):
            return []  # word gaps must stand out a little from letter gaps
        cuts = sorted(i for g, i in top[:k])
        groups, start = [], 0
        for i in cuts:
            groups.append(cl[start:i + 1])
            start = i + 1
        groups.append(cl[start:])
    out = []
    for w, g in zip(words, groups):
        g = [dict(c, box=list(c['box'])) for c in g]
        # a letter broken into pieces (faint pen): join the closest neighbours until the counts match
        while len(g) > len(w):
            i = min(range(len(g) - 1), key=lambda j: g[j + 1]['box'][0] - g[j]['box'][2])
            if g[i + 1]['box'][0] - g[i]['box'][2] > 6:
                break
            a, b = g[i], g[i + 1]
            g[i:i + 2] = [{'box': [min(a['box'][0], b['box'][0]), min(a['box'][1], b['box'][1]), max(a['box'][2], b['box'][2]), max(a['box'][3], b['box'][3])],
                           'n': a['n'] + b['n'], 'area': a['area'] + b['area']}]
        if len(w) == len(g) and zones_match(w, g, base_fn, xh):
            out.extend(zip(w, g))
    return out


ASC = set('bdfhklt' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' + '0123456789' + "àâäéèêëîïôöùûüÿç'")
DESC = set('gjpqy')
SKIP = set("ijtf'.,;:-()çàâäéèêëîïôöùûüÿ")


def zones_match(word, g, base_fn, xh):
    """the word's ink must rise and fall where its letters do: an ascender above the x-height, a descender
    below the baseline, nothing else outside the x-height band. Shifted labels fail this almost always."""
    if not xh:
        return False
    for ch, c in zip(word, g):
        if ch in SKIP:
            continue
        b = c['box']
        base = base_fn((b[0] + b[2]) / 2)
        top = (base - b[1]) / xh
        bot = (b[3] - base) / xh
        if ch in DESC:
            if bot < 0.35:
                return False
        elif bot > 0.4:
            return False
        if ch in ASC:
            if top < 1.35:
                return False
        elif top > 1.3:
            return False
    return True


def cmd_letters(args):
    src = args[0]
    pages = []
    for a in args[1:]:
        if a.startswith('--'):
            break
        pages.append(a)
    writer = args[args.index('--writer') + 1] if '--writer' in args else pages[0]
    out = args[args.index('--out') + 1] if '--out' in args else os.path.join(HERE, 'out', 'htr', writer + '.json')
    cfg = {'flatten': 61, 'minArea': 12, 'holes': 10, 'bias': 0.04, 'close': 2}
    cands = []
    stats = {'lines': 0, 'aligned': 0}
    for page in pages:
        lines = parse_alto(os.path.join(raw(src), 'alto', page + '.xml'))
        gray = np.asarray(Image.open(os.path.join(raw(src), 'jpg', page + '.jpg')).convert('L'))
        for ln in lines:
            t = clean_text(ln['text'])
            if not t or ln['text'].startswith('imp_wikitexte') or ln['text'].startswith('wikitexte'):
                continue
            stats['lines'] += 1
            cl = line_clusters(gray, ln, cfg)
            bfn = lambda x, bl=ln['baseline']: base_at(bl, x)
            tops = sorted(bfn((c['box'][0] + c['box'][2]) / 2) - c['box'][1] for c in cl if c['box'][3] - c['box'][1] > 4)
            xh0 = tops[int(len(tops) * 0.35)] if tops else None
            pairs = align_words(t, cl, bfn, xh0)
            if not pairs:
                continue
            stats['aligned'] += 1
            chars = [c for c, k in pairs]
            cl = [k for c, k in pairs]
            # line x-height: median height above the baseline of x-height letters
            hs = []
            for c, k in zip(chars, cl):
                if c in XLETTERS:
                    cx = (k['box'][0] + k['box'][2]) / 2
                    hs.append(base_at(ln['baseline'], cx) - k['box'][1])
            if len(hs) < 3:
                continue
            xh = float(np.median(hs))
            for i, (c, k) in enumerate(zip(chars, cl)):
                cx = (k['box'][0] + k['box'][2]) / 2
                cands.append({'ch': c, 'writer': writer, 'page': page, 'line': ln['id'], 'box': k['box'],
                              'base': round(base_at(ln['baseline'], cx), 1), 'xH': round(xh, 1), 'parts': k['n']})
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as f:
        json.dump({'source': src, 'writer': writer, 'pages': pages, 'stats': stats, 'cands': cands}, f)
    print(f"{writer}: {stats['aligned']}/{stats['lines']} lines aligned, {len(cands)} letters -> {out}")
    have = sorted(set(c['ch'] for c in cands))
    print('  chars:', ''.join(have))


def typical(group):
    """the instance closest to the group's median proportions (height and width over x-height)."""
    hs = np.array([(g['box'][3] - g['box'][1]) / g['xH'] for g in group])
    ws = np.array([(g['box'][2] - g['box'][0]) / g['xH'] for g in group])
    mh, mw = np.median(hs), np.median(ws)
    d = np.abs(hs - mh) + np.abs(ws - mw)
    return [group[i] for i in np.argsort(d)]


def writer_slant(cands, src):
    """the writer's own slant (degrees, + = leaning right), from the principal axis of their stems."""
    angs = []
    cache = {}
    for c in cands:
        if c['ch'] not in 'lI1tdbhk':
            continue
        p = c['page']
        if p not in cache:
            cache[p] = np.asarray(Image.open(os.path.join(raw(src), 'jpg', p + '.jpg')).convert('L'))
        b = c['box']
        ink = skel.binarize(cache[p][b[1]:b[3], b[0]:b[2]], {'flatten': 0, 'minArea': 5})
        ys, xs = np.nonzero(ink)
        if len(xs) < 20 or (b[3] - b[1]) < 1.5 * (b[2] - b[0]):
            continue
        cx, cy = xs.mean(), ys.mean()
        cov = np.cov(np.vstack([xs - cx, ys - cy]))
        w, v = np.linalg.eigh(cov)
        vx, vy = v[:, 1]
        if vy > 0:
            vx, vy = -vx, -vy
        angs.append(np.degrees(np.arctan2(vx, -vy)))
    return float(np.median(angs)) if angs else 0.0


def cmd_pick(args):
    cand_files = [a for a in args if a.endswith('.json') and '--hand' not in args[max(0, args.index(a) - 1)]]
    hand_path = args[args.index('--hand') + 1]
    per = int(args[args.index('--per') + 1]) if '--per' in args else 1
    only = set(args[args.index('--chars') + 1]) if '--chars' in args else None
    hand = json.load(open(hand_path))
    hand.setdefault('images', {})
    picking = {json.load(open(cf))['writer'] for cf in cand_files}
    keep = [g for g in hand.get('glyphs', []) if not (g.get('fromHTR') and g.get('tags', {}).get('writer') in picking)]
    added = 0
    for cf in cand_files:
        C = json.load(open(cf))
        wr = C['writer']
        by = {}
        for c in C['cands']:
            if only and c['ch'] not in only:
                continue
            if not (c['ch'].isalnum() and c['ch'].isascii()):
                continue
            by.setdefault(c['ch'], []).append(c)
        meta = hand.get('writers', {}).get(wr, {})
        slant = round(writer_slant(C['cands'], C['source']), 1)
        hand.setdefault('writers', {}).setdefault(wr, {})['slant'] = slant
        for ch, group in sorted(by.items()):
            for k, c in enumerate(typical(group)[:per]):
                key = c['page']
                hand['images'][key] = {'source': C['source'], 'file': 'jpg/' + key + '.jpg'}
                pad = 4
                b = c['box']
                g = {'ch': ch, 'img': key, 'box': [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad], 'base': c['base'], 'xH': c['xH'],
                     'var': wr + ('-' + str(k + 1) if per > 1 else ''), 'fromHTR': True, 'slant': slant,
                     'tags': {'writer': wr}, 'source': {'key': wr, 'name': meta.get('name', wr), 'credit': meta.get('credit', ''), 'url': meta.get('url', '')}}
                if c['parts'] > 1:
                    g['own'] = 0.6
                keep.append(g)
                added += 1
    hand['glyphs'] = keep
    with open(hand_path, 'w') as f:
        f.write(json.dumps(hand, indent=1, ensure_ascii=False) + '\n')
    print('added', added, 'glyphs to', hand_path)


def cmd_sheet(args):
    C = json.load(open(args[0]))
    out = args[1]
    src = C['source']
    cache = {}
    tiles = []
    by = {}
    for c in C['cands']:
        by.setdefault(c['ch'], []).append(c)
    for ch in sorted(by):
        for c in by[ch][:8]:
            p = c['page']
            if p not in cache:
                cache[p] = Image.open(os.path.join(raw(src), 'jpg', p + '.jpg')).convert('L')
            b = c['box']
            im = cache[p].crop((b[0] - 3, b[1] - 3, b[2] + 3, b[3] + 3))
            im.thumbnail((60, 60))
            tiles.append((ch, im))
    cols = 24
    sheet = Image.new('L', (cols * 66, ((len(tiles) + cols - 1) // cols) * 80), 255)
    d = ImageDraw.Draw(sheet)
    for i, (ch, im) in enumerate(tiles):
        x, y = (i % cols) * 66, (i // cols) * 80
        sheet.paste(im, (x + 2, y + 16))
        d.text((x + 2, y + 1), ch, fill=0)
    sheet.save(out)
    print(out, len(tiles))


if __name__ == '__main__':
    cmd, rest = sys.argv[1], sys.argv[2:]
    {'letters': cmd_letters, 'pick': cmd_pick, 'sheet': cmd_sheet}[cmd](rest)

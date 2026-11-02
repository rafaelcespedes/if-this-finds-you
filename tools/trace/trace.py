"""trace.py — turn public-domain handwriting scans into engine skeletons. See tools/trace/README.md.

    PY=tools/trace/.venv/bin/python
    $PY -I tools/trace/trace.py fetch  <source-id>             download a source's files (manifest.json)
    $PY -I tools/trace/trace.py grid   <image> x0 y0 x1 y1 [--scale 2] [--step 20] [--out f.png]
                                                                a zoomed crop with a coordinate grid
    $PY -I tools/trace/trace.py comps  <hand.json> <image-key> x0 y0 x1 y1 [--out f.png]
                                                                numbered ink components + their boxes
    $PY -I tools/trace/trace.py build  <hand.json> [--only abc] [--sheet-only]
                                                                extract -> review sheets -> engine/sources/<style>.js

A hand file (tools/trace/hands/<style>.json) holds the style's metadata, the crop box and guide lines
of every glyph, and any hand fixes. Images are read from tools/trace/raw/<source-id>/ (gitignored;
`fetch` re-downloads them from the URLs recorded in manifest.json).
"""
import json
import math
import os
import sys
import urllib.request

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import skel  # noqa: E402

MANIFEST = os.path.join(HERE, 'manifest.json')
UA = 'seedhand-trace/0.1 (handwriting research; https://github.com/)'


def load_json(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def manifest():
    return load_json(MANIFEST)


def raw_dir(src_id):
    return os.path.join(HERE, 'raw', src_id)


# ---------------------------------------------------------------- fetch
def cmd_fetch(args):
    m = manifest()['sources']
    for sid in args:
        src = m[sid]
        d = raw_dir(sid)
        os.makedirs(d, exist_ok=True)
        for f in src.get('files', []):
            out = os.path.join(d, f['name'])
            if os.path.exists(out):
                print('have', out)
                continue
            req = urllib.request.Request(f['url'], headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=120) as r, open(out, 'wb') as w:
                w.write(r.read())
            print('got ', out)


# ---------------------------------------------------------------- viewing helpers
def font(sz=12):
    for p in ['/System/Library/Fonts/Supplemental/Arial.ttf', '/System/Library/Fonts/Helvetica.ttc',
              '/Library/Fonts/Arial.ttf']:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except OSError:
                pass
    return ImageFont.load_default()


def open_gray(path):
    return np.asarray(Image.open(path).convert('L'))


def cmd_grid(args):
    img, x0, y0, x1, y1 = args[0], *map(int, args[1:5])
    opts = dict(zip(args[5::2], args[6::2]))
    sc = float(opts.get('--scale', 2))
    step = int(opts.get('--step', 20))
    out = opts.get('--out', '/tmp/grid.png')
    im = Image.open(img).convert('RGB').crop((x0, y0, x1, y1))
    im = im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    f = font(11)
    for x in range((x0 // step + 1) * step, x1, step):
        X = (x - x0) * sc
        major = x % (step * 5) == 0
        d.line([(X, 0), (X, im.height)], fill=(0, 140, 255) if major else (150, 200, 255), width=1)
        if major:
            d.text((X + 2, 2), str(x), fill=(0, 90, 200), font=f)
    for y in range((y0 // step + 1) * step, y1, step):
        Y = (y - y0) * sc
        major = y % (step * 5) == 0
        d.line([(0, Y), (im.width, Y)], fill=(255, 120, 0) if major else (255, 200, 150), width=1)
        if major:
            d.text((2, Y + 1), str(y), fill=(200, 80, 0), font=f)
    im.save(out)
    print(out, im.size)


def cmd_comps(args):
    from scipy import ndimage as ndi
    hand = load_json(args[0])
    key = args[1]
    x0, y0, x1, y1 = map(int, args[2:6])
    opts = dict(zip(args[6::2], args[7::2]))
    out = opts.get('--out', '/tmp/comps.png')
    path = image_path(hand, key)
    g = open_gray(path)[y0:y1, x0:x1]
    ink = skel.binarize(g, hand.get('binarize'))
    lab, n = ndi.label(ink, structure=np.ones((3, 3)))
    objs = ndi.find_objects(lab)
    im = Image.fromarray(np.where(ink, 90, 235).astype(np.uint8)).convert('RGB')
    d = ImageDraw.Draw(im)
    f = font(12)
    rows = []
    for i, sl in enumerate(objs, 1):
        if sl is None:
            continue
        ys, xs = sl
        area = int((lab[sl] == i).sum())
        if area < 30:
            continue
        b = (xs.start + x0, ys.start + y0, xs.stop + x0, ys.stop + y0)
        rows.append((i, b, area))
        d.rectangle([xs.start, ys.start, xs.stop, ys.stop], outline=(220, 0, 0))
        d.text((xs.start + 1, ys.start + 1), str(i), fill=(200, 0, 0), font=f)
    im.save(out)
    for i, b, a in sorted(rows, key=lambda r: (r[1][0])):
        print(i, list(b), a)
    print(out)


# ---------------------------------------------------------------- per-glyph extraction
def image_path(hand, key):
    src = hand['images'][key]
    if isinstance(src, str):
        return os.path.join(raw_dir(hand['source']['manifest']), src)
    return os.path.join(raw_dir(src['source']), src['file'])


def guides(hand, gl):
    """the glyph's guide lines: its row's, overridden by the glyph's own. 'base' may be a number or a
    sloped line [x0, y0, x1, y1] (evaluated at the box centre); the scale comes from 'cap' (absolute y),
    'capH' (cap height in px) or 'x' / 'xH' (x-height)."""
    row = dict(hand.get('rows', {}).get(gl.get('row'), {}))
    for k in ('img', 'base', 'x', 'cap', 'capH', 'xH', 'slant'):
        if k in gl:
            row[k] = gl[k]
    b = row.get('base')
    if isinstance(b, list):
        cx = (gl['box'][0] + gl['box'][2]) / 2
        x0, y0, x1, y1 = b
        row['base'] = y0 + (y1 - y0) * (cx - x0) / (x1 - x0)
    return row


def glyph_key(gl):
    return gl['ch'] + ('#' + gl['var'] if gl.get('var') else '')


def extract_glyph(hand, gl, cache):
    """-> dict with strokes in image coordinates (+ crop, ink mask for the review)."""
    row = guides(hand, gl)
    path = image_path(hand, row['img'])
    if path not in cache:
        cache[path] = open_gray(path)
    full = cache[path]
    x0, y0, x1, y1 = gl['box']
    crop = full[y0:y1, x0:x1].copy()
    bcfg = dict(hand.get('binarize', {}))
    bcfg.update(gl.get('binarize', {}))
    own = gl.get('own', hand.get('own'))
    if own:
        # binarize a wider region, keep the ink components that lie mostly inside the box
        from scipy import ndimage as ndi
        M = 80
        H, W = full.shape
        X0, Y0, X1, Y1 = max(0, x0 - M), max(0, y0 - M), min(W, x1 + M), min(H, y1 + M)
        big = skel.binarize(full[Y0:Y1, X0:X1], bcfg)
        lab, n = ndi.label(big, structure=np.ones((3, 3)))
        inner = np.zeros_like(big)
        inner[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0] = True
        tot = ndi.sum(big, lab, range(1, n + 1))
        ins = ndi.sum(big & inner, lab, range(1, n + 1))
        keep = [i + 1 for i in range(n) if tot[i] and ins[i] / tot[i] >= own]
        big = np.isin(lab, keep)
        ink = big[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0]
    else:
        ink = skel.binarize(crop, bcfg)
    for r in gl.get('erase', []):  # rectangles (image coords) holding a neighbour's ink
        ex0, ey0, ex1, ey1 = r
        ink[max(0, ey0 - y0):max(0, ey1 - y0), max(0, ex0 - x0):max(0, ex1 - x0)] = False
    for poly in gl.get('erasePoly', []):
        m = Image.new('L', (x1 - x0, y1 - y0), 0)
        ImageDraw.Draw(m).polygon([(px - x0, py - y0) for px, py in poly], fill=1)
        ink[np.asarray(m, dtype=bool)] = False
    if gl.get('keepLargest'):
        from scipy import ndimage as ndi
        lab, n = ndi.label(ink, structure=np.ones((3, 3)))
        if n > 1:
            sizes = ndi.sum(ink, lab, range(1, n + 1))
            keep = {i + 1 for i, s in enumerate(sizes) if s >= max(sizes) * gl['keepLargest']}
            ink = np.isin(lab, list(keep))
    scfg = dict(hand.get('skeleton', {}))
    scfg.update(gl.get('skeleton', {}))
    script = hand.get('connected', False) and gl['ch'].islower()
    if gl.get('manual'):
        strokes = []
        for s in gl['manual']:
            pts = [(float(p[0]), float(p[1])) for p in s]
            strokes.append({'pts': pts, 'closed': False, 'dot': len(pts) == 1, 'manual': True})
        sw = 3.0
    else:
        res, sw = skel.skeleton_strokes(ink, scfg, script=script, retrace=hand.get('connected', False))
        strokes = [{**s, 'pts': [(p[0] + x0, p[1] + y0) for p in s['pts']]} for s in res]
        if gl.get('noDots'):
            strokes = [s for s in strokes if not s.get('dot')]
        for i in sorted(gl.get('drop', []), reverse=True):
            if i < len(strokes):
                strokes.pop(i)
        for i in gl.get('reverse', []):
            if i < len(strokes):
                strokes[i]['pts'] = strokes[i]['pts'][::-1]
        if gl.get('order'):
            strokes = [strokes[i] for i in gl['order'] if i < len(strokes)] + [s for i, s in enumerate(strokes) if i not in gl['order']]
        for i, j in gl.get('retraceJoin', []):
            # stroke i, back along its own tail to where stroke j begins, then on into j (one gesture)
            if i < len(strokes) and j < len(strokes):
                A, B = strokes[i]['pts'], strokes[j]['pts']
                k = min(range(len(A)), key=lambda t: math.hypot(A[t][0] - B[0][0], A[t][1] - B[0][1]))
                strokes[i] = {**strokes[i], 'pts': A + A[k:-1][::-1] + B, 'closed': False}
                strokes[j] = None
        strokes = [s for s in strokes if s is not None]
        if gl.get('autoJoin', hand.get('autoJoin')):
            strokes = auto_join(strokes, ink, x0, y0)
        for s in gl.get('add', []):  # extra hand-drawn strokes (image coords)
            strokes.append({'pts': [tuple(map(float, p)) for p in s], 'closed': False, 'dot': len(s) == 1, 'manual': True})
    return {'gl': gl, 'row': row, 'crop': crop, 'ink': ink, 'strokes': strokes, 'sw': sw}


def auto_join(strokes, ink, x0, y0, on=0.7):
    """keep the pen down between consecutive strokes when the jump from one's end to the next's start
    runs along ink already drawn (the stem of a, d, g, p, q): the letter stays one gesture, so the
    engine's per-stroke offsets can't pull bowl and stem apart."""
    H, W = ink.shape
    out = []
    for s in strokes:
        if out and not s.get('dot') and not out[-1].get('dot') and len(s['pts']) > 1:
            a, b = out[-1]['pts'][-1], s['pts'][0]
            n = max(2, int(math.hypot(b[0] - a[0], b[1] - a[1])))
            hits = 0
            for t in range(n + 1):
                x = int(round(a[0] + (b[0] - a[0]) * t / n)) - x0
                y = int(round(a[1] + (b[1] - a[1]) * t / n)) - y0
                hits += 1 if (0 <= x < W and 0 <= y < H and ink[max(0, y - 1):y + 2, max(0, x - 1):x + 2].any()) else 0
            if hits / (n + 1) >= on:
                out[-1] = {**out[-1], 'pts': list(out[-1]['pts']) + list(s['pts']), 'closed': False}
                continue
        out.append(s)
    return out


# ---------------------------------------------------------------- normalisation to engine units
def U(hand):
    u = {'cap': 200, 'xRatio': 0.45, 'join': 0.5, 'bearing': 0.08, 'maxDepth': 0.5, 'maxRise': 0.22, 'descRatio': 0.45,
         'lowerTop': 1.12, 'slant': {'source': 0, 'target': 0}}
    u.update(hand.get('units', {}))
    return u


def normalise(hand, ex):
    """image strokes -> style units (baseline y=0, cap y=-cap, y down), deslanted, limited, joined."""
    u = U(hand)
    gl, row = ex['gl'], ex['row']
    ch = gl['ch']
    base = row['base']
    if row.get('capH'):
        k = u['cap'] / row['capH']
    elif row.get('xH'):
        k = (u['xRatio'] * u['cap']) / row['xH']
    elif row.get('x') is not None:
        k = (u['xRatio'] * u['cap']) / (base - row['x'])
    else:
        k = u['cap'] / (base - row['cap'])
    k *= gl.get('scale', 1.0)
    src = row.get('slant', u['slant']['source'])
    tgt = u['slant']['target']
    sh = math.tan(math.radians(src)) - math.tan(math.radians(tgt))
    strokes = []
    for s in ex['strokes']:
        pts = []
        for x, y in s['pts']:
            X, Y = x * k, (y - base) * k
            X -= (-Y) * sh  # undo the source's slant above the baseline (and below it, mirrored)
            pts.append([X, Y])
        strokes.append({'pts': pts, 'dot': s.get('dot', False), 'closed': s.get('closed', False)})
    if gl.get('dy'):
        for s in strokes:
            for p in s['pts']:
                p[1] += gl['dy']
    C = u['cap']
    lower = ch.isalpha() and ch.islower()
    # vertical limits: capitals/digits linear in cap height (engine); compress what would clip
    limit_vertical(strokes, C, u, lower)
    out = {'strokes': strokes}
    script = hand.get('connected', False)
    if script and lower and not gl.get('noJoin'):
        J = -u['join'] * u['xRatio'] * C
        fix_joins(strokes, J, u, gl)
    place(strokes, out, hand, u, gl, script and lower and not gl.get('noJoin'))
    return out


def limit_vertical(strokes, C, u, lower):
    ys = [p[1] for s in strokes for p in s['pts']]
    if not ys:
        return
    deep = max(ys)
    maxd = u['maxDepth'] * C if not lower else u.get('maxDepthLower', 0.75) * C
    if deep > maxd:
        f = maxd / deep
        for s in strokes:
            for p in s['pts']:
                if p[1] > 0:
                    p[1] *= f
    top = -min(ys)
    maxt = (1 + u['maxRise']) * C if not lower else u['lowerTop'] * C
    if top > maxt:
        # squeeze only what rises above the x-height (lowercase) or the cap line's lower 60% (caps)
        pivot = u['xRatio'] * C if lower else 0.6 * C
        f = (maxt - pivot) / (top - pivot)
        for s in strokes:
            for p in s['pts']:
                if -p[1] > pivot:
                    p[1] = -(pivot + (-p[1] - pivot) * f)


def _cross(pts, J, i):
    a, b = pts[i], pts[i + 1]
    t = (J - a[1]) / (b[1] - a[1])
    return [a[0] + (b[0] - a[0]) * t, J]


def fix_joins(strokes, J, u, gl):
    """Joined hands: the letter's entry starts, and its exit ends, at join height J (y, negative),
    so that letters set side by side meet. Cuts connectors that run past J, extends ones that stop
    short, and swoops a top exit (o, b, v, w) down to J."""
    live = [s for s in strokes if not s['dot'] and len(s['pts']) > 1]
    if not live:
        return
    ends = []
    for s in live:
        ends.append((s['pts'][0][0], s, 0))
        ends.append((s['pts'][-1][0], s, 1))
    # exit: rightmost endpoint; entry: leftmost endpoint (of a different stroke-end)
    ex = max(ends, key=lambda e: e[0])
    en = min([e for e in ends if e is not ex], key=lambda e: e[0])
    ovals = [s for s in live if s.get('closed') and s['pts'][0][1] < J and s is not ex[1]]
    if ovals:  # g, q: the oval comes first and takes the lead-in
        en = (ovals[0]['pts'][0][0], ovals[0], 0)
    if gl.get('entryStroke') is not None:
        s = live[gl['entryStroke']]
        en = (s['pts'][0][0], s, 0)
    if gl.get('exitStroke') is not None:
        s = live[gl['exitStroke']]
        ex = (s['pts'][-1][0], s, 1)
    # direct the strokes: entry stroke starts at the entry, exit stroke ends at the exit
    if en[2] == 1:
        en[1]['pts'].reverse()
        if ex[1] is en[1]:
            ex = (ex[0], ex[1], 1 - ex[2])
    if ex[2] == 0:
        if ex[1] is en[1]:
            pass  # one stroke holds both ends and runs entry->exit already
        else:
            ex[1]['pts'].reverse()
    es, xs = en[1], ex[1]
    # entry stroke first in drawing order
    strokes.remove(es)
    strokes.insert(0, es)
    if not gl.get('keepExit'):
        xs['pts'] = join_tail(xs['pts'], J, u)
    if not gl.get('keepEntry'):
        es['pts'] = join_head(es['pts'], J, u, gl)


def join_head(pts, J, u, gl):
    """make the stroke START at height J. A start below J (a connector rising from the baseline) is cut
    where it rises through J; a start above J (oval letters a c d g o q, which begin at the top) gets
    the lead-in the copybook draws: a straight connector rising from the lower left."""
    s = pts[0]
    if s[1] > J:  # starts below the join height: cut at the first rising crossing in the head
        for i in range(0, len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            if b[0] < a[0] - 0.5 and i > 0:
                break
            if (a[1] - J) * (b[1] - J) <= 0 and a[1] > b[1]:
                return [_cross(pts, J, i)] + pts[i + 1:]
        # never rises through J: extend backwards down-left along a connector
        h = s[1] - J
        ang = math.radians(gl.get('entryAngle', u.get('entryAngle', 35)))
        return [[s[0] - h / math.tan(ang), J]] + pts
    h = J - s[1]
    if h <= 0.5:
        return pts
    ang = math.radians(gl.get('entryAngle', u.get('entryAngle', 35)))
    lead = math.atan2(-(pts[min(3, len(pts) - 1)][1] - s[1]), pts[min(3, len(pts) - 1)][0] - s[0])
    half = pts[:max(2, int(len(pts) * 0.6))]
    oval = min(p[0] for p in half) < s[0] - 0.25 * u['xRatio'] * u['cap']
    if gl.get('ovalEntry', True) and (math.cos(lead) < 0.2 or oval):
        return oval_entry(pts, J, ang)
    return [[s[0] - h / math.tan(ang), J]] + pts


def oval_entry(pts, J, ang):
    """An oval letter (a c d g o q) starts at its top right and runs left over the top. The lead-in
    rises from the lower left, merges into the oval's upper-left curve where that curve rises at the
    lead-in's own angle, runs up over the top to the start (a retrace, as the copybook shows) and the
    oval follows. So the connector never cuts across the bowl."""
    n = len(pts)
    # leftmost point of the first half = the oval's left side
    half = max(2, int(n * 0.6))
    li = min(range(half), key=lambda i: pts[i][0])
    ti = min(range(li + 1), key=lambda i: pts[i][1])  # the oval's top
    k = None
    for i in range(max(1, ti), li + 1):
        a, b = pts[i], pts[i - 1]  # direction back toward the start: rising to the right
        rise = math.atan2(-(b[1] - a[1]), b[0] - a[0])
        if rise >= ang or a[1] >= J:
            k = i
            break
    if k is None:
        k = li
    P = pts[k]
    back = [list(p) for p in pts[k::-1]]
    rest = [list(p) for p in pts[1:]]
    if P[1] > J:  # merge point below J: start the lead-in on the oval itself at J
        return back + rest
    h = J - P[1]
    return [[P[0] - h / math.tan(ang), J]] + back + rest


def join_tail(pts, J, u):
    """make the stroke's END reach height J moving rightward. pts: [[x, y]] (y down)."""
    n = len(pts)
    end = pts[-1]
    C = u['cap']
    if end[1] < J:  # the exit ends above the join height
        for i in range(n - 2, -1, -1):
            a, b = pts[i], pts[i + 1]
            if a[1] > J >= b[1]:  # the last place the stroke rises through J
                cut = _cross(pts, J, i)
                if tail_ok(pts[:i + 1], cut, pts[i + 1:], C):
                    return pts[:i + 1] + [cut]
                break
        return top_exit(pts, J, u)
    # tail ends below J: extend
    tx, ty = tangent_end(pts)
    h = end[1] - J  # > 0
    if ty < -0.35:  # rising: straight on
        L = h / -ty
        return pts + [[end[0] + tx * L, J]]
    P0 = end
    d = max(h * 1.0, 0.1 * C)
    P1 = [end[0] + tx * d * 0.4, end[1] + ty * d * 0.4]
    P3 = [end[0] + d * 0.9, J]
    P2 = [P3[0] - d * 0.3, J + h * 0.35]
    return pts + bezier(P0, P1, P2, P3, 6)[1:]


def tail_ok(head, cut, tail, C):
    """a cut is a real exit connector only if what it drops moves rightward and never comes back over
    the letter (an o's right side rises through J too, but its tail closes the oval)."""
    if any(p[0] < cut[0] - 0.03 * C for p in tail):
        return False
    acc, keep = 0.0, []
    for i in range(len(head) - 1, 0, -1):
        acc += math.hypot(head[i][0] - head[i - 1][0], head[i][1] - head[i - 1][1])
        if acc > 0.15 * C:
            keep = head[:i]
            break
    for p in tail:
        for q in keep:
            if math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06 * C:
                return False
    return True


def top_exit(pts, J, u):
    """a top exit (the breve of o, b, v, w): trim any tail that climbs well above the x-height, then
    let the connector curve down to J, arriving with a gentle rise like the next letter's lead-in."""
    C = u['cap']
    X = -u['xRatio'] * C
    if min(p[1] for p in pts[-max(3, len(pts) // 3):]) < X - 0.1 * (-X):
        for i in range(len(pts) - 2, 0, -1):
            a, b = pts[i], pts[i + 1]
            if a[1] >= X > b[1]:
                pts = pts[:i + 1] + [_cross(pts, X, i)]
                break
    end = pts[-1]
    drop = J - end[1]
    tx, ty = tangent_end(pts)
    if tx < 0.3:
        tx, ty = 0.9, -0.2
    d = max(1.4 * drop, 0.16 * C)
    P0 = end
    P1 = [end[0] + tx * d * 0.45, end[1] + ty * d * 0.45]
    P3 = [end[0] + d, J]
    a = math.radians(18)
    P2 = [P3[0] - math.cos(a) * d * 0.4, P3[1] + math.sin(a) * d * 0.4]
    return pts + bezier(P0, P1, P2, P3, 8)[1:]


def bend_end(pts, J, C):
    """a top exit (the breve of o, b, v, w): bend its last part down so it ends at J, the way a
    hand drops the connector when the next letter starts low."""
    end = pts[-1]
    drop = J - end[1]
    # arc length from the end backwards
    acc = [0.0]
    for i in range(len(pts) - 1, 0, -1):
        acc.append(acc[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    acc = acc[::-1]  # acc[i] = arc length from pts[i] to the end
    L = min(max(0.3 * C, 1.6 * drop), 0.6 * acc[0])
    out = []
    for i, p in enumerate(pts):
        if acc[i] >= L:
            out.append(list(p))
            continue
        t = 1 - acc[i] / L
        w = t * t * (3 - 2 * t)
        out.append([p[0] + 0.35 * drop * w, p[1] + drop * w])
    if out[-1][1] != J:
        out[-1][1] = J
    return out


def tangent_end(pts):
    a = pts[max(0, len(pts) - 4)]
    b = pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy) or 1
    return dx / L, dy / L


def bezier(P0, P1, P2, P3, n):
    out = []
    for i in range(n + 1):
        t = i / n
        a = (1 - t) ** 3
        b = 3 * (1 - t) ** 2 * t
        c = 3 * (1 - t) * t ** 2
        d = t ** 3
        out.append([a * P0[0] + b * P1[0] + c * P2[0] + d * P3[0], a * P0[1] + b * P1[1] + c * P2[1] + d * P3[1]])
    return out


def place(strokes, out, hand, u, gl, joined):
    C = u['cap']
    xs = [p[0] for s in strokes for p in s['pts']]
    if not xs:
        out['l'], out['r'] = 0, round(0.3 * C)
        return
    if joined:
        live = [s for s in strokes if not s['dot'] and len(s['pts']) > 1]
        l = live[0]['pts'][0][0]
        r = max((s['pts'][-1][0] for s in live), default=max(xs))
        # (fix_joins put the entry first and the exit at the end of its stroke)
        exits = [s['pts'][-1] for s in live]
        r = max(e[0] for e in exits)
    else:
        b = gl.get('bearing', u['bearing']) * C
        l, r = min(xs) - b, max(xs) + b
    for s in strokes:
        s['pts'] = [[p[0] - l, p[1]] for p in s['pts']]
    out['l'], out['r'] = 0, round(r - l)


def to_engine(norm):
    """-> {l, r, s} with integer coordinates; simplify again at unit scale."""
    s_out = []
    for s in norm['strokes']:
        pts = s['pts']
        if s['dot']:
            x = sum(p[0] for p in pts) / len(pts)
            y = sum(p[1] for p in pts) / len(pts)
            s_out.append([[round(x), round(y)]])
            continue
        xs_, ys_ = [p[0] for p in pts], [p[1] for p in pts]
        if max(max(xs_) - min(xs_), max(ys_) - min(ys_)) < 0.05 * 200:
            continue  # a stray scrap, not a stroke (true dots are marked as such)
        q = skel.simplify([tuple(p) for p in pts], 0.55, 26)
        r = []
        for p in q:
            ip = [round(p[0]), round(p[1])]
            if not r or ip != r[-1]:
                r.append(ip)
        if len(r) >= 2:
            s_out.append(r)
    return {'l': norm['l'], 'r': norm['r'], 's': s_out}


# ---------------------------------------------------------------- review sheets
COLORS = [(214, 39, 40), (31, 119, 180), (44, 160, 44), (148, 103, 189), (255, 127, 14), (23, 190, 207), (140, 86, 75)]


def draw_strokes(d, strokes, tf, width=2, numbers=True, f=None):
    for i, s in enumerate(strokes):
        c = COLORS[i % len(COLORS)]
        pts = [tf(p) for p in s]
        if len(pts) == 1:
            x, y = pts[0]
            d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=c)
            continue
        d.line(pts, fill=c, width=width, joint='curve')
        x, y = pts[0]
        d.ellipse([x - 4, y - 4, x + 4, y + 4], outline=c, width=2)
        # arrow head at the end
        (ax, ay), (bx, by) = pts[max(0, len(pts) - 3)], pts[-1]
        ang = math.atan2(by - ay, bx - ax)
        for da in (2.6, -2.6):
            d.line([(bx, by), (bx + 7 * math.cos(ang + da), by + 7 * math.sin(ang + da))], fill=c, width=2)
        if numbers and f:
            d.text((x + 5, y - 12), str(i), fill=c, font=f)


def panel(hand, ex, eng, H=230):
    """one review cell: source crop with traced strokes | normalised skeleton with guide lines."""
    u = U(hand)
    gl = ex['gl']
    crop = ex['crop']
    h0, w0 = crop.shape
    sc = (H - 30) / h0
    W1 = max(60, int(w0 * sc))
    left = Image.fromarray(crop).convert('RGB').resize((W1, H - 30), Image.LANCZOS)
    # fade the paper, keep the ink visible under the strokes
    left = Image.blend(left, Image.new('RGB', left.size, (255, 255, 255)), 0.35)
    d = ImageDraw.Draw(left)
    x0, y0 = gl['box'][0], gl['box'][1]
    draw_strokes(d, [s['pts'] for s in ex['strokes']], lambda p: ((p[0] - x0) * sc, (p[1] - y0) * sc), 2, True, font(11))
    # normalised view
    C = u['cap']
    ys = [p[1] for s in eng['s'] for p in s] or [0]
    top = min(min(ys), -u['xRatio'] * C * 1.5) - 0.06 * C
    bot = max(max(ys), 0.1 * C) + 0.06 * C
    sc2 = (H - 30) / (bot - top)
    allx = [p[0] for s in eng['s'] for p in s] + [eng['l'], eng['r']]
    lx, rx = min(allx) - 10, max(allx) + 10
    W2 = max(60, int((rx - lx) * sc2))
    right = Image.new('RGB', (W2, H - 30), (255, 255, 255))
    d2 = ImageDraw.Draw(right)
    tf = lambda p: ((p[0] - lx) * sc2, (p[1] - top) * sc2)
    for y, col in [(0, (120, 120, 120)), (-C, (200, 170, 170)), (-u['xRatio'] * C, (170, 170, 220))]:
        d2.line([tf((lx, y)), tf((rx, y))], fill=col, width=1)
    if hand.get('connected'):
        J = -u['join'] * u['xRatio'] * C
        d2.line([tf((lx, J)), tf((rx, J))], fill=(200, 230, 200), width=1)
    for xx in (eng['l'], eng['r']):
        d2.line([tf((xx, top)), tf((xx, bot))], fill=(230, 230, 230), width=1)
    draw_strokes(d2, eng['s'], tf, 3, False)
    cell = Image.new('RGB', (W1 + W2 + 12, H), (248, 246, 240))
    cell.paste(left, (0, 30))
    cell.paste(right, (W1 + 12, 30))
    dc = ImageDraw.Draw(cell)
    label = glyph_key(gl) + '  ' + (gl.get('tags', {}).get('allograph', '') or '') + ('  [manual]' if gl.get('manual') else '')
    dc.text((3, 4), label, fill=(30, 30, 30), font=font(16))
    return cell


def sheets(cells, out_prefix, maxw=2200):
    rows, cur, w = [], [], 0
    for c in cells:
        if cur and w + c.width + 8 > maxw:
            rows.append(cur)
            cur, w = [], 0
        cur.append(c)
        w += c.width + 8
    if cur:
        rows.append(cur)
    files = []
    per = 6
    for k in range(0, len(rows), per):
        chunk = rows[k:k + per]
        H = sum(max(c.height for c in r) + 8 for r in chunk)
        im = Image.new('RGB', (maxw, H), (255, 255, 255))
        y = 0
        for r in chunk:
            x = 0
            for c in r:
                im.paste(c, (x, y))
                x += c.width + 8
            y += max(c.height for c in r) + 8
        f = f'{out_prefix}-{k // per:02d}.png'
        im.save(f)
        files.append(f)
    return files


# ---------------------------------------------------------------- emit
def js_header(hand):
    src = hand['source']
    m = manifest()['sources'].get(src.get('manifest'), {})
    lines = [
        f"// sources/{hand['style']}.js — {hand['label']}: {hand['tradition']['name']} ({hand['tradition']['era']}).",
        '// GENERATED by tools/trace/trace.py from tools/trace/hands/' + hand['style'] + '.json; edit that file and rebuild.',
        f"// Source: {src['credit']}",
    ]
    if src.get('url'):
        lines.append(f"// {src['url']}")
    if m.get('rights'):
        lines.append(f"// Rights (checked {m['rights'].get('checked')}): {m['rights'].get('statement')}")
    lines.append('// Skeletons are centerlines traced from the plate (skeletonised, then reviewed and corrected by hand).')
    lines.append(f"// Units: baseline y=0, cap height y=-{U(hand)['cap']}, y down. l / r = entry / exit (joined) or ink bearings.")
    return '\n'.join(lines)


def emit(hand, results):
    u = U(hand)
    C = u['cap']
    style = hand['style']
    if not hand.get('units', {}).get('descender'):
        # the descender line = median depth of the source's own descenders
        deep = [max(p[1] for s in eng['s'] for p in s) for k, (ex, eng) in results.items()
                if ex['gl']['ch'].islower() and eng['s']]
        u['descender'] = (max(deep) / C) if deep else 0.5  # the deepest descender maps to the hand's line
    meta = {
        'label': hand['label'],
        'family': hand['family'],
        'tradition': hand['tradition'],
        'connected': hand.get('connected', False),
        'metrics': {'base': 0, 'cap': -C, 'xHeight': -round(u['xRatio'] * C),
                    'descender': round(u['descender'] * C), 'descRatio': u['descRatio']},
    }
    if hand.get('fallback'):
        meta['fallback'] = hand['fallback']
    src = hand['source']
    data = {}
    sources = {'main': {k: src[k] for k in ('name', 'credit', 'url') if src.get(k)}}
    for key, (ex, eng) in results.items():
        gl = ex['gl']
        v = {'id': gl.get('id') or (hand.get('idPrefix', style) + ('-' + gl['var'] if gl.get('var') else '')), **eng}
        if gl.get('tags'):
            v['tags'] = gl['tags']
        if gl.get('weight') is not None:
            v['weight'] = gl['weight']
        if gl.get('source'):
            sk = gl['source'].get('key') or gl['source']['name']
            sources[sk] = {k: gl['source'][k] for k in ('name', 'credit', 'url') if gl['source'].get(k)}
            v['src'] = sk
        data.setdefault(gl['ch'], []).append(v)
    body = []
    body.append(js_header(hand))
    body.append('')
    body.append("import { defineStyle, register } from '../glyphs.js';")
    body.append('')
    body.append(f"defineStyle({json.dumps(style)}, {json.dumps(meta, ensure_ascii=False)});")
    body.append('')
    body.append('const SOURCES = ' + json.dumps(sources, ensure_ascii=False, indent=1) + ';')
    body.append('')
    body.append('// char -> variants: { id, l, r, s: strokes [[x, y], ...], tags?, src? }')
    body.append('const GLYPHS = {')
    for ch in sorted(data, key=lambda c: (not c.islower(), not c.isupper(), c)):
        body.append(f"  {json.dumps(ch, ensure_ascii=False)}: {json.dumps(data[ch], separators=(',', ':'), ensure_ascii=False)},")
    body.append('};')
    body.append('')
    body.append('for (const [ch, list] of Object.entries(GLYPHS)) {')
    body.append('  for (const { src, ...v } of list) register(' + json.dumps(style) + ', ch, { ...v, source: SOURCES[src || \'main\'] });')
    body.append('}')
    out = os.path.join(ROOT, 'engine', 'sources', style + '.js')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('\n'.join(body) + '\n')
    return out


# ---------------------------------------------------------------- build
def cmd_build(args):
    hand_path = args[0]
    hand = load_json(hand_path)
    only = None
    if '--only' in args:
        only = set(args[args.index('--only') + 1])
    outdir = os.path.join(HERE, 'out', hand['style'])
    os.makedirs(outdir, exist_ok=True)
    cache = {}
    results = {}
    cells = []
    for gl in hand['glyphs']:
        if gl.get('skip'):
            continue
        key = glyph_key(gl)
        try:
            ex = extract_glyph(hand, gl, cache)
            norm = normalise(hand, ex)
            eng = to_engine(norm)
        except Exception as e:  # keep going; report
            import traceback
            traceback.print_exc()
            print('FAILED', key, e)
            continue
        results[key] = (ex, eng)
        if only is None or gl['ch'] in only:
            cells.append(panel(hand, ex, eng))
    files = sheets(cells, os.path.join(outdir, 'review'))
    print('review sheets:', *files, sep='\n  ')
    if '--sheet-only' not in args:
        print('wrote', emit(hand, results), f'({len(results)} glyphs)')
    with open(os.path.join(outdir, 'strokes.json'), 'w') as f:
        json.dump({k: {'image': [s['pts'] for s in ex['strokes']], 'engine': eng} for k, (ex, eng) in results.items()}, f)


if __name__ == '__main__':
    cmd, rest = sys.argv[1], sys.argv[2:]
    {'fetch': cmd_fetch, 'grid': cmd_grid, 'comps': cmd_comps, 'build': cmd_build}[cmd](rest)

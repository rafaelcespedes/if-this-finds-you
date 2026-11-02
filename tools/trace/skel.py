"""skel.py — ink image -> centerline strokes (the automatic half of the tracing pipeline).

    binarize(gray, cfg)          -> bool ink mask (background flattened, specks and ruled lines removed)
    skeleton_strokes(ink, cfg)   -> list of strokes, each a list of (x, y) image points, in drawing order

How strokes are found:
  1. skeletonize the ink (scikit-image), build a graph: nodes are stroke ends and junctions
     (touching junction pixels are one node), edges are the pixel chains between them;
  2. prune short spurs (skeleton whiskers at blunt stroke ends and corners), contract junction pairs
     joined by a very short edge (an X-crossing becomes one 4-way node);
  3. at each junction, pair the edge ends that continue most straight through ("good continuation"):
     a loop's crossing stays one stroke, a T-junction ends one stroke against another;
  4. walk the paired edges into strokes; give each a direction (top-to-bottom, left-to-right, closed
     ovals counter-clockwise from about 1 o'clock) and an order (left to right, bars and dots last);
  5. simplify (Ramer-Douglas-Peucker, keeping cusps, never letting a curve turn sharply between two kept
     points), and extend each end out to where the ink stops.

Coordinates stay in image pixels (y down); normalisation to the engine's units is trace.py's job.
"""
import math

import numpy as np
from scipy import ndimage as ndi
from skimage.filters import threshold_otsu
from skimage.morphology import (binary_opening, disk, remove_small_holes,
                                remove_small_objects, skeletonize)

N8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


# ---------------------------------------------------------------- binarize
def binarize(gray, cfg=None):
    """gray: 2-D uint8 array (0 = black). cfg keys (all optional):
       flatten   px size of the background estimate (0 = off; default 41)
       threshold fixed threshold on the flattened image (0..1, ink below); default Otsu
       bias      added to the Otsu threshold (negative = stricter, thinner ink)
       open      radius of a morphological opening (removes ruled lines thinner than ~2r+1 px)
       minArea   specks smaller than this are dropped (px)
       holes     holes smaller than this are filled (px)
       smooth    gaussian sigma applied to the mask before re-thresholding (0 = off)
    """
    cfg = cfg or {}
    g = gray.astype(np.float64) / 255.0
    fl = cfg.get('flatten', 41)
    if fl:
        bg = ndi.grey_closing(g, size=(fl, fl))
        bg = ndi.uniform_filter(bg, size=fl)
        g = np.clip(g / np.maximum(bg, 1e-3), 0, 1)
    t = cfg.get('threshold')
    if t is None:
        t = threshold_otsu(g) + cfg.get('bias', 0.0)
    ink = g < t
    if cfg.get('open'):
        ink = binary_opening(ink, disk(cfg['open']))
    if cfg.get('smooth'):
        ink = ndi.gaussian_filter(ink.astype(float), cfg['smooth']) > 0.5
    ink = remove_small_objects(ink, cfg.get('minArea', 12))
    ink = remove_small_holes(ink, cfg.get('holes', 6))
    return ink


# ---------------------------------------------------------------- graph
class Graph:
    def __init__(self):
        self.nodes = {}   # id -> {'p': (x, y), 'kind': 'end'|'junction'|'loop'}
        self.edges = {}   # id -> {'a': node, 'b': node, 'pts': [(x, y), ...] from a to b}
        self._n = 0
        self._e = 0

    def add_node(self, p, kind):
        self._n += 1
        self.nodes[self._n] = {'p': p, 'kind': kind}
        return self._n

    def add_edge(self, a, b, pts):
        self._e += 1
        self.edges[self._e] = {'a': a, 'b': b, 'pts': pts}
        return self._e

    def incident(self, n):
        out = []
        for eid, e in self.edges.items():
            if e['a'] == n:
                out.append((eid, 0))
            if e['b'] == n:
                out.append((eid, 1))
        return out


def edge_len(pts):
    return sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) for i in range(1, len(pts)))


def build_graph(sk):
    """sk: bool skeleton image. Returns Graph with pixel-chain edges (points as (x, y))."""
    on = set(zip(*np.nonzero(sk)))  # (row, col)

    def nb(p):
        r, c = p
        return [(r + dr, c + dc) for dr, dc in N8 if (r + dr, c + dc) in on]

    deg = {p: len(nb(p)) for p in on}
    junction = {p for p in on if deg[p] >= 3}
    node_of = {}
    g = Graph()
    # touching junction pixels form one node
    for p in sorted(junction):
        if p in node_of:
            continue
        stack, cl = [p], [p]
        node_of[p] = 0
        while stack:
            q = stack.pop()
            for n in nb(q):
                if n in junction and n not in node_of:
                    node_of[n] = 0
                    stack.append(n)
                    cl.append(n)
        nid = g.add_node((sum(q[1] for q in cl) / len(cl), sum(q[0] for q in cl) / len(cl)), 'junction')
        for q in cl:
            node_of[q] = nid
    for p in on:
        if deg[p] <= 1:
            node_of[p] = g.add_node((float(p[1]), float(p[0])), 'end')
    visited = set()
    xy = lambda q: (float(q[1]), float(q[0]))

    def walk(start, start_pix, first):
        path = [first]
        seen = {first}
        visited.add(first)
        prev, cur = start_pix, first
        while True:
            cands = [n for n in nb(cur) if n != prev and n not in seen]
            hit = [n for n in cands if n in node_of and not (node_of[n] == start and len(path) <= 2)]
            if hit:
                end = node_of[hit[0]]
                break
            nxt = [n for n in cands if n not in node_of and n not in visited]
            if not nxt:
                end = g.add_node(xy(cur), 'end')
                path.pop()
                break
            prev, cur = cur, nxt[0]
            path.append(cur)
            seen.add(cur)
            visited.add(cur)
        return end, [g.nodes[start]['p']] + [xy(q) for q in path] + [g.nodes[end]['p']]

    direct = set()
    for p, nid in list(node_of.items()):
        if deg[p] == 0:
            g.add_edge(nid, nid, [g.nodes[nid]['p']])  # isolated pixel: a dot
            continue
        for n in nb(p):
            if n in node_of:
                m = node_of[n]
                if m != nid and (min(m, nid), max(m, nid)) not in direct:
                    direct.add((min(m, nid), max(m, nid)))
                    g.add_edge(nid, m, [g.nodes[nid]['p'], g.nodes[m]['p']])
                continue
            if n in visited:
                continue
            end, pts = walk(nid, p, n)
            g.add_edge(nid, end, pts)
    # pure cycles (an o with no ends or junctions)
    for p in sorted(on):
        if p in node_of or p in visited:
            continue
        nid = g.add_node(xy(p), 'loop')
        node_of[p] = nid
        nbs = [n for n in nb(p) if n not in visited]
        if nbs:
            end, pts = walk(nid, p, nbs[0])
            g.add_edge(nid, end, pts)
    return g


def degree(g, n):
    return len(g.incident(n))


def merge_through(g, n):
    """node n has exactly two incident edge ends: join the two edges into one."""
    inc = g.incident(n)
    if len(inc) != 2 or inc[0][0] == inc[1][0]:
        return False
    (e1, s1), (e2, s2) = inc
    A, B = g.edges[e1], g.edges[e2]
    p1 = A['pts'] if s1 == 1 else A['pts'][::-1]          # ... -> n
    p2 = B['pts'] if s2 == 0 else B['pts'][::-1]          # n -> ...
    a = A['a'] if s1 == 1 else A['b']
    b = B['b'] if s2 == 0 else B['a']
    del g.edges[e1], g.edges[e2]
    del g.nodes[n]
    g.add_edge(a, b, p1 + p2[1:])
    return True


def prune(g, spur, merge_len):
    changed = True
    while changed:
        changed = False
        # spurs: end -- junction edges shorter than `spur`
        for eid, e in list(g.edges.items()):
            if eid not in g.edges:
                continue
            ka, kb = g.nodes[e['a']]['kind'], g.nodes[e['b']]['kind']
            L = edge_len(e['pts'])
            if L >= spur or e['a'] == e['b']:
                continue
            if (ka == 'end') != (kb == 'end'):
                endn, jn = (e['a'], e['b']) if ka == 'end' else (e['b'], e['a'])
                if degree(g, jn) >= 3:
                    del g.edges[eid]
                    del g.nodes[endn]
                    changed = True
        # junctions left with two edges dissolve
        for n in list(g.nodes):
            if n in g.nodes and g.nodes[n]['kind'] == 'junction':
                d = degree(g, n)
                if d == 2 and merge_through(g, n):
                    changed = True
                elif d == 1:
                    g.nodes[n]['kind'] = 'end'
                    changed = True
        # contract very short junction-junction edges
        for eid, e in list(g.edges.items()):
            if eid not in g.edges:
                continue
            a, b = e['a'], e['b']
            if a == b or g.nodes[a]['kind'] != 'junction' or g.nodes[b]['kind'] != 'junction':
                continue
            if edge_len(e['pts']) >= merge_len:
                continue
            pa, pb = g.nodes[a]['p'], g.nodes[b]['p']
            mid = ((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2)
            del g.edges[eid]
            g.nodes[a]['p'] = mid
            for e2 in g.edges.values():
                if e2['a'] == b:
                    e2['a'] = a
                    e2['pts'] = [mid] + e2['pts'][1:]
                if e2['b'] == b:
                    e2['b'] = a
                    e2['pts'] = e2['pts'][:-1] + [mid]
                if e2['a'] == a:
                    e2['pts'] = [mid] + e2['pts'][1:]
                if e2['b'] == a:
                    e2['pts'] = e2['pts'][:-1] + [mid]
            del g.nodes[b]
            changed = True
            break


# ---------------------------------------------------------------- strokes
def end_dir(pts, k):
    """unit vector from pts[0] towards the point ~k px along the chain."""
    p0 = pts[0]
    acc = 0.0
    q = pts[-1]
    for i in range(1, len(pts)):
        acc += math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
        if acc >= k:
            q = pts[i]
            break
    dx, dy = q[0] - p0[0], q[1] - p0[1]
    L = math.hypot(dx, dy) or 1.0
    return (dx / L, dy / L)


def pair_junctions(g, tangent, max_turn):
    """partner[(edge, side)] = (edge, side) for edge ends that continue straight through a node."""
    partner = {}
    for n, node in g.nodes.items():
        inc = g.incident(n)
        if len(inc) < 2:
            continue
        dirs = {}
        for (eid, side) in inc:
            pts = g.edges[eid]['pts']
            if side == 1:
                pts = pts[::-1]
            dirs[(eid, side)] = end_dir(pts, tangent)
        cands = []
        for i in range(len(inc)):
            for j in range(i + 1, len(inc)):
                a, b = inc[i], inc[j]
                if a[0] == b[0] and len(inc) > 2:
                    continue  # a self-loop's two ends: only pair them if nothing else meets here
                da, db = dirs[a], dirs[b]
                straight = -(da[0] * db[0] + da[1] * db[1])  # 1 = straight through
                cands.append((straight, a, b))
        cands.sort(key=lambda t: -t[0])
        used = set()
        lim = math.cos(math.radians(max_turn))
        for s, a, b in cands:
            if a in used or b in used:
                continue
            if s < lim and node['kind'] == 'junction':
                continue
            partner[a] = b
            partner[b] = a
            used.add(a)
            used.add(b)
    return partner


def add_retraces(g, partner, tangent, acute=75.0, bridge=12.0):
    """Joined hands write some lines twice: up to a point and straight back down (the stem of u, i, t,
    the baseline turn of m and n, the arch of h). The skeleton keeps one copy, so a junction looks like
    a T: a narrow fork (two edges leaving in nearly the same direction) plus one edge the other way,
    ending free. Re-insert the retrace there: fork edge -> free edge -> its tip -> back -> other fork edge."""
    for n, node in list(g.nodes.items()):
        if node['kind'] != 'junction':
            continue
        inc = g.incident(n)
        if len(inc) != 3:
            continue
        free = [x for x in inc if x not in partner]
        paired = [x for x in inc if x in partner and partner[x] in inc]
        if len(free) != 1 or len(paired) != 2:
            continue
        c = free[0]
        dirs = {}
        for (eid, side) in inc:
            pts = g.edges[eid]['pts']
            dirs[(eid, side)] = end_dir(pts if side == 0 else pts[::-1], tangent)
        for t in paired:
            other = partner[t]
            eid, side = t
            e = g.edges[eid]
            far = e['b'] if side == 0 else e['a']
            if far == n or g.nodes[far]['kind'] != 'end':
                continue
            dc, do = dirs[c], dirs[other]
            if math.degrees(math.acos(max(-1, min(1, dc[0] * do[0] + dc[1] * do[1])))) > acute:
                continue
            # duplicate t, walk out along t and back along its copy, then on into c
            t2 = g.add_edge(e['a'], e['b'], list(e['pts']))
            partner[(eid, 1 - side)] = (t2, 1 - side)
            partner[(t2, 1 - side)] = (eid, 1 - side)
            partner[(t2, side)] = c
            partner[c] = (t2, side)
            g.nodes[far]['kind'] = 'tip'
            break
    # a short edge between two junctions, each left with one loose end: the pen came back over it
    # (the e's loop returns along its own lead-in, then leaves as the exit)
    for eid, e in list(g.edges.items()):
        a, b = e['a'], e['b']
        if a == b or g.nodes[a]['kind'] != 'junction' or g.nodes[b]['kind'] != 'junction':
            continue
        if edge_len(e['pts']) > bridge:
            continue
        if (eid, 0) not in partner or (eid, 1) not in partner:
            continue
        ua = [x for x in g.incident(a) if x not in partner]
        ub = [x for x in g.incident(b) if x not in partner]
        if len(ua) != 1 or len(ub) != 1 or ua[0][0] == eid or ub[0][0] == eid:
            continue
        def d_at(x):
            pts = g.edges[x[0]]['pts']
            return end_dir(pts if x[1] == 0 else pts[::-1], tangent)
        dE_a = end_dir(e['pts'], tangent)            # leaving a along e
        dE_b = end_dir(e['pts'][::-1], tangent)      # leaving b along e
        da, db = d_at(ua[0]), d_at(ub[0])
        # arrive at a along ua, leave along e: not a full reversal; same at b
        if (-da[0] * dE_a[0] - da[1] * dE_a[1]) < math.cos(math.radians(105)):
            continue
        if (dE_a[0] * db[0] + dE_a[1] * db[1]) < math.cos(math.radians(105)):
            continue
        e2 = g.add_edge(a, b, list(e['pts']))
        partner[ua[0]] = (e2, 0)
        partner[(e2, 0)] = ua[0]
        partner[(e2, 1)] = ub[0]
        partner[ub[0]] = (e2, 1)
    return partner


def chains(g, partner):
    used = set()
    out = []

    def run(eid, side):
        """enter edge eid at end `side`, follow partners until a free end."""
        pts = []
        while eid not in used:
            used.add(eid)
            p = g.edges[eid]['pts']
            p = p if side == 0 else p[::-1]
            pts.extend(p if not pts else p[1:])
            other = (eid, 1 - side)
            if other not in partner:
                break
            eid, side = partner[other]
        return pts

    ends = [(eid, s) for eid in g.edges for s in (0, 1) if (eid, s) not in partner]
    for eid, s in ends:
        if eid in used:
            continue
        if g.edges[eid]['a'] == g.edges[eid]['b'] and len(g.edges[eid]['pts']) == 1:
            used.add(eid)
            out.append({'pts': g.edges[eid]['pts'][:], 'closed': False, 'dot': True})
            continue
        out.append({'pts': run(eid, s), 'closed': False})
    for eid in list(g.edges):
        if eid not in used:
            out.append({'pts': run(eid, 0), 'closed': True})
    return out


# ---------------------------------------------------------------- geometry helpers
def rdp(pts, eps):
    if len(pts) < 3:
        return list(range(len(pts)))
    keep = [0, len(pts) - 1]
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        ax, ay = pts[i]
        bx, by = pts[j]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        best, bi = -1.0, -1
        for k in range(i + 1, j):
            px, py = pts[k]
            d = abs(dy * (px - ax) - dx * (py - ay)) / L if L > 1e-9 else math.hypot(px - ax, py - ay)
            if d > best:
                best, bi = d, k
        if best > eps:
            keep.append(bi)
            stack.append((i, bi))
            stack.append((bi, j))
    return sorted(set(keep))


def tangent_at(pts, i, k=3):
    a = pts[max(0, i - k)]
    b = pts[min(len(pts) - 1, i + k)]
    return math.atan2(b[1] - a[1], b[0] - a[0])


def angdiff(a, b):
    d = (b - a + math.pi) % (2 * math.pi) - math.pi
    return abs(d)


def simplify(pts, eps, max_turn_deg=28.0):
    """RDP, then re-add points wherever the curve turns more than max_turn between two kept points
    (so a smooth curve never becomes a sharp polygon corner), then a light smoothing pass that
    leaves cusps alone."""
    if len(pts) <= 2:
        return [tuple(p) for p in pts]
    idx = rdp(pts, eps)
    lim = math.radians(max_turn_deg)
    out = [idx[0]]
    for a, b in zip(idx, idx[1:]):
        stack = [(a, b)]
        seg = []
        while stack:
            i, j = stack.pop()
            if j - i > 2 and angdiff(tangent_at(pts, i), tangent_at(pts, j)) > lim:
                m = (i + j) // 2
                stack.append((m, j))
                stack.append((i, m))
            else:
                seg.append(j)
        out.extend(seg)
    q = [list(pts[i]) for i in sorted(set(out))]
    # Laplacian smoothing on gentle vertices only
    for _ in range(2):
        r = [q[0][:]]
        for i in range(1, len(q) - 1):
            a, b, c = q[i - 1], q[i], q[i + 1]
            t1 = math.atan2(b[1] - a[1], b[0] - a[0])
            t2 = math.atan2(c[1] - b[1], c[0] - b[0])
            if angdiff(t1, t2) < math.radians(50):
                r.append([b[0] * 0.6 + (a[0] + c[0]) * 0.2, b[1] * 0.6 + (a[1] + c[1]) * 0.2])
            else:
                r.append(b[:])
        r.append(q[-1][:])
        q = r
    return [tuple(p) for p in q]


def signed_area(pts):
    """> 0 for a loop that runs counter-clockwise as seen on the page (y down)."""
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * (-y2) - x2 * (-y1)
    return s / 2


def bbox(strokes):
    xs = [p[0] for s in strokes for p in s]
    ys = [p[1] for s in strokes for p in s]
    return min(xs), min(ys), max(xs), max(ys)


# ---------------------------------------------------------------- direction + order
def orient(stroke, closed, script_ends=None):
    """Give one stroke its writing direction. Open strokes: top-to-bottom when mostly vertical,
    left-to-right when mostly horizontal (and, in joined hands, entry -> exit). Closed loops:
    counter-clockwise from about 1 o'clock."""
    pts = stroke
    if closed:
        if pts[0] == pts[-1]:
            pts = pts[:-1]
        if signed_area(pts) < 0:
            pts = pts[::-1]
        cx = sum(p[0] for p in pts) / len(pts)
        cy = sum(p[1] for p in pts) / len(pts)
        target = math.radians(60)
        best = min(range(len(pts)), key=lambda i: angdiff(math.atan2(-(pts[i][1] - cy), pts[i][0] - cx), target))
        pts = pts[best:] + pts[:best]
        return pts + [pts[0]]
    a, b = pts[0], pts[-1]
    if script_ends:
        lx, rx = script_ends
        # a stroke that holds the letter's entry (leftmost) runs left -> right
        xs = [p[0] for p in pts]
        if min(xs) <= lx + 1 and (a[0] > b[0]):
            return pts[::-1]
        if min(xs) <= lx + 1:
            return pts
        if max(xs) >= rx - 1 and a[0] > b[0]:
            return pts[::-1]
        if max(xs) >= rx - 1:
            return pts
    dx, dy = b[0] - a[0], b[1] - a[1]
    if abs(dy) > 0.45 * abs(dx):
        return pts if a[1] <= b[1] else pts[::-1]
    return pts if a[0] <= b[0] else pts[::-1]


def ccw_start_loop(pts, sw):
    """a stroke that opens with a closed loop (a, d, g, q: the oval, then the stem) writes that loop
    counter-clockwise, as every copybook teaches; reverse it if the skeleton walked it clockwise."""
    far = 0.0
    for m in range(2, len(pts)):
        d = math.hypot(pts[m][0] - pts[0][0], pts[m][1] - pts[0][1])
        far = max(far, d)
        if far > 6 * sw and d < 2.2 * sw:
            loop = pts[:m + 1]
            if signed_area(loop) < 0:
                return pts[m::-1] + pts[m + 1:]
            return pts
    return pts


def is_bar(s, H):
    x0, y0, x1, y1 = bbox([s])
    w, h = x1 - x0, y1 - y0
    return w > 2.2 * max(h, 1) and w < 0.9 * H


def order_strokes(strokes, H):
    """main strokes left to right (by leftmost point, then top); bars and dots last."""
    def key(s):
        x0, y0, x1, y1 = bbox([s['pts']])
        late = 2 if s.get('dot') else 1 if is_bar(s['pts'], H) else 0
        return (late, round(x0 / max(H * 0.08, 1)), y0)
    return sorted(strokes, key=key)


def stitch(strokes, dist, max_turn, tangent):
    """join two open strokes whose ends nearly touch and carry on in the same direction (a shallow
    crossing can leave two junctions a few pixels apart, breaking one gesture into two strokes)."""
    lim = math.cos(math.radians(max_turn))
    while True:
        best = None
        opens = [i for i, c in enumerate(strokes) if not c['closed'] and len(c['pts']) > 1]
        for i in opens:
            for j in opens:
                if i == j:
                    continue
                A, B = strokes[i]['pts'], strokes[j]['pts']
                d = math.hypot(A[-1][0] - B[0][0], A[-1][1] - B[0][1])
                if d > dist:
                    continue
                ta = end_dir(A[::-1], tangent)       # direction A arrives in, reversed
                tb = end_dir(B, tangent)             # direction B leaves in
                straight = -(ta[0] * tb[0] + ta[1] * tb[1])
                if straight < lim:
                    continue
                if best is None or d < best[0]:
                    best = (d, i, j)
        # also try reversed strokes
        if best is None:
            for i in opens:
                for j in opens:
                    if i >= j:
                        continue
                    for ra in (False, True):
                        for rb in (False, True):
                            A = strokes[i]['pts'][::-1] if ra else strokes[i]['pts']
                            B = strokes[j]['pts'][::-1] if rb else strokes[j]['pts']
                            d = math.hypot(A[-1][0] - B[0][0], A[-1][1] - B[0][1])
                            if d > dist:
                                continue
                            ta, tb = end_dir(A[::-1], tangent), end_dir(B, tangent)
                            if -(ta[0] * tb[0] + ta[1] * tb[1]) < lim:
                                continue
                            if best is None or d < best[0]:
                                best = (d, i, j, ra, rb)
        if best is None:
            return strokes
        if len(best) == 3:
            _, i, j = best
            A, B = strokes[i]['pts'], strokes[j]['pts']
        else:
            _, i, j, ra, rb = best
            A = strokes[i]['pts'][::-1] if ra else strokes[i]['pts']
            B = strokes[j]['pts'][::-1] if rb else strokes[j]['pts']
        merged = {'pts': list(A) + list(B), 'closed': False}
        strokes = [c for k, c in enumerate(strokes) if k not in (i, j)] + [merged]


# ---------------------------------------------------------------- main entry
def extend_ends(pts, ink_dist, ink, frac=0.85):
    """the skeleton stops short of the ink's tip by about the stroke radius: walk each end outward
    along its tangent while still on ink (at most `frac` x radius)."""
    if len(pts) < 2:
        return pts
    H, W = ink.shape

    def ext(p, q):
        x, y = p
        r = ink_dist[min(H - 1, max(0, int(round(y)))), min(W - 1, max(0, int(round(x))))]
        dx, dy = p[0] - q[0], p[1] - q[1]
        L = math.hypot(dx, dy) or 1
        dx, dy = dx / L, dy / L
        step = 0.0
        lim = max(0.0, r * frac)
        while step + 0.5 <= lim:
            nx, ny = x + dx * (step + 0.5), y + dy * (step + 0.5)
            ix, iy = int(round(nx)), int(round(ny))
            if not (0 <= ix < W and 0 <= iy < H) or not ink[iy, ix]:
                break
            step += 0.5
        return (x + dx * step, y + dy * step)

    k = min(len(pts) - 1, 4)
    pts = list(pts)
    pts[0] = ext(pts[0], pts[k])
    pts[-1] = ext(pts[-1], pts[-1 - k])
    return pts


def skeleton_strokes(ink, cfg=None, script=False, retrace=False):
    """ink: bool mask of ONE glyph (neighbours already erased). Returns
       [{'pts': [(x, y)...], 'closed': bool, 'dot': bool}] in drawing order, image coordinates."""
    cfg = cfg or {}
    dist = ndi.distance_transform_edt(ink)
    sw = 2 * float(np.median(dist[skeletonize(ink)])) if ink.any() else 2.0  # typical stroke width
    sk = skeletonize(ink)
    # dots: small round components become single points
    lab, n = ndi.label(ink, structure=np.ones((3, 3)))
    H = ink.shape[0]
    dot_max = cfg.get('dotMax', max(3.2 * sw, 0.035 * H))
    dots = []
    for i in range(1, n + 1):
        m = lab == i
        ys, xs = np.nonzero(m)
        if max(xs.max() - xs.min(), ys.max() - ys.min()) + 1 <= dot_max and m.sum() < dot_max * dot_max:
            dots.append((float(xs.mean()), float(ys.mean())))
            sk[m] = False
    g = build_graph(sk)
    prune(g, spur=cfg.get('spur', max(2.5, 1.6 * sw)), merge_len=cfg.get('mergeLen', max(2.0, 1.1 * sw)))
    partner = pair_junctions(g, tangent=cfg.get('tangent', max(4.0, 2.2 * sw)), max_turn=cfg.get('maxTurn', 62))
    if cfg.get('retrace', retrace):
        partner = add_retraces(g, partner, tangent=cfg.get('tangent', max(4.0, 2.2 * sw)), acute=cfg.get('acute', 75), bridge=cfg.get('bridge', 3.5 * sw))
    raw = chains(g, partner)
    minlen = cfg.get('minLen', max(3.0, 1.2 * sw))
    strokes = []
    for c in raw:
        if c.get('dot'):
            dots.append(c['pts'][0])
            continue
        if edge_len(c['pts']) < minlen:
            continue
        strokes.append(c)
    strokes = stitch(strokes, cfg.get('stitch', 2.6 * sw), cfg.get('stitchTurn', 60), tangent=max(4.0, 2.2 * sw))
    eps = cfg.get('eps', max(0.6, 0.18 * sw))
    allx = [p[0] for c in strokes for p in c['pts']]
    ends = (min(allx), max(allx)) if (script and allx) else None
    out = []
    for c in strokes:
        pts = c['pts']
        if not c['closed']:
            pts = extend_ends(pts, dist, ink, cfg.get('extend', 0.85))
        pts = orient(pts, c['closed'], ends)
        if not c['closed'] and cfg.get('ccw', True):
            pts = ccw_start_loop(pts, sw)
        pts = simplify(pts, eps)
        out.append({'pts': pts, 'closed': c['closed'], 'dot': False})
    for d in dots:
        out.append({'pts': [d], 'closed': False, 'dot': True})
    return order_strokes(out, H), sw

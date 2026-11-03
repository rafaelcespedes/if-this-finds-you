// The sheet's outline: a straight-cut rectangle, or one with deckled, torn, perforated or spiral-fringe sides,
// or an aerogramme's flaps; binder holes cut through it. Painted sheets are clipped to it, and its shadow
// falls on the desk around it. Everything here is in mm.
import type { Edge, PaperSpec, Side } from './types';
import { fbm1, noise1 } from './noise';
import { rng } from './rng';

export interface Rim {
  kind: Edge['kind'];
  side: Side;
  /** the edge as it really runs, x,y pairs in mm */
  pts: number[];
}

export interface Outline {
  /** the sheet's edge, a closed polygon (x,y pairs, mm) */
  pts: number[];
  holes: { x: number; y: number; r: number }[];
  /** the sides that aren't a straight cut, for the painter's feathering and fibres */
  rims: Rim[];
}

/** The outline isn't a rectangle: its shadow must follow the edge (the sheet's box-shadow can't). */
export function isShaped(p: Pick<PaperSpec, 'edges' | 'flaps'>) {
  return !!p.flaps || Object.values(p.edges ?? {}).some((e) => e && e.kind !== 'perforated');
}

const made = new Map<string, Outline | null>();

/** The outline of one sheet (`sheet` varies a deckle or tear from sheet to sheet), or null for a plain rectangle. */
export function outlineOf(p: PaperSpec, sheet = 0): Outline | null {
  const key = `${p.id}|${p.w}x${p.h}|${sheet}`;
  if (made.has(key)) return made.get(key)!;
  const o = p.flaps ? flapOutline(p) : p.edges || p.holes ? edgeOutline(p, `${p.id}:${sheet}`) : null;
  if (o && p.holes) for (const y of p.holes.ys) o.holes.push({ x: p.holes.x, y, r: p.holes.d / 2 });
  made.set(key, o);
  return o;
}

/** The outline as a canvas path at k px per mm, offset by (ox, oy) px. Fill or clip with 'evenodd' (holes). */
export function outlinePath(o: Outline, k: number, ox = 0, oy = 0) {
  const path = new Path2D();
  const { pts } = o;
  path.moveTo(ox + pts[0] * k, oy + pts[1] * k);
  for (let i = 2; i < pts.length; i += 2) path.lineTo(ox + pts[i] * k, oy + pts[i + 1] * k);
  path.closePath();
  for (const h of o.holes) {
    path.moveTo(ox + (h.x + h.r) * k, oy + h.y * k);
    path.arc(ox + h.x * k, oy + h.y * k, h.r * k, 0, Math.PI * 2);
    path.closePath();
  }
  return path;
}

// ---------- the aerogramme: a main sheet with a top flap and two side flaps on its first panel ----------
function flapOutline(p: PaperSpec): Outline {
  const f = p.flaps!;
  const x0 = f.sides, x1 = p.w - f.sides, y0 = f.top, y1 = p.h;
  const c = f.top; // 45° chamfers
  const s = f.sides;
  // flap corners are die-cut with a touch of rounding: a short bevel instead of a sharp point
  const b = 0.6;
  const pts = [
    x0, y0,
    x0 + c - b, b, x0 + c + b, 0,
    x1 - c - b, 0, x1 - c + b, b,
    x1, y0,
    x1 + s - b, y0 + s - b, x1 + s, y0 + s + b,
    x1 + s, y0 + f.panel - s - b, x1 + s - b, y0 + f.panel - s + b,
    x1, y0 + f.panel,
    x1, y1, x0, y1,
    x0, y0 + f.panel,
    b, y0 + f.panel - s + b, 0, y0 + f.panel - s - b,
    0, y0 + s + b, b, y0 + s - b,
  ];
  return { pts, holes: [], rims: [] };
}

// ---------- sides that aren't a straight cut ----------

/** How far the edge reaches into the sheet at `t` mm along a side. */
function profile(e: Edge, seed: string): (t: number) => number {
  const d = e.depth;
  if (e.kind === 'deckle') {
    // a mould's edge: slow waves, short scallops and fibre fuzz, never quite straight
    const f = fbm1(seed, [[13, 0.3], [4.2, 0.26], [1.5, 0.14], [0.5, 0.035], [0.18, 0.015]]);
    return (t) => clamp(d * 0.42 + f(t) * d, 0.12, d);
  }
  if (e.kind === 'torn') {
    // ripped by hand: a slow wander, a few jags, and fine fibre noise
    const f = fbm1(seed, [[34, 0.42], [11, 0.24], [2.6, 0.12], [0.6, 0.06], [0.2, 0.035]]);
    return (t) => clamp(d * 0.45 + f(t) * d, 0.08, d);
  }
  if (e.kind === 'perforated') {
    // torn along a perforation: near-straight, with a small tooth where each bridge broke (about 1 mm apart)
    const n = noise1(seed);
    return (t) => {
      const ph = t / 1.05 - Math.floor(t / 1.05);
      return 0.08 + 0.14 * Math.pow(Math.sin(Math.PI * ph), 6) + 0.05 * n(t * 3);
    };
  }
  // fringe: ripped off a spiral. Where each hole was, a notch: the hole's inner half, then a ragged tear out to
  // the old edge, wider on one side than the other. Between the holes, tabs reach the old edge, a few torn short.
  const pitch = e.pitch ?? 6.35;
  const hr = 1.55;
  const hc = Math.min(d - hr - 0.2, 3.9); // hole centre, from the old edge
  const start = 4.2;
  const r = rng('fringe:' + seed);
  // tab j lies between hole j - 1 and hole j; each hole tears its own way on each side
  const tabs = Array.from({ length: 400 }, () => {
    const x = r();
    // most tabs reach the old edge; some tore short; now and then one tore off along with its neighbour's bridge
    return x < 0.62 ? 0.1 + r() * 0.45 : x < 0.92 ? 0.7 + r() * 1.8 : 2.8 + r() * 1.6;
  });
  const tears = Array.from({ length: 400 }, () => [0.25 + r() * 1.9, 0.25 + r() * 1.9, (r() - 0.5) * 0.7, 0.85 + r() * 0.3]);
  const fine = fbm1(seed + ':f', [[1.4, 0.12], [0.45, 0.08], [0.16, 0.04]]);
  const ragged = fbm1(seed + ':r', [[0.7, 0.35], [0.22, 0.2]]);
  return (t) => {
    const u = (t - start) / pitch;
    const i = Math.round(u);
    if (i < 0) return 0.15 + Math.abs(fine(t));
    const [tl, tr, skew, squash] = tears[Math.min(tears.length - 1, i)];
    const dy = (u - i) * pitch - skew;
    const a = Math.abs(dy);
    const tip = tabs[Math.min(tabs.length - 1, dy > 0 ? i + 1 : i)];
    const tear = dy > 0 ? tr : tl;
    let x = tip + Math.abs(fine(t)) * 1.4 + Math.max(0, ragged(t * 1.7)) * 0.9;
    // the hole itself, stretched and frayed where the wire pulled through it
    if (a < hr) x = hc + Math.sqrt(hr * hr - dy * dy) * squash + fine(t) * 0.9;
    else if (a < hr + tear) {
      // the bridge tore unevenly: a rough slope from the hole's edge out to the tab
      const s = (a - hr) / tear;
      x = hc + (tip - hc) * s * s * (3 - 2 * s) + ragged(t) * (1 - s) * 1.1;
    }
    return Math.max(0.05, x);
  };
}

function edgeOutline(p: PaperSpec, seed: string): Outline {
  const { w, h } = p;
  const sides: Side[] = ['top', 'right', 'bottom', 'left'];
  const len = { top: w, right: h, bottom: w, left: h };
  const raw: Partial<Record<Side, (t: number) => number>> = {};
  for (const s of sides) {
    const e = p.edges?.[s];
    if (e) raw[s] = profile(e, `${seed}:${s}`);
  }
  // where two rough sides meet, the corner wears round
  const rough = (s: Side) => !!p.edges?.[s] && p.edges[s]!.kind !== 'perforated';
  const prev: Record<Side, Side> = { top: 'left', right: 'top', bottom: 'right', left: 'bottom' };
  const next: Record<Side, Side> = { top: 'right', right: 'bottom', bottom: 'left', left: 'top' };
  const inset: Record<Side, (t: number) => number> = {} as never;
  for (const s of sides) {
    const f = raw[s];
    const e = p.edges?.[s];
    const L = len[s];
    const round = (t: number) => {
      if (!e || !rough(s)) return 0;
      const R = e.depth * 2.6;
      let c = 0;
      if (rough(prev[s]) && t < R) c += e.depth * 0.7 * (1 - t / R) ** 2;
      if (rough(next[s]) && L - t < R) c += e.depth * 0.7 * (1 - (L - t) / R) ** 2;
      return c;
    };
    inset[s] = f ? (t) => f(t) + round(t) : () => 0;
  }
  // walk the sides clockwise (top left→right, right top→bottom, bottom right→left, left bottom→top)
  const step = (s: Side) => (p.edges?.[s] ? (p.edges[s]!.kind === 'fringe' ? 0.08 : 0.12) : 0);
  const walk = (s: Side) => {
    const out: number[] = [];
    const L = len[s];
    const st = step(s);
    const n = st ? Math.ceil(L / st) : 1;
    for (let j = 0; j <= n; j++) {
      const t = (j / n) * L;
      const d = inset[s](t);
      if (s === 'top') out.push(t, d);
      else if (s === 'right') out.push(w - d, t);
      else if (s === 'bottom') out.push(w - t, h - d);
      else out.push(d, h - t);
    }
    return out;
  };
  // keep every point inside the other sides' edges, so corners meet cleanly
  const clampPt = (x: number, y: number): [number, number] => {
    x = clamp(x, inset.left(h - y), w - inset.right(y));
    y = clamp(y, inset.top(x), h - inset.bottom(w - x));
    return [x, y];
  };
  const pts: number[] = [];
  const rims: Rim[] = [];
  for (const s of sides) {
    const seg = walk(s);
    const clamped: number[] = [];
    for (let i = 0; i < seg.length; i += 2) {
      const [x, y] = clampPt(seg[i], seg[i + 1]);
      clamped.push(x, y);
    }
    pts.push(...clamped);
    const e = p.edges?.[s];
    if (e) rims.push({ kind: e.kind, side: s, pts: clamped });
  }
  return { pts, holes: [], rims };
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

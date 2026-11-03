// One painter for every sheet, on screen and in the downloaded JPEG, so the two always match.
// Layers, bottom to top: the shadow the sheet casts on the desk; the guide sheet under thin paper; the stock
// (tint, grain, formation, cockle, light); what's in the paper (laid lines); the guide's lines seen through it;
// what's printed on it (rules, margins, borders, words, a motif); what's been done to it (creases, gum, a
// torn or deckled rim, fibres). Lengths are mm; k is device pixels per mm.
import { rng } from './rng';
import type { PaperSpec, Rule } from './types';
import { fbm2 } from './noise';
import { outlineOf, outlinePath, type Rim } from './outline';
import { printMarks, type Mark } from './marks';

export interface PaintOptions {
  /** device pixels per mm */
  pxPerMm: number;
  /** device pixels per CSS pixel (keeps the grain and shadows the same size on screen and in the JPEG) */
  grainScale: number;
  /** what lies where the paper isn't (round holes, past a torn edge, under thin paper): 'clear' on screen,
   *  the desk colour in the JPEG */
  holeFill: 'clear' | string;
  /** the guide sheet under the page shows through (while writing; a sent letter has none) */
  guide?: boolean;
  /** which sheet of the letter: varies a deckle or a tear, and how the guide sits */
  sheet?: number;
  /** a shaped sheet's (deckle, tear, flaps, holes) faint edge tone against the desk; 'none' leaves it out. The sheet
   *  lies flat: no drop shadow anywhere (Rafael, 3 Nov). 'full' and 'contact' are the same edge, kept for callers. */
  shadow?: 'full' | 'contact' | 'none';
  /** printed marks (lib/paper/marks.ts): those stamped before the letter was written are printed into the paper */
  marks?: Mark[];
}

/** The sheet's edge against the desk: a barely-there tone, never a shadow (the same as sheetShadow's ring). */
export const EDGE_TONE = 'rgba(60, 45, 20, 0.11)';
/** how far (CSS px) a shaped sheet's edge tone reaches beyond the sheet */
export const SHADOW_BLEED = 2;

/** A 2D context on screen or in the paper worker. */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
/** A scratch canvas: a DOM canvas on the page, an OffscreenCanvas in the worker. */
function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
const ctx2d = (c: AnyCanvas) => c.getContext('2d') as Ctx2D;
const letterWidths = new Map<string, number>();

/** Paint one sheet at (0,0) on ctx: paper.w * pxPerMm by paper.h * pxPerMm device pixels (a shadow may fall outside). */
export function paintPaper(ctx: Ctx2D, paper: PaperSpec, o: PaintOptions) {
  const k = o.pxPerMm;
  const W = paper.w * k, H = paper.h * k;
  const sheet = o.sheet ?? 0;
  const seed = `${paper.id}:${sheet}`;
  const fin = paper.finish ?? {};
  const outline = outlineOf(paper, sheet);
  const path = outline ? outlinePath(outline, k) : null;

  ctx.save();
  if (o.holeFill !== 'clear') {
    ctx.fillStyle = o.holeFill;
    ctx.fillRect(0, 0, W, H);
  }
  if (path && o.shadow !== 'none') edgeTone(ctx, path, o.grainScale);
  if (path) ctx.clip(path, 'evenodd');

  const t = fin.translucency ?? 0;
  const guide = o.guide && paper.guide ? placeGuide(paper, seed) : null;
  // thin paper: a guide sheet under it hides the desk
  if (guide && t) {
    ctx.save();
    guide.apply(ctx, k);
    ctx.fillStyle = '#fbfbf8';
    ctx.fillRect(guide.rect[0] * k, guide.rect[1] * k, guide.rect[2] * k, guide.rect[3] * k);
    ctx.restore();
  }

  // ---- the stock ----
  ctx.globalAlpha = 1 - t;
  ctx.fillStyle = paper.tint;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  grainLayer(ctx, W, H, o.grainScale, fin.grain ?? 0.05);
  if (fin.mottle) fieldLayer(ctx, paper, k, 'mottle', fin.mottle);
  if (fin.cockle) fieldLayer(ctx, paper, k, 'cockle', fin.cockle);
  // light falls a touch off towards the edges
  const g = ctx.createRadialGradient(W * 0.45, H * 0.38, Math.min(W, H) * 0.2, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(120,96,60,0.045)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  if (fin.sheen) {
    // a coated card catches the light in a long soft diagonal
    const s = ctx.createLinearGradient(0, 0, W, H);
    s.addColorStop(0.15, 'rgba(255,255,255,0)');
    s.addColorStop(0.42, `rgba(255,255,255,${0.09 * fin.sheen})`);
    s.addColorStop(0.7, 'rgba(255,255,255,0)');
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, W, H);
  }
  if (paper.laid) laidLines(ctx, paper, k, seed);
  if (fin.specks) specks(ctx, paper, k, seed, fin.specks);
  if (guide) guideLines(ctx, paper, guide, k, t > 0);

  // ---- printed ----
  const hline = (y: number, x0: number, x1: number, rule: Rule) => line(ctx, x0 * k, y * k, x1 * k, y * k, rule, k);
  const vline = (x: number, y0: number, y1: number, rule: Rule) => line(ctx, x * k, y0 * k, x * k, y1 * k, rule, k);
  if (paper.seyes && paper.lines) {
    const { square, fine, vertical } = paper.seyes;
    const L = paper.lines;
    // fine lines every 2 mm across the whole ruled block (and a little above the first main line)
    for (let y = L.first - square; y <= L.last + 1e-6; y += square / 4) {
      const main = Math.abs((y - L.first) / square - Math.round((y - L.first) / square)) < 1e-6;
      if (!main && y > 0) hline(y, 0, paper.w, fine);
    }
    // vertical lines of the big squares, measured from the margin line
    const mx = paper.margin ? paper.margin.x : 0;
    for (let x = mx + square; x < paper.w; x += square) vline(x, L.first - square, L.last, vertical);
    for (let x = mx - square; x > 0; x -= square) vline(x, L.first - square, L.last, vertical);
    hline(L.first - square, 0, paper.w, L);
  }
  if (paper.lines) {
    const L = paper.lines;
    for (let y = L.first; y <= L.last + 1e-6; y += L.pitch) hline(y, L.x0 ?? 0, L.x1 ?? paper.w, L);
  }
  if (paper.margin) {
    const m = paper.margin;
    vline(m.x, 0, paper.h, m);
    if (m.double) vline(m.x + m.double, 0, paper.h, m);
  }
  if (paper.postcard) {
    const pc = paper.postcard;
    const rule: Rule = { color: pc.color, weight: 0.22 };
    vline(pc.divider, 10, paper.h - 9, rule);
    for (const y of pc.address.ys) hline(y, pc.address.x0, pc.address.x1, rule);
    const [sx, sy, sw, sh] = pc.stamp;
    ctx.save();
    ctx.strokeStyle = pc.color;
    ctx.lineWidth = Math.max(1, 0.22 * k);
    ctx.globalAlpha = 0.9;
    ctx.setLineDash([1.1 * k, 0.8 * k]);
    ctx.strokeRect(Math.round(sx * k) + 0.5, Math.round(sy * k) + 0.5, Math.round(sw * k), Math.round(sh * k));
    ctx.restore();
  }
  if (paper.border) {
    const b = paper.border;
    for (let i = 0; i < (b.count ?? 1); i++) {
      const d = b.inset + i * (b.gap ?? 0.8);
      hline(d, d, paper.w - d, b);
      hline(paper.h - d, d, paper.w - d, b);
      vline(d, d, paper.h - d, b);
      vline(paper.w - d, d, paper.h - d, b);
    }
  }
  if (paper.ticks) for (const m of paper.ticks.marks) hline(m.y, 0, m.len, paper.ticks);
  if (paper.print) for (const w of paper.print) printWord(ctx, w, k);
  if (paper.motif) sprig(ctx, paper.motif, k, seed);

  // ---- what's been done to it ----
  if (paper.folds) folds(ctx, paper, k);
  if (paper.flaps) flaps(ctx, paper, k);
  if (fin.gum) gumEdge(ctx, paper, k, seed);
  if (o.marks?.length) printMarks(ctx, o.marks, k, 'under');
  if (outline) for (const rim of outline.rims) rimLayer(ctx, rim, k, o.holeFill);
  ctx.restore();
  // fibres poke out past a deckled or torn edge
  if (outline) for (const rim of outline.rims) wisps(ctx, rim, paper, k, seed);
}

// ---------- the edge against the desk ----------
/** A hairline along the sheet's real outline (and round its holes), half of it on the desk: no shadow. */
function edgeTone(ctx: Ctx2D, path: Path2D, dpr: number) {
  ctx.save();
  ctx.strokeStyle = EDGE_TONE;
  ctx.lineWidth = 2 * dpr; // the half outside the sheet shows: 1 CSS px
  ctx.lineJoin = 'round';
  ctx.stroke(path);
  ctx.restore();
}

// ---------- the stock ----------
// Everything here is made once, small, and stretched or tiled over the sheet, so a sheet costs a few fills.
// Darkening is baked as black with alpha (multiplying by grey v at alpha a is the same as black at a·(1−v)),
// so every layer draws source-over and the GPU never has to read the sheet back.

let grainTile: AnyCanvas | null = null;
/** A soft, seeded paper grain that tiles seamlessly. */
function grainCanvas(): AnyCanvas {
  if (grainTile) return grainTile;
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = ctx2d(c);
  const r = rng('paper:grain');
  // fibres first, as light and dark marks on mid grey, wrapped at the edges so the tile still tiles
  ctx.fillStyle = 'rgb(128,128,128)';
  ctx.fillRect(0, 0, S, S);
  ctx.lineCap = 'round';
  const fibres: [number, number, number, number, string, number][] = [];
  for (let f = 0; f < 26; f++) fibres.push([r() * S, r() * S, r() * Math.PI, 6 + r() * 16, r() < 0.5 ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.25)', 0.6 + r() * 0.5]);
  for (const [x, y, a, len, col, lw] of fibres) {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      ctx.beginPath();
      ctx.moveTo(x + dx, y + dy);
      ctx.quadraticCurveTo(x + dx + Math.cos(a + 0.4) * len * 0.5, y + dy + Math.sin(a + 0.4) * len * 0.5, x + dx + Math.cos(a) * len, y + dy + Math.sin(a) * len);
      ctx.stroke();
    }
  }
  const fib = ctx.getImageData(0, 0, S, S).data;
  const img = ctx.createImageData(S, S);
  // per-pixel tooth, slightly clumped so it reads as paper rather than digital noise
  const tooth = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) tooth[i] = r();
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const t = (tooth[y * S + x] * 2 + tooth[y * S + ((x + 1) % S)] + tooth[((y + 1) % S) * S + x]) / 4;
      const i = (y * S + x) * 4;
      // the tooth multiplied by the fibre marks (128 = no mark), then as black with alpha
      const v = (0.5 + (t - 0.5) * 0.9) * Math.min(2, fib[i] / 128);
      img.data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, 1 - v)));
    }
  }
  ctx.clearRect(0, 0, S, S);
  ctx.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

function grainLayer(ctx: Ctx2D, W: number, H: number, scale: number, alpha: number) {
  const pat = ctx.createPattern(grainCanvas(), 'repeat');
  if (!pat) return;
  pat.setTransform(new DOMMatrix().scale(scale * 0.75));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// Low-frequency fields (formation, cockle): one big field each, made once; a sheet shows its own part of it.
// White where the field is positive, black where negative, alpha the magnitude.
const FIELD_MM = 330;
const FIELD = {
  // formation: the cloudy way fibres settle in the mould, a few mm across
  mottle: { cell: 1.25, octaves: [[7.5, 0.55], [3, 0.4]] as [number, number][], gain: 1, alpha: 0.055 },
  // cockle: thin paper's waves, lit from the top left (the slope, not the height, is what you see)
  cockle: { cell: 2.2, octaves: [[58, 1], [24, 0.55], [10, 0.22]] as [number, number][], gain: 3.2, alpha: 0.06 },
};
type FieldKind = keyof typeof FIELD;
const fields: Partial<Record<FieldKind, AnyCanvas>> = {};

function fieldCanvas(kind: FieldKind) {
  const made = fields[kind];
  if (made) return made;
  const F = FIELD[kind];
  const n = Math.ceil(FIELD_MM / F.cell);
  const f = fbm2('paper-field:' + kind, F.octaves);
  const e = 1.5;
  const fn = kind === 'mottle' ? f : (x: number, y: number) => (f(x - e, y - e) - f(x + e, y + e)) * F.gain;
  const c = makeCanvas(n, n);
  const cx = ctx2d(c);
  const img = cx.createImageData(n, n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = Math.max(-1, Math.min(1, fn(i * F.cell, j * F.cell)));
      const p = (j * n + i) * 4;
      const lum = v > 0 ? 255 : 0;
      img.data[p] = img.data[p + 1] = img.data[p + 2] = lum;
      img.data[p + 3] = Math.round(Math.abs(v) * 255);
    }
  }
  cx.putImageData(img, 0, 0);
  fields[kind] = c;
  return c;
}

function fieldLayer(ctx: Ctx2D, paper: PaperSpec, k: number, kind: FieldKind, amount: number) {
  const F = FIELD[kind];
  const c = fieldCanvas(kind);
  // each paper (and each sheet size) takes its own window onto the field
  const r = rng('field-window:' + paper.id);
  const sx = (r() * Math.max(0, FIELD_MM - paper.w - 2)) / F.cell, sy = (r() * Math.max(0, FIELD_MM - paper.h - 2)) / F.cell;
  ctx.save();
  ctx.globalAlpha = F.alpha * amount;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low'; // bilinear: soft fields don't need more, and it's several times cheaper
  ctx.drawImage(c, sx, sy, paper.w / F.cell, paper.h / F.cell, 0, 0, paper.w * k, paper.h * k);
  ctx.restore();
}

/** Make the shared textures and the outlines in idle moments, so no New hand pays for them. */
export function warmPaperArt(outlines: PaperSpec[]) {
  const jobs: (() => void)[] = [() => grainCanvas(), () => fieldCanvas('mottle'), () => fieldCanvas('cockle'), ...outlines.map((p) => () => outlineOf(p, 0))];
  const idle = (cb: (d: { timeRemaining(): number }) => void) =>
    typeof requestIdleCallback === 'function' ? requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(() => cb({ timeRemaining: () => 8 }), 50);
  const run = (d: { timeRemaining(): number }) => {
    while (jobs.length && d.timeRemaining() > 4) jobs.shift()!();
    if (jobs.length) idle(run);
  };
  idle(run);
}

function laidLines(ctx: Ctx2D, paper: PaperSpec, k: number, seed: string) {
  const { pitch, chain, color } = paper.laid!;
  const W = paper.w * k, H = paper.h * k;
  const r = rng('laid:' + seed);
  ctx.save();
  ctx.strokeStyle = color;
  // the fine laid lines, only where they resolve (below ~2.5 px they would shimmer); the mould's wires were
  // never quite even, so each line is a little stronger or fainter than the next
  if (pitch * k >= 2.5) {
    ctx.lineWidth = Math.max(0.6, 0.22 * k);
    const bands = [new Path2D(), new Path2D(), new Path2D()];
    for (let y = pitch / 2; y < paper.h; y += pitch) {
      const b = bands[Math.floor(r() * 3)];
      b.moveTo(0, y * k);
      b.lineTo(W, y * k);
    }
    bands.forEach((b, i) => {
      ctx.globalAlpha = 0.027 + 0.01 * i;
      ctx.stroke(b);
    });
  }
  // chain lines: a touch darker and slightly wandering, with the pulp a little denser beside them
  for (let x = chain / 2 + 4; x < paper.w; x += chain) {
    const jx = x + (r() - 0.5) * 0.8;
    const lean = (r() - 0.5) * 0.7;
    ctx.globalAlpha = 0.04;
    ctx.lineWidth = Math.max(0.8, 0.32 * k);
    ctx.beginPath();
    ctx.moveTo(jx * k, 0);
    ctx.bezierCurveTo((jx + lean) * k, H * 0.33, (jx - lean * 0.6) * k, H * 0.66, (jx + 0.3) * k, H);
    ctx.stroke();
    ctx.globalAlpha = 0.014;
    ctx.lineWidth = Math.max(2, 2.6 * k);
    ctx.stroke();
  }
  ctx.restore();
}

/** Handmade paper: flecks of bark and dark fibre caught in the pulp. */
function specks(ctx: Ctx2D, paper: PaperSpec, k: number, seed: string, amount: number) {
  const r = rng('specks:' + seed);
  const n = Math.round((paper.w * paper.h) / 900 * amount);
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = r() * paper.w, y = r() * paper.h;
    if (r() < 0.6) {
      ctx.fillStyle = `rgba(${70 + r() * 40},${55 + r() * 30},${35 + r() * 20},${0.25 + r() * 0.35})`;
      ctx.beginPath();
      ctx.ellipse(x * k, y * k, (0.05 + r() * 0.12) * k, (0.04 + r() * 0.07) * k, r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const a = r() * Math.PI, len = 0.8 + r() * 2.6;
      ctx.strokeStyle = `rgba(120,100,70,${0.12 + r() * 0.16})`;
      ctx.lineWidth = Math.max(0.5, 0.06 * k);
      ctx.beginPath();
      ctx.moveTo(x * k, y * k);
      ctx.quadraticCurveTo((x + Math.cos(a + 0.6) * len * 0.5) * k, (y + Math.sin(a + 0.6) * len * 0.5) * k, (x + Math.cos(a) * len) * k, (y + Math.sin(a) * len) * k);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------- the guide sheet ----------
interface Guide {
  /** the guide sheet's rectangle in its own frame: x, y, w, h (mm) */
  rect: [number, number, number, number];
  apply(ctx: Ctx2D, k: number): void;
}

/**
 * A guide sheet never sits square: it's turned a fraction of a degree and its edges sit a few mm in. Its rules
 * still fall where the writing goes (the writer lined it up), so only the turn and the edges move.
 */
function placeGuide(paper: PaperSpec, seed: string): Guide {
  const r = rng('guide:' + seed);
  const a = ((r() * 2 - 1) * 0.16 * Math.PI) / 180;
  const cx = paper.w / 2, cy = paper.h / 2;
  const rect: [number, number, number, number] = [1.6 + r() * 2.4, 1.2 + r() * 2.2, paper.w - 3 - r() * 3, paper.h - 2 - r() * 3];
  return {
    rect,
    apply(ctx, k) {
      ctx.translate(cx * k, cy * k);
      ctx.rotate(a);
      ctx.translate(-cx * k, -cy * k);
    },
  };
}

const guideArt = new Map<string, AnyCanvas>();
function guideLines(ctx: Ctx2D, paper: PaperSpec, guide: Guide, k: number, edge: boolean) {
  const G = paper.guide!;
  // drawn small and stretched: the stretch is the blur of lines seen through paper
  const res = Math.max(2, Math.min(5, 1 / Math.max(0.2, G.blur)));
  const key = `${paper.id}|${guide.rect.join(',')}|${res}|${edge}`;
  let c = guideArt.get(key);
  if (!c) {
    c = makeCanvas(Math.ceil(paper.w * res), Math.ceil(paper.h * res));
    const g = ctx2d(c);
    const [rx, ry, rw, rh] = guide.rect;
    g.fillStyle = G.color;
    const lw = Math.max(1, G.weight * res);
    for (let y = G.first; y <= G.last + 1e-6; y += G.pitch) g.fillRect((rx + 6) * res, y * res - lw / 2, (rw - 12) * res, lw);
    if (edge) {
      // through onionskin, the guide sheet's own edge shows as a faint step
      g.globalAlpha = 0.16;
      g.strokeStyle = G.color;
      g.lineWidth = Math.max(1, 0.35 * res);
      g.strokeRect(rx * res, ry * res, rw * res, rh * res);
    }
    if (guideArt.size > 24) guideArt.clear();
    guideArt.set(key, c);
  }
  ctx.save();
  guide.apply(ctx, k);
  ctx.globalAlpha = G.alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low'; // bilinear: soft fields don't need more, and it's several times cheaper
  ctx.drawImage(c, 0, 0, (c.width / res) * k, (c.height / res) * k);
  ctx.restore();
}

// ---------- printed ----------
function printWord(ctx: Ctx2D, w: NonNullable<PaperSpec['print']>[number], k: number) {
  const px = (w.size / 0.71) * k;
  ctx.save();
  ctx.font = `500 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  ctx.fillStyle = w.color;
  ctx.globalAlpha = 0.85;
  ctx.textBaseline = 'alphabetic';
  const spacing = 0.16 * w.size * k;
  // letter-spaced small caps, set by hand so it works where canvas letterSpacing doesn't
  // measured once per letter and size (measuring is slow on a slow phone)
  const widths = [...w.text].map((ch) => {
    const key = ctx.font + '|' + ch;
    let v = letterWidths.get(key);
    if (v == null) letterWidths.set(key, (v = ctx.measureText(ch).width));
    return v;
  });
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (widths.length - 1);
  let x = w.x * k - (w.align === 'right' ? total : w.align === 'center' ? total / 2 : 0);
  [...w.text].forEach((ch, i) => {
    ctx.fillText(ch, x, w.y * k);
    x += widths[i] + spacing;
  });
  ctx.restore();
}

/** A small flowering sprig, printed in two soft colours slightly out of register (ippitsusen). */
function sprig(ctx: Ctx2D, m: NonNullable<PaperSpec['motif']>, k: number, seed: string) {
  const r = rng('sprig:' + seed);
  const s = m.size;
  const P = (x: number, y: number): [number, number] => [(m.x + x * s) * k, (m.y + y * s) * k];
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // the branch: a crooked twig that thins toward its tip, with a short side shoot
  ctx.strokeStyle = 'rgba(122, 104, 88, 0.55)';
  const twig = (pts: [number, number][], w0: number, w1: number) => {
    for (let i = 1; i < pts.length; i++) {
      ctx.lineWidth = (w0 + (w1 - w0) * (i / (pts.length - 1))) * s * k;
      ctx.beginPath();
      ctx.moveTo(...P(...pts[i - 1]));
      ctx.lineTo(...P(...pts[i]));
      ctx.stroke();
    }
  };
  twig([[0.52, 0.52], [0.38, 0.4], [0.27, 0.27], [0.12, 0.17], [-0.02, 0.05], [-0.14, -0.06], [-0.27, -0.14], [-0.4, -0.27]], 0.05, 0.016);
  twig([[0.18, 0.22], [0.22, 0.1], [0.27, -0.03], [0.35, -0.17]], 0.03, 0.012);
  // blossoms along it, five round petals each, then their centres a hair off register
  const spots: [number, number, number][] = [[-0.38, -0.3, 0.11], [-0.06, 0.0, 0.13], [0.36, -0.2, 0.1], [0.3, 0.36, 0.085], [-0.2, -0.17, 0.06]];
  for (const [bx, by, br] of spots) {
    const turn = r() * Math.PI;
    ctx.fillStyle = 'rgba(232, 156, 146, 0.36)';
    for (let i = 0; i < 5; i++) {
      const a = turn + (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(...P(bx + Math.cos(a) * br * 0.58, by + Math.sin(a) * br * 0.58), br * 0.44 * s * k, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(190, 90, 70, 0.5)';
  for (const [bx, by, br] of spots) {
    ctx.beginPath();
    ctx.arc(...P(bx + 0.012, by + 0.01), br * 0.16 * s * k, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- what's been done to the sheet ----------
/** Creases: a soft valley of shade with a bright lip, alternating mountain and valley. Panels sit a touch apart in the light. */
function folds(ctx: Ctx2D, paper: PaperSpec, k: number) {
  const W = paper.w * k;
  const ys = paper.folds!;
  ctx.save();
  // unfolded panels never lie quite flat: alternate ones catch a little less light
  ys.forEach((y, i) => {
    if (i % 2 === 0) {
      ctx.fillStyle = 'rgba(40, 50, 70, 0.016)';
      ctx.fillRect(0, y * k, W, ((ys[i + 1] ?? paper.h) - y) * k);
    }
  });
  ys.forEach((y, i) => {
    const valley = i % 2 === 0;
    const yy = y * k;
    const band = 2.6 * k;
    const g = ctx.createLinearGradient(0, yy - band, 0, yy + band);
    g.addColorStop(0, 'rgba(40,50,70,0)');
    g.addColorStop(valley ? 0.47 : 0.53, 'rgba(40,50,70,0.075)');
    g.addColorStop(1, 'rgba(40,50,70,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, yy - band, W, band * 2);
    const lip = Math.max(1, 0.22 * k);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(0, yy + (valley ? -0.38 : 0.12) * k - lip / 2, W, lip);
    ctx.fillStyle = 'rgba(40,50,70,0.12)';
    ctx.fillRect(0, yy + (valley ? 0.1 : -0.3) * k - lip / 2, W, Math.max(1, 0.16 * k));
  });
  ctx.restore();
}

/** Aerogramme flaps: scored where they fold, and a band of dried gum along their outer edges. */
function flaps(ctx: Ctx2D, paper: PaperSpec, k: number) {
  const f = paper.flaps!;
  const x0 = f.sides, x1 = paper.w - f.sides, y0 = f.top;
  ctx.save();
  // gum: a slightly darker, yellower, faintly glossy band
  ctx.fillStyle = 'rgba(178, 162, 112, 0.1)';
  ctx.fillRect(0, 0, paper.w * k, f.gum * k);
  ctx.fillRect(0, y0 * k, f.gum * k, f.panel * k);
  ctx.fillRect((paper.w - f.gum) * k, y0 * k, f.gum * k, f.panel * k);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.fillRect(0, (f.gum - 0.5) * k, paper.w * k, Math.max(1, 0.25 * k));
  // score lines where the flaps fold over
  const score = (xa: number, ya: number, xb: number, yb: number) => {
    ctx.strokeStyle = 'rgba(40, 55, 80, 0.16)';
    ctx.lineWidth = Math.max(1, 0.18 * k);
    ctx.beginPath();
    ctx.moveTo(xa * k, ya * k);
    ctx.lineTo(xb * k, yb * k);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    const dx = ya === yb ? 0 : 0.25, dy = ya === yb ? 0.25 : 0;
    ctx.beginPath();
    ctx.moveTo((xa + dx) * k, (ya + dy) * k);
    ctx.lineTo((xb + dx) * k, (yb + dy) * k);
    ctx.stroke();
  };
  score(x0, y0, x1, y0);
  score(x0, y0, x0, y0 + f.panel);
  score(x1, y0, x1, y0 + f.panel);
  ctx.restore();
}

/** A sheet torn off a glued pad keeps a hairline of dried glue along its top. */
function gumEdge(ctx: Ctx2D, paper: PaperSpec, k: number, seed: string) {
  const r = rng('gum:' + seed);
  ctx.save();
  ctx.fillStyle = 'rgba(176, 160, 120, 0.22)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  let x = 0;
  while (x < paper.w) {
    ctx.lineTo(x * k, (0.35 + r() * 0.45) * k);
    x += 0.8 + r() * 1.6;
  }
  ctx.lineTo(paper.w * k, 0.5 * k);
  ctx.lineTo(paper.w * k, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** The rim of a shaped edge: a deckle thins out, a tear shows its lighter, split fibres. */
function rimLayer(ctx: Ctx2D, rim: Rim, k: number, holeFill: string) {
  if (rim.kind === 'perforated') return;
  const path = new Path2D();
  path.moveTo(rim.pts[0] * k, rim.pts[1] * k);
  for (let i = 2; i < rim.pts.length; i += 2) path.lineTo(rim.pts[i] * k, rim.pts[i + 1] * k);
  ctx.save();
  ctx.lineJoin = 'round';
  if (rim.kind === 'deckle') {
    // thinner toward the edge, so the desk shows through a little (only the inner half of each stroke is inside)
    const see = holeFill === 'clear' ? null : holeFill;
    if (!see) ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = see ?? '#000';
    for (const [wMm, a] of [[2.8, 0.08], [1.4, 0.12], [0.6, 0.18]] as const) {
      ctx.globalAlpha = a;
      ctx.lineWidth = wMm * k;
      ctx.stroke(path);
    }
  } else {
    // a tear splits the sheet's layers: a narrow, whiter, fuzzier rim
    ctx.strokeStyle = '#ffffff';
    for (const [wMm, a] of [[0.9, 0.35], [0.4, 0.45]] as const) {
      ctx.globalAlpha = a;
      ctx.lineWidth = wMm * k;
      ctx.stroke(path);
    }
  }
  ctx.restore();
}

/** Loose fibres past a deckled or torn edge. */
function wisps(ctx: Ctx2D, rim: Rim, paper: PaperSpec, k: number, seed: string) {
  if (rim.kind === 'perforated') return;
  const r = rng('wisps:' + seed + rim.side);
  const out = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }[rim.side];
  const density = rim.kind === 'deckle' ? 0.5 : 0.32;
  ctx.save();
  ctx.strokeStyle = mixWhite(paper.tint, 0.35);
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(0.5, 0.045 * k);
  const pts = rim.pts;
  // three strengths, one path each
  const paths = [new Path2D(), new Path2D(), new Path2D()];
  let carry = 0;
  for (let i = 2; i < pts.length; i += 2) {
    carry += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
    if (carry < 0.6) continue;
    carry = 0;
    if (r() > density) continue;
    const len = 0.25 + r() * (rim.kind === 'deckle' ? 0.9 : 0.6);
    const a = Math.atan2(out[1], out[0]) + (r() - 0.5) * 1.6;
    const x = pts[i] - out[0] * 0.2, y = pts[i + 1] - out[1] * 0.2;
    const path = paths[Math.floor(r() * 3)];
    path.moveTo(x * k, y * k);
    path.quadraticCurveTo((x + Math.cos(a + 0.5) * len * 0.5) * k, (y + Math.sin(a + 0.5) * len * 0.5) * k, (x + Math.cos(a) * len) * k, (y + Math.sin(a) * len) * k);
  }
  paths.forEach((path, i) => {
    ctx.globalAlpha = 0.45 + 0.17 * i;
    ctx.stroke(path);
  });
  ctx.restore();
}

function mixWhite(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** A thin hairline drawn at a crisp device-pixel position; weights under 1px become lighter instead. */
function line(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number, rule: Rule, k: number) {
  let w = rule.weight * k;
  let alpha = 1;
  if (w < 1) { alpha = Math.max(0.35, w); w = 1; }
  // snap to the device pixel grid so hairlines stay crisp
  const snap = (v: number) => (Math.round(w) % 2 ? Math.floor(v) + 0.5 : Math.round(v));
  if (y0 === y1) { y0 = y1 = snap(y0); } else if (x0 === x1) { x0 = x1 = snap(x0); }
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = rule.color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

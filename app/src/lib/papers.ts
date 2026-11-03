// Papers: physical specs in millimetres, and one painter that draws a sheet onto a canvas.
// The same painter draws the sheet on screen and the downloaded JPEG, so the two always match.
// Specs follow real stationery; see docs in app/README.md ("Papers") for sources.
import { rng } from '@engine';

export type PaperId = 'plain' | 'laid' | 'college' | 'seyes' | 'feint' | 'squared' | 'dots' | 'postcard';

interface Rule {
  color: string;
  /** line weight in mm */
  weight: number;
}

export interface PaperSpec {
  id: PaperId;
  name: string;
  /** short plain-words hint: where it's from and the spacing */
  hint: string;
  /** sheet size, mm */
  w: number;
  h: number;
  tint: string;
  /** horizontal rules you write on */
  lines?: Rule & { pitch: number; first: number; last: number; x0?: number; x1?: number };
  /** Seyès: fine lines between the main lines, and the vertical lines of the big squares */
  seyes?: { fine: Rule; vertical: Rule; square: number };
  /** squared grid */
  grid?: Rule & { pitch: number; box: [number, number, number, number] };
  /** dot grid */
  dots?: { color: string; d: number; pitch: number; box: [number, number, number, number] };
  /** laid writing paper: fine laid lines (mm apart) crossed by chain lines, seen in the sheet itself */
  laid?: { pitch: number; chain: number; color: string };
  /** postcard back: centre divider, address lines, stamp box */
  postcard?: { divider: number; address: { x0: number; x1: number; ys: number[] }; stamp: [number, number, number, number]; color: string };
  /** where the panel swatch looks (mm, top-left of a 40 x 30 mm crop) */
  swatch?: { x: number; y: number };
  /** vertical margin line(s), x from the left edge */
  margin?: Rule & { x: number; double?: number };
  /** binder holes (centre x, centre ys, diameter) */
  holes?: { x: number; ys: number[]; d: number };
  /** writing area: left/right edges and the first/last baseline, mm */
  text: { left: number; right: number; first: number; last: number };
  /** the pitch the writing snaps to (mm); 0 = free (plain paper) */
  pitch: number;
  /** true when the writing may skip lines on small grids (squared, dots) */
  multiples?: boolean;
  /** comfortable x-height for this paper at size 1, mm */
  xh: number;
}

export const PAPERS: PaperSpec[] = [
  {
    id: 'plain',
    name: 'Letter',
    hint: 'Plain writing paper, A5',
    w: 148, h: 210,
    tint: '#fffdf8',
    text: { left: 17, right: 131, first: 27, last: 194 },
    pitch: 0,
    xh: 3.1,
  },
  {
    // Cream laid writing paper (A5 pad): laid lines about 1 mm apart, chain lines about 25 mm apart,
    // as in traditional mould-made letter paper.
    id: 'laid',
    name: 'Laid',
    hint: 'Cream laid writing paper, A5',
    w: 148, h: 210,
    tint: '#fbf5e8',
    laid: { pitch: 0.95, chain: 25, color: '#7a6a4c' },
    text: { left: 18, right: 130, first: 28, last: 192 },
    pitch: 0,
    xh: 3.1,
    swatch: { x: 4, y: 4 },
  },
  {
    // Mead/Staples filler paper: 8 x 10.5 in, 33 rules at 9/32 in, about 25 mm of header space,
    // a single pink-red margin 1 1/4 in from the left edge, 5/16 in holes 4 1/4 in apart.
    id: 'college',
    name: 'College ruled',
    hint: 'US loose-leaf, 9/32 in rules',
    w: 203.2, h: 266.7,
    tint: '#fcfcf9',
    lines: { color: '#9dc3e6', weight: 0.2, pitch: 7.14, first: 25.4, last: 25.4 + 32 * 7.14 },
    margin: { color: '#e8737f', weight: 0.24, x: 31.75 },
    holes: { x: 11, ys: [25.4, 133.35, 241.3], d: 7.9 },
    text: { left: 34.5, right: 196, first: 25.4, last: 25.4 + 32 * 7.14 },
    pitch: 7.14,
    xh: 2.55,
  },
  {
    // Clairefontaine-style cahier 17 x 22 cm: violet writing lines every 8 mm, three light-blue
    // interlines at 2 mm, violet verticals every 8 mm, red margin. Small letters fill one interline.
    id: 'seyes',
    name: 'Seyès',
    hint: 'French cahier, 8 mm squares',
    w: 170, h: 220,
    tint: '#fefdfa',
    lines: { color: '#9478bd', weight: 0.24, pitch: 8, first: 24, last: 208 },
    seyes: { fine: { color: '#aac0e6', weight: 0.11 }, vertical: { color: '#9478bd', weight: 0.2 }, square: 8 },
    margin: { color: '#e2505a', weight: 0.26, x: 32 },
    text: { left: 34.5, right: 164, first: 24, last: 208 },
    pitch: 8,
    xh: 2,
  },
  {
    // Silvine-style exercise book, 9 x 7 in: pale blue feint rules at 8 mm and a single red margin.
    id: 'feint',
    name: 'Feint ruled',
    hint: 'UK exercise book, 8 mm',
    w: 178, h: 229,
    tint: '#fdfcf8',
    lines: { color: '#a7c3e3', weight: 0.17, pitch: 8, first: 21, last: 221 },
    margin: { color: '#dc5a62', weight: 0.22, x: 27 },
    text: { left: 29.5, right: 171, first: 21, last: 221 },
    pitch: 8,
    xh: 2.9,
  },
  {
    // DIN 16552 Lineatur 10 style: 5 mm squares on A5 with a plain margin left white on the right.
    id: 'squared',
    name: 'Squared',
    hint: 'German Kästchen, 5 mm',
    w: 148, h: 210,
    tint: '#fdfdfb',
    grid: { color: '#b2b8be', weight: 0.13, pitch: 5, box: [6.5, 7.5, 126.5, 202.5] },
    text: { left: 11.5, right: 124, first: 22.5, last: 197.5 },
    pitch: 5,
    multiples: true,
    xh: 2.7,
  },
  {
    // Rhodia / Leuchtturm style A5 dot grid: 5 mm, small grey dots on ivory, a few mm of border.
    id: 'dots',
    name: 'Dot grid',
    hint: 'Journal, 5 mm dots',
    w: 148, h: 210,
    tint: '#fcf8ee',
    dots: { color: '#a19d95', d: 0.42, pitch: 5, box: [9, 7.5, 139, 202.5] },
    text: { left: 14, right: 134, first: 22.5, last: 197.5 },
    pitch: 5,
    multiples: true,
    xh: 2.8,
  },
  {
    // The back of an A6 postcard: message on the left, a centre divider, address lines and a stamp box.
    id: 'postcard',
    name: 'Postcard',
    hint: 'A6 postcard, message side',
    w: 148, h: 105,
    tint: '#fcf9f2',
    postcard: { divider: 76, address: { x0: 82, x1: 140, ys: [52, 64, 76, 88] }, stamp: [117, 9, 23, 28], color: '#b6ad9c' },
    text: { left: 9, right: 71, first: 17, last: 96 },
    pitch: 0,
    xh: 2.3,
    swatch: { x: 100, y: 6 },
  },
];

export const DEFAULT_PAPER: PaperId = 'plain';
export const getPaper = (id: string) => PAPERS.find((p) => p.id === id) ?? PAPERS[0];

/** Grid lines (mm) from a box [left, top, right, bottom], whole squares only. */
function gridSteps(a: number, b: number, pitch: number) {
  const out: number[] = [];
  for (let v = a; v <= b + 1e-6; v += pitch) out.push(v);
  return out;
}

/**
 * Where the writing goes, given the em size (mm) of the hand at the chosen size.
 * Baselines land on the paper's rules: first baseline on a rule, pitch a whole number of rules.
 */
export function writingLines(paper: PaperSpec, emMm: number, xhMm: number, spacing = 1) {
  const { text } = paper;
  if (!paper.pitch) {
    // free lines: room for loops and tails, never tighter than ~3.6 x-heights
    const lineMm = Math.max(emMm * 1.28, xhMm * 3.6) * spacing;
    const count = Math.max(1, Math.floor((text.last - text.first) / lineMm) + 1);
    return { first: text.first, lineMm, perPage: count };
  }
  // on rules, the writer's spacing picks how many rules a line takes (it snaps)
  let k = 1;
  if (paper.multiples) k = Math.max(1, Math.round((emMm * 1.3 * spacing) / paper.pitch));
  else if (emMm * spacing > paper.pitch * 1.6) k = 2;
  const lineMm = paper.pitch * k;
  let first = text.first;
  const box = paper.grid?.box ?? paper.dots?.box;
  if (box) {
    // snap the first baseline to a grid line
    first = box[1] + Math.ceil((text.first - box[1]) / paper.pitch - 1e-6) * paper.pitch;
  }
  const perPage = Math.max(1, Math.floor((text.last - first) / lineMm + 1e-6) + 1);
  return { first, lineMm, perPage };
}

// ---------- texture: a soft, seeded paper grain (tiles seamlessly) ----------
let grainTile: HTMLCanvasElement | null = null;
function grain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  const r = rng('paper:grain');
  // per-pixel tooth, slightly clumped so it reads as paper rather than digital noise
  const tooth = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) tooth[i] = r();
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const t = (tooth[y * S + x] * 2 + tooth[y * S + ((x + 1) % S)] + tooth[((y + 1) % S) * S + x]) / 4;
      const v = Math.round(255 * (0.5 + (t - 0.5) * 0.9));
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // a few short fibres, wrapped at the edges so the tile still tiles
  ctx.lineCap = 'round';
  for (let f = 0; f < 26; f++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI, len = 6 + r() * 16;
    ctx.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.6 + r() * 0.5;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      ctx.beginPath();
      ctx.moveTo(x + dx, y + dy);
      ctx.quadraticCurveTo(x + dx + Math.cos(a + 0.4) * len * 0.5, y + dy + Math.sin(a + 0.4) * len * 0.5, x + dx + Math.cos(a) * len, y + dy + Math.sin(a) * len);
      ctx.stroke();
    }
  }
  grainTile = c;
  return c;
}

export interface PaintOptions {
  /** device pixels per mm */
  pxPerMm: number;
  /** device pixels per CSS pixel (keeps the grain the same size on screen and in the JPEG) */
  grainScale: number;
  /** what shows through binder holes: 'clear' on screen, a colour in the JPEG */
  holeFill: 'clear' | string;
}

/** Paint one sheet at (0,0) on ctx. Size: paper.w * pxPerMm by paper.h * pxPerMm device pixels. */
export function paintPaper(ctx: CanvasRenderingContext2D, paper: PaperSpec, o: PaintOptions) {
  const k = o.pxPerMm;
  const W = paper.w * k, H = paper.h * k;
  ctx.save();
  ctx.fillStyle = paper.tint;
  ctx.fillRect(0, 0, W, H);

  // grain: multiply-ish, very low contrast
  const pat = ctx.createPattern(grain(), 'repeat');
  if (pat) {
    pat.setTransform(new DOMMatrix().scale(o.grainScale * 0.75));
    ctx.globalAlpha = 0.05;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  // light falls a touch off towards the edges
  const g = ctx.createRadialGradient(W * 0.45, H * 0.38, Math.min(W, H) * 0.2, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
  g.addColorStop(0, 'rgba(255,255,255,0.0)');
  g.addColorStop(1, 'rgba(120,96,60,0.045)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (paper.laid) {
    const { pitch, chain, color } = paper.laid;
    ctx.save();
    ctx.strokeStyle = color;
    // the fine laid lines only where they resolve (below ~2.5 px they would shimmer)
    if (pitch * k >= 2.5) {
      ctx.globalAlpha = 0.035;
      ctx.lineWidth = Math.max(0.6, 0.22 * k);
      ctx.beginPath();
      for (let y = pitch / 2; y < paper.h; y += pitch) { ctx.moveTo(0, y * k); ctx.lineTo(W, y * k); }
      ctx.stroke();
    }
    // chain lines: a touch darker, slightly soft, with the paper a little denser beside them
    const r = rng('paper:laid');
    for (let x = chain / 2 + 4; x < paper.w; x += chain) {
      const jx = x + (r() - 0.5) * 0.6;
      ctx.globalAlpha = 0.034;
      ctx.lineWidth = Math.max(0.8, 0.35 * k);
      ctx.beginPath(); ctx.moveTo(jx * k, 0); ctx.lineTo((jx + 0.3) * k, H); ctx.stroke();
      ctx.globalAlpha = 0.012;
      ctx.lineWidth = Math.max(2, 2.2 * k);
      ctx.beginPath(); ctx.moveTo(jx * k, 0); ctx.lineTo((jx + 0.3) * k, H); ctx.stroke();
    }
    ctx.restore();
  }

  // a thin hairline drawn at a crisp device-pixel position; weights under 1px become lighter instead
  const hline = (y: number, x0: number, x1: number, rule: Rule) => line(ctx, x0 * k, y * k, x1 * k, y * k, rule, k);
  const vline = (x: number, y0: number, y1: number, rule: Rule) => line(ctx, x * k, y0 * k, x * k, y1 * k, rule, k);

  if (paper.grid) {
    const { pitch, box: [l, t, r, b] } = paper.grid;
    for (const x of gridSteps(l, r, pitch)) vline(x, t, b, paper.grid);
    for (const y of gridSteps(t, b, pitch)) hline(y, l, r, paper.grid);
  }

  if (paper.dots) {
    const { pitch, box: [l, t, r, b], d, color } = paper.dots;
    const rad = Math.max(0.55, (d / 2) * k);
    ctx.fillStyle = color;
    ctx.globalAlpha = Math.min(1, (d / 2) * k / 0.55) * 0.9;
    for (const y of gridSteps(t, b, pitch)) {
      for (const x of gridSteps(l, r, pitch)) {
        ctx.beginPath();
        ctx.arc(x * k, y * k, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  if (paper.seyes && paper.lines) {
    const { square, fine, vertical } = paper.seyes;
    const L = paper.lines;
    // fine lines every 2 mm across the whole ruled block (and a little above the first main line)
    for (let y = L.first - square; y <= L.last + 1e-6; y += square / 4) {
      const main = Math.abs(((y - L.first) / square) - Math.round((y - L.first) / square)) < 1e-6;
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
    vline(pc.divider, 9, paper.h - 9, rule);
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

  if (paper.holes) {
    const { x, ys, d } = paper.holes;
    for (const y of ys) {
      const cx = x * k, cy = y * k, r = (d / 2) * k;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      if (o.holeFill === 'clear') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.fillStyle = o.holeFill;
        ctx.fill();
      }
      // the cut edge catches a little shadow on its upper side
      ctx.beginPath();
      ctx.arc(cx, cy, r + 0.35 * k * 0.5, Math.PI * 1.05, Math.PI * 1.95);
      ctx.strokeStyle = 'rgba(70,58,40,0.18)';
      ctx.lineWidth = Math.max(1, 0.35 * k);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, rule: Rule, k: number) {
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

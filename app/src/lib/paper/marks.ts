// Printed marks: what an archive or a post office stamps on a letter (a datestamp, a cancellation, a receipt oval, a
// registry box, a straight-line town mark, an archivist's pencilled note) and the letter's number. They're printed
// into the sheet, never laid over it: rubber-stamp ink is uneven, the impression is fuller on one side, voids show
// where the rubber missed, the ink spreads a hair, and now and then the stamp bounced and struck twice. Everything
// multiplies with what's under it, so the paper's tooth shows through.
//
// planMarks() decides where and how, seeded by the letter and the hand (a letter is stable on reload); printMarks()
// paints them. Marks stamped before the letter was written sit under the handwriting (painted into the paper);
// marks stamped later sit over it (a layer above the writing). All invented: no real office, brand or postmark.
// Lengths in mm.
import type { PaperSpec } from './types';
import type { Ctx2D } from './paint';
import { rng } from './rng';

export type MarkLook = 'reading-room' | 'postmarked' | 'default';

/** What a look knows about the letter. */
export interface MarkInput {
  /** the letter (found letters: their id; your own: anything stable) */
  id: string;
  /** the hand writing it (its seed), so another hand gets another stamping */
  hand: string;
  place?: string | null;
  year?: number | null;
  /** the archive's number for it */
  number?: number | null;
  /** a boxed cancellation, where the provenance says so ("UNDELIVERED") */
  cancel?: string | null;
  look: MarkLook;
  /** force one badge kind (1-6) for review; the URL's ?badge=N does the same */
  badge?: number | null;
}

/** 1 double-ring datestamp · 2 ring with bars · 3 receipt oval · 4 registry box · 5 straight-line mark · 6 pencil note */
export type BadgeKind = 1 | 2 | 3 | 4 | 5 | 6;
type Kind = 'datestamp' | 'duplex' | 'oval' | 'registry' | 'line' | 'pencil' | 'number' | 'inked-number' | 'cancel';
const BADGES: Kind[] = ['datestamp', 'duplex', 'oval', 'registry', 'line', 'pencil'];

export interface Mark {
  kind: Kind;
  /** centre, mm */
  x: number;
  y: number;
  /** the mark's main size, mm (a ring's diameter, a box's width) */
  size: number;
  /** radians */
  rot: number;
  ink: string;
  layer: 'under' | 'over';
  text: { place?: string; year?: string; number?: string; label?: string };
  /** how much ink reached the paper, 0..1 */
  press: number;
  /** the side the impression is fuller on (radians) and how uneven it is, 0..1 */
  lean: number;
  uneven: number;
  /** a second, faint strike (the stamp bounced), offset in mm */
  bounce: [number, number] | null;
  seed: string;
}

export interface MarkPlan {
  marks: Mark[];
  /** changes whenever anything printed changes (for caches) */
  key: string;
}

const INKS = {
  red: '#a3322b', // archival red
  violet: '#3d3050', // violet-black
  blue: '#3f5f93', // faded blue
  pencil: '#55555b',
  ironGall: '#3a2f28',
};

/** Badge weights per look: the reading room leans to the archive's own stamps, postmarked to the post's. */
const WEIGHTS: Record<MarkLook, number[]> = {
  'reading-room': [1.2, 0.8, 1.6, 1.4, 1, 1.3],
  postmarked: [2.4, 2, 0.6, 0.7, 1, 0.3],
  default: [1, 1, 1, 1, 1, 1],
};

function forcedBadge(input: MarkInput): number | null {
  if (input.badge) return input.badge;
  try {
    const b = Number(new URLSearchParams(location.search).get('badge'));
    return b >= 1 && b <= 6 ? b : null;
  } catch {
    return null;
  }
}

const pickWeighted = (r: () => number, w: number[]) => {
  let x = r() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i; }
  return w.length - 1;
};

/** Where and how this letter was stamped. Pure in the input and the paper. */
export function planMarks(paper: PaperSpec, input: MarkInput): MarkPlan {
  const seed = `${input.id}|${input.hand}|${paper.family}`;
  const r = rng('marks:' + seed);
  const minSide = Math.min(paper.w, paper.h);
  const place = (input.place || '').trim();
  const year = input.year != null ? String(input.year) : '';
  const marks: Mark[] = [];
  // corners and margins mostly; now and then right across the writing
  const T = paper.text;
  const zones: [number, number, number, number][] = [
    [2, 2, T.left + 8, T.first - 2], // top left
    [T.right - 30, 2, paper.w - 2, T.first + 6], // top right
    [2, T.last - 10, T.left + 14, paper.h - 2], // bottom left
    [T.right - 34, T.last - 6, paper.w - 2, paper.h - 2], // bottom right
    [2, T.first, T.left + 4, T.last], // left margin
    [T.right - 6, T.first, paper.w - 2, T.last], // right margin
    [T.left + 6, T.first + 6, T.right - 6, T.last - 6], // over the writing
  ];
  const zoneW = [1.25, 1.35, 0.9, 1.1, 0.45, 0.45, 0.9];
  const used = new Set<number>();
  const spot = (size: number) => {
    let z = pickWeighted(r, zoneW.map((w, i) => (used.has(i) ? w * 0.08 : w)));
    used.add(z);
    const [x0, y0, x1, y1] = zones[z];
    const half = size * 0.45; // may run a little off the edge, never mostly
    const x = clamp(x0 + r() * Math.max(0, x1 - x0), half, paper.w - half);
    const y = clamp(y0 + r() * Math.max(0, y1 - y0), half, paper.h - half);
    return { x, y, over: z === 6 };
  };
  const inkFor = (pal: (keyof typeof INKS)[]) => INKS[pal[Math.floor(r() * pal.length)]];
  const common = (size: number, layerOdds: number) => {
    const at = spot(size);
    return {
      ...at,
      rot: ((r() * 2 - 1) * 15 * Math.PI) / 180,
      press: 0.72 + r() * 0.26,
      lean: r() * Math.PI * 2,
      uneven: 0.25 + r() * 0.6,
      bounce: r() < 0.16 ? ([(r() - 0.5) * 1.2, (r() - 0.5) * 1.2] as [number, number]) : null,
      // stamped before the letter was written (under the ink) or afterwards (over it)
      layer: (r() < layerOdds ? 'over' : 'under') as Mark['layer'],
    };
  };

  // the location badge
  if (place || year) {
    const forced = forcedBadge(input);
    const k = forced ? forced - 1 : pickWeighted(r, WEIGHTS[input.look]);
    const kind = BADGES[k];
    const base = clamp(minSide * 0.19, 19, 33) * (0.88 + r() * 0.26);
    const size = kind === 'registry' ? base * 1.25 : kind === 'line' ? base * 1.1 : kind === 'pencil' ? base * 1.15 : base;
    const c = common(kind === 'duplex' ? size * 2 : size, kind === 'pencil' ? 1 : 0.55);
    marks.push({
      kind,
      ...c,
      // dark inks take less well on a worn pad
      press: c.press * (input.look === 'postmarked' ? 0.9 : 1),
      // a pencil note sits nearly level, in the margin, in grey
      rot: kind === 'pencil' ? c.rot * 0.25 : c.rot,
      ink: kind === 'pencil' ? INKS.pencil : inkFor(input.look === 'postmarked' ? ['violet', 'violet', 'blue', 'red'] : ['red', 'violet', 'blue']),
      size,
      text: { place: kind === 'pencil' ? place : place.toUpperCase(), year, label: kind === 'oval' ? 'RECEIVED' : kind === 'registry' ? 'ENTERED' : undefined },
      seed: seed + ':badge',
    });
  }
  // the number: a numbering machine, or written in by hand in ink
  if (input.number != null) {
    const n = String(input.number).padStart(4, '0');
    const handInked = r() < 0.3;
    const size = clamp(minSide * 0.11, 12, 19) * (0.9 + r() * 0.2);
    const c = common(size * 2.4, 0.7);
    marks.push({
      kind: handInked ? 'inked-number' : 'number',
      ...c,
      rot: handInked ? c.rot * 0.3 : c.rot * 0.6,
      ink: handInked ? INKS.ironGall : inkFor(['red', 'red', 'violet']),
      size,
      text: { number: n },
      seed: seed + ':no',
    });
  }
  // a cancellation in red, true to the provenance
  if (input.cancel) {
    const size = clamp(minSide * 0.2, 20, 36);
    const c = common(size, 0.85);
    marks.push({ kind: 'cancel', ...c, ink: INKS.red, size, text: { label: input.cancel.toUpperCase() }, seed: seed + ':cancel' });
  }
  const key = marks.map((m) => `${m.kind}${m.x.toFixed(1)},${m.y.toFixed(1)},${m.rot.toFixed(3)},${m.layer},${m.ink},${m.text.place ?? ''}${m.text.year ?? ''}${m.text.number ?? ''}${m.text.label ?? ''}`).join(';');
  return { marks, key: hash(key) };
}

// ---------- printing ----------
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// shared ink textures, made once: speckle (where the rubber missed) and blotches (where it was over- or under-inked)
let speckleTile: AnyCanvas | null = null;
let blotchTile: AnyCanvas | null = null;
function speckle() {
  if (speckleTile) return speckleTile;
  const S = 128;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d') as Ctx2D;
  const r = rng('marks:speckle');
  for (let i = 0; i < 520; i++) {
    g.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.75})`;
    g.beginPath();
    g.arc(r() * S, r() * S, 0.35 + r() * r() * 1.8, 0, Math.PI * 2);
    g.fill();
  }
  return (speckleTile = c);
}
function blotch() {
  if (blotchTile) return blotchTile;
  const S = 24;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d') as Ctx2D;
  const img = g.createImageData(S, S);
  const r = rng('marks:blotch');
  for (let i = 0; i < S * S; i++) img.data[i * 4 + 3] = Math.round(255 * Math.pow(r(), 1.6));
  g.putImageData(img, 0, 0);
  return (blotchTile = c);
}

const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = '"Courier New", Courier, monospace';
const SERIF = 'Georgia, "Times New Roman", serif';
const HAND = '"Bradley Hand", "Segoe Print", "Noteworthy", "Comic Sans MS", cursive';

/** Paint the marks of one layer onto a sheet (ctx at the sheet's origin, k px per mm). */
export function printMarks(ctx: Ctx2D, marks: Mark[], k: number, layer: 'under' | 'over') {
  for (const m of marks) if (m.layer === layer) printMark(ctx, m, k);
}

function printMark(ctx: Ctx2D, m: Mark, k: number) {
  const r = rng(m.seed);
  // the mark's own canvas, room for its widest form
  const span = m.kind === 'duplex' ? m.size * 2.3 : m.kind === 'line' || m.kind === 'pencil' || m.kind === 'number' || m.kind === 'inked-number' ? m.size * 2.6 : m.kind === 'cancel' ? m.size * 1.6 : m.size * 1.4;
  const W = Math.ceil(span * k), H = Math.ceil(m.size * 1.4 * k);
  const c = makeCanvas(W, H);
  const g = c.getContext('2d') as Ctx2D;
  g.translate(W / 2, H / 2);
  g.scale(k, k);
  g.fillStyle = g.strokeStyle = '#000';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  SHAPES[m.kind](g, m, r);
  g.setTransform(1, 0, 0, 1, 0, 0);

  const pencil = m.kind === 'pencil';
  const pen = m.kind === 'inked-number';
  // ink: voids where the rubber missed (pencil: the paper's tooth catching graphite)
  g.globalCompositeOperation = 'destination-out';
  const sp = g.createPattern(speckle(), 'repeat');
  if (sp) {
    sp.setTransform(new DOMMatrix().translate(r() * 128, r() * 128).scale(Math.max(0.6, k / 7)));
    g.globalAlpha = pencil ? 0.75 : pen ? 0.12 : 0.38 + m.uneven * 0.3;
    g.fillStyle = sp;
    g.fillRect(0, 0, W, H);
    // and wider patches the rubber didn't reach at all
    if (!pen && !pencil) {
      sp.setTransform(new DOMMatrix().translate(r() * 300, r() * 300).scale(Math.max(1.6, k / 2.6)).rotate(r() * 90));
      g.globalAlpha = 0.22 + m.uneven * 0.25;
      g.fillRect(0, 0, W, H);
    }
  }
  if (!pen) {
    // under- and over-inking: soft blotches, and one side of the impression fainter than the other
    g.globalAlpha = 0.34 + m.uneven * 0.36;
    g.imageSmoothingEnabled = true;
    g.drawImage(blotch(), -W * r() * 0.5, -H * r() * 0.5, W * 1.6, H * 1.6);
    const dx = Math.cos(m.lean), dy = Math.sin(m.lean);
    const grad = g.createLinearGradient(W / 2 - dx * W / 2, H / 2 - dy * H / 2, W / 2 + dx * W / 2, H / 2 + dy * H / 2);
    grad.addColorStop(0, `rgba(0,0,0,${(0.75 * m.uneven).toFixed(3)})`);
    grad.addColorStop(0.55, 'rgba(0,0,0,0)');
    g.globalAlpha = 1;
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }
  // colour it
  g.globalCompositeOperation = 'source-in';
  g.globalAlpha = 1;
  g.fillStyle = m.ink;
  g.fillRect(0, 0, W, H);

  // onto the sheet: multiplied, so the paper (and any writing under it) shows through; a hair of spread
  ctx.save();
  ctx.translate(m.x * k, m.y * k);
  ctx.rotate(m.rot);
  ctx.globalCompositeOperation = 'multiply';
  // the darker the ink, the more a thin inking shows
  ctx.globalAlpha = pencil ? 0.62 : m.ink === INKS.violet || m.ink === INKS.ironGall ? m.press * 0.82 : m.press;
  if (!pencil) {
    ctx.shadowColor = m.ink;
    ctx.shadowBlur = Math.max(0.6, 0.18 * k);
  }
  ctx.drawImage(c, -W / 2, -H / 2);
  ctx.shadowBlur = 0;
  if (m.bounce && !pencil && !pen) {
    ctx.globalAlpha = m.press * 0.22;
    ctx.drawImage(c, -W / 2 + m.bounce[0] * k, -H / 2 + m.bounce[1] * k);
  }
  ctx.restore();
}

// ---------- the shapes (drawn black at mm scale, centred on 0,0) ----------
type Shape = (g: Ctx2D, m: Mark, r: () => number) => void;

const font = (px: number, face: string, weight = 600) => `${weight} ${px.toFixed(2)}px ${face}`;

/** Letters along a circle: centred at angle `at` (radians, 0 = right, -π/2 = top); outside: top arcs read left→right. */
function arcText(g: Ctx2D, text: string, rad: number, at: number, px: number, face: string, top: boolean, spacing = 0.12) {
  g.font = font(px, face);
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width + spacing * px);
  const total = widths.reduce((a, b) => a + b, 0);
  let a = top ? at - total / rad / 2 : at + total / rad / 2;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  chars.forEach((ch, i) => {
    const step = widths[i] / rad;
    const mid = top ? a + step / 2 : a - step / 2;
    g.save();
    g.translate(Math.cos(mid) * rad, Math.sin(mid) * rad);
    g.rotate(top ? mid + Math.PI / 2 : mid - Math.PI / 2);
    g.fillText(ch, 0, 0);
    g.restore();
    a = top ? a + step : a - step;
  });
}

/** Fit a word into a width: the font size that makes it so (capped). */
function fitPx(g: Ctx2D, text: string, face: string, width: number, max: number, spacing = 0.1) {
  g.font = font(max, face);
  const w = g.measureText(text).width + spacing * max * text.length;
  return Math.min(max, (max * width) / Math.max(1e-3, w));
}

function spaced(g: Ctx2D, text: string, x: number, y: number, px: number, face: string, spacing = 0.12, weight = 600) {
  g.font = font(px, face, weight);
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const chars = [...text];
  const ws = chars.map((ch) => g.measureText(ch).width);
  const total = ws.reduce((a, b) => a + b, 0) + spacing * px * (chars.length - 1);
  let cx = x - total / 2;
  chars.forEach((ch, i) => { g.fillText(ch, cx, y); cx += ws[i] + spacing * px; });
}

const ringText = (place: string) => (place.length > 22 ? place.slice(0, 21) + '.' : place);

const SHAPES: Record<Kind, Shape> = {
  // 1. a double-ring datestamp: the town around the top, two small stars at the foot, the year across the middle
  datestamp(g, m) {
    const R = m.size / 2;
    g.lineWidth = 0.55;
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 0.32;
    g.beginPath(); g.arc(0, 0, R * 0.6, 0, Math.PI * 2); g.stroke();
    const band = R * 0.8;
    const place = ringText(m.text.place || '');
    const px = Math.min(R * 0.27, (Math.PI * band * 0.92) / Math.max(4, place.length * 0.78));
    if (place) arcText(g, place, band, -Math.PI / 2, px, SANS, true);
    for (const a of [Math.PI / 2 - 0.32, Math.PI / 2 + 0.32]) star(g, Math.cos(a) * band, Math.sin(a) * band, R * 0.07);
    if (m.text.year) spaced(g, m.text.year, 0, 0, R * 0.32, SANS, 0.06, 700);
    g.lineWidth = 0.25;
    for (const y of [-R * 0.3, R * 0.3]) { g.beginPath(); g.moveTo(-R * 0.36, y); g.lineTo(R * 0.36, y); g.stroke(); }
  },
  // 2. a single ring with the town and year inside, and the bars that cancelled the stamp beside it
  duplex(g, m, r) {
    const R = m.size / 2;
    const cx = -R * 0.95;
    g.save();
    g.translate(cx, 0);
    g.lineWidth = 0.5;
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
    const place = ringText(m.text.place || '');
    const px = Math.min(R * 0.27, (Math.PI * R * 0.78 * 0.9) / Math.max(4, place.length * 0.78));
    if (place) arcText(g, place, R * 0.76, -Math.PI / 2, px, SANS, true);
    if (m.text.year) spaced(g, m.text.year, 0, R * 0.12, R * 0.34, SANS, 0.05, 700);
    g.restore();
    // the bars: thick, slightly wavy, not quite even
    const x0 = cx + R * 1.12, x1 = cx + R * 3.25;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const y = (-0.78 + (1.56 * i) / (n - 1)) * R;
      g.lineWidth = R * (0.11 + r() * 0.03);
      g.beginPath();
      g.moveTo(x0, y);
      g.bezierCurveTo(x0 + (x1 - x0) * 0.33, y - R * 0.05, x0 + (x1 - x0) * 0.66, y + R * 0.05, x1, y + (r() - 0.5) * R * 0.04);
      g.stroke();
    }
  },
  // 3. an oval receipt stamp: RECEIVED · YEAR · PLACE
  oval(g, m) {
    const rx = m.size * 0.6, ry = m.size * 0.38;
    g.lineWidth = 0.5;
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 0.25;
    g.beginPath(); g.ellipse(0, 0, rx * 0.9, ry * 0.84, 0, 0, Math.PI * 2); g.stroke();
    spaced(g, m.text.label || 'RECEIVED', 0, -ry * 0.44, ry * 0.26, SANS, 0.16);
    if (m.text.year) spaced(g, m.text.year, 0, ry * 0.03, ry * 0.46, SERIF, 0.04, 700);
    const place = m.text.place || '';
    if (place) spaced(g, place, 0, ry * 0.48, fitPx(g, place, SANS, rx * 1.3, ry * 0.24, 0.14), SANS, 0.14);
    for (const x of [-rx * 0.55, rx * 0.55]) { g.beginPath(); g.arc(x, -ry * 0.44, 0.35, 0, Math.PI * 2); g.fill(); }
  },
  // 4. a registry box: ENTERED above, then the place and the year in two cells
  registry(g, m) {
    const w = m.size, h = m.size * 0.5;
    g.lineWidth = 0.5;
    g.strokeRect(-w / 2, -h / 2, w, h);
    g.lineWidth = 0.22;
    g.strokeRect(-w / 2 + 0.9, -h / 2 + 0.9, w - 1.8, h - 1.8);
    const top = -h / 2 + h * 0.33;
    g.beginPath(); g.moveTo(-w / 2 + 0.9, top); g.lineTo(w / 2 - 0.9, top); g.stroke();
    const split = w * 0.18;
    g.beginPath(); g.moveTo(split, top); g.lineTo(split, h / 2 - 0.9); g.stroke();
    spaced(g, m.text.label || 'ENTERED', 0, (-h / 2 + top) / 2 + 0.45, h * 0.17, SANS, 0.3);
    const place = m.text.place || '';
    const cellY = (top + h / 2) / 2;
    if (place) spaced(g, place, (-w / 2 + split) / 2, cellY, fitPx(g, place, SANS, (split + w / 2) * 0.86, h * 0.27, 0.08), SANS, 0.08);
    if (m.text.year) spaced(g, m.text.year, (split + w / 2) / 2, cellY, h * 0.3, SANS, 0.05, 700);
  },
  // 5. a straight-line town mark: the name in one line of capitals, the year under it
  line(g, m) {
    const place = m.text.place || '';
    const px = place ? fitPx(g, place, SERIF, m.size * 1.9, m.size * 0.22, 0.12) : m.size * 0.2;
    if (place) spaced(g, place, 0, -px * 0.5, px, SERIF, 0.12, 700);
    if (m.text.year) spaced(g, m.text.year, 0, px * 0.75, px * 0.72, SERIF, 0.1, 600);
    g.lineWidth = 0.3;
    const half = Math.min(m.size * 0.95, px * Math.max(4, place.length) * 0.45);
    g.beginPath(); g.moveTo(-half, -px * 1.2); g.lineTo(half, -px * 1.2); g.stroke();
  },
  // 6. an archivist's pencilled note, in a neat hand
  pencil(g, m) {
    const note = [m.text.place, m.text.year].filter(Boolean).join(', ');
    const px = fitPx(g, note, HAND, m.size * 2.1, m.size * 0.24, 0);
    g.font = font(px, HAND, 400);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(note, 0, 0);
    g.lineWidth = 0.18;
    g.beginPath();
    g.moveTo(-g.measureText(note).width * 0.42, px * 0.62);
    g.quadraticCurveTo(0, px * 0.7, g.measureText(note).width * 0.4, px * 0.58);
    g.stroke();
  },
  // the number: a numbering machine's figures (a small "No" with its o raised and underlined)
  number(g, m) {
    const px = m.size * 0.36;
    const n = m.text.number || '';
    g.font = font(px, MONO, 700);
    const nw = g.measureText(n).width;
    g.font = font(px * 0.7, MONO, 700);
    const lw = g.measureText('No').width;
    const total = lw + px * 0.35 + nw;
    let x = -total / 2;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.fillText('N', x, px * 0.35);
    const nW = g.measureText('N').width;
    g.font = font(px * 0.5, MONO, 700);
    g.fillText('o', x + nW, px * 0.05);
    g.fillRect(x + nW, px * 0.14, g.measureText('o').width, px * 0.06);
    x += lw + px * 0.35;
    g.font = font(px, MONO, 700);
    g.fillText(n, x, px * 0.35);
  },
  // the number written in by hand, in ink
  'inked-number'(g, m) {
    const px = m.size * 0.36;
    g.font = `400 ${(px * 1.15).toFixed(2)}px ${HAND}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`No. ${String(Number(m.text.number))}`, 0, 0);
  },
  // a boxed cancellation word
  cancel(g, m) {
    const label = m.text.label || '';
    const px = fitPx(g, label, SANS, m.size * 1.25, m.size * 0.2, 0.14);
    g.lineWidth = 0.55;
    const w = m.size * 1.42, h = px * 2.1;
    g.strokeRect(-w / 2, -h / 2, w, h);
    spaced(g, label, 0, 0, px, SANS, 0.14, 800);
  },
};

function star(g: Ctx2D, x: number, y: number, s: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? s * 0.45 : s;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

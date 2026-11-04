// Age on a sheet: what years of being held, folded, bundled and kept do to paper. Its edges wear soft and a little
// rough, its corners round off, now and then a nibble or a tiny tear; and a patina settles on it: grime where hands
// held it, a darker rim, an uneven fade, faint foxing, once in a while a tide mark. The base colours stay.
//
// Seeded by the letter (and the sheet), so a letter looks the same on every visit; older letters wear more, and a
// seeded minority of sheets are visibly older than the rest. The edges are part of the sheet's outline
// (lib/paper/outline.ts), so the writing, the marks and the sheet's own edge tone all follow them; the patina is
// painted into the paper (lib/paper/paint.ts), once, never per frame. ?wear=0|1|2 (none, gentle, well-worn).
// Lengths in mm.
import type { Ctx2D } from './paint';
import type { PaperSpec } from './types';
import { rng } from './rng';
import { paintAdornment } from './adorn';

export type WearLevel = 0 | 1 | 2;
/** What a page shows when the URL doesn't say (gentle once Rafael has seen it). */
export const DEFAULT_WEAR: WearLevel = 0;

/** How worn one sheet is. */
export interface Wear {
  level: 1 | 2;
  /** the letter's seed (its id, or '' for your own) */
  seed: string;
  /** how much it wears, about 0.3 (a recent letter, gently) to 2 (an old one, well worn, and seeded older) */
  amount: number;
}

let chosen: WearLevel | null = null;
/** The level this page shows: set (a worker is told by the page), else ?wear= in the URL, else the default. */
export function wearLevel(): WearLevel {
  if (chosen != null) return chosen;
  try {
    const q = new URLSearchParams(location.search).get('wear');
    if (q === '0' || q === '1' || q === '2') return (chosen = Number(q) as WearLevel);
  } catch { /* no location (a worker) */ }
  return (chosen = DEFAULT_WEAR);
}
/** A worker is told the page's level. */
export function setWearLevel(l: WearLevel | undefined) {
  chosen = l ?? DEFAULT_WEAR;
}

const kept = new Map<string, PaperSpec>();
/**
 * The paper as this letter's sheet of it, worn (the same object every time for the same letter, so painted sheets
 * are cached and React keeps it). The paper itself at level 0.
 */
export function wornPaper(paper: PaperSpec, seed: string, year?: number | null, level: WearLevel = wearLevel()): PaperSpec {
  if (!level) return paper;
  const key = `${paper.id}|${paper.w}x${paper.h}|${paper.text.right},${paper.text.last}|${seed}|${year ?? ''}|${level}`;
  const have = kept.get(key);
  if (have) return have;
  const r = rng('wear-amount:' + seed + '|' + paper.id);
  // older letters wear more: 1929 barely, 1390 most; your own letter is a recent one
  const age = year == null ? 0.1 : Math.max(0, Math.min(1, (1935 - year) / 545));
  // a seeded minority of sheets have had a harder life
  const older = r() < 0.2 ? 1.55 : 0.85 + r() * 0.3;
  const amount = (level === 2 ? 1 : 0.62) * (0.65 + 0.7 * age) * older;
  const worn: PaperSpec = { ...paper, wear: { level, seed, amount } };
  kept.set(key, worn);
  if (kept.size > 400) kept.delete(kept.keys().next().value!);
  return worn;
}

// ---------- the letter on screen, for downloads and videos ----------
let onScreen: { paperId: string; seed: string; year: number | null | undefined; owner: object } | null = null;
/** The sheet on screen wears as this letter (owner: whatever unregisters it later). */
export function showWear(paperId: string, seed: string, year: number | null | undefined, owner: object) {
  onScreen = { paperId, seed, year, owner };
}
export function hideWear(owner: object) {
  if (onScreen?.owner === owner) onScreen = null;
}
/** The paper an exported copy of the letter on screen is printed on: worn as it is on screen. */
export function wornForExport(paper: PaperSpec): PaperSpec {
  if (paper.wear) return paper;
  const s = onScreen && onScreen.paperId === paper.id ? onScreen : null;
  return wornPaper(paper, s?.seed ?? '', s?.year);
}

// ---------- the edges (outline.ts walks these) ----------
/**
 * How far a worn straight side reaches into the sheet at t mm along it: a soft wander, nibbles where it was knocked,
 * and now and then a tiny tear. `L` is the side's length.
 */
export function wornProfile(w: Wear, seed: string, L: number): (t: number) => number {
  const r = rng('wear-edge:' + w.seed + ':' + seed);
  const a = w.amount;
  // the wander: a few slow waves and a fine fuzz, a fraction of a millimetre
  const waves = Array.from({ length: 5 }, (_, i) => ({ f: (0.03 + r() * 0.06) * (i + 1), p: r() * 6.28, amp: (0.05 + r() * 0.06) / (i + 1) }));
  const fuzz = Array.from({ length: 3 }, () => ({ f: 1.5 + r() * 3, p: r() * 6.28 }));
  // nibbles: shallow rounded bites (a knock, a rub), more on a longer, older side
  const bites: { at: number; half: number; d: number }[] = [];
  const n = Math.floor((L / 90) * a * 1.6 + r() * a * 1.3);
  for (let i = 0; i < n; i++) bites.push({ at: 8 + r() * (L - 16), half: 0.8 + r() * 2.2 * a, d: (0.25 + r() * 0.8) * Math.min(1.4, a) });
  // a tiny tear: narrow and a few millimetres deep, rare and only on a worn-enough sheet
  const tear = r() < 0.16 * a ? { at: 12 + r() * (L - 24), half: 0.35 + r() * 0.4, d: 1.6 + r() * 2.4 * Math.min(1.3, a) } : null;
  return (t) => {
    let d = 0.06 * a;
    for (const v of waves) d += v.amp * a * (1 + Math.sin(t * v.f + v.p));
    for (const v of fuzz) d += 0.025 * a * (1 + Math.sin(t * v.f + v.p));
    for (const b of bites) {
      const u = Math.abs(t - b.at) / b.half;
      if (u < 1) d += b.d * Math.sqrt(1 - u * u) * (0.8 + 0.2 * Math.sin(t * 9));
    }
    if (tear) {
      const u = Math.abs(t - tear.at) / tear.half;
      if (u < 1) d = Math.max(d, tear.d * (1 - u) ** 1.4);
    }
    return d;
  };
}

/** Each corner's rubbed radius (mm), top-left, top-right, bottom-right, bottom-left; now and then one is knocked off. */
export function wornCorners(w: Wear, seed: string): number[] {
  const r = rng('wear-corners:' + w.seed + ':' + seed);
  return [0, 1, 2, 3].map(() => (0.6 + r() * 1.6) * w.amount * (r() < 0.12 * w.amount ? 2.6 : 1));
}

/** A rounded corner's inset t mm from it, for a radius R. */
export const cornerInset = (t: number, R: number) => (R > 0 && t < R ? R - Math.sqrt(Math.max(0, R * R - (R - t) * (R - t))) : 0);

// ---------- the patina (paint.ts calls this, the sheet clipped to its outline) ----------
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const GRIME = '112, 88, 55';

/** Paint the sheet's patina: grime and a darker rim near its edges, an uneven fade, uneven fibre, foxing, a tide. */
export function paintPatina(ctx: Ctx2D, paper: PaperSpec, k: number, sheet: number) {
  const w = paper.wear;
  if (!w) return;
  const r = rng('patina:' + w.seed + ':' + paper.id + ':' + sheet);
  const a = w.amount;
  const W = paper.w * k, H = paper.h * k;
  // the soft stains are all low-frequency: built at a quarter of the resolution and laid on once, multiplied
  const q = 4;
  const low = makeCanvas(Math.max(1, Math.ceil(W / q)), Math.max(1, Math.ceil(H / q)));
  stains(low.getContext('2d') as Ctx2D, k / q, low.width, low.height);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(low, 0, 0, low.width * q, low.height * q);
  ctx.restore();

  function stains(ctx: Ctx2D, k: number, W: number, H: number) {
    // uneven fibre: a coarse field of slightly darker and lighter patches, drawn small and smoothed up
    const cols = 14, rows = Math.max(8, Math.round((14 * paper.h) / paper.w));
    const f = makeCanvas(cols, rows);
    const fg = f.getContext('2d') as Ctx2D;
    const img = fg.createImageData(cols, rows);
    for (let i = 0; i < cols * rows; i++) {
      img.data[i * 4] = 150; img.data[i * 4 + 1] = 120; img.data[i * 4 + 2] = 80;
      img.data[i * 4 + 3] = Math.round(255 * Math.pow(r(), 2.2) * 0.07 * Math.min(1.3, a));
    }
    fg.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(f, 0, 0, W, H);

    // the fade: one side of the sheet a touch more yellowed (it lay that way up, or nearer the light)
    const fa = r() * Math.PI * 2;
    const fade = ctx.createLinearGradient(W / 2 - Math.cos(fa) * W * 0.6, H / 2 - Math.sin(fa) * H * 0.6, W / 2 + Math.cos(fa) * W * 0.6, H / 2 + Math.sin(fa) * H * 0.6);
    fade.addColorStop(0, `rgba(170, 135, 80, ${(0.05 * a).toFixed(3)})`);
    fade.addColorStop(0.6, 'rgba(170, 135, 80, 0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, W, H);

    // the rim: each side a little darker toward its edge, and more so in a few places along it
    const band = (3 + 4 * Math.min(1.5, a)) * k;
    const strip = (x: number, y: number, w2: number, h2: number, gx0: number, gy0: number, gx1: number, gy1: number) => {
      const alpha = (0.035 + r() * 0.035) * Math.min(1.6, a);
      const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      g.addColorStop(0, `rgba(${GRIME}, ${alpha.toFixed(3)})`);
      g.addColorStop(0.35, `rgba(${GRIME}, ${(alpha * 0.35).toFixed(3)})`);
      g.addColorStop(1, `rgba(${GRIME}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w2, h2);
    };
    strip(0, 0, W, band, 0, 0, 0, band);
    strip(0, H - band, W, band, 0, H, 0, H - band);
    strip(0, 0, band, H, 0, 0, band, 0);
    strip(W - band, 0, band, H, W, 0, W - band, 0);
    for (let i = 0, n = 3 + Math.floor(r() * 4); i < n; i++) {
      const s = Math.floor(r() * 4), t = r();
      const x = s === 0 || s === 2 ? t * W : s === 1 ? W : 0, y = s === 1 || s === 3 ? t * H : s === 2 ? H : 0;
      const R = (6 + r() * 14) * k;
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, `rgba(${GRIME}, ${((0.03 + r() * 0.04) * Math.min(1.6, a)).toFixed(3)})`);
      g.addColorStop(1, `rgba(${GRIME}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
    }

    // where hands held it: a soft grubby patch or two on an edge (most often low on the right, where a thumb sits)
    const holds = 1 + (r() < 0.5 * a ? 1 : 0);
    for (let i = 0; i < holds; i++) {
      const where = r();
      const x = where < 0.55 ? W - r() * 0.04 * W : where < 0.8 ? r() * 0.04 * W : W * (0.3 + r() * 0.4);
      const y = where < 0.8 ? H * (0.6 + r() * 0.35) : H - r() * 0.03 * H;
      const R = (9 + r() * 9) * k;
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, `rgba(${GRIME}, ${(0.07 * Math.min(1.5, a)).toFixed(3)})`);
      g.addColorStop(1, `rgba(${GRIME}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
    }
    // the corners darken most, being handled most
    for (const [x, y] of [[0, 0], [W, 0], [W, H], [0, H]]) {
      const R = (8 + r() * 10) * k;
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, `rgba(${GRIME}, ${((0.03 + r() * 0.05) * Math.min(1.5, a)).toFixed(3)})`);
      g.addColorStop(1, `rgba(${GRIME}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
    }
  }

  // foxing: a few faint spots, more often on an older sheet; and once in a while a tide mark from a corner
  if (r() < 0.22 + 0.25 * Math.min(1.5, a)) {
    const d: number[] = [];
    const cx = paper.w * (0.1 + r() * 0.8), cy = paper.h * (0.1 + r() * 0.8);
    const n = 2 + Math.floor(r() * (3 + 5 * Math.min(1.5, a)));
    for (let i = 0; i < n; i++) d.push(Math.max(1, Math.min(paper.w - 1, cx + (r() - 0.5) * 50)), Math.max(1, Math.min(paper.h - 1, cy + (r() - 0.5) * 50)), 0.25 + r() * r() * 1.1);
    paintAdornment(ctx, { kind: 'fox', x: 0, y: 0, size: 1, rot: 0, ink: '#000', text: {}, data: d, seed: 'wear-fox:' + w.seed + sheet }, k, paper.w, paper.h);
  }
  if (r() < 0.1 * a) {
    const c = Math.floor(r() * 4);
    paintAdornment(ctx, { kind: 'tide', x: c % 2 ? paper.w + 6 : -6, y: c < 2 ? -6 : paper.h + 6, size: 22 + r() * 18, rot: 0, ink: '#000', text: {}, seed: 'wear-tide:' + w.seed + sheet }, k, paper.w, paper.h);
  }
}

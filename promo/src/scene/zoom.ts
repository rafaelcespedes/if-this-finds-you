// Section 3: the flip stops dead, and the camera pulls back from the hand it landed on into a canvas of thousands of
// cards, each "If this / finds you" in another writer's hand, on that writer's paper in that writer's ink. It keeps
// pulling back until every card is a speck.
//
// The writers (scripts/canvas-hands.mjs, the site's sampler; as many as make the count end on 5,000) are drawn once
// into atlas pages (the Atlas composition: pages of 16 × 16 cards at 128 px, public/atlas/). Big cards are drawn live
// by the engine at the size they're seen; mid-size ones come from the atlas; once cards are only a few pixels, blocks
// of about 70 × 70 cards (every writer once, in one of four orders) are composed from the atlas and laid like tiles.
import { continueRender, delayRender, staticFile } from 'remotion';
import { getPaper } from '@/lib/papers';
import { drawInk, ground, RR } from './ink';
import type { FrameStyle } from './flip';
import type { Look } from './hands';
import { geometry, phrase } from './phrase';
import canvasHands from '../data/canvas-hands.json';

export const hands = canvasHands as Look[];
export const ATLAS = { tile: 128, per: 16, pages: Math.ceil(hands.length / 256) };
/** the gap between cards, as a share of a card */
const GAP = 0.06;
const BLOCK_CARD = 12; // px per card in a block's picture

// ---------- one card ----------

const tintOf = (l: Look) => (getPaper(String((l as any).paper ?? 'plain')) as any).tint ?? '#fbf9f4';

/** Paint a card (its paper's tint, the phrase in its hand and ink) into ctx at (x, y), px square. */
export function paintCard(ctx: CanvasRenderingContext2D, look: Look, x: number, y: number, px: number) {
  ctx.fillStyle = tintOf(look);
  ctx.fillRect(x, y, px, px);
  const g = geometry(px);
  for (const gr of phrase([look], g, look.ink)) drawInk(ctx, gr.p, gr.items, { emPx: gr.emPx, width: px, height: px, x, y, ink: look.ink });
}

/** An atlas page: cards page·256 … page·256 + 255, 16 to a row. */
export function paintAtlasPage(ctx: CanvasRenderingContext2D, page: number) {
  const { tile, per } = ATLAS;
  for (let i = 0; i < per * per; i++) {
    const look = hands[(page * per * per + i) % hands.length];
    paintCard(ctx, look, (i % per) * tile, Math.floor(i / per) * tile, tile);
  }
}

// ---------- which writer is where ----------

function mix(a: number, b: number) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
}
// How many writers the canvas has (the first n of the list), the blocks' size (BW × BH ≥ n cells: every writer
// once, a few twice) and four orders of them (a block uses one, chosen by where it lies).
interface CanvasState { n: number; BW: number; BH: number; orders: number[][]; blocks: (HTMLCanvasElement | null)[] }
function canvasState(n: number): CanvasState {
  n = Math.max(1, Math.min(hands.length, Math.round(n)));
  const BW = Math.ceil(Math.sqrt(n)), BH = Math.ceil(n / BW);
  const orders = [0, 1, 2, 3].map((k) => {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = mix(i, k + 7) % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  });
  return { n, BW, BH, orders, blocks: [null, null, null, null] };
}
let C = canvasState(hands.length);
/** Use the first n writers (the scene picks n so the counter ends on 5,000). */
export function useWriters(n: number) { if (Math.round(n) !== C.n) C = canvasState(n); }
export const writers = () => C.n;
const mod = (a: number, m: number) => ((a % m) + m) % m;
const orderOf = (bi: number, bj: number) => mix(bi + 101, bj - 57) & 3;
const cell = (order: number, ci: number, cj: number) => C.orders[order][(cj * C.BW + ci) % C.n];
/** the writer at card (i, j); card (0, 0) is the hand the flip landed on (-1) */
export function handAt(i: number, j: number) {
  if (i === 0 && j === 0) return -1;
  const bi = Math.floor(i / C.BW), bj = Math.floor(j / C.BH);
  return cell(orderOf(bi, bj), mod(i, C.BW), mod(j, C.BH));
}

// ---------- the atlas and the blocks ----------

let atlas: HTMLImageElement[] | null = null;
let loading: Promise<void> | null = null;

export function loadAtlas(): Promise<void> | null {
  if (atlas) return null;
  if (loading) return loading;
  const handle = delayRender('Loading the canvas of hands', { timeoutInMilliseconds: 120000 });
  loading = Promise.all(Array.from({ length: ATLAS.pages }, (_, p) => new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`atlas page ${p} is missing: run npm run canvas`));
    im.src = staticFile(`atlas/page-${String(p).padStart(2, '0')}.png`);
  }))).then((ims) => { atlas = ims; }).finally(() => continueRender(handle));
  return loading;
}

function drawFromAtlas(ctx: CanvasRenderingContext2D, h: number, x: number, y: number, px: number) {
  if (!atlas) return;
  const { tile, per } = ATLAS;
  const page = Math.floor(h / (per * per)), k = h % (per * per);
  ctx.drawImage(atlas[page], (k % per) * tile, Math.floor(k / per) * tile, tile, tile, x, y, px, px);
}

function block(order: number) {
  let c = C.blocks[order];
  if (!c && atlas) {
    const pitch = BLOCK_CARD * (1 + GAP);
    c = document.createElement('canvas');
    c.width = Math.ceil(C.BW * pitch);
    c.height = Math.ceil(C.BH * pitch);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = RR.room;
    ctx.fillRect(0, 0, c.width, c.height);
    for (let j = 0; j < C.BH; j++) for (let i = 0; i < C.BW; i++) {
      drawFromAtlas(ctx, cell(order, i, j), i * pitch, j * pitch, BLOCK_CARD);
    }
    C.blocks[order] = c;
  }
  return c;
}

// ---------- live cards (big on screen) ----------

const live = new Map<string, HTMLCanvasElement>();
function liveCard(h: number, landedFrame: () => HTMLCanvasElement, px: number) {
  if (h < 0) return landedFrame();
  const b = 2 ** Math.ceil(Math.log2(px));
  const key = `${h}@${b}`;
  let c = live.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = b;
    paintCard(c.getContext('2d')!, hands[h], 0, 0, b);
    if (live.size > 400) live.clear();
    live.set(key, c);
  }
  return c;
}

let landed: { key: string; c: HTMLCanvasElement } | null = null;
/** The landing frame itself (its paper and the landed hand, as the flip drew it), kept to be shrunk. */
function landedCard(look: Look, S: number, st: FrameStyle) {
  const key = `${look.seed}~${look.style}@${S}|${st.paper}|${st.ink}`;
  if (landed?.key !== key) {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(ground(S, st.paper), 0, 0, S, S);
    for (const gr of phrase([look], geometry(S), st.ink)) drawInk(ctx, gr.p, gr.items, { emPx: gr.emPx, width: S, height: S, ink: st.ink });
    landed = { key, c };
  }
  return landed.c;
}

/** The card we stopped on, as it was when the flip stopped (paper and ink, no labels), S px. */
export const landedFrame = (look: Look, S: number, st: FrameStyle) => landedCard(look, S, st);

/**
 * Paint the canvas with the landing card filling `s` px (s = S: the landing frame exactly), centred.
 * Returns how many different writers are on screen (for the counter).
 */
export function drawCanvas(ctx: CanvasRenderingContext2D, S: number, s: number, landing: Look, st: FrameStyle): number {
  ctx.fillStyle = RR.room;
  ctx.fillRect(0, 0, S, S);
  const pitch = s * (1 + GAP);
  const c0 = S / 2 - s / 2; // the landing card's top-left
  const iMin = Math.floor(-c0 / pitch) - 1, iMax = Math.ceil((S - c0) / pitch);
  const cards = (iMax - iMin + 1) ** 2;
  if (s >= BLOCK_CARD || !atlas) {
    const seen = new Set<number>();
    for (let j = iMin; j <= iMax; j++) for (let i = iMin; i <= iMax; i++) {
      const x = c0 + i * pitch, y = c0 + j * pitch;
      if (x > S || y > S || x + s < 0 || y + s < 0) continue;
      const h = handAt(i, j);
      if (h >= 0) {
        if (s > ATLAS.tile) ctx.drawImage(liveCard(h, () => landedCard(landing, S, st), s), x, y, s, s);
        else drawFromAtlas(ctx, h, x, y, s);
      }
      if (seen.size < C.n + 1) seen.add(h);
    }
    ctx.drawImage(landedCard(landing, S, st), c0, c0, s, s);
    return seen.size;
  }
  // specks: blocks of BW × BH cards, each block one of the four orders
  const bw = C.BW * pitch, bh = C.BH * pitch;
  const biMin = Math.floor(-c0 / bw) - 1, biMax = Math.ceil((S - c0) / bw);
  const bjMin = Math.floor(-c0 / bh) - 1, bjMax = Math.ceil((S - c0) / bh);
  for (let bj = bjMin; bj <= bjMax; bj++) for (let bi = biMin; bi <= biMax; bi++) {
    const x = c0 + bi * bw, y = c0 + bj * bh;
    if (x > S || y > S || x + bw < 0 || y + bh < 0) continue;
    const c = block(orderOf(bi, bj));
    if (c) ctx.drawImage(c, x, y, bw, bh);
  }
  // the landing card stays itself
  ctx.drawImage(landedCard(landing, S, st), c0, c0, s, s);
  return Math.min(C.n + 1, cards);
}

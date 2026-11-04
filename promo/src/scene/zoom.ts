// Section 3: the flip stops dead, and the camera pulls back from the hand it landed on into a canvas of thousands of
// cards, each "If this / finds you" in another writer's hand, on that writer's paper in that writer's ink. It keeps
// pulling back until every card is a speck.
//
// 4096 writers (scripts/canvas-hands.mjs, the site's sampler) are drawn once into atlas pages (the Atlas composition:
// 16 pages of 16 × 16 cards at 128 px, public/atlas/). Big cards are drawn live by the engine at the size they're
// seen; mid-size ones come from the atlas; once cards are only a few pixels, blocks of 64 × 64 cards (every writer
// once, in one of four orders) are composed from the atlas and laid like tiles.
import { continueRender, delayRender, staticFile } from 'remotion';
import { getPaper } from '@/lib/papers';
import { drawInk, FLIP_INK, ground, RR } from './ink';
import type { Look } from './hands';
import { geometry, phrase } from './phrase';
import canvasHands from '../data/canvas-hands.json';

export const ATLAS = { tile: 128, per: 16, pages: 16 };
export const N = ATLAS.per * ATLAS.per * ATLAS.pages; // 4096
export const hands = canvasHands as Look[];
/** the gap between cards, as a share of a card */
const GAP = 0.06;
const BLOCK = 64; // cards a side in a block (64² = 4096: every writer once)
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
// four orders of the 4096 writers (a block uses one, chosen by where it lies)
const ORDERS = [0, 1, 2, 3].map((k) => {
  const a = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) { const j = mix(i, k + 7) % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
});
const mod = (a: number, m: number) => ((a % m) + m) % m;
const orderOf = (bi: number, bj: number) => mix(bi + 101, bj - 57) & 3;
/** the writer at card (i, j); card (0, 0) is the hand the flip landed on (-1) */
export function handAt(i: number, j: number) {
  if (i === 0 && j === 0) return -1;
  const bi = Math.floor(i / BLOCK), bj = Math.floor(j / BLOCK);
  return ORDERS[orderOf(bi, bj)][mod(j, BLOCK) * BLOCK + mod(i, BLOCK)];
}

// ---------- the atlas and the blocks ----------

let atlas: HTMLImageElement[] | null = null;
let loading: Promise<void> | null = null;
const blocks: (HTMLCanvasElement | null)[] = [null, null, null, null];

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
  let c = blocks[order];
  if (!c && atlas) {
    const pitch = BLOCK_CARD * (1 + GAP);
    c = document.createElement('canvas');
    c.width = c.height = Math.ceil(BLOCK * pitch);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = RR.room;
    ctx.fillRect(0, 0, c.width, c.height);
    for (let j = 0; j < BLOCK; j++) for (let i = 0; i < BLOCK; i++) {
      drawFromAtlas(ctx, ORDERS[order][j * BLOCK + i], i * pitch, j * pitch, BLOCK_CARD);
    }
    blocks[order] = c;
  }
  return c;
}

// ---------- live cards (big on screen) ----------

const live = new Map<string, HTMLCanvasElement>();
function liveCard(h: number, landing: Look, landedFrame: () => HTMLCanvasElement, px: number) {
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
/** The landing frame itself (paper and the landed hand, as the flip drew it), kept to be shrunk. */
function landedCard(look: Look, S: number) {
  const key = `${look.seed}~${look.style}@${S}`;
  if (landed?.key !== key) {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(ground(S), 0, 0, S, S);
    for (const gr of phrase([look], geometry(S), FLIP_INK)) drawInk(ctx, gr.p, gr.items, { emPx: gr.emPx, width: S, height: S, ink: FLIP_INK });
    landed = { key, c };
  }
  return landed.c;
}

/** The card we stopped on, as it was when the flip stopped (paper and ink, no labels), S px. */
export const landedFrame = (look: Look, S: number) => landedCard(look, S);

/**
 * The card we stopped on keeps a light red plate under it, so the eye can follow it all the way out: a red frame
 * round the card while it's big, a red dot once it's a speck (the plate never gets smaller than ~14 px at 1080).
 */
function trackPlate(ctx: CanvasRenderingContext2D, S: number, s: number) {
  const k = S / 1080;
  const pad = Math.max(0.03 * s, 6 * k);
  const c0 = S / 2 - s / 2;
  // stronger as the card gets small, so the dot still finds the eye among the specks
  const small = Math.min(1, Math.max(0, Math.log2(S / s) / Math.log2(400)));
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(c0 - pad, c0 - pad, s + 2 * pad, s + 2 * pad, Math.max(3 * k, 0.04 * s));
  ctx.fillStyle = RR.card;
  ctx.fill();
  ctx.fillStyle = `rgba(155, 59, 42, ${0.13 + 0.67 * small})`;
  ctx.fill();
  ctx.restore();
}

/**
 * Paint the canvas with the landing card filling `s` px (s = S: the landing frame exactly), centred.
 * Returns how many different writers are on screen (for the counter).
 */
export function drawCanvas(ctx: CanvasRenderingContext2D, S: number, s: number, landing: Look): number {
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
        if (s > ATLAS.tile) ctx.drawImage(liveCard(h, landing, () => landedCard(landing, S), s), x, y, s, s);
        else drawFromAtlas(ctx, h, x, y, s);
      }
      if (seen.size < N + 1) seen.add(h);
    }
    trackPlate(ctx, S, s);
    ctx.drawImage(landedCard(landing, S), c0, c0, s, s);
    return seen.size;
  }
  // specks: blocks of 64 × 64 cards, each block one of the four orders
  const bp = BLOCK * pitch;
  const bMin = Math.floor((iMin * pitch) / bp) - 1, bMax = Math.ceil((iMax * pitch) / bp) + 1;
  for (let bj = bMin; bj <= bMax; bj++) for (let bi = bMin; bi <= bMax; bi++) {
    const x = c0 + bi * bp, y = c0 + bj * bp;
    if (x > S || y > S || x + bp < 0 || y + bp < 0) continue;
    const c = block(orderOf(bi, bj));
    if (c) ctx.drawImage(c, x, y, bp, bp);
  }
  // the landing card stays itself, on its plate
  trackPlate(ctx, S, s);
  ctx.drawImage(landedCard(landing, S), c0, c0, s, s);
  return Math.min(N + 1, cards);
}

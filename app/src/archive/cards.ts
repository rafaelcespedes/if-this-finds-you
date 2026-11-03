// Card images: written by workers (card.worker.ts), visible cards first, nearest the top of the screen first; cards
// scrolled away before their turn are never written. Results stay for the visit (object URLs), and in production
// also in the browser's Cache Storage, keyed by the worker build, so a second visit shows them at once.
import workerSrc from './card.worker.ts?worker&url';
import type { Look } from './model';
import type { CardLetter, CardRequest, CardResult } from './card-protocol';

export interface CardImage {
  url: string;
  look: Look;
  /** the sheet in the image, px; the image is `bleed` px larger on every side (a shaped sheet's own shadow) */
  width: number;
  height: number;
  bleed: number;
  shaped: boolean;
  /** written this visit (fades in) or found in a cache (shows at once) */
  fresh: boolean;
}

interface Want {
  key: string;
  letter: CardLetter;
  hand?: string;
  /** raster and on-screen widths (cardSize), and the sheet's height for its width */
  width: number;
  css: number;
  aspect: number;
  el: Element;
}

const PERSIST = !import.meta.env.DEV && typeof caches !== 'undefined';
const CACHE_NAME = 'lost-letters-cards';
// a new worker build (engine or renderer changed) gets new keys; old entries are cleared below
const BUILD = workerSrc.split('/').pop()?.replace(/\W+/g, '-') ?? 'dev';

/**
 * A card shown `css` px wide: that width in steps of 20 px, and its raster width at the screen's density (at most
 * 2x). Steps keep cached images reusable between similar screens.
 */
export function cardSize(css: number) {
  const dpr = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
  const step = Math.max(140, Math.round(css / 20) * 20);
  return { css: step, width: Math.min(960, Math.ceil((step * dpr) / 80) * 80) };
}

export const cardKey = (id: string, hand: string | undefined, size: { css: number; width: number }) => `${id}|${hand ?? ''}|${size.css}@${size.width}`;

class CardStore {
  private done = new Map<string, CardImage>();
  private failed = new Set<string>();
  private wanted = new Map<string, Want>();
  private running = new Set<string>();
  private listeners = new Map<string, Set<() => void>>();
  private pool: { worker: Worker; job: number | null; key: string | null }[] = [];
  private jobs = 0;
  private cache: Promise<Cache | null> | null = null;
  /** QA: timings (window.__lostLetters) */
  stats = { firstCardMs: 0, firstShownMs: 0, rendered: [] as number[], cached: 0 };

  get(key: string) { return this.done.get(key); }

  subscribe(key: string, fn: () => void) {
    let set = this.listeners.get(key);
    if (!set) this.listeners.set(key, (set = new Set()));
    set.add(fn);
    return () => { set!.delete(fn); };
  }

  /** A card is near the screen: write it when its turn comes. */
  want(w: Want) {
    if (this.done.has(w.key) || this.failed.has(w.key)) return;
    this.wanted.set(w.key, w);
    this.pump();
  }
  /** Scrolled away: drop it unless it's already being written. */
  unwant(key: string) { this.wanted.delete(key); }

  private emit(key: string) { this.listeners.get(key)?.forEach((fn) => fn()); }

  /** Start the workers now, while the letters download: they load the engine and warm up its renderer. */
  warm() {
    this.ensurePool();
  }

  private ensurePool() {
    if (this.pool.length) return;
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
    const n = cores >= 6 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      // built as a classic worker (the build's worker format); in development it's served as a module
      const worker = new Worker(workerSrc, { type: import.meta.env.DEV ? 'module' : 'classic', name: 'lost-letters-cards' });
      const slot = { worker, job: null as number | null, key: null as string | null };
      worker.onmessage = (e: MessageEvent<CardResult>) => this.finished(slot, e.data);
      worker.onerror = () => { if (slot.key) this.fail(slot.key); slot.job = null; slot.key = null; this.pump(); };
      worker.postMessage({ warm: true });
      this.pool.push(slot);
    }
  }

  private persistent() {
    if (!PERSIST) return Promise.resolve(null);
    this.cache ??= caches.open(CACHE_NAME).then(async (c) => {
      // entries from older builds can go
      try {
        for (const req of await c.keys()) if (!new URL(req.url).pathname.includes(`/${BUILD}/`)) c.delete(req);
      } catch { /* fine */ }
      return c;
    }).catch(() => null);
    return this.cache;
  }
  private cacheUrl = (key: string) => `${location.origin}/__lost-letters/${BUILD}/${encodeURIComponent(key)}`;

  /** The next card to write: on screen first (top to bottom), then just below, then just above. */
  private next(): Want | null {
    let best: Want | null = null;
    let bestScore = Infinity;
    const vh = window.innerHeight;
    for (const w of this.wanted.values()) {
      if (this.running.has(w.key)) continue;
      const r = w.el.getBoundingClientRect();
      if (!r.width && !r.height) continue; // hidden (the letter page is open)
      const score = r.bottom > 0 && r.top < vh ? r.top : r.top >= vh ? 10000 + (r.top - vh) : 20000 - r.bottom;
      if (score < bestScore) { bestScore = score; best = w; }
    }
    return best;
  }

  private pump() {
    this.ensurePool();
    for (const slot of this.pool) {
      if (slot.job != null) continue;
      const w = this.next();
      if (!w) return;
      this.wanted.delete(w.key);
      this.running.add(w.key);
      const job = ++this.jobs;
      slot.job = job;
      slot.key = w.key;
      this.fromCache(w).then((hit) => {
        if (slot.job !== job) return;
        if (hit) {
          slot.job = null;
          slot.key = null;
          this.pump();
          return;
        }
        const req: CardRequest = { job, letter: w.letter, hand: w.hand, width: w.width, css: w.css, aspect: w.aspect };
        slot.worker.postMessage(req);
      });
    }
  }

  private async fromCache(w: Want) {
    const c = await this.persistent();
    if (!c) return false;
    try {
      const res = await c.match(this.cacheUrl(w.key));
      if (!res) return false;
      const look = JSON.parse(decodeURIComponent(res.headers.get('x-look') ?? '')) as Look;
      const num = (h: string) => Number(res.headers.get(h));
      const blob = await res.blob();
      this.stats.cached++;
      this.store(w.key, { url: URL.createObjectURL(blob), look, width: num('x-width'), height: num('x-height'), bleed: num('x-bleed'), shaped: res.headers.get('x-shaped') === '1', fresh: false });
      return true;
    } catch {
      return false;
    }
  }

  private finished(slot: (typeof this.pool)[number], msg: CardResult) {
    if (slot.job !== msg.job) return;
    const key = slot.key!;
    slot.job = null;
    slot.key = null;
    if ('error' in msg) {
      if (import.meta.env.DEV) console.warn('[lost letters] card failed', msg.id, msg.error);
      this.fail(key);
    } else {
      this.stats.rendered.push(Math.round(msg.ms));
      this.store(key, { url: URL.createObjectURL(msg.blob), look: msg.look, width: msg.width, height: msg.height, bleed: msg.bleed, shaped: msg.shaped, fresh: true });
      this.persistent().then((c) => c?.put(this.cacheUrl(key), new Response(msg.blob, {
        headers: {
          'content-type': msg.blob.type, 'x-look': encodeURIComponent(JSON.stringify(msg.look)),
          'x-width': String(msg.width), 'x-height': String(msg.height), 'x-bleed': String(msg.bleed), 'x-shaped': msg.shaped ? '1' : '0',
        },
      })).catch(() => {}));
    }
    this.pump();
  }

  private store(key: string, img: CardImage) {
    this.running.delete(key);
    this.done.set(key, img);
    if (!this.stats.firstCardMs) {
      this.stats.firstCardMs = Math.round(performance.now());
      performance.mark?.('lost-letters:first-card');
    }
    this.emit(key);
  }

  private fail(key: string) {
    this.running.delete(key);
    this.failed.add(key);
    this.emit(key);
  }

  hasFailed(key: string) { return this.failed.has(key); }

  /** A card's image is on screen (QA: the first one is "first card visible"). */
  shown() {
    if (this.stats.firstShownMs) return;
    this.stats.firstShownMs = Math.round(performance.now());
    performance.mark?.('lost-letters:first-card-shown');
  }

  /** The look a card was written in (so the letter page doesn't have to work it out again). */
  lookOf(id: string, hand?: string): Look | undefined {
    for (const [k, v] of this.done) if (k.startsWith(`${id}|${hand ?? ''}|`)) return v.look;
    return undefined;
  }
}

export const cards = new CardStore();
(globalThis as unknown as { __lostLetters: unknown }).__lostLetters = cards;

// Card images: written by workers (card.worker.ts), visible cards first, nearest the top of the screen first; cards
// scrolled away before their turn are never written. Results stay for the visit (object URLs), and in production
// also in the browser's Cache Storage, keyed by the worker build, so a second visit shows them at once.
import workerSrc from './card.worker.ts?worker&url';
import type { Look } from './model';
import type { CardLetter, CardRequest, CardResult } from './card-protocol';
import { wearLevel } from '@/lib/paper/wear';
import { reloadForNewVersion, workerDidNotLoad } from '@/lib/stale-build';

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
  /** the whole first sheet at its paper's own size (card-protocol.ts) */
  full?: boolean;
  el: Element;
}

/** The Cache API, or null where it's missing or blocked: with site data blocked (Firefox), even reading `caches`
 * throws a SecurityError ("The operation is insecure"), so the cards simply aren't kept between visits. */
function cacheStorage(): CacheStorage | null {
  try {
    return typeof caches !== 'undefined' ? caches : null;
  } catch {
    return null;
  }
}
const PERSIST = !import.meta.env.DEV && cacheStorage() !== null;
const CACHE_NAME = 'lost-letters-cards';
// a new worker build (engine or renderer changed) gets new keys; old entries are cleared below
const BUILD = workerSrc.split('/').pop()?.replace(/\W+/g, '-') ?? 'dev';

/**
 * A card shown `css` px wide: that width in steps of 20 px, and its raster width at the screen's density (to 3x: at
 * 2x a phone's cards were soft). Steps keep cached images reusable between similar screens.
 */
export function cardSize(css: number) {
  const dpr = Math.min(3, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
  const step = Math.max(140, Math.round(css / 20) * 20);
  return { css: step, width: Math.min(960, Math.ceil((step * dpr) / 80) * 80) };
}

export const cardKey = (id: string, hand: string | undefined, size: { css: number; width: number }) => `${id}|${hand ?? ''}|${size.css}@${size.width}${wearLevel() ? `|w${wearLevel()}` : ''}`;

class CardStore {
  private done = new Map<string, CardImage>();
  private failed = new Set<string>();
  private wanted = new Map<string, Want>();
  private running = new Set<string>();
  private listeners = new Map<string, Set<() => void>>();
  private pool: { worker: Worker; job: number | null; key: string | null }[] = [];
  private jobs = 0;
  /** what each slot is writing, so leaving the page can put it back on the list */
  private inflight = new Map<number, Want>();
  /** the page is hidden or going away (pagehide): nothing more is written, read or kept until it shows again */
  private hidden = false;
  private cache: Promise<Cache | null> | null = null;
  /** QA: timings (window.__lostLetters) */
  stats = { firstCardMs: 0, firstShownMs: 0, rendered: [] as number[], cached: 0 };

  constructor() {
    // Leaving All letters while its cards are being written: WebKit stops the page's context, and any Cache Storage
    // or blob work still under way then fails ("Context is stopped", "… access control checks"). So on pagehide the
    // store stops: what was being written goes back on the list and its result, if it comes, is dropped. If the page
    // comes back from the back-forward cache (pageshow), it carries on.
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.hide());
      window.addEventListener('pageshow', () => this.show());
    }
  }

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

  private hide() {
    this.hidden = true;
    for (const slot of this.pool) {
      if (slot.job == null) continue;
      const w = this.inflight.get(slot.job);
      if (w && slot.key) {
        this.running.delete(slot.key);
        this.wanted.set(slot.key, w);
      }
      this.inflight.delete(slot.job);
      // the worker may still answer this job: finished() drops it, as the slot no longer expects it
      slot.job = null;
      slot.key = null;
    }
  }
  private show() {
    if (!this.hidden) return;
    this.hidden = false;
    this.pump();
  }

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
      const worker = new Worker(workerSrc, { type: 'module', name: 'lost-letters-cards' });
      const slot = { worker, job: null as number | null, key: null as string | null };
      worker.onmessage = (e: MessageEvent<CardResult>) => this.finished(slot, e.data);
      worker.onerror = (e) => {
        // its script gone (a new version of the site arrived): the page reloads onto it
        if (workerDidNotLoad(e) && reloadForNewVersion()) return;
        if (slot.job != null) this.inflight.delete(slot.job);
        if (slot.key) this.fail(slot.key); slot.job = null; slot.key = null; this.pump();
      };
      worker.postMessage({ warm: true });
      this.pool.push(slot);
    }
  }

  /** The cache, opened once a visit (opening it again on every call left promises nobody caught). */
  private persistent() {
    if (this.cache) return this.cache;
    const store = PERSIST ? cacheStorage() : null;
    if (!store) return Promise.resolve(null);
    let opened: Promise<Cache>;
    try {
      opened = store.open(CACHE_NAME);
    } catch {
      return Promise.resolve(null);
    }
    this.cache = opened.then(async (c) => {
      // entries from older builds can go (each in its own time: one that fails, as the page goes, is let be)
      try {
        for (const req of await c.keys()) if (!new URL(req.url).pathname.includes(`/${BUILD}/`)) c.delete(req).catch(() => {});
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
    if (this.hidden) return;
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
      this.inflight.set(job, w);
      this.fromCache(w).then((hit) => {
        if (slot.job !== job) return;
        if (hit) {
          this.inflight.delete(job);
          slot.job = null;
          slot.key = null;
          this.pump();
          return;
        }
        const req: CardRequest = { job, letter: w.letter, hand: w.hand, width: w.width, css: w.css, aspect: w.aspect, full: w.full, wear: wearLevel() };
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
      // as bytes, like a written card (card-protocol.ts CardResult)
      const bytes = await res.arrayBuffer();
      // the page went while it was read: hide() has put the card back on the list
      if (this.hidden) return false;
      this.stats.cached++;
      const blob = new Blob([bytes], { type: res.headers.get('content-type') ?? 'image/webp' });
      this.store(w.key, { url: URL.createObjectURL(blob), look, width: num('x-width'), height: num('x-height'), bleed: num('x-bleed'), shaped: res.headers.get('x-shaped') === '1', fresh: false });
      return true;
    } catch {
      return false;
    }
  }

  private finished(slot: (typeof this.pool)[number], msg: CardResult) {
    if (slot.job !== msg.job) return;
    this.inflight.delete(msg.job);
    const key = slot.key!;
    slot.job = null;
    slot.key = null;
    if ('error' in msg) {
      if (import.meta.env.DEV) console.warn('[lost letters] card failed', msg.id, msg.error);
      this.fail(key);
    } else {
      this.stats.rendered.push(Math.round(msg.ms));
      this.store(key, { url: URL.createObjectURL(new Blob([msg.bytes], { type: msg.type })), look: msg.look, width: msg.width, height: msg.height, bleed: msg.bleed, shaped: msg.shaped, fresh: true });
      void this.keep(key, msg);
    }
    this.pump();
  }

  /**
   * Keep a written card in Cache Storage for the next visit. It goes in as bytes, never as a Blob: given a Blob,
   * WebKit's put loads it, and if the page goes meanwhile (leaving All letters while its cards are being written) the
   * load fails as "Cannot load blob … due to access control checks" or "Context is stopped", reported as uncaught
   * whatever catches it. Bytes have nothing to load.
   */
  private async keep(key: string, msg: Extract<CardResult, { bytes: ArrayBuffer }>) {
    try {
      const c = await this.persistent();
      if (!c || this.hidden) return;
      await c.put(this.cacheUrl(key), new Response(msg.bytes, {
        headers: {
          'content-type': msg.type, 'x-look': encodeURIComponent(JSON.stringify(msg.look)),
          'x-width': String(msg.width), 'x-height': String(msg.height), 'x-bleed': String(msg.bleed), 'x-shaped': msg.shaped ? '1' : '0',
        },
      }));
    } catch { /* not kept: written again next visit */ }
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

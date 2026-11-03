// The page's side of the Fonts workers: one or two workers (fonts.worker.ts) that load the engine once; the first
// also chooses the sets. A set arrives hand by hand; specimens are written for rows near the screen only, the ones
// on screen first (top to bottom), then just below, then just above. Rows scrolled away before their turn are never
// written. Results stay for the visit, so going back to a set (or a size) shows it at once.
import { useEffect, useState, useSyncExternalStore } from 'react';
import workerSrc from './fonts.worker.ts?worker&url';
import { STATIC_CATALOGUE, filterKey, type Catalogue, type Filters } from './filters';
import type { FontEntry, FromWorker, RenderSpec, ToWorker } from './protocol';

export interface Specimen {
  key: string;
  /** plain: SVG markup in currentColor; ink: an image of the paper strip */
  svg?: string;
  url?: string;
  /** what it was written for (a newer size shows the old one scaled until its own arrives) */
  emPx: number;
  width: number;
  height: number;
  clipped: boolean;
  /** written this visit (fades in) or kept (shows at once) */
  fresh: boolean;
}

export interface SetState {
  key: string;
  entries: (FontEntry | undefined)[];
  /** all picked (or the filters ran out) */
  done: boolean;
  exhausted: boolean;
  found: number;
  failed: boolean;
}

interface Want { key: string; entry: FontEntry; spec: RenderSpec; el: Element }
interface Slot { worker: Worker; job: number | null; key: string | null }

export const specimenKey = (e: FontEntry, s: RenderSpec) => `${e.id}|${e.neatOnly ? 1 : 0}|${s.mode}|${s.emPx}|${s.width}|${s.lines}|${s.dpr}|${s.text}`;

const EMPTY_SET: SetState = { key: '', entries: [], done: false, exhausted: false, found: 0, failed: false };

class FontStore {
  private pool: Slot[] = [];
  private jobs = 0;
  private done = new Map<string, Specimen>();
  private failed = new Set<string>();
  private wanted = new Map<string, Want>();
  private running = new Map<number, string>();
  private listeners = new Map<string, Set<() => void>>();
  private setListeners = new Set<() => void>();
  private catListeners = new Set<() => void>();
  private set: SetState = EMPTY_SET;
  private setReq = 0;
  /** sets already drawn this visit (Back to a set shows it at once) */
  private sets = new Map<string, SetState>();
  catalogue: Catalogue = STATIC_CATALOGUE;
  ready = false;
  sampler: 'engine' | 'app' = 'app';
  /** QA: timings (window.__fonts) */
  stats = { start: performance.now(), firstEntryMs: 0, firstRowMs: 0, tenthRowMs: 0, rows: 0, renderMs: [] as number[], setMs: 0 };

  private ensurePool() {
    if (this.pool.length) return;
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
    const n = cores >= 6 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      // built as a classic worker (the build's worker format); in development it's served as a module
      const worker = new Worker(workerSrc, { type: import.meta.env.DEV ? 'module' : 'classic', name: 'fonts' });
      const slot: Slot = { worker, job: null, key: null };
      worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(slot, e.data);
      worker.onerror = () => {
        if (slot.key) this.fail(slot.key);
        if (i === 0 && !this.set.done) this.updateSet({ ...this.set, done: true, failed: true });
        slot.job = null; slot.key = null; this.pump();
      };
      worker.postMessage({ type: 'hello' } satisfies ToWorker);
      this.pool.push(slot);
    }
  }

  /** Start the workers now: they load the engine while the page lays itself out. */
  warm() { this.ensurePool(); }

  // ---------- sets ----------

  getSet = () => this.set;
  subscribeSet = (fn: () => void) => { this.setListeners.add(fn); return () => { this.setListeners.delete(fn); }; };
  subscribeCatalogue = (fn: () => void) => { this.catListeners.add(fn); return () => { this.catListeners.delete(fn); }; };
  private updateSet(s: SetState) { this.set = s; if (s.key) this.sets.set(s.key, s); this.setListeners.forEach((fn) => fn()); }

  /** Ask for a set (the same seed and filters always give the same hands). */
  requestSet(setSeed: string, filters: Filters, count: number, neatOnly: boolean) {
    const key = `${setSeed}|${filterKey(filters)}|${neatOnly ? 'neat' : 'any'}|${count}`;
    if (this.set.key === key) return;
    const kept = this.sets.get(key);
    if (kept && kept.done && !kept.failed) { this.setReq++; this.updateSet(kept); return; }
    this.ensurePool();
    const req = ++this.setReq;
    this.updateSet({ key, entries: Array.from({ length: count }, () => undefined), done: false, exhausted: false, found: 0, failed: false });
    this.stats.firstEntryMs = 0;
    this.pool[0].worker.postMessage({ type: 'set', req, setSeed, filters, count, neatOnly } satisfies ToWorker);
  }

  /** Show a list that isn't drawn (the saved hands). */
  showEntries(key: string, entries: FontEntry[]) {
    this.setReq++;
    this.updateSet({ key, entries, done: true, exhausted: false, found: entries.length, failed: false });
  }

  // ---------- specimens ----------

  get(key: string) { return this.done.get(key); }
  hasFailed(key: string) { return this.failed.has(key); }
  subscribe(key: string, fn: () => void) {
    let s = this.listeners.get(key);
    if (!s) this.listeners.set(key, (s = new Set()));
    s.add(fn);
    return () => { s!.delete(fn); if (!s!.size) this.listeners.delete(key); };
  }
  private emit(key: string) { this.listeners.get(key)?.forEach((fn) => fn()); }

  /** A row is near the screen: write its specimen when its turn comes. */
  want(w: Want) {
    if (this.done.has(w.key) || this.failed.has(w.key)) return;
    this.wanted.set(w.key, w);
    this.pump();
  }
  /** Scrolled away (or its text or size changed): drop it unless it's being written. */
  unwant(key: string) { this.wanted.delete(key); }

  private next(): Want | null {
    let best: Want | null = null;
    let bestScore = Infinity;
    const vh = window.innerHeight;
    const busy = new Set(this.running.values());
    for (const w of this.wanted.values()) {
      if (busy.has(w.key)) continue;
      const r = w.el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
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
      const job = ++this.jobs;
      slot.job = job;
      slot.key = w.key;
      this.running.set(job, w.key);
      slot.worker.postMessage({ type: 'render', job, entry: w.entry, spec: w.spec } satisfies ToWorker);
    }
  }

  private receive(slot: Slot, m: FromWorker) {
    switch (m.type) {
      case 'ready':
        this.catalogue = m.catalogue;
        this.sampler = m.sampler;
        this.ready = true;
        this.catListeners.forEach((fn) => fn());
        return;
      case 'entry': {
        if (m.req !== this.setReq) return;
        if (!this.stats.firstEntryMs) this.stats.firstEntryMs = Math.round(performance.now() - this.stats.start);
        const entries = this.set.entries.slice();
        entries[m.index] = m.entry;
        this.updateSet({ ...this.set, entries, found: Math.max(this.set.found, m.index + 1) });
        return;
      }
      case 'set-done': {
        if (m.req !== this.setReq) return;
        this.stats.setMs = Math.round(m.ms);
        // a set that ran out of hands keeps only the rows it found
        const entries = this.set.entries.slice(0, m.found);
        this.updateSet({ ...this.set, entries, done: true, exhausted: m.exhausted, found: m.found });
        return;
      }
      case 'rendered': {
        if (slot.job !== m.job) return;
        const key = this.running.get(m.job)!;
        this.running.delete(m.job);
        slot.job = null; slot.key = null;
        const spec = Number(key.split('|')[3]);
        this.store(key, {
          key, svg: m.svg, url: m.blob ? URL.createObjectURL(m.blob) : undefined,
          emPx: spec, width: m.width, height: m.height, clipped: m.clipped, fresh: true,
        });
        this.stats.renderMs.push(Math.round(m.ms));
        this.pump();
        return;
      }
      case 'failed': {
        if (m.req != null) {
          if (m.req === this.setReq) this.updateSet({ ...this.set, done: true, failed: true });
          return;
        }
        if (m.job != null && slot.job === m.job) {
          const key = this.running.get(m.job)!;
          this.running.delete(m.job);
          slot.job = null; slot.key = null;
          if (import.meta.env.DEV) console.warn('[fonts] specimen failed', key, m.message);
          this.fail(key);
          this.pump();
        }
      }
    }
  }

  private store(key: string, s: Specimen) {
    this.done.set(key, s);
    // keep the visit's specimens within reason (oldest first; plain ones are small)
    if (this.done.size > 400) {
      const old = this.done.keys().next().value!;
      const v = this.done.get(old);
      if (v?.url) URL.revokeObjectURL(v.url);
      this.done.delete(old);
    }
    this.emit(key);
  }
  private fail(key: string) { this.failed.add(key); this.emit(key); }

  /** A row's specimen is on screen (QA: first row, tenth row). */
  shown() {
    this.stats.rows++;
    const t = Math.round(performance.now() - this.stats.start);
    if (this.stats.rows === 1) { this.stats.firstRowMs = t; performance.mark?.('fonts:first-row'); }
    if (this.stats.rows === 10) { this.stats.tenthRowMs = t; performance.mark?.('fonts:tenth-row'); }
  }
}

export const fonts = new FontStore();
(globalThis as unknown as { __fonts: unknown }).__fonts = fonts;

export function useSet() {
  return useSyncExternalStore(fonts.subscribeSet, fonts.getSet, fonts.getSet);
}
export function useCatalogue() {
  return useSyncExternalStore(fonts.subscribeCatalogue, () => fonts.catalogue, () => fonts.catalogue);
}

/**
 * A row's specimen: asked for while the row is near the screen, kept while it's away. While a new one is being
 * written (another size, text or width) the last one stays up, so nothing flashes.
 */
export function useSpecimen(entry: FontEntry | undefined, spec: RenderSpec, el: Element | null, near: boolean) {
  const key = entry ? specimenKey(entry, spec) : '';
  const [shown, setShown] = useState<Specimen | null>(() => (key ? fonts.get(key) ?? null : null));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!key) return;
    const hit = fonts.get(key);
    if (hit) { setShown({ ...hit, fresh: false }); setFailed(false); return; }
    const off = fonts.subscribe(key, () => {
      const s = fonts.get(key);
      if (s) setShown(s);
      setFailed(fonts.hasFailed(key));
    });
    if (near && el && entry) fonts.want({ key, entry, spec, el });
    return () => { off(); fonts.unwant(key); };
    // spec is part of the key
  }, [key, near, el]);
  // a different hand in this row: nothing of the last one may stay up
  const own = shown && entry && shown.key.startsWith(entry.id + '|') ? shown : null;
  return { specimen: own, failed };
}

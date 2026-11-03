// The page's side of the Fonts workers: a few workers (fonts.worker.ts) that load the engine once; the first also
// draws the sets. Specimens are made for rows near the screen only, the ones on screen first (top to bottom), then
// just below, then just above; rows scrolled away before their turn are never made. Results stay for the visit, so
// Back to a set, another size or the same words again show at once.
//
// As a font, a row's specimen is its real font: the worker builds it for the characters the row shows, and the page
// adds it to document.fonts and sets the line in it. Live hand, it's an image of the engine's live writing.
import { useEffect, useState, useSyncExternalStore } from 'react';
import workerSrc from './fonts.worker.ts?worker&url';
import { constraintsOf, filterKey, STATIC_CATALOGUE, type Catalogue, type Filters } from './filters';
import type { FontEntry, FromWorker, HandRecord, LiveSpec, Opening, ToWorker } from './protocol';

export interface LiveImage {
  key: string;
  url: string;
  emPx: number;
  width: number;
  height: number;
  clipped: boolean;
  fresh: boolean;
}
export interface FontFile {
  /** the CSS font-family it's loaded under */
  family: string;
  /** the characters it has */
  chars: string;
  fresh: boolean;
}

export interface SetState {
  key: string;
  entries: FontEntry[];
  /** how many hands are still being drawn (placeholders: the first page, then each "Show more") */
  pending: number;
  done: boolean;
  exhausted: boolean;
  note: string | null;
  failed: boolean;
  pages: number;
  opening: Opening | null;
}

type Job =
  | { kind: 'font'; key: string; entry: FontEntry; chars: string; el: Element }
  | { kind: 'live'; key: string; entry: FontEntry; spec: LiveSpec; el: Element };
interface Slot { worker: Worker; job: number | null; key: string | null }

export const liveKey = (e: FontEntry, s: LiveSpec) => `live|${e.id}|${e.neatOnly ? 1 : 0}|${s.emPx}|${s.width}|${s.lines}|${s.dpr}|${s.text}`;
const fontKey = (e: FontEntry) => `font|${e.id}|${e.neatOnly ? 1 : 0}`;

const EMPTY: SetState = { key: '', entries: [], pending: 0, done: false, exhausted: false, note: null, failed: false, pages: 0, opening: null };

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
const covers = (have: string, want: string) => { for (const c of want) if (c !== '\n' && !have.includes(c)) return false; return true; };

class FontStore {
  private pool: Slot[] = [];
  private jobs = 0;
  private live = new Map<string, LiveImage>();
  private fonts = new Map<string, FontFile & { face: FontFace }>();
  private failed = new Set<string>();
  private wanted = new Map<string, Job>();
  private running = new Map<number, Job>();
  private listeners = new Map<string, Set<() => void>>();
  private setListeners = new Set<() => void>();
  private catListeners = new Set<() => void>();
  private set: SetState = EMPTY;
  private setReq = 0;
  private setArgs: { setSeed: string; filters: Filters; count: number; neatOnly: boolean } | null = null;
  /** sets already drawn this visit (Back to a set shows it at once) */
  private sets = new Map<string, SetState>();
  private faces = 0;
  catalogue: Catalogue = STATIC_CATALOGUE;
  ready = false;
  /** QA: timings (window.__fonts) */
  stats = { start: performance.now(), setMs: 0, setShownMs: 0, firstRowMs: 0, tenthRowMs: 0, rows: 0, fontMs: [] as number[], liveMs: [] as number[] };

  private ensurePool() {
    if (this.pool.length) return;
    // fonts take a few hundred ms each to build: a worker per two cores on a big machine, fewer on phones
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
    const phone = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    const n = cores >= 8 && !phone ? 4 : cores >= 4 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      // built as a classic worker (the build's worker format); in development it's served as a module
      const worker = new Worker(workerSrc, { type: 'module', name: 'fonts' });
      const slot: Slot = { worker, job: null, key: null };
      worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(slot, e.data);
      worker.onerror = () => {
        if (slot.key) this.fail(slot.key);
        if (i === 0 && !this.set.done) this.updateSet({ ...this.set, done: true, failed: true, pending: 0 });
        slot.job = null; slot.key = null; this.pump();
      };
      worker.postMessage({ type: 'hello' } satisfies ToWorker);
      this.pool.push(slot);
    }
  }

  /** Start the workers now: they load the engine while the page lays out. */
  warm() { this.ensurePool(); }

  // ---------- sets ----------

  getSet = () => this.set;
  subscribeSet = (fn: () => void) => { this.setListeners.add(fn); return () => { this.setListeners.delete(fn); }; };
  subscribeCatalogue = (fn: () => void) => { this.catListeners.add(fn); return () => { this.catListeners.delete(fn); }; };
  private updateSet(s: SetState) { this.set = s; if (s.key) this.sets.set(s.key, s); this.setListeners.forEach((fn) => fn()); }

  /** Ask for a set (the same seed and filters always give the same hands). */
  requestSet(setSeed: string, filters: Filters, count: number, neatOnly: boolean) {
    const key = `${setSeed}|${filterKey(filters)}|${neatOnly ? 'neat' : 'any'}|${count}`;
    this.setArgs = { setSeed, filters, count, neatOnly };
    if (this.set.key === key) return;
    const kept = this.sets.get(key);
    if (kept && kept.done && !kept.failed) { this.setReq++; this.updateSet(kept); return; }
    this.updateSet({ ...EMPTY, key, pending: count });
    this.ask(0);
  }

  /** The next page of the same set ("Show more"): kept away from the hands already shown, never repeating one. */
  more() {
    const a = this.setArgs;
    if (!a || !this.set.done || this.set.failed) return;
    this.updateSet({ ...this.set, done: false, pending: a.count });
    this.ask(this.set.pages);
  }

  private ask(page: number) {
    const a = this.setArgs!;
    this.ensurePool();
    const req = ++this.setReq;
    this.stats.setShownMs = 0;
    this.pool[0].worker.postMessage({
      type: 'set', req, setSeed: a.setSeed, page, count: a.count, neatOnly: a.neatOnly, constraints: constraintsOf(a.filters, a.neatOnly, this.catalogue),
    } satisfies ToWorker);
  }

  /** Show a list that isn't drawn (the saved hands). */
  showEntries(key: string, entries: FontEntry[]) {
    this.setReq++;
    this.updateSet({ ...EMPTY, key, entries, done: true, pages: 1 });
  }

  // ---------- specimens ----------

  getFont(e: FontEntry) { return this.fonts.get(fontKey(e)); }
  getLive(key: string) { return this.live.get(key); }
  hasFailed(key: string) { return this.failed.has(key); }
  subscribe(key: string, fn: () => void) {
    let s = this.listeners.get(key);
    if (!s) this.listeners.set(key, (s = new Set()));
    s.add(fn);
    return () => { s!.delete(fn); if (!s!.size) this.listeners.delete(key); };
  }
  private emit(key: string) { this.listeners.get(key)?.forEach((fn) => fn()); }

  /** A row near the screen wants its font, with at least these characters. */
  wantFont(entry: FontEntry, chars: string, el: Element) {
    const key = fontKey(entry);
    const have = this.fonts.get(key);
    if ((have && covers(have.chars, chars)) || this.failed.has(key)) return key;
    // one build that has what the row had and what it needs now
    const all = [...new Set([...(have?.chars ?? ''), ...chars])].join('');
    const running = [...this.running.values()].find((j) => j.key === key) as Extract<Job, { kind: 'font' }> | undefined;
    if (running && covers(running.chars, all)) return key;
    this.wanted.set(key, { kind: 'font', key, entry, chars: all, el });
    this.pump();
    return key;
  }
  /** A row near the screen wants its live writing. */
  wantLive(entry: FontEntry, spec: LiveSpec, el: Element) {
    const key = liveKey(entry, spec);
    if (this.live.has(key) || this.failed.has(key)) return key;
    this.wanted.set(key, { kind: 'live', key, entry, spec, el });
    this.pump();
    return key;
  }
  /** Scrolled away (or its text or size changed): drop it unless it's being made. */
  unwant(key: string) { this.wanted.delete(key); }

  private next(): Job | null {
    let best: Job | null = null;
    let bestScore = Infinity;
    const vh = window.innerHeight;
    const busy = new Set([...this.running.values()].map((j) => j.key));
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
      this.running.set(job, w);
      slot.worker.postMessage((w.kind === 'font'
        ? { type: 'font', job, entry: w.entry, chars: w.chars }
        : { type: 'live', job, entry: w.entry, spec: w.spec }) satisfies ToWorker);
    }
  }

  private finish(slot: Slot, jobId: number) {
    const job = this.running.get(jobId);
    this.running.delete(jobId);
    if (slot.job === jobId) { slot.job = null; slot.key = null; }
    return job;
  }

  private receive(slot: Slot, m: FromWorker) {
    switch (m.type) {
      case 'ready':
        this.catalogue = m.catalogue;
        this.ready = true;
        this.catListeners.forEach((fn) => fn());
        return;
      case 'set': {
        if (m.req !== this.setReq) return;
        this.stats.setMs = Math.round(m.ms);
        this.stats.setShownMs = Math.round(performance.now() - this.stats.start);
        const first = this.set.pages === 0;
        this.updateSet({
          ...this.set, entries: first ? m.entries : [...this.set.entries, ...m.entries], pending: 0, done: true,
          exhausted: m.exhausted, note: first ? m.note : this.set.note ?? m.note, pages: this.set.pages + 1, opening: first ? m.opening : this.set.opening,
        });
        return;
      }
      case 'font': {
        const job = this.finish(slot, m.job);
        this.pump();
        if (!job || job.kind !== 'font') return;
        this.stats.fontMs.push(Math.round(m.ms));
        const family = `itfy-${hash(job.key)}-${++this.faces}`;
        const face = new FontFace(family, m.otf, { display: 'block' });
        face.load().then(() => {
          document.fonts.add(face);
          const old = this.fonts.get(job.key);
          this.fonts.set(job.key, { family, chars: m.chars, fresh: !old, face });
          if (old) setTimeout(() => document.fonts.delete(old.face), 1000);
          this.trimFonts();
          this.emit(job.key);
        }, () => this.fail(job.key));
        return;
      }
      case 'record': {
        this.recordJobs.get(m.job)?.(m.record);
        this.recordJobs.delete(m.job);
        return;
      }
      case 'live': {
        const job = this.finish(slot, m.job);
        this.pump();
        if (!job || job.kind !== 'live') return;
        this.stats.liveMs.push(Math.round(m.ms));
        this.live.set(job.key, { key: job.key, url: URL.createObjectURL(m.blob), emPx: job.spec.emPx, width: m.width, height: m.height, clipped: m.clipped, fresh: true });
        if (this.live.size > 240) {
          const old = this.live.keys().next().value!;
          URL.revokeObjectURL(this.live.get(old)!.url);
          this.live.delete(old);
        }
        this.emit(job.key);
        return;
      }
      case 'failed': {
        if (m.req != null) {
          if (m.req === this.setReq) this.updateSet({ ...this.set, done: true, failed: true, pending: 0 });
          return;
        }
        if (m.job != null) {
          const job = this.finish(slot, m.job);
          if (job) {
            if (import.meta.env.DEV) console.warn('[fonts] specimen failed', job.key, m.message);
            this.fail(job.key);
          }
          this.pump();
        }
      }
    }
  }

  /** Keep the loaded fonts within reason (the oldest go; a row asks again if it comes back). */
  private trimFonts() {
    if (this.fonts.size <= 160) return;
    const [k, v] = this.fonts.entries().next().value!;
    document.fonts.delete(v.face);
    this.fonts.delete(k);
  }
  private fail(key: string) { this.failed.add(key); this.emit(key); }

  /** A row's specimen is on screen (QA: first row, tenth row). */
  shown() {
    this.stats.rows++;
    const t = Math.round(performance.now() - this.stats.start);
    if (this.stats.rows === 1) { this.stats.firstRowMs = t; performance.mark?.('fonts:first-row'); }
    if (this.stats.rows === 10) { this.stats.tenthRowMs = t; performance.mark?.('fonts:tenth-row'); }
  }

  // ---------- a hand's record (asked of the first worker, kept for the visit) ----------
  private records = new Map<string, Promise<HandRecord>>();
  private recordJobs = new Map<number, (r: HandRecord) => void>();
  record(entry: FontEntry) {
    const key = `${entry.id}|${entry.neatOnly ? 1 : 0}`;
    let r = this.records.get(key);
    if (!r) {
      this.ensurePool();
      const job = ++this.jobs;
      r = new Promise<HandRecord>((resolve) => this.recordJobs.set(job, resolve));
      this.records.set(key, r);
      this.pool[0].worker.postMessage({ type: 'record', job, entry } satisfies ToWorker);
    }
    return r;
  }

  /** The whole font package for a hand (.otf, .ttf, licence, credits), built in a worker of its own. */
  download(entry: FontEntry) {
    return new Promise<{ zip: ArrayBuffer; filename: string }>((resolve, reject) => {
      const w = new Worker(workerSrc, { type: 'module', name: 'fonts-package' });
      w.onmessage = (e: MessageEvent<FromWorker>) => {
        const m = e.data;
        if (m.type === 'package') { w.terminate(); resolve({ zip: m.zip, filename: m.filename }); }
        else if (m.type === 'failed') { w.terminate(); reject(new Error(m.message)); }
      };
      w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'The font couldn’t be made')); };
      w.postMessage({ type: 'package', job: 1, entry } satisfies ToWorker);
    });
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

/** A row's font, asked for while the row is near the screen; grows when the words need letters it hasn't got. */
export function useRowFont(entry: FontEntry | undefined, chars: string, el: Element | null, near: boolean) {
  const [font, setFont] = useState(() => (entry ? fonts.getFont(entry) ?? null : null));
  const [failed, setFailed] = useState(false);
  const key = entry ? `${entry.id}|${entry.neatOnly ? 1 : 0}` : '';
  useEffect(() => {
    if (!entry) { setFont(null); return; }
    const k = `font|${key}`;
    const read = () => { const f = fonts.getFont(entry); setFont(f ? { ...f } : null); setFailed(fonts.hasFailed(k)); };
    read();
    const off = fonts.subscribe(k, read);
    if (near && el) fonts.wantFont(entry, chars, el);
    return () => { off(); fonts.unwant(k); };
  }, [key, chars, near, el]);
  return { font, failed };
}

/** A row's live writing; while a new one is made (another size, words or width) the last stays up. */
export function useRowLive(entry: FontEntry | undefined, spec: LiveSpec, el: Element | null, near: boolean, on: boolean) {
  const key = entry && on ? liveKey(entry, spec) : '';
  const [shown, setShown] = useState<LiveImage | null>(() => (key ? fonts.getLive(key) ?? null : null));
  useEffect(() => {
    if (!key || !entry) return;
    const hit = fonts.getLive(key);
    if (hit) { setShown({ ...hit, fresh: false }); return; }
    const off = fonts.subscribe(key, () => { const s = fonts.getLive(key); if (s) setShown(s); });
    if (near && el) fonts.wantLive(entry, spec, el);
    return () => { off(); fonts.unwant(key); };
  }, [key, near, el]);
  return shown && entry && shown.key.includes(`|${entry.id}|`) ? shown : null;
}

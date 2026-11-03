import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { WriteRequest, WriteResult } from '@/lib/write-protocol';
import { lookOf, type Req } from '@/lib/request';
import { perf } from '@/lib/perf';

/** Results kept by request, so a hand fetched ahead (or seen a moment ago) shows the instant it's asked for. */
const CACHE_SIZE = 12;
/** Workers writing hands ahead: two, so quick flipping uses them up no faster than they're written. */
const AHEAD_WORKERS = 2;

function spawn() {
  return new Worker(new URL('../workers/write.worker.ts', import.meta.url), { type: 'module' });
}

/**
 * The written page for a request, produced by a worker. Returns the newest finished result (the page keeps
 * showing the previous writing until the next one is ready), or a cached one at once. Requests are debounced
 * only when writing gets slow (long letters), so short notes update on every key.
 *
 * `prefetch(reqs)` writes the given requests ahead of time in a second worker, so the page's worker is never
 * busy with them; a newer call replaces the older list.
 */
export function useWriting(req: Req, paused = false) {
  const [result, setResult] = useState<WriteResult | null>(null);
  const worker = useRef<Worker | null>(null);
  const ahead = useRef<Worker[]>([]);
  const nextId = useRef(0);
  const sent = useRef(new Map<number, { at: number; key: string }>());
  const lastMs = useRef(0);
  const shown = useRef<WriteResult | null>(null);
  const cache = useRef(new Map<string, WriteResult>());
  const lastLook = useRef('');
  const [, bump] = useState(0);
  /** the worker couldn't start (blocked, offline, an old browser): the page says so instead of staying blank */
  const [failed, setFailed] = useState(false);
  // for debugging and QA: what's written ahead
  (window as unknown as { __seedhandCache: unknown }).__seedhandCache = cache.current;

  const remember = (r: WriteResult) => {
    if (!r.key) return;
    cache.current.delete(r.key);
    cache.current.set(r.key, r);
    while (cache.current.size > CACHE_SIZE) cache.current.delete(cache.current.keys().next().value!);
  };

  useEffect(() => {
    const w = spawn();
    worker.current = w;
    w.onmessage = (e: MessageEvent<WriteResult | { id: number; error: string }>) => {
      const data = e.data;
      if ('error' in data) {
        console.error('[seedhand] write failed:', data.error);
        toast.error('The hand couldn’t write this', { id: 'write-error', description: 'Try another hand, or shorten the letter.' });
        return;
      }
      const s = sent.current.get(data.id);
      if (s) {
        data.key = s.key;
        perf.samples.push({ name: data.partial ? 'request→first sheet' : 'request→writing', ms: performance.now() - s.at });
      }
      perf.samples.push({ name: data.partial ? 'worker first sheet' : 'worker write', ms: data.ms });
      // a first sheet: shown, but the whole letter is still on its way (and is what gets kept)
      if (!data.partial) {
        lastMs.current = data.ms;
        for (const id of sent.current.keys()) if (id <= data.id) sent.current.delete(id);
        remember(data);
      }
      const prev = shown.current;
      if (prev && prev.id > data.id) return;
      shown.current = data;
      setResult(data);
    };
    w.onerror = (e) => {
      console.error('[seedhand] writer worker failed to start:', e.message || e);
      setFailed(true);
    };
    return () => {
      w.terminate();
      for (const a of ahead.current) a.terminate();
      worker.current = null;
      ahead.current = [];
    };
  }, []);

  // the whole request travels; one stable key decides when to write again
  const reqKey = JSON.stringify(req);
  const hit = cache.current.get(reqKey) ?? null;
  useEffect(() => {
    // an IME is composing (or the live page is drawing the typing): the worker waits
    if (paused || cache.current.has(reqKey)) return;
    const send = () => {
      const w = worker.current;
      if (!w) return;
      const id = ++nextId.current;
      sent.current.set(id, { at: performance.now(), key: reqKey });
      w.postMessage({ ...(JSON.parse(reqKey) as Req), id } satisfies WriteRequest);
    };
    // fast writes go straight through; slow ones wait for a short pause in typing, but a new look never waits
    const look = lookOf(JSON.parse(reqKey) as Req);
    const newLook = look !== lastLook.current;
    lastLook.current = look;
    const delay = !newLook && lastMs.current > 70 ? Math.min(180, lastMs.current * 0.6) : 0;
    if (!delay) { send(); return; }
    const t = window.setTimeout(send, delay);
    return () => window.clearTimeout(t);
  }, [reqKey, paused]);

  const prefetch = useCallback((reqs: Req[]) => {
    const keys = reqs.map((r) => JSON.stringify(r)).filter((k) => !cache.current.has(k));
    if (!keys.length) return;
    while (ahead.current.length < AHEAD_WORKERS) {
      const w = spawn();
      w.onmessage = (e: MessageEvent<WriteResult | { id: number; error: string }>) => {
        const data = e.data;
        if ('error' in data) return;
        data.key = pending.current.get(data.id);
        pending.current.delete(data.id);
        remember(data);
        // a hand asked for while it was being fetched shows now
        bump((n) => n + 1);
      };
      ahead.current.push(w);
    }
    const list = keys.map((key) => {
      const id = -(++nextId.current);
      pending.current.set(id, key);
      return { ...(JSON.parse(key) as Req), id } satisfies WriteRequest;
    });
    // the nearest hands first, shared out so both workers start at the front of the queue
    ahead.current.forEach((w, i) => w.postMessage({ ahead: list.filter((_, j) => j % ahead.current.length === i) }));
  }, []);
  const pending = useRef(new Map<number, string>());

  /** this request is already written (a cached or prefetched result) */
  const written = useCallback((r: Req) => cache.current.has(JSON.stringify(r)), []);
  /** the writing for this request, if it's been written (kept or fetched ahead) */
  const lookup = useCallback((r: Req) => cache.current.get(JSON.stringify(r)), []);

  return { writing: hit ?? result, prefetch, written, lookup, failed };
}

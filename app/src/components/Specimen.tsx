// A few words written in a hand, for pickers (school cards, pen swatches). Each sample is a real layout and
// render, so they're written in a worker (a copy of the writing worker, workers/specimen.ts) and kept: a new hand
// never stops the page for them. Without the worker, the page makes them one at a time in idle moments.
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Hand } from '@engine';
import { edgeForScreen, inlineSVG } from '@/lib/writing';
import { cn } from '@/lib/utils';
import type { SpecimenAsk, SpecimenJob, SpecimenReply } from '@/lib/specimen-protocol';

/** samples kept (a new hand brings about twenty): the newest few hundred */
const KEEP = 400;
const cache = new Map<string, string>();
function remember(key: string, svg: string) {
  cache.delete(key);
  cache.set(key, svg);
  if (cache.size > KEEP) cache.delete(cache.keys().next().value!);
}
const queue: (() => void)[] = [];
let scheduled = false;

// Safari has no requestIdleCallback
const idle = (fn: () => void) =>
  typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 16);

function run() {
  const t0 = performance.now();
  // a few per slice, then give the frame back
  while (queue.length && performance.now() - t0 < 10) queue.shift()!();
  if (queue.length) idle(run);
  else scheduled = false;
}

function schedule(job: () => void) {
  queue.push(job);
  if (!scheduled) {
    scheduled = true;
    idle(run);
  }
}

// ---------- the worker that writes them ----------
/** undefined: not started yet; null: none (it failed or can't start), the page writes them itself */
let sampler: Worker | null | undefined;
/** samples asked of the worker, with who waits for each and how the page would write it instead */
const waiting = new Map<string, { done: Set<(svg: string) => void>; here: () => string }>();

function startSampler() {
  if (sampler !== undefined) return sampler;
  try {
    // the writing worker's own script (already downloaded for the letter)
    sampler = new Worker(new URL('../workers/write.worker.ts', import.meta.url), { type: 'module', name: 'samples' });
  } catch {
    sampler = null;
    return null;
  }
  sampler.onmessage = (e: MessageEvent<SpecimenReply>) => {
    const { specimen: key, svg } = e.data;
    remember(key, svg);
    const w = waiting.get(key);
    waiting.delete(key);
    w?.done.forEach((f) => f(svg));
  };
  sampler.onerror = () => {
    // the page writes what was still waiting, and every sample from now on
    sampler?.terminate();
    sampler = null;
    for (const [key, w] of waiting) schedule(() => { const svg = w.here(); remember(key, svg); w.done.forEach((f) => f(svg)); });
    waiting.clear();
  };
  return sampler;
}

/** Ask the worker for a sample; returns how to stop waiting (it's dropped when nobody waits), or null without one. */
function fromWorker(job: SpecimenJob, here: () => string, done: (svg: string) => void) {
  const w = startSampler();
  if (!w) return null;
  let entry = waiting.get(job.key);
  if (!entry) {
    entry = { done: new Set(), here };
    waiting.set(job.key, entry);
    w.postMessage({ kind: 'specimen', job } satisfies SpecimenAsk);
  }
  entry.done.add(done);
  return () => {
    const e = waiting.get(job.key);
    if (!e) return;
    e.done.delete(done);
    if (!e.done.size) {
      waiting.delete(job.key);
      sampler?.postMessage({ kind: 'specimen', drop: job.key } satisfies SpecimenAsk);
    }
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

interface Props {
  /** everything the sample depends on, as one string */
  sampleKey: string;
  /** the hand to write with (only called when the sample isn't made yet, and the worker can't write it) */
  hand: () => Hand;
  /** the same hand for the worker: `withOverrides(makeHand(seed, style), overrides)` */
  recipe?: { seed: string; style: string; overrides?: Record<string, string> };
  text: string;
  emPx: number;
  /** CSS colour for flat ink */
  color: string;
  /** an engine ink key when the engine models ink; undefined lets the pen use its own */
  inkKey?: string | null;
  className?: string;
}

export const Specimen = memo(function Specimen({ sampleKey, hand, recipe, text, emPx, color, inkKey, className }: Props) {
  const key = `${sampleKey}|${text}|${emPx}|${inkKey ?? ''}`;
  const [svg, setSvg] = useState(() => cache.get(key) ?? null);
  useEffect(() => {
    const hit = cache.get(key);
    if (hit) { setSvg(hit); return; }
    setSvg(null);
    let live = true;
    const ink = inkKey && inkKey !== 'auto' ? inkKey : inkKey === 'auto' ? undefined : 'currentColor';
    const uid = 's' + hash(key);
    const here = () => {
      try {
        return inlineSVG(hand(), text, emPx, uid, ink);
      } catch (e) {
        console.warn('specimen', e);
        return '';
      }
    };
    const stop = recipe && fromWorker({ key, ...recipe, text, emPx, uid, ink }, here, (out) => { if (live) setSvg(out); });
    if (stop) return () => { live = false; stop(); };
    schedule(() => {
      if (!live) return;
      const out = here();
      remember(key, out);
      if (live) setSvg(out);
    });
    return () => { live = false; };
    // hand() and recipe are read only when the key changes
  }, [key]);
  // a touch screen: the ink's edge and felt's bleed off, as on the page (lib/writing.ts EDGE_OFF)
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { edgeForScreen(host.current?.querySelector('svg')); }, [svg]);
  return (
    <div
      ref={host}
      aria-hidden
      className={cn('writing flex items-center transition-opacity duration-200 ease-out [&_svg]:h-full [&_svg]:w-auto [&_svg]:max-w-none', svg ? 'opacity-100' : 'opacity-0', className)}
      style={{ color }}
      dangerouslySetInnerHTML={{ __html: svg ?? '' }}
    />
  );
});

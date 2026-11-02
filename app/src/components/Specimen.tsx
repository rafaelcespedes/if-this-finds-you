// A few words written in a hand, for pickers (school cards, pen swatches). Each sample is a real layout and
// render, so they're made one at a time in idle moments and kept: opening a picker never blocks a frame.
import { memo, useEffect, useState } from 'react';
import type { Hand } from '@engine';
import { inlineSVG } from '@/lib/writing';
import { cn } from '@/lib/utils';

const cache = new Map<string, string>();
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

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

interface Props {
  /** everything the sample depends on, as one string */
  sampleKey: string;
  /** the hand to write with (only called when the sample isn't made yet) */
  hand: () => Hand;
  text: string;
  emPx: number;
  /** CSS colour for flat ink */
  color: string;
  /** an engine ink key when the engine models ink; undefined lets the pen use its own */
  inkKey?: string | null;
  className?: string;
}

export const Specimen = memo(function Specimen({ sampleKey, hand, text, emPx, color, inkKey, className }: Props) {
  const key = `${sampleKey}|${text}|${emPx}|${inkKey ?? ''}`;
  const [svg, setSvg] = useState(() => cache.get(key) ?? null);
  useEffect(() => {
    const hit = cache.get(key);
    if (hit) { setSvg(hit); return; }
    setSvg(null);
    let live = true;
    schedule(() => {
      if (!live) return;
      const ink = inkKey && inkKey !== 'auto' ? inkKey : inkKey === 'auto' ? undefined : 'currentColor';
      let out = '';
      try {
        out = inlineSVG(hand(), text, emPx, 's' + hash(key), ink);
      } catch (e) {
        console.warn('specimen', e);
      }
      cache.set(key, out);
      if (live) setSvg(out);
    });
    return () => { live = false; };
    // hand() is read only when the key changes
  }, [key]);
  return (
    <div
      aria-hidden
      className={cn('writing flex items-center transition-opacity duration-200 ease-out [&_svg]:h-full [&_svg]:w-auto [&_svg]:max-w-none', svg ? 'opacity-100' : 'opacity-0', className)}
      style={{ color }}
      dangerouslySetInnerHTML={{ __html: svg ?? '' }}
    />
  );
});

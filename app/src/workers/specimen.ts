// Picker samples (components/Specimen.tsx): a few words in a hand, written here so the page never stops for them.
// A copy of the writing worker loads this with its first ask (write.worker.ts). One sample at a time, oldest first;
// one the page no longer shows is dropped before it's written.
import { makeHand, withOverrides, type Hand } from '@engine';
import { inlineSVG } from '@/lib/writing';
import type { SpecimenAsk, SpecimenJob, SpecimenReply } from '@/lib/specimen-protocol';

const queue = new Map<string, SpecimenJob>();
let scheduled = false;

// the pens' samples share one writer: the last few hands are kept
const hands = new Map<string, Hand>();
function handFor(seed: string, style: string) {
  const key = `${seed}|${style}`;
  let p = hands.get(key);
  if (!p) {
    p = makeHand(seed, style);
    hands.set(key, p);
    if (hands.size > 4) hands.delete(hands.keys().next().value!);
  }
  return p;
}

function next() {
  scheduled = false;
  const first = queue.entries().next();
  if (first.done) return;
  const [key, job] = first.value;
  queue.delete(key);
  let svg = '';
  try {
    const base = handFor(job.seed, job.style);
    svg = inlineSVG(job.overrides ? withOverrides(base, job.overrides) : base, job.text, job.emPx, job.uid, job.ink);
  } catch (e) {
    console.warn('specimen', e);
  }
  (self as unknown as Worker).postMessage({ specimen: key, svg } satisfies SpecimenReply);
  if (queue.size) { scheduled = true; setTimeout(next, 0); }
}

export function onSpecimen(ask: SpecimenAsk) {
  if ('drop' in ask) { queue.delete(ask.drop); return; }
  queue.set(ask.job.key, ask.job);
  if (!scheduled) { scheduled = true; setTimeout(next, 0); }
}

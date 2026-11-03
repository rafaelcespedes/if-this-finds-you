// Writes the page off the main thread, so typing never waits for the hand.
// Only the newest request matters: older ones still queued are dropped.
// A second copy of this worker writes hands ahead of time (`{ ahead: [...] }`): one at a time, and a newer
// list replaces whatever is still waiting. Other copies roll the hands ahead (a RollAsk, ./roll.ts) and write the
// pickers' samples (a SpecimenAsk, ./specimen.ts), each loaded by its own copy only: one script for all of them, so
// the tool downloads it once.
import { write } from '@/lib/write-core';
import { LIVE } from '@/lib/live';
import { writeFirstSheet } from '@/lib/write-live';
import type { WriteRequest } from '@/lib/write-protocol';
import { isRollAsk, type RollAsk } from '@/lib/roll-protocol';
import { isSpecimenAsk, type SpecimenAsk } from '@/lib/specimen-protocol';

let pending: WriteRequest | null = null;
let scheduled = false;
let queue: WriteRequest[] = [];
let aheadScheduled = false;

const post = (req: WriteRequest) => {
  try {
    const res = write(req);
    (self as unknown as Worker).postMessage(res, [res.glyphs.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: req.id, error: err instanceof Error ? err.message : String(err) });
  }
};

self.onmessage = (e: MessageEvent<WriteRequest | { ahead: WriteRequest[] } | RollAsk | SpecimenAsk>) => {
  if (isRollAsk(e.data)) { const ask = e.data; void import('./roll').then((m) => m.roll(ask)); return; }
  if (isSpecimenAsk(e.data)) { const ask = e.data; void import('./specimen').then((m) => m.onSpecimen(ask)); return; }
  if ('ahead' in e.data) {
    queue = e.data.ahead;
    if (!aheadScheduled) { aheadScheduled = true; setTimeout(runAhead, 0); }
    return;
  }
  pending = e.data;
  if (scheduled) return;
  scheduled = true;
  // yield once so a burst of keystrokes collapses into one write
  setTimeout(run, 0);
};

async function run() {
  scheduled = false;
  const req = pending;
  pending = null;
  if (!req) return;
  // a long letter: its first sheet goes out first, so a new hand shows at once; if another request has
  // come in meanwhile (a quick next click), the rest of this one is never written
  if (LIVE) {
    let first = null;
    try { first = writeFirstSheet(req); } catch { first = null; }
    if (first) {
      (self as unknown as Worker).postMessage(first, [first.glyphs.buffer]);
      await new Promise((r) => setTimeout(r, 0));
      if (pending) return;
    }
  }
  post(req);
}

function runAhead() {
  aheadScheduled = false;
  const req = queue.shift();
  if (!req) return;
  post(req);
  if (queue.length) { aheadScheduled = true; setTimeout(runAhead, 0); }
}

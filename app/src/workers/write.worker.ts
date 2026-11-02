// Writes the page off the main thread, so typing never waits for the hand.
// Only the newest request matters: older ones still queued are dropped.
import { write } from '@/lib/write-core';
import type { WriteRequest } from '@/lib/write-protocol';

let pending: WriteRequest | null = null;
let scheduled = false;

self.onmessage = (e: MessageEvent<WriteRequest>) => {
  pending = e.data;
  if (scheduled) return;
  scheduled = true;
  // yield once so a burst of keystrokes collapses into one write
  setTimeout(run, 0);
};

function run() {
  scheduled = false;
  const req = pending;
  pending = null;
  if (!req) return;
  try {
    const res = write(req);
    (self as unknown as Worker).postMessage(res, [res.glyphs.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: req.id, error: err instanceof Error ? err.message : String(err) });
  }
}

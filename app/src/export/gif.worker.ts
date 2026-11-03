// GIF encoding off the main thread (gifenc). One palette for the whole clip, taken from the finished frame
// (paper, every ink density, the credit), so colours never shift between frames and nothing flickers.
// Each frame stores only the pixels that changed (the rest is the transparent index over the frame before),
// and frames that change nothing are folded into the previous frame's delay: a pause costs no bytes.
import { applyPalette, GIFEncoder, quantize } from 'gifenc';

type Msg =
  | { type: 'start'; width: number; height: number; palette: ArrayBuffer }
  | { type: 'frame'; i: number; data: ArrayBuffer; delay: number }
  | { type: 'finish' };

let enc: ReturnType<typeof GIFEncoder> | null = null;
let pal: number[][] = [];
let full: number[][] = [];
let T = 255;
let w = 0, h = 0;
let prev: Uint8Array | null = null;
let pending: { index: Uint8Array; delay: number; first: boolean } | null = null;

function write(f: { index: Uint8Array; delay: number; first: boolean }) {
  enc!.writeFrame(f.index, w, h, {
    palette: f.first ? full : undefined,
    delay: f.delay,
    transparent: !f.first,
    transparentIndex: T,
    dispose: 1, // keep the frame before: unchanged pixels show through
    repeat: 0,  // loop forever
  });
}

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (m.type === 'start') {
    w = m.width; h = m.height;
    pal = quantize(new Uint8ClampedArray(m.palette), 255, { format: 'rgb565' });
    T = pal.length;
    // the transparent slot: a colour nothing maps to (applyPalette only sees `pal`)
    full = [...pal, [255, 0, 255]];
    enc = GIFEncoder();
    prev = null; pending = null;
    (self as unknown as Worker).postMessage({ type: 'ready', colors: pal.length });
    return;
  }
  if (m.type === 'frame') {
    const idx = applyPalette(new Uint8ClampedArray(m.data), pal, 'rgb565');
    if (!prev || !pending) {
      pending = { index: idx, delay: m.delay, first: true };
    } else {
      const out = new Uint8Array(idx.length);
      let changed = false;
      for (let k = 0; k < idx.length; k++) {
        if (idx[k] !== prev[k]) { out[k] = idx[k]; changed = true; } else out[k] = T;
      }
      if (!changed) pending.delay += m.delay;
      else { write(pending); pending = { index: out, delay: m.delay, first: false }; }
    }
    prev = idx;
    (self as unknown as Worker).postMessage({ type: 'ack', i: m.i });
    return;
  }
  if (m.type === 'finish') {
    if (pending) write(pending);
    enc!.finish();
    const bytes = enc!.bytes();
    (self as unknown as Worker).postMessage({ type: 'done', bytes }, [bytes.buffer]);
    enc = null; prev = null; pending = null;
  }
};

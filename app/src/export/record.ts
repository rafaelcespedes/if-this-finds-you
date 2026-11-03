// Recorders: step the scene frame by frame (never the wall clock), hand each frame to an encoder.
//   MP4: H.264 through WebCodecs, muxed by mp4-muxer (fast start, so it plays while it loads).
//   WebM: VP9 (or VP8) through WebCodecs, muxed by webm-muxer.
//   No WebCodecs at all: MediaRecorder on the canvas, in real time (best effort; rare today).
//   GIF: gifenc in a worker (gif.worker.ts).
// The page stays responsive: frames are drawn in short slices with yields between them, and the encoders
// themselves run off the main thread.
import type { Scene } from './scene';

export interface RecordHooks {
  onFrame(i: number, frames: number): void;
  signal?: AbortSignal;
}

export interface Recorded {
  blob: Blob;
  mime: string;
  ext: string;
  codec: string;
  renderMs: number;
  finishMs: number;
}

const now = () => performance.now();

function aborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('The export was cancelled.', 'AbortError');
}

/** Give the page a moment between frames (input, paint), at most every ~24 ms of work. */
function yielder() {
  let last = now();
  const sched = (globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  return async (force = false) => {
    if (!force && now() - last < 24) return;
    if (sched?.yield) await sched.yield();
    else await new Promise<void>((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
    last = now();
  };
}

function frameCanvas(scene: Scene, readBack: boolean) {
  const c = document.createElement('canvas');
  c.width = scene.width;
  c.height = scene.height;
  const ctx = c.getContext('2d', { alpha: false, willReadFrequently: readBack });
  if (!ctx) throw new Error('This browser could not make a canvas for the video.');
  return { c, ctx };
}

// ---------------------------------------------------------------------------------------------
// video
// ---------------------------------------------------------------------------------------------

const hex2 = (n: number) => n.toString(16).padStart(2, '0');

/** H.264 level for a frame size and rate (macroblocks per frame and per second). */
function avcLevel(w: number, h: number, fps: number) {
  const mb = Math.ceil(w / 16) * Math.ceil(h / 16), mbs = mb * fps;
  if (mb <= 8192 && mbs <= 245760) return 0x28; // 4.0
  if (mb <= 8704 && mbs <= 522240) return 0x2a; // 4.2
  return 0x33; // 5.1
}

export function bitrateFor(w: number, h: number, fps: number) {
  return Math.round(Math.min(16e6, Math.max(2.5e6, w * h * fps * 0.16)));
}

/** The first encoder config this browser supports for the container, or null. */
export async function videoConfig(container: 'mp4' | 'webm', w: number, h: number, fps: number): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  const L = hex2(avcLevel(w, h, fps));
  const codecs = container === 'mp4'
    ? [`avc1.6400${L}`, `avc1.4d00${L}`, `avc1.4200${L}`]
    : [fps > 30 ? 'vp09.00.41.08' : 'vp09.00.40.08', 'vp8'];
  for (const codec of codecs) {
    // VP9 needs about half H.264's bits for the same picture (and its encoder spends what it's given)
    const bitrate = Math.round(bitrateFor(w, h, fps) * (codec.startsWith('vp09') ? 0.5 : 1));
    const cfg: VideoEncoderConfig = {
      codec, width: w, height: h, bitrate, framerate: fps,
      latencyMode: 'quality', bitrateMode: 'variable',
      ...(codec.startsWith('avc1') ? { avc: { format: 'avc' as const } } : {}),
    };
    try {
      const r = await VideoEncoder.isConfigSupported(cfg);
      if (r.supported) return r.config ?? cfg;
    } catch { /* try the next */ }
  }
  return null;
}

export async function recordVideo(scene: Scene, container: 'mp4' | 'webm', hooks: RecordHooks): Promise<Recorded> {
  const { width: W, height: H, fps, frames } = scene;
  const cfg = await videoConfig(container, W, H, fps);
  if (!cfg) {
    // MP4 not available here: WebM from the same encoder family, else MediaRecorder
    if (container === 'mp4') {
      const webm = await videoConfig('webm', W, H, fps);
      if (webm) return recordVideo(scene, 'webm', hooks);
    }
    return recordRealtime(scene, hooks);
  }
  const isAvc = cfg.codec.startsWith('avc1');
  const mux = isAvc
    ? await import('mp4-muxer').then((m) => {
      const target = new m.ArrayBufferTarget();
      const muxer = new m.Muxer({ target, video: { codec: 'avc', width: W, height: H, frameRate: fps }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' });
      return { add: muxer.addVideoChunk.bind(muxer), done: () => { muxer.finalize(); return target.buffer; } };
    })
    : await import('webm-muxer').then((m) => {
      const target = new m.ArrayBufferTarget();
      const muxer = new m.Muxer({ target, video: { codec: cfg.codec === 'vp8' ? 'V_VP8' : 'V_VP9', width: W, height: H, frameRate: fps }, firstTimestampBehavior: 'offset' });
      return { add: muxer.addVideoChunk.bind(muxer), done: () => { muxer.finalize(); return target.buffer; } };
    });

  let failure: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => { try { mux.add(chunk, meta); } catch (e) { failure = e; } },
    error: (e) => { failure = e; },
  });
  encoder.configure(cfg);
  const { c, ctx } = frameCanvas(scene, false);
  const pause = yielder();
  const t0 = now();
  try {
    for (let i = 0; i < frames; i++) {
      aborted(hooks.signal);
      if (failure) throw failure;
      scene.draw(ctx, i / fps);
      const frame = new VideoFrame(c, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      hooks.onFrame(i + 1, frames);
      // don't run ahead of the encoder (its 'dequeue' event; timers are throttled in background tabs)
      while (encoder.encodeQueueSize > 6) {
        await new Promise<void>((r) => {
          const done = () => { encoder.removeEventListener('dequeue', done); r(); };
          encoder.addEventListener('dequeue', done);
          setTimeout(done, 50);
        });
      }
      await pause();
    }
    const t1 = now();
    await encoder.flush();
    if (failure) throw failure;
    const buf = mux.done();
    const mime = isAvc ? 'video/mp4' : 'video/webm';
    return { blob: new Blob([buf], { type: mime }), mime, ext: isAvc ? 'mp4' : 'webm', codec: cfg.codec, renderMs: t1 - t0, finishMs: now() - t1 };
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
}

/** No WebCodecs: record the canvas in real time. The pacing then depends on keeping up, so it's a fallback. */
async function recordRealtime(scene: Scene, hooks: RecordHooks): Promise<Recorded> {
  const { fps, frames } = scene;
  const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('This browser can’t record video. Try the GIF, or Chrome, Edge, Safari or Firefox.');
  const { c, ctx } = frameCanvas(scene, false);
  const stream = c.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrateFor(scene.width, scene.height, fps) });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>((r) => { rec.onstop = () => r(); });
  scene.draw(ctx, 0);
  rec.start();
  const t0 = now();
  for (let i = 0; i < frames; i++) {
    if (hooks.signal?.aborted) { rec.stop(); await stopped; aborted(hooks.signal); }
    scene.draw(ctx, i / fps);
    track.requestFrame();
    hooks.onFrame(i + 1, frames);
    const due = t0 + ((i + 1) * 1000) / fps - now();
    await new Promise((r) => setTimeout(r, Math.max(0, due)));
  }
  const t1 = now();
  rec.stop();
  await stopped;
  const type = mime.split(';')[0];
  return { blob: new Blob(chunks, { type }), mime: type, ext: type === 'video/mp4' ? 'mp4' : 'webm', codec: 'mediarecorder:' + mime, renderMs: t1 - t0, finishMs: now() - t1 };
}

// ---------------------------------------------------------------------------------------------
// GIF
// ---------------------------------------------------------------------------------------------

export async function recordGif(scene: Scene, paletteAt: number, hooks: RecordHooks): Promise<Recorded> {
  const { width: W, height: H, fps, frames } = scene;
  const worker = new Worker(new URL('./gif.worker.ts', import.meta.url), { type: 'module' });
  const acks: (() => void)[] = [];
  let inflight = 0;
  let done: ((b: Uint8Array) => void) | null = null;
  let fail: ((e: unknown) => void) | null = null;
  const finished = new Promise<Uint8Array>((res, rej) => { done = res; fail = rej; });
  const ready = new Promise<void>((res) => {
    worker.onmessage = (e: MessageEvent<{ type: string; bytes?: Uint8Array }>) => {
      const m = e.data;
      if (m.type === 'ready') res();
      else if (m.type === 'ack') { inflight--; acks.shift()?.(); }
      else if (m.type === 'done') done!(m.bytes!);
    };
  });
  worker.onerror = (e) => fail!(new Error(e.message || 'The GIF encoder stopped.'));
  const { ctx } = frameCanvas(scene, true);
  const pause = yielder();
  const delay = 1000 / fps;
  const t0 = now();
  try {
    // the palette: the finished letter with its credit (every colour the clip will show)
    scene.draw(ctx, paletteAt);
    const pal = ctx.getImageData(0, 0, W, H).data.buffer;
    worker.postMessage({ type: 'start', width: W, height: H, palette: pal }, [pal]);
    await ready;
    for (let i = 0; i < frames; i++) {
      aborted(hooks.signal);
      scene.draw(ctx, i / fps);
      const data = ctx.getImageData(0, 0, W, H).data.buffer;
      inflight++;
      worker.postMessage({ type: 'frame', i, data, delay }, [data]);
      hooks.onFrame(i + 1, frames);
      while (inflight > 3) await new Promise<void>((r) => acks.push(r));
      await pause();
    }
    const t1 = now();
    worker.postMessage({ type: 'finish' });
    const bytes = await finished;
    return { blob: new Blob([bytes as BlobPart], { type: 'image/gif' }), mime: 'image/gif', ext: 'gif', codec: 'gif', renderMs: t1 - t0, finishMs: now() - t1 };
  } finally {
    worker.terminate();
  }
}

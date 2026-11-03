// Share-ready export: a letter writing itself out, as MP4, WebM or GIF.
//
//   import { exportWriting } from '@/export';
//   const res = await exportWriting(state, { format: 'mp4', aspect: '4:5', framing: 'lines', onProgress, signal });
//   // res.blob, res.filename, res.mime, res.ms.total ...
//
// `state` is the app's NoteState (lib/state.ts): the hand, pen, ink, paper, size, text or ink log, exactly as
// the page shows it. The letter is laid out the same way the app lays it out (lib/live.ts, lib/ink.ts).
// Frames are stepped through the engine's timeline (engine/animate.js), never the wall clock, so the same
// note gives the same file every time. See scene.ts for framing and pacing, record.ts for the encoders.
import type { NoteState } from '@/lib/state';
import { buildScene, frameSize, type Scene, type SceneOptions } from './scene';
import { recordGif, recordVideo, videoConfig } from './record';
import type { Branding, ExportOptions, ExportResult } from './types';

export type { Aspect, Branding, ExportFormat, ExportOptions, ExportProgress, ExportResult, Framing } from './types';
export type { Scene } from './scene';

/** Resolved scene options for a note and an export request. */
function sceneOptions(opts: ExportOptions): SceneOptions {
  const gif = opts.format === 'gif';
  const aspect = opts.aspect ?? '4:5';
  const { width, height } = frameSize(aspect, gif ? 'gif' : 'video', opts.width);
  const b: Branding = opts.branding === false ? { credit: false, wordmark: false } : opts.branding === true || opts.branding == null ? {} : opts.branding;
  return {
    aspect,
    framing: opts.framing ?? 'lines',
    maxSeconds: opts.duration ?? (gif ? 15 : 18),
    width, height,
    fps: opts.fps ?? (gif ? 20 : 30),
    ss: opts.supersample ?? 2,
    branding: { credit: b.credit ?? true, wordmark: b.wordmark ?? true },
    credit: opts.credit,
    loop: gif,
    still: gif,
  };
}

/** The scene an export would record, for a live preview (draw(ctx, t) with t in seconds). */
export function previewScene(state: NoteState, opts: ExportOptions & { previewWidth?: number }): Promise<Scene> {
  const o = sceneOptions(opts);
  if (opts.previewWidth && opts.previewWidth < o.width) {
    const k = opts.previewWidth / o.width;
    o.width = Math.round(o.width * k);
    o.height = Math.round(o.height * k);
    o.ss = Math.min(o.ss, 1.5);
  }
  return buildScene(state, o);
}

/** Write the note out as a video or GIF. Rejects with an AbortError when `signal` aborts. */
export async function exportWriting(state: NoteState, opts: ExportOptions): Promise<ExportResult> {
  const t0 = performance.now();
  const progress = opts.onProgress ?? (() => {});
  progress({ phase: 'prepare', fraction: 0 });
  const o = sceneOptions(opts);
  const scene = await buildScene(state, o);
  const t1 = performance.now();
  progress({ phase: 'render', fraction: 0.02, frame: 0, frames: scene.frames });
  const hooks = {
    signal: opts.signal,
    onFrame: (i: number, n: number) => progress({ phase: 'render', fraction: 0.02 + 0.93 * (i / n), frame: i, frames: n }),
  };
  const rec = opts.format === 'gif' ? await recordGif(scene, scene.poster, hooks) : await recordVideo(scene, opts.format, hooks);
  progress({ phase: 'done', fraction: 1 });
  const total = performance.now() - t0;
  return {
    blob: rec.blob,
    mime: rec.mime,
    ext: rec.ext,
    filename: `if-this-finds-you-${scene.slug}-${o.aspect.replace(':', 'x')}.${rec.ext}`,
    width: scene.width,
    height: scene.height,
    fps: scene.fps,
    frames: scene.frames,
    seconds: scene.seconds,
    codec: rec.codec,
    pace: scene.pace,
    ms: { prepare: t1 - t0, render: rec.renderMs, finish: rec.finishMs, total },
  };
}

/** What this browser can make: MP4 needs an H.264 encoder (WebCodecs); WebM and GIF work almost anywhere. */
export async function exportSupport() {
  const [mp4, webm] = await Promise.all([videoConfig('mp4', 1080, 1350, 30), videoConfig('webm', 1080, 1350, 30)]);
  return { mp4: !!mp4, webm: !!webm || typeof MediaRecorder !== 'undefined', gif: true };
}

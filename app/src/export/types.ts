// Shared types for the share-ready export (app/src/export).

export type ExportFormat = 'mp4' | 'webm' | 'gif';
export type Aspect = '4:5' | '1:1' | '16:9' | '9:16';
/** 'lines': close on the opening lines, near real hand speed. 'page': the whole first sheet, sped up to fit. */
export type Framing = 'lines' | 'page';

export interface Branding {
  /** "Letter: Barbary Stockdell, 1838" (sample letters; or ExportOptions.credit) */
  credit?: boolean;
  /** the small "If This Finds You" wordmark */
  wordmark?: boolean;
}

export interface ExportOptions {
  format: ExportFormat;
  /** default '4:5' (best in the X feed) */
  aspect?: Aspect;
  /** default 'lines' */
  framing?: Framing;
  /** longest the clip may run, in seconds (default 18 for video, 15 for GIF) */
  duration?: number;
  /** output width in px (default 1080 for video, 670 for GIF at 4:5; 16:9 video is 1920 wide) */
  width?: number;
  /** frames per second (default 30 for video, 20 for GIF) */
  fps?: number;
  /** ink supersampling (default 2) */
  supersample?: number;
  /** true (default), false, or which parts */
  branding?: boolean | Branding;
  /** the credit line; default: the sample letter's credit, none for your own letter. null hides it. */
  credit?: string | null;
  onProgress?: (p: ExportProgress) => void;
  signal?: AbortSignal;
}

export interface ExportProgress {
  phase: 'prepare' | 'render' | 'finish' | 'done';
  /** 0..1 over the whole export */
  fraction: number;
  frame?: number;
  frames?: number;
}

export interface ExportResult {
  blob: Blob;
  mime: string;
  /** file extension without the dot */
  ext: string;
  /** suggested download name, e.g. if-this-finds-you-stockdell-1838-4x5.mp4 */
  filename: string;
  width: number;
  height: number;
  fps: number;
  frames: number;
  seconds: number;
  /** the codec actually used, e.g. avc1.640028, vp09.00.40.08, gif */
  codec: string;
  /** how the writing was paced: lines written, top speed (x real hand) */
  pace: { lines: number; topSpeed: number; writeSeconds: number };
  /** wall-clock ms */
  ms: { prepare: number; render: number; finish: number; total: number };
}

/** A timeline event (engine/animate.js). */
export interface Ev {
  k: number;
  item: number;
  stroke: number;
  t0: number;
  dur: number;
  line: number;
  word: unknown;
  delayed: boolean;
  tn: Float32Array;
  sn: Float32Array;
}

export interface Timeline {
  events: Ev[];
  duration: number;
}

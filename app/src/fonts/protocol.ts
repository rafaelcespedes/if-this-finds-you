// Messages between the Fonts page and its workers (fonts.worker.ts). The page never loads the engine: the workers
// choose the hands, name them, write their specimens and build the tool links; the page only shows what they send.
import type { Catalogue, Filters } from './filters';

/** One hand in a set: everything a row shows and every action needs, so a favourite reproduces it exactly. */
export interface FontEntry {
  /** seed~style~pen~tip~ink: unique in a set, and the favourite's key */
  id: string;
  seed: string;
  style: string;
  family: 'print' | 'script';
  /** written with Neat hands only (the engine tidies the hand) */
  neatOnly: boolean;
  pen: string;
  tip: string;
  ink: string;
  paper: string;
  /** the look's own values (absolute), as the engine's sampler gave them */
  params: Record<string, number>;
  /** what the renderer and the font builder are given: the params the engine knows, pen, tip and ink */
  overrides: Record<string, number | string>;
  /** the fictional writer ("Yara Bellamy") */
  name: string;
  /** the quiet line under the name: ["Joined", "Spencerian", "fountain pen"] */
  attrs: string[];
  /** for the filters and the screen reader: how neat (0..1), how it leans (degrees), how easy to read (0..1) */
  traits: { neatness: number; lean: number; legibility: number };
  /** the tool's note state (lib/state.ts encodeState) with this hand on a fresh sheet: `${toolHref}#${tool}` */
  tool: string;
  /** the paper's colour (ink on paper) and the ink's flat colour (the UI's tint for this hand) */
  tint: string;
  inkColor: string;
}

export type Mode = 'ink' | 'plain';

export interface RenderSpec {
  text: string;
  mode: Mode;
  /** px per em: the specimen's size */
  emPx: number;
  /** the space the specimen has, CSS px */
  width: number;
  /** 1 on wide screens (the line runs off the edge), 2 on phones (it wraps) */
  lines: number;
  dpr: number;
}

export type ToWorker =
  | { type: 'hello' }
  | { type: 'set'; req: number; setSeed: string; filters: Filters; count: number; neatOnly: boolean }
  | { type: 'render'; job: number; entry: FontEntry; spec: RenderSpec };

export type FromWorker =
  | { type: 'ready'; catalogue: Catalogue; sampler: 'engine' | 'app' }
  | { type: 'entry'; req: number; index: number; entry: FontEntry }
  | { type: 'set-done'; req: number; found: number; exhausted: boolean; ms: number }
  | { type: 'rendered'; job: number; svg?: string; blob?: Blob; width: number; height: number; clipped: boolean; ms: number }
  | { type: 'failed'; job?: number; req?: number; message: string };

/**
 * The specimen box for a size, in em: room above the first baseline for capitals, ascenders and flourishes, below
 * the last for descenders, and the line pitch when it wraps. The page reserves exactly this before anything is
 * written, so rows never move when their writing arrives.
 */
export const BOX = { above: 1.02, below: 0.5, pitch: 1.36, left: 0.08 };
export const boxHeight = (emPx: number, lines: number) => Math.ceil((BOX.above + BOX.below + (lines - 1) * BOX.pitch) * emPx);

// Messages between the Fonts page and its workers (fonts.worker.ts). The page never loads the engine: the workers
// choose the hands (the engine's sampler), name them, build their fonts and tool links; the page only shows them.
import type { Catalogue, Constraints } from './filters';

/** One hand in a set: everything a row shows and every action needs, so a saved hand comes back exactly. */
export interface FontEntry {
  /** seed~style~pen~tip~ink: unique in a set, and the saved hand's key */
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
  /** the look's values (absolute), exactly as the sampler gave them: the hand is makeHand + these */
  params: Record<string, number>;
  /** the fictional writer ("Yara Bellamy"; lib/hands.ts writerName, as the tool's label) */
  name: string;
  /** "Palmer", "Québec school" */
  tradition: string;
  /** the kind of writer ("Field journal") */
  kind: string;
  /** where they learned, for a tooltip: "Schooled in … Later habits …" */
  schooled: string;
  /** met every filter as drawn (false: one of the closest, nudged; the set's note says so) */
  matches: boolean;
  /** the tool's note state (lib/state.ts encodeState) with this hand on a fresh sheet: `${toolHref}#${tool}` */
  tool: string;
  /** the paper's colour and the ink's flat colour (Live hand) */
  tint: string;
  inkColor: string;
}

/** As a font: the generated font itself (what you download). Live hand: the engine's live writing on its paper. */
export type Mode = 'font' | 'live';

export interface LiveSpec {
  text: string;
  /** px per em */
  emPx: number;
  /** the space the specimen has, CSS px */
  width: number;
  /** 1 on wide screens (the line runs off the edge), 2 on phones (it wraps) */
  lines: number;
  dpr: number;
}

export interface Opening { text: string; id: string; by: string; year?: number }

/** What a hand's record says (worked out in the worker when the hand is opened). */
export interface HandRecord {
  /** "Schooled in: American business hand (Palmer Method). Later habits: … (19%)." */
  taught: string;
  tradition: { name: string; region?: string; era?: string };
  /** "Fountain pen, medium tip" */
  pen: string;
  /** "Letter pad" */
  paper: string;
  /** every copybook, plate and drawing its letters come from, with the credit each asks for */
  sources: { name: string; credit: string; url?: string }[];
  /** every character the font has (its glyph set) */
  chars: string;
  /** one plain sentence on how the hand was made */
  about: string;
}

export type ToWorker =
  | { type: 'hello' }
  | { type: 'set'; req: number; setSeed: string; page: number; count: number; constraints: Constraints; neatOnly: boolean }
  | { type: 'font'; job: number; entry: FontEntry; chars: string }
  | { type: 'live'; job: number; entry: FontEntry; spec: LiveSpec }
  | { type: 'package'; job: number; entry: FontEntry }
  | { type: 'record'; job: number; entry: FontEntry };

export type FromWorker =
  | { type: 'ready'; catalogue: Catalogue }
  | { type: 'set'; req: number; entries: FontEntry[]; note: string | null; exhausted: boolean; matched: number; opening: Opening | null; ms: number }
  | { type: 'font'; job: number; otf: ArrayBuffer; chars: string; ms: number }
  | { type: 'live'; job: number; blob: Blob; width: number; height: number; clipped: boolean; ms: number }
  | { type: 'package'; job: number; zip: ArrayBuffer; filename: string }
  | { type: 'record'; job: number; record: HandRecord }
  | { type: 'failed'; job?: number; req?: number; message: string };

/**
 * The specimen box, in em: a line, plus room above for capitals and flourishes and below for descenders. The page
 * reserves exactly this before anything arrives, so rows never move when their writing does.
 */
export const BOX = { above: 1.02, below: 0.5, pitch: 1.36, left: 0.08 };
export const boxHeight = (emPx: number, lines: number) => Math.ceil((BOX.above + BOX.below + (lines - 1) * BOX.pitch) * emPx);

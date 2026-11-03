// What the pickers' samples (components/Specimen.tsx) and the worker that writes them (workers/specimen.ts, run by a
// copy of workers/write.worker.ts) say to each other.

/** One sample: `withOverrides(makeHand(seed, style), overrides)` writing `text`, as lib/writing.ts inlineSVG draws it. */
export interface SpecimenJob {
  key: string;
  seed: string;
  style: string;
  overrides?: Record<string, string>;
  text: string;
  emPx: number;
  uid: string;
  /** 'currentColor', an engine ink key, or undefined (the pen's own) */
  ink: string | undefined;
}

export type SpecimenAsk = { kind: 'specimen'; job: SpecimenJob } | { kind: 'specimen'; drop: string };
export interface SpecimenReply { specimen: string; svg: string }

export const isSpecimenAsk = (m: unknown): m is SpecimenAsk =>
  typeof m === 'object' && m !== null && (m as SpecimenAsk).kind === 'specimen';

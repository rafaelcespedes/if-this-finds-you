// What the engine can do right now. Parallel sessions add pens, inks and new params; the UI lights a
// control up only when the engine supports it, so nothing ships as a dead control.
//
// Preview: add `?preview` to the URL (or set localStorage 'seedhand:preview' to '1') to see controls the
// engine doesn't support yet. They are wired to the placeholder params listed in PENDING_PARAMS and are
// marked "soon"; the engine ignores them until it learns them.
import * as E from '@engine';

const engine = E as unknown as Record<string, unknown>;

export const PARAM_KEYS = new Set(E.PARAMS.map((d) => d.key));

/** Engine pens beyond the original 'auto' (arrive with the pens & ink session). */
export const ENGINE_PENS = (engine.PENS as Record<string, { label?: string }> | undefined) ?? {};
export const hasPen = (key: string) => key in ENGINE_PENS && key !== 'auto';

/** Engine ink families (arrive with the pens & ink session): key -> { label, rgb }. */
export const ENGINE_INKS = (engine.INKS as Record<string, { label: string; rgb: [number, number, number] }> | undefined) ?? null;
/** When true, renderSVG models ink itself from a swatch key, so we pass the key instead of a colour. */
export const MODELLED_INK = typeof engine.inkModel === 'function' && !!ENGINE_INKS;

function readPreview() {
  try {
    if (new URLSearchParams(location.search).has('preview')) return true;
    return localStorage.getItem('seedhand:preview') === '1';
  } catch {
    return false;
  }
}
export const PREVIEW = typeof location !== 'undefined' ? readPreview() : false;

/**
 * Placeholder params the UI already speaks, waiting for the engine.
 * key -> what the engine should do with it (also listed in app/README.md).
 */
export const PENDING_PARAMS: Record<string, string> = {
  hurry: 'Hurry macro 0..1: slant +0–8°, width +0–10%, longer tapers, more strokeShift, lighter ink, looser lines, neatness −0.3×',
  inkFlow: 'Dry ↔ wet 0..1: mean density, end pools, halo, ballpoint skips, felt bleed',
  inkVariation: 'Per-stroke colour jitter, along-stroke gradient, slow page drift 0..1',
  paperTooth: 'Grain depth and absorbency 0..1',
  lineWander: 'Even ↔ wandering 0..2 (page-rhythm engine): pitch variation, per-line slope, end bend, float off the rule',
  marginDiscipline: 'Strict ↔ loose 0..1: left-start jitter, inward drift, last-word squeeze',
  fatigue: 'Drift along the text 0..2 (page-rhythm engine): neatness falls, size and spacing grow',
  mistakes: 'Journey 0..1 (mistakes session): crossings-out, overwrites and insertions over the draft',
};

export const supports = (key: string) => PARAM_KEYS.has(key);

/**
 * Journey (mistakes session): the writer's own crossings-out, overwrites and insertions over a whole draft.
 * writeWithJourney(p, text, layoutOpts, { amount, seed }) returns a layout()-shaped page.
 */
export const JOURNEY = typeof engine.writeWithJourney === 'function';
export interface JourneyResult {
  page: import('@engine').Page;
  intended: string;
  transcript: string;
  summary: string;
  ok: boolean;
}
export const writeWithJourney = engine.writeWithJourney as
  | ((p: unknown, text: string, opts: unknown, j?: { amount?: number; seed?: string }) => JourneyResult)
  | undefined;

/** A param's natural value for this hand, when the engine supplies one (PARAMS entries may carry natural(p)). */
export function engineNatural(key: string, hand: unknown): number | undefined {
  const d = E.PARAMS.find((x) => x.key === key) as { natural?: (p: unknown) => number; default?: unknown } | undefined;
  if (typeof d?.natural === 'function') return d.natural(hand);
  return typeof d?.default === 'number' ? d.default : undefined;
}

/** The engine picks a pen tip (fine / medium / bold) itself and keeps it physical across sizes. */
export const ENGINE_TIPS = PARAM_KEYS.has('tip');

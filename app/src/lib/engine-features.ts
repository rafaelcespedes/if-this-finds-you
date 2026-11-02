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
  lineRhythm: 'Even ↔ wandering 0..1: pitch variation, per-line slope, end bend, float off the rule',
  marginDiscipline: 'Strict ↔ loose 0..1: left-start jitter, inward drift, last-word squeeze',
  tiredness: 'Drift along the text 0..1: neatness falls, size and spacing grow',
};

export const supports = (key: string) => PARAM_KEYS.has(key);

// The curated hand controls. Ranges come from the engine's PARAMS, trimmed to the part that still
// looks like a person wrote it, and every control speaks in plain words.
import { PARAMS } from '@engine';
import { words } from './hands';
import type { OverrideKey } from './state';
import { clamp } from './utils';

export interface HandControl {
  key: OverrideKey;
  label: string;
  /** words at either end of the slider */
  ends: [string, string];
  min: number;
  max: number;
  step: number;
  describe: (v: number) => string;
}

// the part of each engine range we expose
const CURATE: Record<OverrideKey, { label: string; ends: [string, string]; min: number; max: number }> = {
  neatness: { label: 'Neatness', ends: ['Hurried', 'Careful'], min: 0.1, max: 1 },
  slant: { label: 'Slant', ends: ['Back', 'Forward'], min: -12, max: 24 },
  penWidth: { label: 'Pen width', ends: ['Fine', 'Bold'], min: 22, max: 96 },
  pressure: { label: 'Pressure', ends: ['Light', 'Heavy'], min: 0, max: 0.9 },
};

export const HAND_CONTROLS: HandControl[] = (Object.keys(CURATE) as OverrideKey[]).map((key) => {
  const def = PARAMS.find((d) => d.key === key);
  const c = CURATE[key];
  const lo = def?.min ?? c.min, hi = def?.max ?? c.max;
  return {
    key,
    label: c.label,
    ends: c.ends,
    min: clamp(c.min, lo, hi),
    max: clamp(c.max, lo, hi),
    step: def?.step ?? 0.01,
    describe: words[key],
  };
});

export function clampOverride(key: OverrideKey, v: number) {
  const c = HAND_CONTROLS.find((h) => h.key === key);
  return c ? clamp(v, c.min, c.max) : v;
}

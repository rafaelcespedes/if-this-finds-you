// natural hand (seed) + your offsets + occasion -> what the engine is asked to draw.
import { withOverrides, type Hand } from '@engine';
import { CONTROLS, naturalValue, penSizeFactor } from './controls';
import { ENGINE_TIPS, MODELLED_INK } from './engine-features';
import { AUTO_INK } from './inks';
import { getOccasion } from './occasions';
import type { NoteState } from './state';
import { clamp } from './utils';

export interface Effective {
  /** absolute engine overrides */
  overrides: Record<string, number | string>;
  /** writing size factor (paper-relative) */
  size: number;
  /** line spacing factor */
  lineSpacing: number;
  /** ink: a swatch key when the engine models ink, else null (the app paints a flat colour) */
  inkKey: string | null;
}

export function effective(natural: Hand, s: NoteState): Effective {
  const occ = getOccasion(s.occasion);
  const amt = occ ? s.amount : 0;
  const overrides: Record<string, number | string> = {};
  let lineSpacing = 1;
  for (const c of CONTROLS) {
    const off = s.offsets[c.key] ?? 0;
    const d = (occ?.deltas[c.key] ?? 0) * amt;
    let nat = naturalValue(c, natural);
    // without engine tips, Fine/Medium/Bold scale the pen width
    if (c.key === 'penWidth' && !ENGINE_TIPS) nat *= penSizeFactor(s.penSize);
    const changed = off !== 0 || d !== 0 || (c.key === 'penWidth' && !ENGINE_TIPS && s.penSize !== 'medium');
    if (!changed) continue;
    const v = clamp(nat + off + d, c.min, c.max);
    if (c.app) {
      if (c.key === 'lineSpacing') lineSpacing = v;
    } else overrides[c.key] = v;
  }
  if (s.pen !== 'auto') overrides.pen = s.pen;
  if (ENGINE_TIPS && s.penSize !== 'medium') overrides.tip = s.penSize;
  const inkKey = MODELLED_INK ? s.ink : null;
  if (inkKey && inkKey !== AUTO_INK) overrides.ink = inkKey;
  return { overrides, size: s.size * (1 + (occ?.size ?? 0) * amt), lineSpacing, inkKey };
}

/** The current value a control shows (natural + offset + occasion), clamped. */
export function controlValue(key: string, natural: Hand, s: NoteState) {
  const c = CONTROLS.find((x) => x.key === key)!;
  const occ = getOccasion(s.occasion);
  let nat = naturalValue(c, natural);
  if (c.key === 'penWidth' && !ENGINE_TIPS) nat *= penSizeFactor(s.penSize);
  return clamp(nat + (s.offsets[key] ?? 0) + (occ?.deltas[key] ?? 0) * (occ ? s.amount : 0), c.min, c.max);
}

/** The offset that makes a control show `v`. */
export function offsetFor(key: string, v: number, natural: Hand, s: NoteState) {
  const c = CONTROLS.find((x) => x.key === key)!;
  const occ = getOccasion(s.occasion);
  let nat = naturalValue(c, natural);
  if (c.key === 'penWidth' && !ENGINE_TIPS) nat *= penSizeFactor(s.penSize);
  return v - nat - (occ?.deltas[key] ?? 0) * (occ ? s.amount : 0);
}

export const effectiveHand = (natural: Hand, e: Effective) => withOverrides(natural, e.overrides);

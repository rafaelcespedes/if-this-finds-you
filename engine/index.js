// engine/index.js — the public API of the handwriting engine. UIs import from here only.
//
//   const hand = makeHand('maple-river-42', 'script');
//   const p = withOverrides(hand, { neatness: 0.8 });
//   const page = layout(p, 'Dear Ada,', { maxWidth: 9000 });
//   const svg = renderSVG(p, page, { width: 720, emPx: 58 });
//
// Sources register skeletons on import; add new source modules to the list below.

import './sources/hershey.js';
import './sources/extras.js';

export { rng, makeNoise } from './core.js';
export { defineStyle, register, addComposer, addTransform, variants, choose, getStyle, styleNames, stylesInFamily } from './glyphs.js';
export { makeHand, withOverrides, makeGlyph, has, isLower, isUpper, isDigit, CAP, UPM } from './hand.js';
export { PENS, getPen, penOutline, simplify } from './pen.js';
export { layout } from './layout.js';
export { kinematics } from './kinematics.js';
export { renderSVG, contoursToD } from './render-svg.js';
export { buildFont, verify, glyphName } from './fontbuild.js';
export { EXTRAS } from './sources/extras.js';
export { STYLE_DIMS, STYLE_PARAMS, STYLE_NEUTRAL, MOVEMENTS, movementOf, styleTraits, styleDims } from './style-dims.js';

import { HAND_PARAMS } from './hand.js';
import { PEN_PARAMS } from './pen.js';
import { STYLE_PARAMS } from './style-dims.js'; // per-writer style dimensions (registers a skeleton transform)

// User-facing controls, grouped. Each entry: { key, label, group, min, max, step, format } or
// { key, label, group, type: 'select', options() }. UIs render these; modules add their own.
export const PARAMS = [...HAND_PARAMS, ...PEN_PARAMS, ...STYLE_PARAMS];

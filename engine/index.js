// engine/index.js — the public API of the handwriting engine. UIs import from here only.
//
//   const hand = makeHand('maple-river-42', 'script');
//   const p = withOverrides(hand, { neatness: 0.8 });
//   const page = layout(p, 'Dear Ada,', { maxWidth: 9000 });
//   const svg = renderSVG(p, page, { width: 720, emPx: 58 });
//   el.innerHTML = renderSVG(p, page, { width: 720, emPx: 58, strokeIds: true });
//   playSVG(el.firstChild, page, { emPx: 58 }).play();     // write it, stroke by stroke
//
// Sources register skeletons on import; add new source modules to the list below.

import './sources/hershey.js';
import './sources/extras.js';

export { rng, makeNoise } from './core.js';
export { defineStyle, register, addComposer, addTransform, variants, choose, getStyle, styleNames, stylesInFamily } from './glyphs.js';
export { makeHand, addHandTraits, withOverrides, makeGlyph, has, isLower, isUpper, isDigit, CAP, UPM } from './hand.js';
export { PENS, getPen, penKey, penOutline, strokeInk, simplify, INKS, inkModel, inkRGB, PAPER_REF } from './pen.js';
export { layout, pageHabits, spreadOf } from './layout.js';
export { kinematics } from './kinematics.js';
export { timeline, frameAt, strokeFraction, createPlayer, playSVG } from './animate.js';
export { renderSVG, contoursToD } from './render-svg.js';
export { renderCanvas, warmCanvas, PAPERS } from './render-canvas.js';
export { buildFont, verify, glyphName } from './fontbuild.js';
export { EXTRAS } from './sources/extras.js';

import { HAND_PARAMS } from './hand.js';
import { PEN_PARAMS, INK_PARAMS } from './pen.js';
import { PAGE_PARAMS } from './layout.js';

// User-facing controls, grouped. Each entry: { key, label, group, min, max, step, format } or
// { key, label, group, type: 'select', options() }. UIs render these; modules add their own.
export const PARAMS = [...HAND_PARAMS, ...PEN_PARAMS, ...INK_PARAMS, ...PAGE_PARAMS];

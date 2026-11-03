// engine/index.js — the public API of the handwriting engine. UIs import from here only.
//
//   const hand = makeHand('maple-river-42', 'script');
//   const p = withOverrides(hand, { neatness: 0.8 });
//   const page = layout(p, 'Dear Ada,', { maxWidth: 9000 });
//   const svg = renderSVG(p, page, { width: 720, emPx: 58 });
//   el.innerHTML = renderSVG(p, page, { width: 720, emPx: 58, strokeIds: true });
//   playSVG(el.firstChild, page, { emPx: 58 }).play();     // write it, stroke by stroke
//   const j = writeWithJourney(p, 'Dear Ada,', { maxWidth: 9000 }, { amount: 0.4 }); // a draft, with its slips
//   renderSVG(p, j.page, { width: 720, emPx: 58 });        // j.transcript / j.events say what happened
//   Ink mode (typing that behaves like ink): see sheet.js — newInkDoc, replay, plan, penStep, apply
//
// Sources register skeletons on import; add new source modules to the list below.

import './sources/hershey.js';
import './sources/extras.js';
import './sources/palmer.js';
import './sources/suetterlin.js';
import './sources/arrighi.js';
import './sources/quebec-print.js';
import './sources/spencerian.js';
import './sources/norwegian-1849.js';
import './sources/kurrent-1849.js';
import './sources/polish-1906.js';
import './sources/spanish-1776.js';
import './sources/dutch-1618.js';
import './sources/adult-fr-2023.js';
import './sources/allographs.js';
import './sources/accents.js'; // composes accented letters for every style, so it comes after them

export { rng, makeNoise } from './core.js';
export { defineStyle, register, amend, addComposer, addDeriver, addTransform, transform, variants, choose, getStyle, styleNames, stylesInFamily, families, isHistorical,
  allographOf, allographChar, defineSchooling, defineContinuum, getSchooling, schoolingNames, describeHabits } from './glyphs.js';
export { makeHand, addHandTraits, withOverrides, makeGlyph, has, isLower, isUpper, isDigit, CAP, UPM,
  ARCHETYPES, archetypeOf, latentOf, baseSeed, care, hurryDelta, skeleton, traditionsOf, describeTraditions, tidyHand, builtInSlant } from './hand.js';
export { sampleHand, sampleLook, sampleLooks, sampleSet, LOOK_FILTERS, CHARACTER, characterOf, aboutOf, lookOf, lookDistance, handDistance, chaos, seedFrom, legibility, legibilityParts, NEAT_MIN, VARIETY, LOOK_PENS, LOOK_TIPS, LOOK_PAPERS } from './sampler.js';
export { PENS, getPen, penKey, penOutline, strokeInk, simplify, INKS, inkModel, inkRGB, PAPER_REF, TIPS, handSize, penWidthUnits, emPxFor } from './pen.js';
export { layout, inkPage, writeAt, pageHabits, pageMetrics, spreadOf, lineBaseline, lineAngle, lineLean } from './layout.js';
export { geometry, pathD } from './editing.js';
export { kinematics } from './kinematics.js';
export { timeline, frameAt, strokeFraction, createPlayer, playSVG, createPen, paintPen } from './animate.js';
export { renderSVG, contoursToD, renderRun, runRenderer, runTransform, runChanges } from './render-svg.js';
export { inkSVG } from './ink-svg.js';
export { renderCanvas, warmCanvas, PAPERS } from './render-canvas.js';
export { buildFont, buildFontPackage, verify, glyphName, fontNames, GF_LATIN_CORE } from './fontbuild.js';
export { writeWithJourney, journeyAmount, fixHabits, journeyText } from './corrections.js';
export { newInkDoc, newView, replay, apply, plan, penStep, viewText, draftPage, fairCopy, postScript, dropLast, sheetPage, INK_VERSION } from './sheet.js';
export { logicalText, transcription, summary as inkSummary, encodeDoc, decodeDoc, encodeInkLink, decodeInkLink } from './inklog.js';
export { coverQuality } from './marks.js';
export { EXTRAS } from './sources/extras.js';
export { STYLE_DIMS, STYLE_PARAMS, STYLE_NEUTRAL, MOVEMENTS, movementOf, styleTraits, styleDims } from './style-dims.js';

import { HAND_PARAMS } from './hand.js';
import { PEN_PARAMS, INK_PARAMS } from './pen.js';
import { PAGE_PARAMS } from './layout.js';
import { STYLE_PARAMS } from './style-dims.js'; // per-writer style dimensions (registers a skeleton transform)
import { JOURNEY_PARAMS } from './corrections.js';
import { MOVEMENTS as _MOVEMENTS, movementOf as _movementOf } from './style-dims.js';
import { useMovements } from './sampler.js';
useMovements(_movementOf, _MOVEMENTS); // the Fonts view can filter by kind of movement (sampleLooks)

// User-facing controls, grouped. Each entry: { key, label, group, min, max, step, format, default? } or
// { key, label, group, type: 'select', options() }. UIs render these; modules add their own.
export const PARAMS = [...HAND_PARAMS, ...PEN_PARAMS, ...INK_PARAMS, ...PAGE_PARAMS, ...STYLE_PARAMS, ...JOURNEY_PARAMS];

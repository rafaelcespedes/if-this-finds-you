// API contracts from docs/ARCHITECTURE.md that UIs rely on.
//  - PARAMS entries are well formed (the lab and app build their controls from them)
//  - every hand's natural value of each control lies inside that control's range (else the slider
//    can't show or restore the seed's own value)
//  - hostile input never throws and never produces NaN
//  - makeGlyph returns the documented shape

import { varietySeeds } from '../config.mjs';
import { isFiniteDeep, fmt } from '../util.mjs';

const HOSTILE = ['', ' ', '\n\n\n', '   \n  ', 'a'.repeat(400), '😀👍🏽', 'é', '\t\t', '​‍', 'x\r\ny', '�', 'ﬁ'];

export async function run(ctx) {
  const { E } = ctx;
  const problems = [], lines = [];
  // PARAMS shape
  const keys = new Set();
  for (const d of E.PARAMS) {
    const where = `PARAMS '${d.key}'`;
    if (!d.key || !d.label || !d.group) problems.push({ level: 'fail', msg: `${where} lacks key/label/group` });
    if (keys.has(d.key)) problems.push({ level: 'fail', msg: `${where} is declared twice` });
    keys.add(d.key);
    if (d.type === 'select') { if (typeof d.options !== 'function' || !d.options().length) problems.push({ level: 'fail', msg: `${where} select has no options()` }); }
    else if (!(d.min < d.max) || !(d.step > 0)) problems.push({ level: 'fail', msg: `${where} needs min < max and step > 0` });
  }
  lines.push(`${E.PARAMS.length} controls: ${E.PARAMS.map((d) => d.key).join(', ')}`);
  // natural values within range
  const seeds = varietySeeds(200);
  for (const style of E.styleNames()) {
    const hands = seeds.map((s) => E.makeHand(s, style)); // once per seed, not once per control
    for (const d of E.PARAMS) {
      if (d.type === 'select') {
        const opts = new Set(d.options().map((o) => o.value));
        // a hand without its own value uses the control's default (that's what the UI shows)
        const bad = hands.filter((h) => { const v = h[d.key]; return !opts.has(v == null ? d.default : v); });
        if (bad.length) problems.push({ level: 'fail', msg: `${style}: ${bad.length}/200 hands have a '${d.key}' that isn't one of its options` });
        continue;
      }
      const vals = hands.map((h) => { const v = h[d.key]; return v == null && d.default != null ? d.default : v; });
      const out = vals.filter((v) => !(v >= d.min && v <= d.max));
      if (out.length) problems.push({ level: 'warn', msg: `${style}: ${out.length}/200 hands have ${d.key} outside its control range ${d.min}–${d.max} (e.g. ${fmt(out[0], 2)}) — the slider can't show that hand's own value` });
    }
  }
  // hostile input
  let ok = 0;
  for (const style of E.styleNames()) {
    const p = E.makeHand('hostile', style);
    for (const t of HOSTILE) {
      try {
        const page = E.layout(p, t, { maxWidth: 4000 });
        const svg = E.renderSVG(p, page, { width: 300, emPx: 40 });
        if (!Number.isFinite(page.height) || /NaN|Infinity/.test(svg)) problems.push({ level: 'fail', msg: `${style}: NaN/Infinity for input ${JSON.stringify(t).slice(0, 30)}` });
        else ok++;
      } catch (e) { problems.push({ level: 'fail', msg: `${style}: layout/render threw on ${JSON.stringify(t).slice(0, 30)}: ${e.message}` }); }
    }
    // documented makeGlyph shape
    const g = E.makeGlyph(p, 'a', null);
    if (!(Number.isFinite(g.advance) && Array.isArray(g.contours) && Array.isArray(g.strokes) && g.variant && g.strokes.every((s) => s.center && s.contour && typeof s.dot === 'boolean')))
      problems.push({ level: 'fail', msg: `${style}: makeGlyph no longer returns { advance, contours, strokes: [{center, contour, dot}], variant }` });
    if (g.contours.length !== g.strokes.length || !g.strokes.every((s, i) => s.contour === g.contours[i]))
      problems.push({ level: 'warn', msg: `${style}: strokes[i].contour is not contours[i] (animation relies on drawing order matching)` });
    if (!isFiniteDeep(g.contours)) problems.push({ level: 'fail', msg: `${style}: canonical 'a' has non-finite points` });
  }
  lines.push(`hostile inputs: ${ok}/${HOSTILE.length * E.styleNames().length} rendered cleanly (empty, whitespace, 400-char word, emoji, combining mark, tabs, zero-width, CRLF, U+FFFD, ligature)`);
  return { id: 'contracts', title: 'API contracts', lines, problems, data: {} };
}

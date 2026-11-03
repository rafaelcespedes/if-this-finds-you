// API contracts from docs/ARCHITECTURE.md that UIs rely on.
//  - PARAMS entries are well formed (the lab and app build their controls from them)
//  - every hand's natural value of each control lies inside that control's range (else the slider
//    can't show or restore the seed's own value)
//  - hostile input never throws and never produces NaN
//  - makeGlyph returns the documented shape
//  - sampleLooks (the Fonts view's set of hands) is deterministic, meets its filters, and says so when it can't

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
    for (const d of E.PARAMS) {
      if (d.type === 'select') {
        const opts = new Set(d.options().map((o) => o.value));
        // a hand without its own value uses the control's default (that's what the UI shows)
        const bad = seeds.filter((s) => { const v = E.makeHand(s, style)[d.key]; return !opts.has(v == null ? d.default : v); });
        if (bad.length) problems.push({ level: 'fail', msg: `${style}: ${bad.length}/200 hands have a '${d.key}' that isn't one of its options` });
        continue;
      }
      const vals = seeds.map((s) => { const v = E.makeHand(s, style)[d.key]; return v == null && d.default != null ? d.default : v; });
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
  if (E.sampleLooks) lines.push(fontsViewContract(E, problems));
  lines.push(`hostile inputs: ${ok}/${HOSTILE.length * E.styleNames().length} rendered cleanly (empty, whitespace, 400-char word, emoji, combining mark, tabs, zero-width, CRLF, U+FFFD, ligature)`);
  return { id: 'contracts', title: 'API contracts', lines, problems, data: {} };
}

// sampleLooks(setSeed, n, constraints, opts): docs/FILTERS.md
function fontsViewContract(E, problems) {
  const fail = (msg) => problems.push({ level: 'fail', msg: `sampleLooks: ${msg}` });
  for (const f of E.LOOK_FILTERS) {
    if (!f.key || !f.label || !['choice', 'range', 'toggle'].includes(f.kind)) fail(`LOOK_FILTERS '${f.key}' needs key, label and kind choice|range|toggle`);
    if (f.kind === 'choice' && f.key !== 'movement' && !(typeof f.values === 'function' && f.values().length)) fail(`LOOK_FILTERS '${f.key}' has no values()`);
    if (f.kind === 'range' && !(Array.isArray(f.range) && f.range[0] < f.range[1])) fail(`LOOK_FILTERS '${f.key}' needs range [min, max]`);
  }
  const t0 = Date.now();
  const a = E.sampleLooks('qa-set', 16, {});
  const ms = Date.now() - t0;
  if (JSON.stringify(a) !== JSON.stringify(E.sampleLooks('qa-set', 16, {}))) fail('the same setSeed gave a different set');
  if (a.looks.length !== 16 || a.matched !== 16) fail(`asked for 16 unfiltered hands, got ${a.looks.length} (${a.matched} matched)`);
  if (new Set(a.looks.map((l) => l.seed)).size !== a.looks.length) fail('a writer appears twice in one set');
  for (const l of a.looks) {
    if (!(l.seed && l.style && l.family && l.params && l.pen && l.ink && l.paper && Number.isFinite(l.size))) { fail(`a look lacks seed/style/family/params/pen/ink/paper/size: ${JSON.stringify(l).slice(0, 120)}`); break; }
    if (l.legibility < E.NEAT_MIN) { fail(`Neat only is the default, but ${l.seed} has legibility ${l.legibility}`); break; }
  }
  // filters are met: joined, leaning 15° or more, by visible slant (tradition's own lean plus the hand's)
  const b = E.sampleLooks('qa-set', 12, { family: 'script', slant: [15, null] });
  for (const l of b.looks.filter((x) => x.matches)) {
    const lean = E.builtInSlant(l.style) + l.params.slant;
    if (l.family !== 'script' || lean < 15) { fail(`{ family: 'script', slant: [15, null] } returned ${l.seed} (${l.family}, ${lean.toFixed(1)}°)`); break; }
  }
  if (b.matched < 12) fail(`{ family: 'script', slant: [15, null] } should be easy, but only ${b.matched}/12 matched`);
  // a choice that can't be met returns nothing, with a note; too-tight ranges are topped up and say so
  const c = E.sampleLooks('qa-set', 6, { family: 'print', style: 'palmer' });
  if (c.looks.length || !c.note) fail('an impossible tradition filter should return no hands and a note');
  const d = E.sampleLooks('qa-set', 6, { slant: [42, 45], loops: [0.95, 1], hurry: [0, 0.05] });
  if (d.looks.length !== 6 || d.matched === 6 || !d.note || !d.looks.some((l) => Object.keys(l.nudged).length)) fail('too-tight ranges should still return n hands, nudged, with a note');
  // load more: a second set keeps away from the hands already shown
  const e = E.sampleLooks('qa-set-2', 16, {}, { shown: a.looks });
  if (e.looks.some((l) => a.looks.some((x) => x.seed === l.seed))) fail('opts.shown hands came back in the next set');
  const ds = a.looks.slice(1).map((l) => l.distance).sort((x, y) => x - y);
  return `sampleLooks: 16 hands in ${ms} ms, nearest-pick distance median ${ds[ds.length >> 1].toFixed(2)} (min ${ds[0].toFixed(2)}); filters met; tight filters topped up with a note`;
}

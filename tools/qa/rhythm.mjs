// Page rhythm QA: measures the human-feel.md §8.2 checks that layout and animation own.
// Usage: node tools/qa/rhythm.mjs [seed ...]   (default: a few seeds × print/script × neatness extremes)
// Prints one row per hand and a PASS/FAIL per check, plus timing and determinism.
import * as E from '../../engine/index.js';

const PARA = 'I have been meaning to write to you for weeks, but the days keep folding into each other and the garden takes whatever time is left. The tomatoes finally came in, far too many of them, so I have been giving bags away to anyone who stands still long enough. Yesterday the postman took two. The old maps are still in the blue box under the stairs, and I think you should have them, since you were always the one who knew how to read them properly. I found your letter from the summer we spent at the lake, the one with the drawing of the boat, and I laughed for a long time. Write back soon, and tell me everything about the new house, the city and the little dog, and whether the kettle still whistles.';
const SAME = Array(24).fill('the').join(' '); // text 2, longer for a stable estimate
const REPEATS = 'bookkeeper committee coffee balloon Mississippi assess llama little letters tttt';
const DOTS = 'itinerary: titillating, jitter, quintet, fixity, Tutti-frutti, little bottle, attic';
const W = 13000;

const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db || 1); };
const lag1 = (a) => corr(a.slice(0, -1), a.slice(1));
const f = (x, d = 2) => (x >= 0 ? ' ' : '') + x.toFixed(d);

function measure(seed, style, neat) {
  const p = E.withOverrides(E.makeHand(seed, style), neat == null ? {} : { neatness: neat });
  const xh = p.xHeight * E.CAP;
  const out = {};
  const page = E.layout(p, PARA, { maxWidth: W });
  // 4 line geometry
  const L = page.lineInfo;
  out.slopeSd = sd(L.map((l) => l.slope));
  const pitches = L.slice(1).map((l, i) => l.y - L[i].y);
  out.pitchCv = sd(pitches) / mean(pitches);
  const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const at = (l, x) => { const u = Math.min(1, Math.max(0, (x - l.x0) / (W - l.x0))); return l.y - (x - l.x0) * Math.tan(l.slope * Math.PI / 180) + l.bow * 4 * u * (1 - u) + l.droop * sm((u - 0.55) / 0.45); };
  out.fan = Math.max(...L.slice(1).map((l, i) => Math.abs((at(l, W) - at(L[i], W)) - (at(l, 0) - at(L[i], 0))) / mean(pitches)));
  // 5 left margin: line starts (first glyph x) vary and drift
  const starts = [], ends = [];
  for (let li = 0; li < page.lines; li++) {
    const its = page.items.filter((it) => it.line === li && it.kind === 'glyph');
    if (!its.length) continue;
    starts.push(its[0].x); ends.push(its[its.length - 1].x + its[its.length - 1].g.advance);
  }
  out.marginSd = sd(starts) / W * 100;
  out.raggedSd = sd(ends.slice(0, -1)) / W * 100;
  out.squeeze = Math.min(1, ...page.items.filter((it) => it.g && it.g.pose).map((it) => it.g.pose.squeeze));
  // 3 baseline: word offsets autocorrelated; letter residual within word
  const words = new Map();
  for (const it of page.items) if (it.kind === 'glyph') { if (!words.has(it.word)) words.set(it.word, []); words.get(it.word).push(it); }
  const wordOff = [], resid = [];
  for (const its of words.values()) {
    const l = L[its[0].line];
    const offs = its.map((it) => it.y - at(l, it.x));
    const m = mean(offs);
    wordOff.push(m);
    for (const o of offs) resid.push(o - m);
  }
  out.wordBaseSd = sd(wordOff) / xh * 100;
  out.wordBaseRho = lag1(wordOff);
  out.letterResid = sd(resid) / xh * 100;
  // 12 fatigue: last third vs first third (size, word gap)
  const gl = page.items.filter((it) => it.kind === 'glyph');
  const third = Math.floor(gl.length / 3);
  out.sizeGain = mean(gl.slice(-third).map((it) => it.g.pose.scale)) / mean(gl.slice(0, third).map((it) => it.g.pose.scale)) - 1;
  // 2 correlated variation on "the" ×10
  const p2 = E.layout(p, SAME, { maxWidth: 1e6 });
  const g2 = p2.items.filter((it) => it.kind === 'glyph');
  const sl = g2.map((it) => it.g.pose.slant);
  out.slantR = corr(sl.slice(0, -1), sl.slice(1));
  const byWord = new Map();
  for (const it of g2) { if (!byWord.has(it.word)) byWord.set(it.word, []); byWord.get(it.word).push(it.g.pose.scale); }
  out.wordSizeSd = sd([...byWord.values()].map(mean)) * 100;
  out.letterSlantSd = mean([...new Set(g2.map((it) => it.word))].map((w) => sd(g2.filter((it) => it.word === w).map((it) => it.g.pose.slant))));
  // 1 no identical neighbours: same letter within 10 letters differs by RMS 2–12% xh (centroid-aligned)
  const p4 = E.layout(p, REPEATS, { maxWidth: 1e6 });
  const g4 = p4.items.filter((it) => it.kind === 'glyph');
  const rms = [];
  for (let i = 0; i < g4.length; i++) for (let j = i + 1; j < Math.min(g4.length, i + 10); j++) {
    if (g4[i].ch !== g4[j].ch || g4[i].g.strokes.length !== g4[j].g.strokes.length) continue;
    let acc = 0, n = 0;
    g4[i].g.strokes.forEach((sa, si) => {
      const a = sa.center, b = g4[j].g.strokes[si].center;
      if (a.length !== b.length) return;
      const ca = [mean(a.map((q) => q[0])), mean(a.map((q) => q[1]))], cb = [mean(b.map((q) => q[0])), mean(b.map((q) => q[1]))];
      const sa2 = g4[i].g.pose.scale, sb2 = g4[j].g.pose.scale; // align position and word size
      for (let k = 0; k < a.length; k++) { acc += ((a[k][0] - ca[0]) / sa2 - (b[k][0] - cb[0]) / sb2) ** 2 + ((a[k][1] - ca[1]) / sa2 - (b[k][1] - cb[1]) / sb2) ** 2; n++; }
    });
    if (n) rms.push(Math.sqrt(acc / n) / xh);
  }
  out.repeatMin = Math.min(...rms); out.repeatMax = Math.max(...rms);
  // 11 dots: offset right of the stem top, in x-heights
  const p3 = E.layout(p, DOTS, { maxWidth: 1e6 });
  const dx = [];
  for (const it of p3.items) {
    if (it.ch !== 'i' && it.ch !== 'j') continue;
    const dot = it.g.strokes.find((s) => s.mark === 'dot');
    const stem = it.g.strokes.find((s) => !s.dot && s.center.some((q) => q[1] > xh * 0.5));
    if (!dot || !stem) continue;
    const top = stem.center.reduce((a, q) => (q[1] > a[1] ? q : a));
    const c = mean(dot.center.map((q) => q[0]));
    const cy = mean(dot.center.map((q) => q[1]));
    // compare along the slant: undo the shear for the height difference
    const t = Math.tan(it.g.pose.slant * Math.PI / 180);
    dx.push((c - (top[0] + (cy - top[1]) * t)) / xh);
  }
  out.dotMean = mean(dx); out.dotSd = sd(dx);
  out.tbars = p3.items.filter((it) => it.ch === 't').map((it) => it.g.strokes.filter((s) => s.mark === 'bar').length).join('');
  // 10 wobble: lateral deviation from the canonical letter, share of power at wavelengths < 0.3 xh
  let hf = 0, all = 0;
  for (const it of gl.slice(0, 120)) {
    const can = E.makeGlyph(p, it.ch, null);
    it.g.strokes.forEach((st, si) => {
      const c0 = can.strokes[si];
      if (!c0 || st.dot || c0.center.length !== st.center.length || st.center.length < 12) return;
      const n = st.center.length;
      // lateral deviation (normal to the canonical path), after removing the rotation baked by layout
      const ca = Math.cos(-it.rot), sa = Math.sin(-it.rot);
      const dev = [], s = [0];
      for (let i = 0; i < n; i++) {
        const q = [ca * st.center[i][0] - sa * st.center[i][1], sa * st.center[i][0] + ca * st.center[i][1]];
        const a = c0.center[Math.max(0, i - 1)], b = c0.center[Math.min(n - 1, i + 1)];
        let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1;
        dev.push(((q[0] - c0.center[i][0]) * -ty + (q[1] - c0.center[i][1]) * tx) / tl);
        if (i) s.push(s[i - 1] + Math.hypot(c0.center[i][0] - c0.center[i - 1][0], c0.center[i][1] - c0.center[i - 1][1]));
      }
      const m = mean(dev);
      for (let i = 0; i < n; i++) {
        let acc = 0, cnt = 0; // moving average over 0.3 xh of arclength = the slow part
        for (let j = 0; j < n; j++) if (Math.abs(s[j] - s[i]) <= 0.15 * xh) { acc += dev[j]; cnt++; }
        hf += (dev[i] - acc / cnt) ** 2; all += (dev[i] - m) ** 2;
      }
    });
  }
  out.wobbleHF = all ? hf / all : 0;
  // 14 animation: word pauses ≥ 2× letter pauses; delayed strokes after their word's last stroke
  const tl = E.timeline(page);
  const inWord = [], between = [];
  for (let i = 1; i < tl.events.length; i++) {
    const a = tl.events[i - 1], b = tl.events[i], g = b.t0 - (a.t0 + a.dur);
    (a.word === b.word ? inWord : between).push(g);
  }
  out.pauseRatio = mean(between) / mean(inWord);
  out.secPerChar = tl.duration / PARA.length;
  return out;
}

const seeds = process.argv.slice(2).length ? process.argv.slice(2) : ['maple-river-42', 'quiet-heron-17', 'amber-comet-63'];
const checks = {
  slopeSd: [(v) => v >= 0.3, 'line slope σ ≥ 0.3°'],
  pitchCv: [(v) => v >= 0.03 && v <= 0.1, 'pitch CV 3–10%'],
  fan: [(v) => v >= 0.04, 'a line pair fans ≥ 4%'],
  marginSd: [(v) => v >= 0.3, 'left starts σ ≥ 0.3% of width'],
  squeeze: [(v) => v >= 0.85, 'no word squeezed > 15%'],
  wordBaseSd: [(v) => v >= 1.5 && v <= 5, 'word baseline σ 2–4% xh'],
  wordBaseRho: [(v) => v >= 0.3, 'word offsets autocorrelated'],
  letterResid: [(v) => v >= 0.5 && v <= 3.5, 'letter bob σ 1–3% xh'],
  slantR: [(v) => v >= 0.4, 'adjacent letter slant r ≥ 0.4'],
  dotMean: [(v) => v > 0, 'i-dots land right of the stem'],
  repeatMax: [(v) => v <= 0.12, 'repeats differ by ≤ 12% xh'],
  wobbleHF: [(v) => v < 0.1, '< 10% wobble power below 0.3 xh'],
  pauseRatio: [(v) => v >= 2, 'word pauses ≥ 2× letter pauses'],
};
// informational (owned by the letters workstream, rule 9): repeatMin, nearest same-letter pair ≥ 2% xh
let fails = 0;
for (const seed of seeds) for (const style of ['print', 'script']) for (const neat of [null, 0, 1]) {
  const m = measure(seed, style, neat);
  const bad = Object.entries(checks).filter(([k, [ok]]) => !ok(m[k])).map(([k]) => k);
  fails += bad.length;
  console.log(`${seed.padEnd(16)} ${style.padEnd(6)} neat=${neat == null ? 'seed' : neat}  ` +
    `slope σ${f(m.slopeSd)}° pitchCV${f(m.pitchCv * 100, 1)}% fan${f(m.fan * 100, 0)}% margin σ${f(m.marginSd)}% ragged σ${f(m.raggedSd, 1)}% squeeze${f(m.squeeze)} | ` +
    `wordBase σ${f(m.wordBaseSd, 1)}%xh ρ${f(m.wordBaseRho)} bob σ${f(m.letterResid, 1)}% | slant r${f(m.slantR)} letterSlant σ${f(m.letterSlantSd, 1)}° wordSize σ${f(m.wordSizeSd, 1)}% fatigue size${f(m.sizeGain * 100, 1)}% | ` +
    `repeats ${(m.repeatMin * 100).toFixed(1)}–${(m.repeatMax * 100).toFixed(1)}%xh | dots +${f(m.dotMean)}±${m.dotSd.toFixed(2)}xh bars ${m.tbars} | wobbleHF ${(m.wobbleHF * 100).toFixed(1)}% | pauses ×${m.pauseRatio.toFixed(1)} ${m.secPerChar.toFixed(2)}s/char` +
    (bad.length ? `  FAIL: ${bad.join(', ')}` : '  ok'));
}
// determinism + speed (600 characters)
let text = ''; while (text.length < 600) text += PARA + ' '; text = text.slice(0, 600);
for (const style of ['print', 'script']) {
  const p = E.makeHand('maple-river-42', style);
  const a = E.renderSVG(p, E.layout(p, text, { maxWidth: W }), { width: 800, emPx: 58 });
  const b = E.renderSVG(p, E.layout(p, text, { maxWidth: W }), { width: 800, emPx: 58 });
  let tl = 0, tr = 0, tt = 0;
  for (let i = 0; i < 6; i++) {
    const t0 = performance.now(); const page = E.layout(p, text, { maxWidth: W }); const t1 = performance.now();
    E.renderSVG(p, page, { width: 800, emPx: 58 }); const t2 = performance.now();
    E.timeline(page); const t3 = performance.now();
    if (i) { tl += t1 - t0; tr += t2 - t1; tt += t3 - t2; }
  }
  console.log(`${style}: 600 chars — layout ${(tl / 5).toFixed(0)} ms, renderSVG ${(tr / 5).toFixed(0)} ms, timeline ${(tt / 5).toFixed(0)} ms; same seed+text → identical SVG: ${a === b}`);
  if (a !== b) fails++;
}
console.log(fails ? `${fails} check(s) outside the target range` : 'all checks in range');

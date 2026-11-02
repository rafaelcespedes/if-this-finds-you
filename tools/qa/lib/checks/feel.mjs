// Human feel: the QA rubric from docs/research/human-feel.md §8.2, measured from stroke geometry.
//
// Each row is the doc's check, measured over many hands, compared with the doc's own pass condition.
// PASS = meets the research target · MISS = doesn't (reported as a warning; it never fails the run,
// because these are quality targets, not contracts) · n/a = can't be measured yet.
// Numbers marked "est." in the doc are starting values; when the doc changes, update RUBRIC below.
// Extra rows (spacing, legibility) cover rules 13 and 23 of the same doc.

import fs from 'node:fs';
import path from 'node:path';
import { TEXTS, RENDER, statSeeds, sheetSeeds } from '../config.mjs';
import { features, distance } from './variety.mjs';
import { stats, fmt, bboxOf, widthProfile, rasterize, iou } from '../util.mjs';

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const sd = (a) => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
const med = (a) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : NaN; };
function corr(xs, ys) {
  const n = xs.length; if (n < 3) return NaN;
  const mx = mean(xs), my = mean(ys);
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < n; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; c += (ys[i] - my) ** 2; }
  return b && c ? a / Math.sqrt(b * c) : NaN;
}
function linfit(xs, ys) {
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const slope = sxx ? sxy / sxx : 0;
  return { slope, at: (x) => my + slope * (x - mx), resid: ys.map((y, i) => y - (my + slope * (xs[i] - mx))) };
}
function resample(pts, n) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = s[s.length - 1] || 1, out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const t = L * k / (n - 1);
    while (j < s.length - 2 && s[j + 1] < t) j++;
    const u = s[j + 1] > s[j] ? (t - s[j]) / (s[j + 1] - s[j]) : 0;
    out.push([pts[j][0] + (pts[j + 1 < pts.length ? j + 1 : j][0] - pts[j][0]) * u, pts[j][1] + (pts[j + 1 < pts.length ? j + 1 : j][1] - pts[j][1]) * u]);
  }
  return out;
}
const lines = (g) => g.strokes.filter((s) => !s.dot).map((s) => s.center);
// RMS shape difference after removing translation (same allograph assumed; NaN if stroke structure differs)
function alignedRMS(a, b) {
  const A = lines(a), B = lines(b);
  if (A.length !== B.length || !A.length) return NaN;
  const pa = A.flatMap((c) => resample(c, 24)), pb = B.flatMap((c) => resample(c, 24));
  const ca = [mean(pa.map((q) => q[0])), mean(pa.map((q) => q[1]))], cb = [mean(pb.map((q) => q[0])), mean(pb.map((q) => q[1]))];
  let s = 0;
  for (let i = 0; i < pa.length; i++) s += (pa[i][0] - ca[0] - pb[i][0] + cb[0]) ** 2 + (pa[i][1] - ca[1] - pb[i][1] + cb[1]) ** 2;
  return Math.sqrt(s / pa.length);
}
// slant of one glyph instance: length-weighted angle of near-vertical centerline segments (deg, + = right)
function slantOf(g, minLen) {
  let num = 0, den = 0;
  for (const c of lines(g)) for (let i = 1; i < c.length; i++) {
    const dx = c[i][0] - c[i - 1][0], dy = c[i][1] - c[i - 1][1], L = Math.hypot(dx, dy);
    if (L > 0 && Math.abs(dy) > 1.5 * Math.abs(dx)) { num += Math.atan(dx / dy) * L; den += L; }
  }
  return den > minLen ? num / den * 180 / Math.PI : NaN;
}
const topOf = (g) => bboxOf(lines(g)).y1;
const gl = (page) => page.items.filter((it) => it.kind === 'glyph');
function wordsOf(items) {
  const words = []; let cur = [];
  for (const it of items) {
    const last = cur[cur.length - 1];
    if (last && (it.charIndex !== last.charIndex + 1 || it.line !== last.line)) { words.push(cur); cur = []; }
    cur.push(it);
  }
  if (cur.length) words.push(cur);
  return words;
}
const isLow = (c) => c >= 'a' && c <= 'z';
const BASE_SITTERS = new Set('acehiklmnorstuvwxzABCDEHIKLMNORSTUVWXZ');
const XH_LETTERS = new Set('acemnorsuvwxz');

// ---------- colour (for density -> visible difference) ----------
const hex = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h.trim()); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
function lab(rgb) {
  const lin = rgb.map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const X = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047, Y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2], Z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const dE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
const over = (paper, ink, a) => paper.map((p, i) => p * (1 - a) + ink[i] * a);
function labColours(root) {
  try {
    const css = fs.readFileSync(path.join(root, 'lab', 'index.html'), 'utf8');
    const ink = /--ink:\s*(#[0-9a-f]{6})/i.exec(css), paper = /--paper:\s*(#[0-9a-f]{6})/i.exec(css);
    return { ink: hex(ink ? ink[1] : '#1c2233'), paper: hex(paper ? paper[1] : '#fffdf8'), inkHex: ink ? ink[1] : '#1c2233' };
  } catch { return { ink: hex('#1c2233'), paper: hex('#fffdf8'), inkHex: '#1c2233' }; }
}

export async function run(ctx) {
  const { E, root } = ctx;
  const CAP = E.CAP || 700;
  const problems = [], out = [], data = {};
  const seeds = statSeeds(ctx.args.quick ? 8 : 24);
  const opts = { maxWidth: RENDER.width / (RENDER.emPx / 1000), lineHeight: RENDER.lineEm * 1000 };
  const colours = labColours(root);

  for (const style of E.styleNames()) {
    const connected = !!(E.getStyle(style) && E.getStyle(style).connected);
    const V = {}; const put = (k, v) => { if (Number.isFinite(v)) (V[k] = V[k] || []).push(v); };
    const pairs = { slant: [[], []] }, sizeBetween = [], sizeWithin = [];
    let structuralFlat = true, pathCount = 0, contourCount = 0;
    const opacities = [], dotAngles = [], conf = new Map(), digitVsLower = { dS: [], lS: [], dV: [], lV: [] }, capsLower = [];
    let kinR = [];
    for (const seed of seeds) {
      const p = E.makeHand(seed, style);
      const canon = new Map();
      const C = (ch) => { if (!canon.has(ch)) canon.set(ch, E.makeGlyph(p, ch, null)); return canon.get(ch); };
      const xh = med([...'xunvzm'].map((c) => topOf(C(c))));
      const lay = (t) => E.layout(p, TEXTS[t], opts);

      // 1 no identical neighbours
      const g1 = gl(lay('rRepeats'));
      for (let i = 0; i < g1.length; i++) for (let j = i + 1; j < g1.length && g1[j].charIndex - g1[i].charIndex <= 10; j++) {
        if (g1[i].ch !== g1[j].ch || !isLow(g1[i].ch)) continue;
        put('r1', alignedRMS(g1[i].g, g1[j].g) / xh);
      }
      // 2 correlated variation (slant of adjacent letters; size between vs within words)
      for (const t of ['rSameWord', 'long']) {
        const items = gl(lay(t));
        for (const w of wordsOf(items)) {
          const dev = w.map((it) => slantOf(it.g, 0.4 * xh) - slantOf(C(it.ch), 0.4 * xh));
          for (let i = 1; i < w.length; i++) if (Number.isFinite(dev[i]) && Number.isFinite(dev[i - 1])) { pairs.slant[0].push(dev[i - 1]); pairs.slant[1].push(dev[i]); }
          const sz = w.filter((it) => isLow(it.ch)).map((it) => topOf(it.g) / topOf(C(it.ch)));
          if (sz.length >= 3) { sizeBetween.push(mean(sz)); sizeWithin.push(sd(sz)); }
        }
      }
      // 3–6, 12 on the long paragraph
      const page = lay('long');
      const items = gl(page);
      const byLine = new Map();
      for (const it of items) { if (!byLine.has(it.line)) byLine.set(it.line, []); byLine.get(it.line).push(it); }
      const L = [...byLine.values()];
      const bottom = (it) => Math.max(...lines(it.g).flat().map((q) => it.y - q[1]));
      const fits = [], starts = [], ends = [];
      const wordOffsets = [];
      for (const ln of L) {
        const base = ln.filter((it) => BASE_SITTERS.has(it.ch));
        if (base.length < 6) continue;
        const f = linfit(base.map((it) => it.x), base.map(bottom));
        fits.push({ f, x0: ln[0].x, x1: ln[ln.length - 1].x + ln[ln.length - 1].g.advance });
        // 3: letter-bottom residuals per word, word offsets autocorrelation
        const offs = [];
        for (const w of wordsOf(ln)) {
          const b = w.filter((it) => BASE_SITTERS.has(it.ch));
          if (b.length < 2) continue;
          const ys = b.map(bottom), m = mean(ys);
          put('r3letter', sd(ys) / xh);
          offs.push(m - f.at(mean(b.map((it) => it.x))));
        }
        wordOffsets.push(offs);
        starts.push(ln[0].x + bboxOf(ln[0].g.contours).x0);
        ends.push(ln[ln.length - 1].x + bboxOf(ln[ln.length - 1].g.contours).x1);
      }
      const ac = [[], []];
      for (const offs of wordOffsets) for (let i = 1; i < offs.length; i++) { ac[0].push(offs[i - 1]); ac[1].push(offs[i]); }
      put('r3rho', corr(ac[0], ac[1]));
      // 4 line geometry
      if (fits.length >= 3) {
        put('r4slopeSd', sd(fits.map((x) => Math.atan(x.f.slope) * 180 / Math.PI)));
        const xl = Math.min(...fits.map((x) => x.x0)), xr = Math.max(...fits.map((x) => x.x1));
        const pitch = [], fan = [];
        for (let i = 1; i < fits.length; i++) {
          const gl0 = fits[i].f.at(xl) - fits[i - 1].f.at(xl), gr = fits[i].f.at(xr) - fits[i - 1].f.at(xr);
          pitch.push((gl0 + gr) / 2); fan.push(Math.abs(gr - gl0) / ((gl0 + gr) / 2));
        }
        put('r4pitchCV', sd(pitch) / mean(pitch)); put('r4fan', Math.max(...fan));
        put('pitchXh', mean(pitch) / xh);
      }
      // 5 left margin; 6 right margin
      const width = opts.maxWidth;
      if (starts.length >= 3) {
        put('r5sd', sd(starts) / width);
        put('r5drift', linfit(starts.map((_, i) => i), starts).slope / width);
        put('r6ragged', sd(ends.slice(0, -1)) / width);
      }
      for (const ln of L.slice(0, -1)) {
        const w = wordsOf(ln).pop();
        const act = w.reduce((s, it) => s + it.g.advance, 0), nat = w.reduce((s, it) => s + C(it.ch).advance, 0);
        put('r6squeeze', 1 - act / nat);
      }
      // 12 fatigue: last third vs first third (size of x-height letters, word gaps)
      const third = Math.max(1, Math.floor(L.length / 3));
      const sizeOf = (lns) => mean(lns.flat().filter((it) => XH_LETTERS.has(it.ch)).map((it) => topOf(it.g)));
      const gapOf = (lns) => { const g = []; for (const ln of lns) for (let i = 1; i < ln.length; i++) if (ln[i].charIndex > ln[i - 1].charIndex + 1) g.push(ln[i].x - ln[i - 1].x - ln[i - 1].g.advance); return mean(g); };
      put('r12size', sizeOf(L.slice(-third)) / sizeOf(L.slice(0, third)) - 1);
      put('r12space', gapOf(L.slice(-third)) / gapOf(L.slice(0, third)) - 1);
      // spacing rhythm (rule 13)
      const wg = [], lg = [];
      for (const ln of L) for (let i = 1; i < ln.length; i++) {
        const A = ln[i - 1], B = ln[i];
        if (B.charIndex > A.charIndex + 1) wg.push(B.x - A.x - A.g.advance);
        else if (!connected && isLow(A.ch) && isLow(B.ch)) {
          const band = (g, x0, side) => { const m = new Map(); for (const c of g.contours) for (const q of c) { const k = Math.floor(q[1] / 40); const v = x0 + q[0]; const o = m.get(k); if (o == null || (side > 0 ? v > o : v < o)) m.set(k, v); } return m; };
          const ra = band(A.g, A.x, 1), lb = band(B.g, B.x, -1);
          let g = Infinity; for (const [k, v] of ra) if (lb.has(k)) g = Math.min(g, lb.get(k) - v);
          if (Number.isFinite(g)) lg.push(g / xh);
        }
      }
      put('wordCV', sd(wg) / mean(wg));
      if (lg.length) { put('letterCV', sd(lg) / mean(lg)); put('collide', lg.filter((g) => g < 0).length / lg.length); put('hole', lg.filter((g) => g > 0.6).length / lg.length); }

      // 7–8 ink density and colour (from the SVG the lab would show)
      const svg = E.renderSVG(p, page, { width: RENDER.width, emPx: RENDER.emPx });
      const ops = [...svg.matchAll(/fill-opacity="([\d.]+)"/g)].map((m) => +m[1]);
      opacities.push(...ops);
      pathCount += (svg.match(/<path\b/g) || []).length;
      contourCount += items.reduce((s, it) => s + it.g.contours.length, 0);
      if (/Gradient|<mask|<pattern|feImage|<image/.test(svg)) structuralFlat = false;
      // 9 stroke ends; width down/up (pressure as width)
      for (const it of items.slice(0, 120)) for (const s of it.g.strokes) {
        if (s.dot || s.center.length < 12 || !/[A-Za-z]/.test(it.ch)) continue;
        const w = widthProfile(s, 2);
        const m = med(w);
        put('r9blunt', w[w.length - 1] / m >= 0.85 ? 1 : 0);
        put('r9startBlunt', w[0] / m >= 0.85 ? 1 : 0);
        put('r9startRatio', w[0] / m); put('r9endRatio', w[w.length - 1] / m);
        const c = s.center; let dn = 0, dnN = 0, up = 0, upN = 0;
        for (let i = 1, k = 0; k < w.length; i += 2, k++) {
          const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
          const dx = b[0] - a[0], dy = b[1] - a[1];
          if (dy < -1.5 * Math.abs(dx)) { dn += w[k]; dnN++; } else if (dy > 1.5 * Math.abs(dx)) { up += w[k]; upN++; }
        }
        if (dnN > 2 && upN > 2) put('widthDownUp', (dn / dnN) / (up / upN));
        put('widthCV', sd(w) / mean(w));
      }
      // 10 wobble spectrum: instance vs canonical lateral difference; share of power below 0.3 xh wavelength
      for (const it of items.slice(0, 60)) {
        if (!/[a-z]/.test(it.ch)) continue;
        const A = lines(it.g), B = lines(C(it.ch));
        if (A.length !== B.length) continue;
        A.forEach((a, si) => {
          const b = B[si]; if (a.length !== b.length || a.length < 20) return;
          const d = a.map((q, i) => { const j0 = Math.max(0, i - 1), j1 = Math.min(b.length - 1, i + 1); let tx = b[j1][0] - b[j0][0], ty = b[j1][1] - b[j0][1]; const tl = Math.hypot(tx, ty) || 1; return ((q[0] - b[i][0]) * -ty + (q[1] - b[i][1]) * tx) / tl; });
          const step = mean(b.slice(1).map((q, i) => Math.hypot(q[0] - b[i][0], q[1] - b[i][1]))) || 7;
          const win = Math.max(1, Math.round(0.3 * xh / step / 2));
          const low = d.map((_, i) => mean(d.slice(Math.max(0, i - win), i + win + 1)));
          const md = mean(d);
          const tot = d.reduce((s, v) => s + (v - md) ** 2, 0), hf = d.reduce((s, v, i) => s + (v - low[i]) ** 2, 0);
          if (tot > 0) { put('r10share', hf / tot); put('r10amp', Math.sqrt(hf / d.length) / xh); }
        });
      }
      // 11 delayed strokes (i/j dots)
      for (const it of gl(lay('rDots'))) {
        if (it.ch !== 'i' && it.ch !== 'j') continue;
        const dot = it.g.strokes.find((s) => s.dot); if (!dot) continue;
        const stem = lines(it.g).flat();
        const topPt = stem.reduce((a, q) => (q[1] > a[1] ? q : a));
        const dc = dot.center[1];
        const tan = Math.tan((p.slant || 0) * Math.PI / 180);
        put('r11offset', (dc[0] - (topPt[0] + (dc[1] - topPt[1]) * tan)) / xh);
        const a0 = dot.center[0], a2 = dot.center[dot.center.length - 1];
        dotAngles.push({ seed, a: Math.atan2(a2[1] - a0[1], a2[0] - a0[0]) * 180 / Math.PI });
      }
      // 13 digits vs lowercase; caps vs lowercase
      for (const t of ['rNumbers', 'long']) for (const it of gl(lay(t))) {
        const dig = /[0-9]/.test(it.ch), low = isLow(it.ch);
        if (!dig && !low) continue;
        const s = slantOf(it.g, 0.3 * xh), v = alignedRMS(it.g, C(it.ch)) / xh;
        if (dig) { if (Number.isFinite(s)) digitVsLower.dS.push(Math.abs(s)); if (Number.isFinite(v)) digitVsLower.dV.push(v); }
        else { if (Number.isFinite(s)) digitVsLower.lS.push(Math.abs(s)); if (Number.isFinite(v)) digitVsLower.lV.push(v); }
      }
      for (const [lc, uc] of [['c', 'C'], ['o', 'O'], ['s', 'S'], ['v', 'V'], ['w', 'W'], ['x', 'X'], ['z', 'Z'], ['u', 'U']]) {
        const norm = (g) => { const b = bboxOf(g.contours); const k = 1000 / Math.max(b.w, b.h); return g.contours.map((c) => c.map((q) => [(q[0] - b.x0) * k, (q[1] - b.y0) * k])); };
        capsLower.push(iou(rasterize(norm(C(lc)), -50, -50, 1100, 32), rasterize(norm(C(uc)), -50, -50, 1100, 32)));
      }
      // legibility guard (rule 23): per-use warp and slant
      for (const it of items.slice(0, 200)) {
        if (!isLow(it.ch)) continue;
        put('warp', alignedRMS(it.g, C(it.ch)) / xh);
        const s = slantOf(it.g, 0.4 * xh), s0 = slantOf(C(it.ch), 0.4 * xh);
        if (Number.isFinite(s) && Number.isFinite(s0)) put('slantDev', Math.abs(s - s0));
      }
      for (const [a, b] of [['l', '1'], ['l', 'I'], ['I', '1'], ['l', '|'], ['O', '0'], ['S', '5'], ['Z', '2'], ['B', '8'], ['g', '9'], ['u', 'v'], ['n', 'h'], ['a', 'o'], ['e', 'c'], ['r', 'v'], ['i', 'l']]) {
        if (!E.has(p, a) || !E.has(p, b)) continue;
        const ga = C(a), gb = C(b);
        const v = iou(rasterize(ga.contours, bboxOf(ga.contours).x0 - 100, -400, 1300), rasterize(gb.contours, bboxOf(gb.contours).x0 - 100, -400, 1300));
        const k = a + ' / ' + b; conf.set(k, [...(conf.get(k) || []), v]);
      }
      // 14 kinematics (until animation exists): speed should dip where curvature peaks
      if (E.kinematics) for (const ch of 'aenmorsu') {
        for (const c of lines(C(ch))) {
          if (c.length < 20) continue;
          const k = E.kinematics(c, { xh });
          kinR.push(corr([...k.kappa].map(Math.log), [...k.vn]));
        }
      }
    }

    // ---------- verdicts ----------
    const S = (k) => stats(V[k] || []);
    const rows = [];
    const row = (n, check, measured, target, pass) => rows.push({ n, check, measured, target, verdict: pass == null ? 'n/a' : pass ? 'PASS' : 'MISS' });
    const r1 = S('r1');
    const r1in = (V.r1 || []).filter((v) => v >= 0.02 && v <= 0.12).length / Math.max(1, (V.r1 || []).length);
    row(1, 'No identical neighbours', `same-letter RMS ${fmt(r1.p05 * 100, 1)}–${fmt(r1.p95 * 100, 1)}% xh (p5–p95); ${fmt(r1in * 100, 0)}% of ${r1.n} pairs in band; closest ${fmt(r1.min * 100, 1)}%`, '2–12% xh', r1in >= 0.95);
    const rs = corr(pairs.slant[0], pairs.slant[1]);
    const sb = sd(sizeBetween), sw = mean(sizeWithin);
    row(2, 'Correlated variation', `adjacent-letter slant r = ${fmt(rs, 2)}; word size spread ${fmt(sb * 100, 1)}% vs within-word ${fmt(sw * 100, 1)}%`, 'r ≥ 0.4; between > within', rs >= 0.4 && sb > sw);
    const r3 = S('r3letter'), r3r = S('r3rho');
    row(3, 'Baseline within a line', `letter-bottom σ per word ${fmt(r3.median * 100, 1)}% xh; word-offset ρ ${fmt(r3r.median, 2)}`, 'σ 1–3% xh; ρ ≥ 0.4', r3.median >= 0.01 && r3.median <= 0.03 && r3r.median >= 0.4);
    const s4 = S('r4slopeSd'), p4 = S('r4pitchCV'), f4 = S('r4fan'), px = S('pitchXh');
    row(4, 'Line geometry', `slope σ ${fmt(s4.median, 2)}°; pitch CV ${fmt(p4.median * 100, 1)}% (pitch ${fmt(px.median, 2)} xh); max fan ${fmt(f4.median * 100, 1)}%`, 'σ ≥ 0.3°; CV 3–10%; fan ≥ 4%', s4.median >= 0.3 && p4.median >= 0.03 && p4.median <= 0.10 && f4.median >= 0.04);
    const s5 = S('r5sd'), d5 = S('r5drift');
    row(5, 'Left margin', `line-start σ ${fmt(s5.median * 100, 2)}% of width; drift ${fmt(d5.median * 100, 2)}%/line`, 'σ ≥ 0.3%; drifts inward (≥ 0.05%/line)', s5.median >= 0.003 && d5.median >= 0.0005);
    const r6 = S('r6ragged'), q6 = S('r6squeeze');
    row(6, 'Right margin', `line-end σ ${fmt(r6.median * 100, 1)}% of width; last-word squeeze max ${fmt(q6.max * 100, 1)}%`, 'ragged; squeeze ≤ 15%', r6.median > 0.01 && q6.max <= 0.15);
    const opS = stats(opacities);
    const flat = structuralFlat && pathCount === contourCount;
    const aMed = opS.median, cross = 1 - (1 - aMed) ** 2;
    const dCross = dE(over(colours.paper, colours.ink, aMed), over(colours.paper, colours.ink, cross));
    row(7, 'Ink density', flat ? `one flat fill per stroke → within-stroke CV 0%, down/up density 1.00; crossing ΔE ${fmt(dCross, 1)} (opacity ${fmt(aMed, 2)} → ${fmt(cross, 3)})` : 'density varies inside strokes — measure visually', 'CV 8–20%; down/up ≥ 1.15; crossings visibly darker', flat ? false : null);
    const dDen = dE(over(colours.paper, colours.ink, opS.p10), over(colours.paper, colours.ink, opS.p90));
    row(8, 'Colour', `p10/p90 opacity ${fmt(opS.p10, 2)}/${fmt(opS.p90, 2)} on ${colours.inkHex} → ΔE ${fmt(dDen, 1)}; one hue, saturation never changes`, 'ΔE ≥ 10 in lightness and saturation', dDen >= 10);
    const b9 = mean(V.r9blunt || []), st9 = mean(V.r9startRatio || []), en9 = mean(V.r9endRatio || []);
    row(9, 'Stroke ends', `${fmt(b9 * 100, 0)}% of stroke ends ≥ 85% of stroke width (blunt); mean start/end width ${fmt(st9, 2)} / ${fmt(en9, 2)} of median; caps are round on both ends`, '≤ 15% blunt; starts differ from ends', b9 <= 0.15 && Math.abs(st9 - en9) >= 0.1);
    const w10 = S('r10share'), a10 = S('r10amp');
    row(10, 'Wobble spectrum', `${fmt(w10.median * 100, 0)}% of per-use lateral deviation below 0.3 xh wavelength (amplitude ${fmt(a10.median * 100, 2)}% xh)`, '< 10% below 0.3 xh', w10.median < 0.10);
    const o11 = S('r11offset');
    const angSd = (() => { const by = new Map(); for (const d of dotAngles) { if (!by.has(d.seed)) by.set(d.seed, []); by.get(d.seed).push(d.a); } return med([...by.values()].map(sd)); })();
    row(11, 'Delayed strokes (i/j dots)', `offset right of stem axis mean ${fmt(o11.mean, 2)} xh, σ ${fmt(o11.sd, 2)} xh; dot angle σ within a writer ${fmt(angSd, 0)}°`, 'mean > 0 (0.1–0.6 xh); σ > 0; shape consistent per writer', o11.mean > 0.05 && o11.sd > 0 && angSd < 15);
    const z12 = S('r12size'), sp12 = S('r12space');
    row(12, 'Fatigue', `last third vs first: size ${fmt(z12.median * 100, 1)}%, word spacing ${fmt(sp12.median * 100, 1)}%`, 'size +2–8%; spacing +5–10%', z12.median >= 0.02 && z12.median <= 0.08 && sp12.median >= 0.05 && sp12.median <= 0.10);
    const dS = med(digitVsLower.dS), lS = med(digitVsLower.lS), dV = med(digitVsLower.dV), lV = med(digitVsLower.lV), cl = med(capsLower);
    row(13, 'Numbers and caps', `|slant| digits ${fmt(dS, 1)}° vs lowercase ${fmt(lS, 1)}°; per-use variation digits ${fmt(dV * 100, 1)}% vs lowercase ${fmt(lV * 100, 1)}% xh; caps≈lowercase shape overlap ${fmt(cl, 2)}`, 'digits more upright and less varied; caps not scaled lowercase', dS < lS * 0.85 && dV < lV * 0.85);
    const kr = med(kinR);
    row(14, 'Animation / time axis', E.kinematics ? `no animation yet; kinematics(): corr(log curvature, speed) ${fmt(kr, 2)}, not yet used by ink or layout` : 'no animation, no time axis', 'speed dips at curvature peaks; word pauses ≥ 2× letter pauses', null);
    const ten = sheetSeeds(false).slice(0, 10).map((s) => ({ s, f: features(E, E.makeHand(s, style)) }));
    let minD = Infinity, minPair = '';
    for (let i = 0; i < ten.length; i++) for (let j = i + 1; j < ten.length; j++) { const d = distance(ten[i].f, ten[j].f).d; if (d < minD) { minD = d; minPair = `${ten[i].s} ~ ${ten[j].s}`; } }
    row(15, 'Seed coherence', `same seed → byte-identical writer (see determinism); 10 sheet seeds: closest pair ${fmt(minD, 2)} JND (${minPair})`, 'ten seeds, ten clearly different writers (≥ 3 JND)', minD >= 3);
    // extras from the rules list
    const wcv = S('wordCV'), lcv = S('letterCV');
    row('r13', 'Spacing rhythm', `word gap CV ${fmt(wcv.median * 100, 0)}%${connected ? '' : `; letter gap CV ${fmt(lcv.median * 100, 0)}%; collisions ${fmt(S('collide').median * 100, 1)}%, holes > 0.6 xh ${fmt(S('hole').median * 100, 1)}%`}`, connected ? 'word CV 15–30%' : 'word CV 15–30%; letter CV 10–20%', wcv.median >= 0.15 && wcv.median <= 0.30 && (connected || (lcv.median >= 0.10 && lcv.median <= 0.20)));
    const wp = S('warp'), sdv = S('slantDev');
    row('r23', 'Legibility guard', `per-use warp RMS p95 ${fmt(wp.p95 * 100, 1)}% xh; slant deviation p95 ${fmt(sdv.p95, 1)}°`, 'warp ≤ 6% xh; slant within ±8°', wp.p95 <= 0.06 && sdv.p95 <= 8);
    const confList = [...conf].map(([k, v]) => [k, med(v)]).sort((a, b) => b[1] - a[1]);
    const bad = confList.filter(([, v]) => v > 0.8);
    row('lg', 'Confusable characters', `${confList.slice(0, 5).map(([k, v]) => `${k} ${fmt(v, 2)}`).join(', ')}`, 'ink overlap ≤ 0.8 for l/1/I, O/0, S/5 …', !bad.length);
    row('pr', 'Pressure as width (info)', `width along a stroke CV ${fmt(S('widthCV').median * 100, 0)}%; downstroke/upstroke width ${fmt(S('widthDownUp').median, 2)}`, 'pointed pen ≈ 2–4 down/up, ballpoint ≈ 1.1–1.4', null);

    data[style] = { rows, raw: Object.fromEntries(Object.entries(V).map(([k, v]) => [k, stats(v)])) };
    const pass = rows.filter((r) => r.verdict === 'PASS').length, miss = rows.filter((r) => r.verdict === 'MISS').length;
    out.push(`${style}: ${pass} PASS · ${miss} MISS · ${rows.length - pass - miss} n/a  (${seeds.length} hands; rubric = docs/research/human-feel.md §8.2)`);
    for (const r of rows) out.push(`    ${r.verdict.padEnd(4)} ${String(r.n).padStart(3)} ${r.check.padEnd(26)} ${r.measured}  [target: ${r.target}]`);
    for (const r of rows) if (r.verdict === 'MISS') problems.push({ level: 'warn', msg: `${style}: rubric ${r.n} "${r.check}" — ${r.measured} (target ${r.target})` });
  }
  return { id: 'feel', title: 'Human feel (docs/research/human-feel.md §8.2 rubric)', lines: out, problems, data };
}

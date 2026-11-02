// Geometry sanity, per glyph and per page.
//  - no NaN / Infinity; no empty outlines for visible characters
//  - advances positive and in a sane range; print ink stays near its advance box
//  - ink stays inside the page (layout's first baseline is 0.95 em, page ends 0.45 em below the last baseline)
//  - i / j have a dot, separate from the stem; other dotted punctuation has the expected number of dots
//  - script: each letter's exit lands on the next letter (gap distribution, in pen widths)
//  - layout keeps glyphs inside maxWidth
//  - style dimensions never break a letter: in context (word starts, ends, joins, lifts), no visible letter keeps
//    less than 40% of the ink it has with every dimension at 0, and no new specks (tiny non-dot strokes) appear

import { KERNEL } from '../charsets.mjs';
import { GEOM, RENDER, NARROW_WIDTH, TEXTS, PARAGRAPH, statSeeds } from '../config.mjs';
import { isFiniteDeep, bboxOf, polyArea, stats, fmtStats, fmt, showCh } from '../util.mjs';

const VISIBLE = (c) => c !== ' ' && c !== ' ';
const EXPECTED_DOTS = { i: 1, j: 1, '.': 1, ':': 2, ';': 1, '!': 1, '?': 1, '…': 3, '÷': 2, '·': 1 };
const isLower = (c) => c >= 'a' && c <= 'z';
const isUpper = (c) => c >= 'A' && c <= 'Z';

export async function run(ctx) {
  const { E } = ctx;
  const problems = [], lines = [], data = {};
  const pens = Object.keys(E.PENS);
  const CAP = E.CAP || 700;

  for (const style of E.styleNames()) {
    const connected = !!(E.getStyle(style) && E.getStyle(style).connected);
    const D = (data[style] = {});
    const ijUses = { n: 0, skipped: [] };
    const bad = { nan: [], empty: [], degenerate: 0, adv: [], top: [], bottom: [], overhang: [], dots: [], dotCount: new Map() };
    const worst = new Map(); // ch -> { top, bottom, seedTop, seedBottom }
    const dotGaps = [];
    let glyphs = 0;
    const seedsAll = statSeeds(24);
    for (const pen of pens) {
      const seeds = pen === pens[0] ? seedsAll : seedsAll.slice(0, 6);
      for (const seed of seeds) {
        const p = E.withOverrides(E.makeHand(seed, style), { pen });
        for (const ch of KERNEL) {
          if (!E.has(p, ch)) continue;
          for (const inst of [null, { seed: 'qa0', amount: 1 }, { seed: 'qa1', amount: 1, baseline: true }]) {
            let g;
            try { g = E.makeGlyph(p, ch, inst); } catch (e) { bad.nan.push(`${seed} ${showCh(ch)} threw ${e.message}`); continue; }
            glyphs++;
            const tag = `${seed}${pen !== pens[0] ? '/' + pen : ''} '${showCh(ch)}'${inst ? ' #' + inst.seed : ''}`;
            if (!Number.isFinite(g.advance) || !isFiniteDeep(g.contours) || !g.strokes.every((s) => isFiniteDeep(s.center))) { bad.nan.push(tag); continue; }
            if (VISIBLE(ch)) {
              if (!g.contours.length || g.contours.some((c) => c.length < 3)) bad.empty.push(tag);
              bad.degenerate += g.contours.filter((c) => polyArea(c) < 1).length;
            }
            if (g.advance <= 0) bad.adv.push(`${tag} advance ${fmt(g.advance, 0)}`);
            else if (g.advance < GEOM.advanceMin || g.advance > GEOM.advanceMax) bad.adv.push(`${tag} advance ${fmt(g.advance, 0)}`);
            if (!g.contours.length) continue;
            const bb = bboxOf(g.contours);
            const w = worst.get(ch) || { top: -Infinity, bottom: Infinity };
            if (bb.y1 > w.top) { w.top = bb.y1; w.seedTop = tag; }
            if (bb.y0 < w.bottom) { w.bottom = bb.y0; w.seedBottom = tag; }
            worst.set(ch, w);
            if (bb.y1 > GEOM.topLimit) bad.top.push(`${tag} top ${fmt(bb.y1, 0)}`);
            if (bb.y0 < GEOM.bottomLimit) bad.bottom.push(`${tag} bottom ${fmt(bb.y0, 0)}`);
            if (!connected && VISIBLE(ch)) {
              // measured in the unslanted frame: neighbours share the same shear, so slant alone isn't overhang
              const tan = Math.tan((p.slant || 0) * Math.PI / 180);
              let ux0 = Infinity, ux1 = -Infinity;
              for (const c of g.contours) for (const q of c) { const x = q[0] - q[1] * tan; if (x < ux0) ux0 = x; if (x > ux1) ux1 = x; }
              const over = Math.max(-ux0, ux1 - g.advance) / g.advance;
              if (over > GEOM.overhangWarn) bad.overhang.push(`${tag} ${Math.round(over * 100)}%`);
            }
            // dots
            if (EXPECTED_DOTS[ch] != null) {
              const dots = g.strokes.filter((s) => s.dot);
              if (dots.length !== EXPECTED_DOTS[ch]) {
                const k = `'${ch}' has ${dots.length} dot(s), expected ${EXPECTED_DOTS[ch]}`;
                bad.dotCount.set(k, (bad.dotCount.get(k) || 0) + 1);
              }
              if ((ch === 'i' || ch === 'j')) {
                // real writers occasionally forget a dot (human-feel rule 7: 0–3% of uses); the canonical form never does
                ijUses.n++;
                if (!dots.length && tag.includes('#qa')) ijUses.skipped.push(tag);
                else if (!dots.length) bad.dots.push(`${tag} has no dot`);
                else {
                  const stem = g.strokes.filter((s) => !s.dot).map((s) => s.contour);
                  const gap = bboxOf(dots.map((s) => s.contour)).y0 - bboxOf(stem).y1;
                  dotGaps.push(gap / (p.xHeight * CAP));
                  if (gap <= 0) bad.dots.push(`${tag} dot touches the stem (gap ${fmt(gap, 0)})`);
                }
              }
            }
          }
        }
      }
    }
    D.glyphs = glyphs;
    lines.push(`${style}: ${glyphs} glyph instances checked (${seedsAll.length} seeds × Kernel × canonical + 2 uses, ${pens.length} pen${pens.length > 1 ? 's' : ''})`);
    const list = (arr, n = 6) => arr.slice(0, n).join('; ') + (arr.length > n ? ` … (+${arr.length - n})` : '');
    if (bad.nan.length) problems.push({ level: 'fail', key: `${style}:nan`, count: bad.nan.length, msg: `${style}: ${bad.nan.length} glyphs with NaN/Infinity or errors: ${list(bad.nan)}` });
    if (bad.empty.length) problems.push({ level: 'fail', key: `${style}:empty`, count: bad.empty.length, msg: `${style}: ${bad.empty.length} visible glyphs with empty outlines: ${list(bad.empty)}` });
    if (bad.degenerate) problems.push({ level: 'warn', msg: `${style}: ${bad.degenerate} zero-area outline contours` });
    if (bad.adv.length) problems.push({ level: bad.adv.some((s) => / advance -|advance 0$/.test(s)) ? 'fail' : 'warn', msg: `${style}: ${bad.adv.length} advances outside ${GEOM.advanceMin}–${GEOM.advanceMax}: ${list(bad.adv)}` });
    if (bad.top.length) problems.push({ level: 'fail', key: `${style}:top`, count: bad.top.length, msg: `${style}: ${bad.top.length} glyphs rise above the page top (> ${GEOM.topLimit}): ${list(bad.top)}` });
    if (bad.bottom.length) problems.push({ level: 'fail', key: `${style}:bottom`, count: bad.bottom.length, msg: `${style}: ${bad.bottom.length} glyphs drop below the page bottom (< ${GEOM.bottomLimit}): ${list(bad.bottom)}` });
    if (bad.overhang.length) problems.push({ level: 'warn', msg: `${style}: ${bad.overhang.length} print glyphs overhang their advance by > ${GEOM.overhangWarn * 100}%: ${list(bad.overhang)}` });
    if (ijUses.skipped.length) {
      const rate = ijUses.skipped.length / Math.max(1, ijUses.n);
      lines.push(`${style}: forgotten i/j dots ${ijUses.skipped.length}/${ijUses.n} uses (${(rate * 100).toFixed(1)}%, allowed ≤ 3%)`);
      if (rate > 0.03) bad.dots.push(`forgotten dots on ${(rate * 100).toFixed(1)}% of uses (> 3%): ${ijUses.skipped.slice(0, 3).join('; ')}`);
    }
    if (bad.dots.length) problems.push({ level: 'fail', key: `${style}:dots`, count: bad.dots.length, msg: `${style}: i/j dot problems in ${bad.dots.length} instances: ${list(bad.dots)}` });
    for (const [k, n] of bad.dotCount) problems.push({ level: 'warn', msg: `${style}: ${k} (${n} instances)` });
    const tops = [...worst].sort((a, b) => b[1].top - a[1].top).slice(0, 4).map(([c, w]) => `${showCh(c)} ${fmt(w.top, 0)}`);
    const bots = [...worst].sort((a, b) => a[1].bottom - b[1].bottom).slice(0, 4).map(([c, w]) => `${showCh(c)} ${fmt(w.bottom, 0)}`);
    lines.push(`    vertical ink range: highest ${tops.join(', ')} · lowest ${bots.join(', ')} (page allows +${GEOM.topLimit} / ${GEOM.bottomLimit})`);
    const maxTop = Math.max(...[...worst.values()].map((w) => w.top)), minBot = Math.min(...[...worst.values()].map((w) => w.bottom));
    D.maxTop = maxTop; D.minBottom = minBot;
    lines.push(`    worst-case ascender + descender = ${fmt(maxTop - minBot, 0)} vs line height ${RENDER.lineEm * 1000} → ${maxTop - minBot > RENDER.lineEm * 1000 ? 'lines CAN collide' : 'lines cannot collide'}`);
    if (dotGaps.length) { const s = stats(dotGaps); D.dotGap = s; lines.push(`    i/j dot gap above stem (x-heights): ${fmtStats(s, 2)}`); }

    // ---------- loose spacing: empty space inside the advance (canonical forms, unslanted) ----------
    {
      const air = new Map();
      for (const seed of seedsAll) {
        const p = E.makeHand(seed, style);
        const xh = p.xHeight * CAP, tan = Math.tan((p.slant || 0) * Math.PI / 180);
        for (const ch of KERNEL) {
          if (!VISIBLE(ch) || !E.has(p, ch) || isLower(ch) || isUpper(ch)) continue;
          const g = E.makeGlyph(p, ch, null);
          let a = Infinity, b = -Infinity;
          for (const c of g.contours) for (const q of c) { const x = q[0] - q[1] * tan; if (x < a) a = x; if (x > b) b = x; }
          if (!Number.isFinite(a)) continue;
          (air.get(ch) || air.set(ch, []).get(ch)).push((g.advance - (b - a)) / xh);
        }
      }
      const loose = [...air].map(([c, v]) => [c, stats(v).median]).filter(([, m]) => m > 0.6).sort((x, y) => y[1] - x[1]);
      D.looseSpacing = Object.fromEntries(loose);
      if (loose.length) {
        lines.push(`    loose spacing (empty advance > 0.6 x-height, digits & punctuation): ${loose.slice(0, 16).map(([c, m]) => `${showCh(c)} ${fmt(m, 2)}`).join(', ')}${loose.length > 16 ? ` … (+${loose.length - 16})` : ''}`);
        problems.push({ level: 'warn', msg: `${style}: ${loose.length} digits/punctuation carry more than 0.6 x-height of empty space (e.g. ${loose.slice(0, 6).map(([c, m]) => `'${showCh(c)}' ${fmt(m, 2)} xh`).join(', ')}) — they float away from their neighbours` });
      }
    }

    // ---------- script joins ----------
    if (connected) {
      const gaps = [], capGaps = [], byPair = new Map();
      let noExit = 0, lifts = 0, pairs = 0;
      for (const seed of seedsAll) {
        const p = E.makeHand(seed, style);
        const xh = p.xHeight * CAP;
        const page = E.layout(p, PARAGRAPH + ' ' + TEXTS.pangram, { maxWidth: RENDER.width / (RENDER.emPx / 1000), lineHeight: RENDER.lineEm * 1000 });
        const items = page.items.filter((it) => it.kind === 'glyph');
        for (let i = 0; i + 1 < items.length; i++) {
          const A = items[i], B = items[i + 1];
          if (B.charIndex !== A.charIndex + 1 || A.line !== B.line) continue;
          if (!isLower(B.ch) || !(isLower(A.ch) || isUpper(A.ch))) continue;
          // deliberate pen lifts (style dimensions mark them on the variant) are the writer's habit, not broken joins
          if (isLower(A.ch)) pairs++;
          if ((A.g.variant && A.g.variant.lift && A.g.variant.lift.after) || (B.g.variant && B.g.variant.lift && B.g.variant.lift.before)) { if (isLower(A.ch)) lifts++; continue; }
          const zone = (q) => q[1] > -0.15 * xh && q[1] < 1.2 * xh;
          let exit = null;
          for (const s of A.g.strokes) if (!s.dot) { const q = s.center[s.center.length - 1]; if (zone(q) && (!exit || q[0] > exit[0])) exit = q; }
          if (!exit) { noExit++; continue; }
          const ex = A.x + exit[0], ey = A.y - exit[1];
          let d = Infinity;
          for (const s of B.g.strokes) if (!s.dot) for (const q of s.center) if (zone(q)) {
            const v = Math.hypot(B.x + q[0] - ex, B.y - q[1] - ey); if (v < d) d = v;
          }
          const pw = d / p.penWidth;
          if (isUpper(A.ch)) { capGaps.push(pw); continue; }
          gaps.push(pw);
          const k = A.ch + B.ch, e = byPair.get(k) || { n: 0, sum: 0, broken: 0 };
          e.n++; e.sum += pw; if (pw > GEOM.joinBrokenPenWidths) e.broken++; byPair.set(k, e);
        }
      }
      const s = stats(gaps);
      const brokenRate = gaps.filter((g) => g > GEOM.joinBrokenPenWidths).length / Math.max(1, gaps.length);
      D.joins = { stats: s, brokenRate, liftRate: lifts / Math.max(1, pairs), capJoinedRate: capGaps.filter((g) => g <= GEOM.joinBrokenPenWidths).length / Math.max(1, capGaps.length) };
      lines.push(`    joins lower→lower, exit-to-next-letter gap in pen widths: ${fmtStats(s, 2)}`);
      if (lifts) lines.push(`    deliberate pen lifts (the writer's habit, marked by style dimensions): ${fmt(lifts / pairs * 100, 1)}% of ${pairs} lowercase pairs`);
      lines.push(`    joins broken (> ${GEOM.joinBrokenPenWidths} pen widths): ${fmt(brokenRate * 100, 1)}% of ${gaps.length} joins · capital→lower joined: ${fmt(D.joins.capJoinedRate * 100, 0)}% of ${capGaps.length}${noExit ? ` · ${noExit} letters without an exit in the join zone` : ''}`);
      const worstPairs = [...byPair].filter(([, e]) => e.broken).sort((a, b) => b[1].broken / b[1].n - a[1].broken / a[1].n || b[1].sum / b[1].n - a[1].sum / a[1].n).slice(0, 10);
      if (worstPairs.length) lines.push(`    pairs that break most: ${worstPairs.map(([k, e]) => `${k} ${e.broken}/${e.n} (avg ${fmt(e.sum / e.n, 1)})`).join(', ')}`);
      D.joins.worstPairs = worstPairs.map(([k, e]) => ({ pair: k, broken: e.broken, n: e.n, avg: e.sum / e.n }));
      if (brokenRate > GEOM.joinBrokenRateWarn) problems.push({ level: 'warn', msg: `${style}: ${fmt(brokenRate * 100, 1)}% of lowercase joins are broken (exit lands > ${GEOM.joinBrokenPenWidths} pen widths from the next letter); worst ${worstPairs.slice(0, 5).map(([k]) => k).join(' ')}` });
    }

    // ---------- page level: ink inside the SVG, glyphs inside maxWidth ----------
    const pageIssues = [];
    for (const [textId, width] of [['paragraph', RENDER.width], ['letter', NARROW_WIDTH], ['edge', RENDER.width], ['edge', NARROW_WIDTH], ['clip', RENDER.width]]) {
      for (const seed of textId === 'clip' ? seedsAll : seedsAll.slice(0, 8)) {
        const p = E.makeHand(seed, style);
        const maxW = width / (RENDER.emPx / 1000);
        const page = E.layout(p, TEXTS[textId], { maxWidth: maxW, lineHeight: RENDER.lineEm * 1000 });
        let inkTop = Infinity, inkBot = -Infinity, overflow = 0;
        for (const it of page.items) {
          if (it.kind !== 'glyph') continue;
          for (const c of it.g.contours) for (const q of c) { const y = it.y - q[1]; if (y < inkTop) inkTop = y; if (y > inkBot) inkBot = y; }
          const bb = it.g.contours.length ? bboxOf(it.g.contours) : null;
          if (bb && it.x + bb.x1 > maxW + 1) overflow++;
        }
        if (inkTop < 0) pageIssues.push({ level: 'fail', key: `${style}:page-top:${textId}@${width}`, amt: -inkTop, msg: `${style} ${seed} ${textId}@${width}px: ink starts ${fmt(-inkTop, 0)} units above the SVG top (clipped outside the lab)` });
        if (inkBot > page.height) pageIssues.push({ level: 'fail', key: `${style}:page-bottom:${textId}@${width}`, amt: inkBot - page.height, msg: `${style} ${seed} ${textId}@${width}px: ink ends ${fmt(inkBot - page.height, 0)} units below the SVG bottom (descender clipped outside the lab)` });
        if (overflow) pageIssues.push({ level: 'warn', amt: overflow, msg: `${style} ${seed} ${textId}@${width}px: ${overflow} glyphs run past the right edge (maxWidth)` });
      }
    }
    // collapse repeats so the report stays readable
    const seen = new Map();
    // (keeps the worst seed's message as the example)
    for (const iss of pageIssues) {
      const k = iss.level + iss.msg.replace(/ [a-z]+-[a-z]+-\d+ /, ' <seed> ').replace(/\d+ (units|glyphs)/, 'N $1');
      const e = seen.get(k);
      if (!e) seen.set(k, { ...iss, n: 1 }); else { e.n++; if (iss.amt > e.amt) { e.amt = iss.amt; e.msg = iss.msg; } }
    }
    for (const v of seen.values()) problems.push({ level: v.level, key: v.key, count: v.n, msg: v.msg + (v.n > 1 ? ` (worst of ${v.n} seeds)` : '') });
  }

  // ---------- style dimensions: bugs only (ugly is allowed, broken letters are not) ----------
  // Every tradition (style), each letter in word context, against the same letter with every dimension at 0.
  if (E.STYLE_NEUTRAL) {
    const text = (TEXTS.pangram + ' ' + PARAGRAPH.slice(0, 260) + ' ' + TEXTS.caps + ' bookkeeper committee minimum quite little').split(/\s+/);
    const inkOf = (g) => g.strokes.filter((st) => !st.dot).reduce((n, st) => { let L = 0; for (let i = 1; i < st.center.length; i++) L += Math.hypot(st.center[i][0] - st.center[i - 1][0], st.center[i][1] - st.center[i - 1][1]); return n + L; }, 0);
    const specks = (g, xh) => g.strokes.filter((st) => !st.dot && !st.mark).filter((st) => {
      let L = 0; for (let i = 1; i < st.center.length; i++) L += Math.hypot(st.center[i][0] - st.center[i - 1][0], st.center[i][1] - st.center[i - 1][1]);
      return st.center.length <= 3 || L < 0.06 * xh;
    }).length;
    const lost = [], speck = [];
    let checked = 0;
    for (const style of E.styleNames()) {
      for (const seed of statSeeds(24).slice(0, 12)) {
        let p;
        try { p = E.makeHand(seed, { style }); } catch { p = E.makeHand(seed, style); }
        if (p.style !== style) continue;
        const p0 = E.withOverrides(p, E.STYLE_NEUTRAL);
        const xh = p.xHeight * CAP;
        for (const word of text) {
          const chars = [...word];
          chars.forEach((ch, i) => {
            if (!/^\p{L}$/u.test(ch) || !E.has(p, ch)) return;
            const ctx = { prev: chars[i - 1] || null, next: chars[i + 1] || null, index: i, wordStart: i === 0, wordEnd: i === chars.length - 1 };
            const g = E.makeGlyph(p, ch, null, ctx), g0 = E.makeGlyph(p0, ch, null, ctx);
            checked++;
            const a = inkOf(g), b = inkOf(g0);
            const tag = `${seed} '${ch}' in "${word}"`;
            if (b > 0 && a < 0.4 * b) lost.push(`${tag} keeps ${Math.round(a / b * 100)}% of its ink`);
            const n = specks(g, xh), n0 = specks(g0, xh);
            if (n > n0) speck.push(`${tag} has ${n - n0} new speck${n - n0 > 1 ? 's' : ''}`);
          });
        }
      }
    }
    lines.push(`style dimensions: ${checked} letters in context across ${E.styleNames().length} traditions · letters that lost > 60% of their ink: ${lost.length} · new specks: ${speck.length}`);
    const list = (arr, n = 6) => arr.slice(0, n).join('; ') + (arr.length > n ? ` … (+${arr.length - n})` : '');
    if (lost.length) problems.push({ level: 'fail', key: 'dims:ink-lost', count: lost.length, msg: `style dimensions broke ${lost.length} letters (ink lost): ${list(lost)}` });
    if (speck.length) problems.push({ level: 'fail', key: 'dims:specks', count: speck.length, msg: `style dimensions left specks in ${speck.length} letters: ${list(speck)}` });
  }
  return { id: 'geometry', title: 'Geometry sanity', lines, problems, data };
}

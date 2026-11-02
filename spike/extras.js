/* extras.js — the 21 "GF Latin Kernel" extras on top of Hershey's 95 ASCII glyphs.
 *
 * Same skeleton format as hershey-data.js: Hershey units, y down, baseline y=9, cap height y=-12,
 * { l, r, s: [[ [x,y], ... ], ...] }.
 *  - Derived from each style's own glyphs: ‘ ’ “ ” (from its curly apostrophe), – — − (hyphen/plus),
 *    … · (period), × ÷ (plus), © ® ™ (scaled C / R / T M), non-breaking space.
 *  - Hand-authored here: € £ ¥ ¢ ° •  (drawn once, sheared for the script style).
 * Run after hershey-data.js; it adds the characters to window.HERSHEY.print / .script.
 */
(function (root) {
  'use strict';
  const H = root.HERSHEY;
  const clone = (s) => s.map((st) => st.map((p) => [p[0], p[1]]));
  const map = (s, f) => s.map((st) => st.map(f));
  const bbox = (s) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const st of s) for (const [x, y] of st) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  };
  const move = (s, dx, dy) => map(s, ([x, y]) => [x + dx, y + dy]);
  // scale a glyph's strokes about their centre, then put that centre at (cx, cy)
  const fit = (s, k, cx, cy) => { const b = bbox(s); return map(s, ([x, y]) => [cx + (x - b.cx) * k, cy + (y - b.cy) * k]); };
  const rot = (s, deg, cx, cy) => {
    const a = deg * Math.PI / 180, c = Math.cos(a), n = Math.sin(a);
    return map(s, ([x, y]) => [cx + (x - cx) * c - (y - cy) * n, cy + (x - cx) * n + (y - cy) * c]);
  };
  // y-down arc: angle 0 = right, 90 = down
  const arc = (cx, cy, rx, ry, a0, a1, n) => {
    const out = [];
    for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
    return out;
  };
  // inward spiral: a dot filled in by hand (turn spacing < pen width, so it reads solid)
  const spiral = (cx, cy, r0, turns) => {
    const out = [], n = Math.round(turns * 14);
    for (let i = 0; i <= n; i++) { const t = i / n, a = -Math.PI / 2 + t * turns * 2 * Math.PI, r = r0 * (1 - t); out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return out;
  };
  const SHEAR = 0.28; // script leans; authored shapes get this italic shear
  const shear = (s) => map(s, ([x, y]) => [x + (9 - y) * SHEAR, y]);

  // ---- hand-authored strokes (upright, print proportions) ----
  const AUTHORED = {
    '€': { l: -12, r: 11, s: [arc(1.5, -1.5, 8, 10.5, -42, -318, 22), [[-10, -4.5], [4, -4.5]], [[-10, 1], [2.5, 1]]] },          // €
    '£': { l: -10, r: 10, s: [[[6, -8], [5.5, -10.5], [3.5, -12], [1, -12], [-1.5, -10.8], [-2.5, -8], [-2, -4], [-1.2, 0], [-1.8, 4], [-3.5, 7], [-6, 9], [-3.5, 7.8], [-0.5, 8], [3, 9], [6, 8]], [[-6, -2], [3, -2]]] }, // £
    '¥': { l: -10, r: 10, s: [[[-8, -12], [0, -2], [0, 9]], [[8, -12], [0, -2]], [[-6, -0.5], [6, -0.5]], [[-6, 3.5], [6, 3.5]]] }, // ¥
    '¢': { l: -9, r: 9, s: [arc(0, 2, 6, 7, -40, -320, 18), [[1.5, -8], [-0.8, 12]]] },                                     // ¢
    '°': { l: -5, r: 6, s: [arc(0.5, -9, 3, 3, -80, 285, 14)] },                                                          // °
    '•': { l: -6, r: 6, s: [spiral(0, 0, 2.3, 3.2)] },                                         // • scribbled-in dot
  };

  function extrasFor(style) {
    const G = H[style];
    const out = {};
    const script = style === 'script';
    // smart quotes: Hershey's apostrophe is already a raised comma, i.e. ’
    const apos = G["'"];
    const ab = bbox(apos.s);
    const right = move(clone(apos.s), -ab.cx, 0);
    const left = rot(right, 180, 0, ab.cy);
    const qw = (ab.x1 - ab.x0);
    out['’'] = { l: apos.l, r: apos.r, s: right };                                            // ’
    out['‘'] = { l: apos.l, r: apos.r, s: left };                                             // ‘
    out['”'] = { l: apos.l - 2, r: apos.r + 2, s: [...move(right, -qw * 0.9 - 1, 0), ...move(right, qw * 0.9 + 1, 0)] }; // ”
    out['“'] = { l: apos.l - 2, r: apos.r + 2, s: [...move(left, -qw * 0.9 - 1, 0), ...move(left, qw * 0.9 + 1, 0)] };   // “
    // dashes
    const hy = G['-'];
    const stretch = (k) => map(clone(hy.s), ([x, y]) => [x * k, y]);
    out['–'] = { l: Math.round(hy.l * 1.1), r: Math.round(hy.r * 1.1), s: stretch(1.15) };    // –
    out['—'] = { l: Math.round(hy.l * 1.8), r: Math.round(hy.r * 1.8), s: stretch(1.95) };    // —
    const plus = G['+'];
    const horiz = plus.s.filter((st) => Math.abs(st[0][1] - st[st.length - 1][1]) < 0.5);
    out['−'] = { l: plus.l, r: plus.r, s: clone(horiz) };                                     // −
    // dots
    const per = G['.'];
    const pb = bbox(per.s);
    const dotAt = (x, y) => move(clone(per.s), x - pb.cx, y - pb.cy);
    out['…'] = { l: -11, r: 11, s: [...dotAt(-6, pb.cy), ...dotAt(0, pb.cy), ...dotAt(6, pb.cy)] }; // …
    out['·'] = { l: per.l, r: per.r, s: dotAt(0, 1) };                                       // ·
    // math
    out['×'] = { l: plus.l + 2, r: plus.r - 2, s: rot(fit(clone(plus.s), 0.72, 0, 0), 45, 0, 0) }; // ×
    out['÷'] = { l: plus.l, r: plus.r, s: [...clone(horiz), ...dotAt(0, -6), ...dotAt(0, 6)] };     // ÷
    // marks built from this style's own letters
    const ring = arc(0, -1.5, 10.5, 10.5, -100, 262, 30);
    out['©'] = { l: -14, r: 14, s: [ring, ...fit(clone(G['C'].s), 0.47, 0, -1.5)] };         // ©
    out['®'] = { l: -14, r: 14, s: [ring, ...fit(clone(G['R'].s), 0.45, 0, -1.5)] };         // ®
    const T = fit(clone(G['T'].s), 0.42, 0, 0), M = fit(clone(G['M'].s), 0.42, 0, 0);
    const tb = bbox(T), mb = bbox(M);
    const tm = [...move(T, -tb.x1 - 0.5, -12 - tb.y0), ...move(M, -mb.x0 + 0.5, -12 - mb.y0)];
    const tmb = bbox(tm);
    out['™'] = { l: Math.floor(tmb.x0) - 3, r: Math.ceil(tmb.x1) + 3, s: tm };               // ™
    // hand-authored
    for (const [ch, g] of Object.entries(AUTHORED)) {
      out[ch] = { l: g.l, r: g.r, s: script ? shear(clone(g.s)) : clone(g.s) };
      if (script) { out[ch].l += 1; out[ch].r += 3; }
    }
    out[' '] = { l: G[' '].l, r: G[' '].r, s: [] };                                           // nbsp
    return out;
  }
  for (const style of ['print', 'script']) Object.assign(H[style], extrasFor(style));
  root.HERSHEY_EXTRAS = Object.keys(extrasFor('print'));
})(typeof window !== 'undefined' ? window : globalThis);

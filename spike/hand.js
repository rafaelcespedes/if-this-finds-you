/* hand.js — seed -> handwriting engine (no ML).
 *
 * Pipeline per glyph instance:
 *   Hershey skeleton (centerlines)  ->  zone remap (x-height / ascender / descender) + width
 *   -> corner-aware smoothing (centripetal Catmull-Rom, optional corner fillets)
 *   -> per-letter "quirk" warp (fixed for the hand)  +  per-instance warp & affine (varies each use)
 *   -> tremor along the stroke  ->  slant shear
 *   -> pen model (broad nib or pointed pen, pressure, tapers)  ->  filled outline polygons
 *
 * Everything is deterministic from strings: hand seed, and an instance seed for each use.
 * Works in the browser (window.Hand) and in Node (globalThis.Hand) — needs window.HERSHEY.
 */
(function (root) {
  'use strict';

  // ---------- seeded randomness ----------
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function sfc32(a, b, c, d) {
    return function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
  }
  function rng(seedStr) {
    const h = xmur3(String(seedStr));
    const r = sfc32(h(), h(), h(), h());
    for (let i = 0; i < 12; i++) r();
    const f = () => r();
    f.range = (a, b) => a + (b - a) * r();
    f.gauss = () => { // approx N(0,1), clipped-ish
      return (r() + r() + r() + r() + r() + r() - 3) / 0.7071;
    };
    f.pick = (arr) => arr[Math.floor(r() * arr.length)];
    return f;
  }

  // ---------- smooth noise (gradient noise, 1D + 2D) ----------
  function makeNoise(seedStr) {
    const r = rng('noise:' + seedStr);
    const perm = new Uint8Array(512);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const g1 = new Float32Array(256), gx = new Float32Array(256), gy = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      g1[i] = r() * 2 - 1;
      const a = r() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a);
    }
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    function n1(x) {
      const i = Math.floor(x), f = x - i, u = fade(f);
      const a = g1[perm[i & 255]] * f, b = g1[perm[(i + 1) & 255]] * (f - 1);
      return 2 * (a + (b - a) * u);
    }
    function n2(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const u = fade(xf), v = fade(yf);
      const h = (i, j) => perm[(perm[(xi + i) & 255] + yi + j) & 255];
      const d = (k, dx, dy) => gx[k] * dx + gy[k] * dy;
      const a = d(h(0, 0), xf, yf), b = d(h(1, 0), xf - 1, yf);
      const c = d(h(0, 1), xf, yf - 1), e = d(h(1, 1), xf - 1, yf - 1);
      const ab = a + (b - a) * u, ce = c + (e - c) * u;
      return 1.4 * (ab + (ce - ab) * v);
    }
    return { n1, n2 };
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const DEG = Math.PI / 180;

  // ---------- the "writer": one consistent set of parameters per seed ----------
  // `style` is a user choice ("print" | "script"); everything else comes from the seed.
  function makeHand(seed, style) {
    const r = rng('hand:' + seed);
    const script = style === 'script';
    const h = {
      seed: String(seed),
      style: script ? 'script' : 'print',
      // --- the four exposed controls (UI may override) ---
      neatness: r.range(0.35, 0.85),           // 0 = scrawl, 1 = careful
      slant: r.range(-5, 6) + r() * r() * 16,  // degrees, right-leaning bias
      penWidth: r.range(40, 76),               // font units at UPM 1000
      pressure: r.range(0.1, 0.65),            // stroke contrast: nib / pressure shading
      // --- hidden "personality" ---
      nibAngle: r.range(20, 55),               // degrees (broad-nib model, print)
      xHeight: script ? r.range(0.42, 0.54) : r.range(0.5, 0.68), // fraction of cap height
      ascender: r.range(0.98, 1.16),           // lowercase ascender vs cap height
      descender: r.range(0.8, 1.2),
      width: script ? r.range(0.84, 1.12) : r.range(0.7, 0.96), // horizontal scale of lowercase
      capWidth: 1,                             // set below (correlated with width)
      roundness: r.range(0.15, 1),             // corner softening
      tracking: 0,
      sidebearing: r.range(28, 66),           // print: gap each side of the ink
      space: r.range(230, 360),               // word space (font units)
      strokeShift: r.range(0.6, 1.4),         // how loosely separate strokes land (t-bars, i-dots)
      wordSpace: r.range(0.85, 1.35),
      quirk: r.range(22, 44),                  // amplitude of the fixed per-letter distortion
      quirkScale: r.range(320, 480),           // wavelength of that distortion (long = no wiggles)
      tremor: r.range(0.6, 2.4),               // fine wobble along strokes
      drift: r.range(0.4, 1.0),                // baseline wander
      pressureVar: r.range(0.08, 0.3),
      taperIn: r.range(0.45, 0.85),            // width multiplier at stroke start
      taperOut: r.range(0.3, 0.75),            // width multiplier at stroke end
      dotHeight: r.range(0.35, 0.62),          // where i/j dots sit above x-height
      dotSize: r.range(0.9, 1.35),
    };
    h.capWidth = script ? h.width * r.range(0.92, 1.06) : r.range(0.78, 0.98);
    h.noise = makeNoise('hand:' + seed);
    return h;
  }

  // Effective params = hand + overrides from the UI.
  function withOverrides(hand, o) {
    const p = Object.assign(Object.create(null), hand);
    if (o) for (const k in o) if (o[k] !== undefined && o[k] !== null) p[k] = o[k];
    return p;
  }

  // ---------- glyph geometry ----------
  const CAP = 700;            // cap height in font units (UPM 1000)
  const SRC_BASE = 9, SRC_CAP = -12;
  const SRC_XH = { print: -5, script: 0 };
  const SRC_DESC = { print: 16, script: 21 };
  const DESC_RATIO = { print: 0.33, script: 0.45 };
  const S = CAP / (SRC_BASE - SRC_CAP);  // src unit -> font unit

  const CHAR_FALLBACK = { '‘': "'", '’': "'", '“': '"', '”': '"', '—': '-', '–': '-', '…': '.', ' ': ' ' };

  function srcGlyph(style, ch) {
    const set = root.HERSHEY[style];
    return set[ch] || set[CHAR_FALLBACK[ch]] || set['?'];
  }
  // true if this style can actually draw ch (no silent fallback)
  const has = (style, ch) => !!root.HERSHEY[style][ch];
  const isLower = (ch) => ch >= 'a' && ch <= 'z';
  const isUpper = (ch) => ch >= 'A' && ch <= 'Z';
  const isDigit = (ch) => ch >= '0' && ch <= '9';

  function zoneY(p, y, lower, style) {
    if (!lower) return (SRC_BASE - y) * S;
    const X = SRC_XH[style], xhT = p.xHeight * CAP, ascT = p.ascender * CAP;
    if (y >= X && y <= SRC_BASE) return (SRC_BASE - y) / (SRC_BASE - X) * xhT;
    if (y < X) return xhT + (X - y) / (X - SRC_CAP) * (ascT - xhT);
    const descT = p.descender * CAP * DESC_RATIO[style];
    return -(y - SRC_BASE) / (SRC_DESC[style] - SRC_BASE) * descT;
  }

  // centripetal Catmull-Rom through pts, resampled at ~`step` units
  function catmull(pts, step) {
    const n = pts.length;
    if (n < 2) return pts.slice();
    if (n === 2) return lineSample(pts[0], pts[1], step, true);
    const ext = [
      [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]],
      ...pts,
      [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]],
    ];
    const out = [pts[0]];
    for (let i = 1; i < ext.length - 2; i++) {
      const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2];
      const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const k = Math.max(1, Math.ceil(d / step));
      const t0 = 0;
      const t1 = t0 + Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + 1e-6, 0.5);
      const t2 = t1 + Math.pow(d + 1e-6, 0.5);
      const t3 = t2 + Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) + 1e-6, 0.5);
      for (let j = 1; j <= k; j++) {
        const t = t1 + (t2 - t1) * (j / k);
        const A1 = mix(p0, p1, (t - t0) / (t1 - t0));
        const A2 = mix(p1, p2, (t - t1) / (t2 - t1));
        const A3 = mix(p2, p3, (t - t2) / (t3 - t2));
        const B1 = mix(A1, A2, (t - t0) / (t2 - t0));
        const B2 = mix(A2, A3, (t - t1) / (t3 - t1));
        out.push(mix(B1, B2, (t - t1) / (t2 - t1)));
      }
    }
    return out;
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  function lineSample(a, b, step, includeFirst) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.ceil(d / step));
    const out = includeFirst ? [a] : [];
    for (let j = 1; j <= k; j++) out.push(mix(a, b, j / k));
    return out;
  }
  function turnAngle(a, b, c) {
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < 1e-6 || lv < 1e-6) return 0;
    return Math.acos(clamp((ux * vx + uy * vy) / (lu * lv), -1, 1));
  }

  // Split a coarse stroke at sharp corners; soften medium corners with a fillet.
  // Returns an array of dense polylines.
  function smoothStroke(pts, p, step) {
    // drop duplicate points
    const q = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = q[q.length - 1], b = pts[i];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.5) q.push(b);
    }
    if (q.length < 2) return [q];
    const runs = [];
    let cur = [q[0]];
    const filletR = lerp(0, 46, p.roundness);
    for (let i = 1; i < q.length - 1; i++) {
      const ang = turnAngle(q[i - 1], q[i], q[i + 1]) / DEG;
      if (ang > 118 || (ang > 48 && filletR < 8)) {
        cur.push(q[i]); runs.push(cur); cur = [q[i]];             // hard corner: new pen segment
      } else if (ang > 48) {
        const a = q[i - 1], b = q[i], c = q[i + 1];
        const lin = Math.hypot(b[0] - a[0], b[1] - a[1]), lout = Math.hypot(c[0] - b[0], c[1] - b[1]);
        const r = Math.min(filletR * (ang / 90), lin * 0.42, lout * 0.42);
        cur.push(mix(b, a, r / lin), mix(b, c, r / lout));          // rounded corner
      } else cur.push(q[i]);
    }
    cur.push(q[q.length - 1]);
    runs.push(cur);
    return runs.map((run) => catmull(run, step));
  }

  // Build the skeleton (in font units) for one glyph instance.
  // inst: null -> canonical hand form; or { seed, amount } -> a specific use of the letter.
  function glyphSkeleton(p, ch, inst) {
    const style = p.style;
    const g = srcGlyph(style, ch);
    const lower = isLower(ch);
    const letter = lower || isUpper(ch);
    const wScale = lower ? p.width : isUpper(ch) ? p.capWidth : isDigit(ch) ? (p.width + 1) / 2 : 0.5 + p.width / 2;
    const L = g.l;
    const step = 7;
    const strokes = [];
    const dots = [];
    for (const st of g.s) {
      const xs = st.map((v) => v[0]), ys = st.map((v) => v[1]);
      const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
      const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
      if (Math.max(bw, bh) <= 2.6) { // a dot (i, j, period, colon...)
        let Y = zoneY(p, cy, lower, style);
        if (lower && (ch === 'i' || ch === 'j')) Y = p.xHeight * CAP + (p.ascender - p.xHeight) * CAP * p.dotHeight;
        dots.push([(cx - L) * S * wScale, Y]);
        continue;
      }
      const mapped = st.map((v) => [(v[0] - L) * S * wScale, zoneY(p, v[1], lower, style)]);
      for (const run of smoothStroke(mapped, p, step)) strokes.push(run);
    }
    let advance = (g.r - g.l) * S * wScale + (p.tracking || 0);
    if (ch === ' ' || ch === '\u00A0') advance = p.space;
    else if (style === 'print' && (strokes.length || dots.length)) {
      // handwriting sits much tighter than Hershey's bearings: space by the ink, not the box
      let mn = Infinity, mx = -Infinity;
      for (const st of strokes) for (const q of st) { if (q[0] < mn) mn = q[0]; if (q[0] > mx) mx = q[0]; }
      for (const q of dots) { if (q[0] < mn) mn = q[0]; if (q[0] > mx) mx = q[0]; }
      const sb = p.sidebearing * (letter || isDigit(ch) ? 1 : 0.7) + p.penWidth * 0.5;
      const dx = sb - mn;
      for (const st of strokes) for (const q of st) q[0] += dx;
      for (const q of dots) q[0] += dx;
      advance = mx - mn + 2 * sb;
    }
    return { strokes, dots, advance, letter, lower };
  }

  // ---------- instance variation + pen ----------
  function charKey(ch) { return ch.charCodeAt(0); }

  function makeGlyph(p, ch, inst) {
    const sk = glyphSkeleton(p, ch, inst);
    const N = p.noise;
    const messy = 1 - clamp(p.neatness, 0, 1);
    const amt = inst ? (inst.amount == null ? 1 : inst.amount) : 0;
    const ir = inst ? rng('inst:' + p.seed + ':' + inst.seed) : null;
    const k = charKey(ch);
    // per-letter quirk offsets (fixed for this hand + letter)
    const qox = k * 3.71 + 11.3, qoy = k * 5.13 + 47.9;
    const qA = p.quirk * (0.55 + 0.75 * messy), qS = p.quirkScale;
    // per-instance warp + affine
    let iox = 0, ioy = 0, iA = 0, rot = 0, sx = 1, sy = 1, dy = 0, sh = 0;
    if (ir) {
      iox = ir() * 200; ioy = ir() * 200 + 300;
      const v = amt * (0.25 + 1.1 * messy);
      iA = 14 * v;
      rot = ir.gauss() * 1.6 * v * DEG;
      sx = 1 + ir.gauss() * 0.035 * v;
      sy = 1 + ir.gauss() * 0.06 * v;
      sh = ir.gauss() * 2.2 * v * DEG;
      dy = inst.baseline ? ir.gauss() * 7 * v : 0;
    }
    const cxG = sk.advance / 2, cyG = (sk.lower ? p.xHeight : 0.5) * CAP / 2;
    function displace(x, y) {
      let dx = qA * N.n2(x / qS + qox, y / qS + qoy);
      let dyv = qA * N.n2(x / qS + qox + 71.7, y / qS + qoy + 13.1);
      if (iA) {
        dx += iA * N.n2(x / 420 + iox, y / 420 + ioy);
        dyv += iA * N.n2(x / 420 + iox + 33.3, y / 420 + ioy + 91.7);
      }
      // instance affine about glyph centre
      let X = x + dx - cxG, Y = y + dyv - cyG;
      X = X * sx + Y * Math.tan(sh); Y = Y * sy;
      const c = Math.cos(rot), s = Math.sin(rot);
      return [c * X - s * Y + cxG, s * X + c * Y + cyG + dy];
    }
    // script letters must keep their entry/exit points so joins still meet
    const pin = p.style === 'script' && sk.letter;
    let entry = null, exit = null;
    if (pin) {
      for (const st of sk.strokes) for (const q of st) {
        if (!entry || q[0] < entry[0]) entry = q;
        if (!exit || q[0] > exit[0]) exit = q;
      }
    }
    let dEntry = [0, 0], dExit = [0, 0], dMean = [0, 0];
    if (pin && entry) {
      const a = displace(entry[0], entry[1]), b = displace(exit[0], exit[1]);
      dEntry = [a[0] - entry[0], a[1] - entry[1]]; dExit = [b[0] - exit[0], b[1] - exit[1]];
    } else {
      // keep the glyph centred in its advance (no drift out of the box)
      let n = 0;
      for (const st of sk.strokes) for (let i = 0; i < st.length; i += 4) {
        const d = displace(st[i][0], st[i][1]); dMean[0] += d[0] - st[i][0]; n++;
      }
      if (n) dMean[0] /= n;
    }
    function warp(q) {
      const d = displace(q[0], q[1]);
      let ox = d[0] - q[0], oy = d[1] - q[1];
      if (pin && entry) {
        const t = clamp((q[0] - entry[0]) / Math.max(1, exit[0] - entry[0]), 0, 1);
        ox -= lerp(dEntry[0], dExit[0], t); oy -= lerp(dEntry[1], dExit[1], t);
        // keep a little instance offset on the baseline itself
        oy += inst && inst.baseline ? dy : 0;
      } else ox -= dMean[0];
      return [q[0] + ox, q[1] + oy];
    }

    const tanSlant = Math.tan((p.slant || 0) * DEG);
    const tremorA = p.tremor * (0.25 + 0.9 * messy);
    const contours = [];
    const strokeSeedBase = (inst ? (ir() * 1000) : 0) + k * 17.3;
    const loose = [];
    sk.strokes.forEach((st, si) => {
      let off = [0, 0];
      if (si > 0) {
        const sr = rng('stroke:' + p.seed + ':' + k + ':' + si + ':' + (inst ? inst.seed : 'canon'));
        const m = p.strokeShift * (6 + 22 * messy) * (inst ? 0.6 + 0.6 * amt : 0.7);
        off = [sr.gauss() * m, sr.gauss() * m * 0.6];
      }
      loose.push(off);
      let pts = st.map((q) => { const w = warp(q); return [w[0] + off[0], w[1] + off[1]]; });
      // a stroke is a single gesture: it bows gently (one arc), plus a faint slow tremor.
      // (High-frequency wobble reads as fake/shaky, so it's deliberately kept small.)
      if (pts.length > 2) {
        let total = 0;
        for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        const br = rng('bow:' + p.seed + ':' + k + ':' + si + ':' + (inst ? inst.seed : 'canon'));
        const bow = br.gauss() * Math.min(1, total / 500) * (3 + 9 * messy) * (inst ? 1 : 0.5);
        let s = 0; const o = strokeSeedBase + si * 9.7;
        const out = [];
        for (let i = 0; i < pts.length; i++) {
          if (i) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
          let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
          const m = bow * Math.sin(Math.PI * s / total) + tremorA * N.n1(s / 85 + o);
          out.push([pts[i][0] - ty * m, pts[i][1] + tx * m]);
        }
        pts = out;
      }
      pts = pts.map((q) => [q[0] + q[1] * tanSlant, q[1]]);
      const c = penOutline(p, pts, strokeSeedBase + si * 3.1);
      if (c) contours.push(c);
    });
    for (const [di, d] of sk.dots.entries()) {
      const q = warp(d);
      const a = (ir ? ir() : 0.5) * 0.9 + 0.3 + (p.slant || 0) * DEG;
      const len = p.penWidth * 0.35 * p.dotSize;
      const c0 = [q[0] + q[1] * tanSlant, q[1]];
      const pts = [[c0[0] - Math.cos(a) * len / 2, c0[1] - Math.sin(a) * len / 2], c0, [c0[0] + Math.cos(a) * len / 2, c0[1] + Math.sin(a) * len / 2]];
      const c = penOutline(p, pts, 900 + di, { dot: true });
      if (c) contours.push(c);
    }
    return { advance: sk.advance, contours };
  }

  // Sweep a pen along a centerline -> one closed polygon (y-up, consistent orientation).
  function penOutline(p, pts, seedOff, opt) {
    const n = pts.length;
    if (n < 2) return null;
    const N = p.noise;
    const isDot = opt && opt.dot;
    const len = [0];
    for (let i = 1; i < n; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = len[n - 1] || 1;
    const tin = Math.min(70, total * 0.3), tout = Math.min(120, total * 0.4);
    const c = clamp(p.pressure, 0, 1);
    const nib = p.nibAngle * DEG;
    const script = p.style === 'script';
    const tang = [], w = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      tang.push([tx, ty]);
      let f;
      if (isDot) f = 1.15 * p.dotSize;
      else {
        if (script) f = 1 - 0.55 * c + 1.5 * c * Math.max(0, -ty);   // pointed pen: swell on downstrokes
        else f = (1 - 0.85 * c) + 0.95 * c * Math.abs(Math.sin(Math.atan2(ty, tx) - nib)); // broad nib
        const s = len[i];
        const taper = lerp(p.taperIn, 1, smooth(s / tin)) * lerp(p.taperOut, 1, smooth((total - s) / tout));
        f *= taper * (1 + p.pressureVar * N.n1(s / 110 + seedOff));
      }
      w.push(Math.max(4, p.penWidth * f));
    }
    // soften width changes (nib model flips at corners)
    const ws = w.map((_, i) => (w[Math.max(0, i - 2)] + 2 * w[Math.max(0, i - 1)] + 3 * w[i] + 2 * w[Math.min(n - 1, i + 1)] + w[Math.min(n - 1, i + 2)]) / 9);
    const left = [], right = [];
    for (let i = 0; i < n; i++) {
      const [tx, ty] = tang[i], h = ws[i] / 2;
      left.push([pts[i][0] - ty * h, pts[i][1] + tx * h]);
      right.push([pts[i][0] + ty * h, pts[i][1] - tx * h]);
    }
    const poly = [];
    for (const q of left) poly.push(q);
    capArc(poly, pts[n - 1], tang[n - 1], ws[n - 1] / 2, false);
    for (let i = n - 1; i >= 0; i--) poly.push(right[i]);
    capArc(poly, pts[0], tang[0], ws[0] / 2, true);
    return poly;
  }
  function capArc(poly, c, t, r, start) {
    // from +n through +t (end) / -t (start) to -n ... sweeping clockwise in y-up
    const a0 = start ? Math.atan2(-t[0], t[1]) : Math.atan2(t[0], -t[1]);
    // +n = (-ty, tx) has angle atan2(tx, -ty); -n has angle atan2(-tx, ty)
    const steps = 8;
    for (let j = 1; j < steps; j++) {
      const a = a0 - Math.PI * (j / steps);
      poly.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
    }
  }

  // Ramer–Douglas–Peucker on a closed polygon (for compact font outlines)
  function simplify(poly, tol) {
    if (poly.length < 8) return poly;
    const keep = new Uint8Array(poly.length);
    keep[0] = 1; keep[poly.length - 1] = 1;
    const stack = [[0, poly.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let maxD = 0, idx = -1;
      const ax = poly[a][0], ay = poly[a][1], bx = poly[b][0], by = poly[b][1];
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs((poly[i][0] - ax) * dy - (poly[i][1] - ay) * dx) / L;
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    return poly.filter((_, i) => keep[i]);
  }

  root.Hand = {
    rng, makeNoise, makeHand, withOverrides, makeGlyph, simplify,
    CAP, isLower, isUpper, isDigit, has,
    exposed: ['neatness', 'slant', 'penWidth', 'pressure'],
  };
})(typeof window !== 'undefined' ? window : globalThis);

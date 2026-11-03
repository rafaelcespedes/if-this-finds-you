// blend.js — letters in between: morph two skeletons of the same structure.
//
// A writer schooled in one tradition who later lived with another writes letters that sit between the two
// (glyphs.js decides which letters and how far; this file does the geometry). Two variants are only morphed
// when they are built the same way: the same number of strokes, each pair close in shape once both are in
// the same coordinate system. Otherwise morph() returns null and the caller picks one form instead, so a
// blend can never produce a broken letter.
//
// Traditions use different coordinate systems (metrics), so B is first carried into A's: x by cap height
// from the left bearing, y zone by zone (cap / x-height / baseline / descender) for lowercase, linearly for the
// rest, exactly as hand.js zoneY would place it. Then every stroke is resampled by arclength to a common count
// and interpolated, as are the bearings, so joined letters keep entry and exit on their join lines.

// y of a source point, as a fraction-based position in metrics m, carried to metrics to. lower: zone mapping.
function carryY(y, m, to, lower) {
  if (!lower) return to.base - (m.base - y) * (to.base - to.cap) / (m.base - m.cap);
  if (y >= m.xHeight && y <= m.base) return to.base - (m.base - y) / (m.base - m.xHeight) * (to.base - to.xHeight);
  if (y < m.xHeight) return to.xHeight - (m.xHeight - y) / (m.xHeight - m.cap) * (to.xHeight - to.cap);
  // descenders render at descRatio of the cap height: keep the rendered depth, not the fraction of the zone
  const f = (y - m.base) / (m.descender - m.base) * (m.descRatio || 1) / (to.descRatio || 1);
  return to.base + f * (to.descender - to.base);
}

// Variant v (metrics m) expressed in metrics `to`, with its left bearing at `l`.
export function carry(v, m, to, l, lower) {
  const k = (to.base - to.cap) / (m.base - m.cap);
  return {
    l, r: l + (v.r - v.l) * k,
    s: v.s.map((st) => st.map(([x, y]) => [l + (x - v.l) * k, carryY(y, m, to, lower)])),
  };
}

function resample(pts, n) {
  if (pts.length === 1) return Array.from({ length: n }, () => pts[0].slice());
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1] || 1e-9, out = [];
  let j = 1;
  for (let i = 0; i < n; i++) {
    const s = total * i / (n - 1);
    while (j < pts.length - 1 && cum[j] < s) j++;
    const a = pts[j - 1], b = pts[j], seg = cum[j] - cum[j - 1] || 1e-9, t = Math.min(1, Math.max(0, (s - cum[j - 1]) / seg));
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
const lengthOf = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
const meanDist = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]); return d / a.length; };

// Morph variant A (metrics mA) toward B (metrics mB) by t (0 = A, 1 = B), in A's coordinate system.
// tolerance: how far apart (mean point distance, as a fraction of cap height) two strokes may be and still count
// as the same stroke drawn differently. Returns { l, r, s } or null when the two aren't built the same way.
export function morph(A, mA, B, mB, t, lower, tolerance = 0.2) {
  if (!A || !B || !A.s || !B.s || A.s.length !== B.s.length || (A.marks && A.marks.length) || (B.marks && B.marks.length)) return null;
  const Bc = carry(B, mB, mA, A.l, lower);
  const capH = mA.base - mA.cap;
  const out = [];
  for (let i = 0; i < A.s.length; i++) {
    const a = A.s[i], b = Bc.s[i];
    const n = Math.max(6, Math.min(48, Math.round(Math.max(lengthOf(a), lengthOf(b)) / (capH / 30)) + 2));
    const ra = resample(a, n), rb = resample(b, n), rbr = resample(b.slice().reverse(), n);
    const df = meanDist(ra, rb), dr = meanDist(ra, rbr);
    const bb = dr < df ? rbr : rb; // B may draw the stroke the other way round
    if (Math.min(df, dr) > tolerance * capH) return null;
    out.push(ra.map((q, j) => [q[0] + (bb[j][0] - q[0]) * t, q[1] + (bb[j][1] - q[1]) * t]));
  }
  return { l: A.l, r: A.r + (Bc.r - A.r) * t, s: out };
}

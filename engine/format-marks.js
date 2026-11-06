// format-marks.js — the marks formatting needs, drawn the way this writer draws (format.js habits): a list's bullet,
// a checklist's box and the tick that goes in it, and a highlighter's swipe. sheet.js places them; every pen mark
// goes through marks.js markItem, so it carries this hand's pen, ink and pressure, and the drawn pen draws it like a
// letter. A highlighter isn't this pen: its swipe is a shape of its own (page.highlights), laid under the writing.
//
// Page space: x right, y down; base(x) is the baseline's y at x, xh the x-height there. Strokes are arrays of page
// points. Everything is drawn from `r`, the event's own rng (sheet.js R0), so it's the same on every replay.

import { clamp, smooth, DEG } from './core.js';
import { strikeStrokes } from './marks.js';

// a few points along a curve, with a hand's small wobble (amp, in page units)
const wobble = (pts, amp, r) => pts.map(([x, y]) => [x + r.gauss() * amp, y + r.gauss() * amp]);
const arc = (cx, cy, rx, ry, a0, a1, n) => {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + rx * Math.cos(a), cy - ry * Math.sin(a)]); }
  return out;
};

// ---------- a list's bullet ----------
// The writer's own: a scribbled dot (a tight little coil, gone round until it's filled in), a short dash, a small
// circle, or an arrow. x: where it starts; it sits about halfway up the x-height.
export function bulletStrokes(F, x, base, xh, r) {
  const L = F.list, s = L.sloppy;
  const y = (X) => base(X) - (0.42 + 0.06 * r.gauss() * s) * xh;
  switch (L.bullet) {
    case 'dash': {
      const w = (0.62 + 0.14 * r()) * xh, x1 = x + w, tilt = (r.gauss() * 3 + 2) * DEG;
      return [wobble([[x, y(x) + 0.02 * xh], [x + w * 0.5, y(x + w / 2) - Math.tan(tilt) * w * 0.5], [x1, y(x1) - Math.tan(tilt) * w]], 0.01 * xh * s, r)];
    }
    case 'circle': {
      const rad = (0.19 + 0.04 * r()) * xh, cx = x + rad, cy = y(cx), a0 = Math.PI * (0.55 + 0.2 * r());
      return [wobble(arc(cx, cy, rad * (0.95 + 0.1 * r()), rad, a0, a0 + 2 * Math.PI * (1.04 + 0.08 * r()), 18), 0.012 * xh * s, r)];
    }
    case 'arrow': {
      const w = (0.85 + 0.15 * r()) * xh, tip = x + w, yt = y(tip), hd = (0.22 + 0.06 * r()) * xh;
      const shaft = [[x, y(x) + 0.015 * xh * r.gauss()], [x + w * 0.55, y(x + w * 0.55)], [tip, yt]];
      const head = [[tip - hd * 1.1, yt - hd * (0.85 + 0.2 * r())], [tip + 0.02 * xh, yt], [tip - hd * 1.1, yt + hd * (0.85 + 0.2 * r())]];
      return [wobble(shaft, 0.01 * xh * s, r), wobble(head, 0.012 * xh * s, r)];
    }
    default: { // a scribbled dot: two turns or so of a shrinking coil
      const rad = (0.13 + 0.04 * r()) * xh, cx = x + 0.15 * xh, cy = y(cx), turns = 2 + 0.7 * r(), n = 30, out = [];
      let a = r() * 6.28;
      for (let i = 0; i <= n; i++) { const t = i / n, k = rad * (1 - 0.75 * t); out.push([cx + k * Math.cos(a), cy - k * 0.9 * Math.sin(a)]); a += turns * 2 * Math.PI / n; }
      return [out];
    }
  }
}

// ---------- a title's underline ----------
// Drawn when Return ends the title (sheet.js closeLine): steadier than a quick underline for emphasis (marks.js), since
// a title is written with care, and long: it follows the title's baseline, ending at most a little off it, with only a
// small flick at the end for a writer who flicks. k = 1: the second line of a double underline, a little lower and shorter.
export function titleUnderlineStrokes(H, x0, x1, base, xh, r, k = 0) {
  let xs = x0 - (0.04 + 0.1 * r()) * xh, xe = x1 + (0.05 + 0.22 * r()) * xh;
  if (k) { const cut = 0.07 * (xe - xs); xs += cut * (0.2 + 0.6 * r()); xe -= cut * (0.3 + 0.7 * r()); }
  const L = Math.max(1, xe - xs);
  const drop = (0.19 + 0.07 * r() + 0.2 * k) * xh;
  const rise = clamp(r.gauss() * 0.05, -0.1, 0.1) * xh, sag = (r() - 0.4) * 0.05 * xh;
  const n = Math.max(8, Math.ceil(L / 14)), pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = xs + u * L;
    let y = base(x) + drop - rise * u + sag * Math.sin(Math.PI * u);
    if (H.underlineSwoosh && !k) y -= 0.12 * xh * smooth((u - 0.82) / 0.18) ** 2;
    pts.push([x, y]);
  }
  return [pts];
}

// ---------- a checklist's box ----------
// square: one stroke round four sides, the corners a little rounded, the end running past the start; round: a ring,
// a little more than once round; dash: just a short line where a box would be. Returns { strokes, box: [x0,y0,x1,y1] }.
export function boxStrokes(F, x, base, xh, r) {
  const L = F.list, s = L.sloppy, b = L.boxSize * xh * (0.96 + 0.08 * r());
  const x0 = x, x1 = x + b * (0.95 + 0.1 * r());
  const yb = (X) => base(X) + 0.03 * xh, yt = (X) => base(X) - b;
  if (L.box === 'dash') {
    const w = 0.62 * xh, y = (X) => base(X) - 0.08 * xh;
    return { strokes: [wobble([[x0, y(x0)], [x0 + w / 2, y(x0 + w / 2) - 0.01 * xh], [x0 + w, y(x0 + w) - 0.02 * xh]], 0.008 * xh * s, r)], box: [x0, base(x0) - 0.7 * xh, x0 + w, base(x0) + 0.05 * xh] };
  }
  if (L.box === 'round') {
    const cx = (x0 + x1) / 2, cy = (yb(cx) + yt(cx)) / 2, rx = (x1 - x0) / 2, ry = (yb(cx) - yt(cx)) / 2, a0 = Math.PI * (0.6 + 0.3 * r());
    return { strokes: [wobble(arc(cx, cy, rx, ry, a0, a0 + 2 * Math.PI * (1.05 + 0.08 * r()), 24), 0.012 * xh * s, r)], box: [x0, yt(cx), x1, yb(cx)] };
  }
  const j = () => r.gauss() * 0.035 * xh * s;
  const c = 0.08 * xh; // corner rounding
  const tl = [x0 + j(), yt(x0) + j()], bl = [x0 + j(), yb(x0) + j()], br = [x1 + j(), yb(x1) + j()], tr = [x1 + j(), yt(x1) + j()];
  const pts = [
    [tl[0] + 0.15 * c, tl[1] + c * 0.4], [bl[0], bl[1] - c], [bl[0] + c, bl[1]], [br[0] - c, br[1]], [br[0], br[1] - c],
    [tr[0], tr[1] + c], [tr[0] - c, tr[1]], [tl[0] + c, tl[1]], [tl[0] - (0.04 + 0.1 * r() * s) * xh, tl[1] + (0.02 + 0.04 * r()) * xh], // overshoot
  ];
  return { strokes: [pts], box: [x0, Math.min(yt(x0), yt(x1)), x1, Math.max(yb(x0), yb(x1))] };
}

// ---------- ticking it ----------
// tick: a short stroke down and a long one up, past the box's top right (people never keep a tick inside its box);
// cross: two strokes; fill: back and forth until the box is filled in. box: [x0, y0, x1, y1] (page, y down).
export function tickStrokes(F, box, xh, r) {
  const [x0, y0, x1, y1] = box, w = x1 - x0, h = y1 - y0, s = F.list.sloppy;
  const j = () => r.gauss() * 0.03 * xh * s;
  if (F.list.tick === 'cross') {
    const o = 0.1 * w;
    return [[[x0 + o + j(), y0 + o + j()], [(x0 + x1) / 2, (y0 + y1) / 2 + j()], [x1 - o + j(), y1 - o + j()]],
      [[x1 - o + j(), y0 + o + j()], [(x0 + x1) / 2 + j(), (y0 + y1) / 2], [x0 + o + j(), y1 - o + j()]]];
  }
  if (F.list.tick === 'fill') {
    const pts = [], n = Math.max(4, Math.round(w / (0.12 * xh)));
    for (let i = 0; i <= n; i++) { const x = x0 + 0.08 * w + (0.84 * w) * i / n; pts.push([x + j(), i % 2 ? y1 - 0.12 * h + j() : y0 + 0.12 * h + j()]); }
    return [pts];
  }
  // a tick: in at the left, about halfway down, to the bottom a little left of centre, then up and out past the top right
  const a = [x0 + 0.12 * w + j(), y0 + 0.5 * h + j()], b = [x0 + 0.42 * w + j(), y1 - 0.08 * h + j()];
  const up = (0.45 + 0.4 * r()) * xh, c = [x1 + 0.3 * w + up * 0.5 + j(), y0 - up + j()];
  return [[a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.03 * h], b, [b[0] + 0.25 * (c[0] - b[0]), b[1] + 0.3 * (c[1] - b[1])], c]];
}
// Unticking in ink: the tick can't be lifted, so it's scribbled out, box and all (the writer's own scribble).
export function untickStrokes(H, N, box, base, xh, W, r) {
  const [x0, , x1] = box;
  return strikeStrokes(H, N, 'scrawl', x0 - 0.05 * xh, x1 + 0.05 * xh, base, 0.45 * xh, xh, W, r);
}

// ---------- the highlighter ----------
// One swipe of a chisel felt along [x0, x1] of a line: as tall as the x-height and a little more, a bit crooked (it
// drifts off the line and back), the ends cut at the chisel's angle, and streaky where the felt runs drier. Returns
// { shape, streaks }: closed polygons in page space (y down), the swipe and its streaks (lighter lines along it).
export function highlightSwipe(x0, x1, base, xh, r) {
  const pad0 = (0.08 + 0.12 * r()) * xh, pad1 = (0.1 + 0.18 * r()) * xh;
  const xs = x0 - pad0, xe = x1 + pad1, L = Math.max(1, xe - xs);
  const h = (1.55 + 0.25 * r()) * xh;                       // the chisel's width across the line (a 5 mm felt)
  const mid0 = (0.55 + 0.07 * r.gauss()) * xh;              // its middle, above the baseline
  const tilt = Math.tan(clamp(r.gauss() * 1.1, -2.5, 2.5) * DEG); // a bit crooked
  const bow = (r() - 0.5) * 0.12 * xh;                      // and it bows a little over a long line
  const chisel = (0.22 + 0.12 * r()) * xh;                  // the ends cut at the chisel's angle
  const n = Math.max(8, Math.ceil(L / (0.35 * xh)));
  const ph = r() * 50, wob = 0.035 * xh;
  const midAt = (x, u) => base(x) - mid0 - tilt * (x - xs) - bow * Math.sin(Math.PI * u);
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = xs + u * L, m = midAt(x, u);
    // each edge wanders on its own a little (a felt edge is never ruled)
    const wt = wob * Math.sin(u * 7.3 + ph) + 0.4 * wob * Math.sin(u * 19.1 + ph * 1.7);
    const wb = wob * Math.sin(u * 6.1 + ph * 0.6) + 0.4 * wob * Math.sin(u * 23.3 + ph * 2.1);
    top.push([x + chisel / 2, m - h / 2 + wt]);
    bot.push([x - chisel / 2, m + h / 2 + wb]);
  }
  // the ends: the felt's slanted edge (top runs a little past the bottom at the right, and starts later at the left)
  const shape = [...top, ...bot.reverse()];
  // streaks: two to four thin lines along it where the felt ran drier or doubled up
  const streaks = [];
  const k = 2 + Math.floor(r() * 3);
  for (let s = 0; s < k; s++) {
    const off = (r() - 0.5) * 0.75 * h, th = (0.03 + 0.05 * r()) * xh, a = r() * 0.3, b = a + 0.35 + 0.6 * r();
    const t = [], q = [];
    for (let i = 0; i <= 10; i++) {
      const u = clamp(a + (b - a) * i / 10, 0, 1), x = xs + u * L, m = midAt(x, u) + off + 0.02 * xh * Math.sin(u * 11 + s);
      t.push([x, m - th / 2]); q.push([x, m + th / 2]);
    }
    streaks.push([...t, ...q.reverse()]);
  }
  return { shape, streaks, x0: xs, x1: xe };
}

// Draws the Reading Room's icons with the handwriting engine's own pen, once, into engine-icons.ts (from the type and
// icons study, branch claude/kind-joliot-270d00; Rafael's pick, 3 Nov). Run again after changing a skeleton:
// node app/src/themes/reading-room/icons/make-engine-icons.mjs
// Each icon is a few pen strokes (skeletons in a 1000-unit box, y up) put through penOutline, the same call that inks
// the letters: a fountain pen's pressure, taper and slight tremor, seeded so the set never changes between builds.
import fs from 'node:fs';
import path from 'node:path';
import * as E from '../../../../../engine/index.js';

const HAND = E.makeHand('reading-room-icons-3', 'print');
const PEN = { ...HAND, pen: 'fountain', tremor: Math.min(HAND.tremor ?? 0, 0.25) };
const W = 64; // stroke width in box units: 1.5 px at 24 px, 1.1 px at 17 px
PEN.tip = W / E.penWidthUnits({ ...PEN, tip: 1 });

const rnd = E.rng('icons:wobble');
// ---------- skeleton helpers (box units, y up) ----------
const lerp = (a, b, t) => a + (b - a) * t;
function line(x1, y1, x2, y2) {
  const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 14));
  return Array.from({ length: n + 1 }, (_, i) => [lerp(x1, x2, i / n), lerp(y1, y2, i / n)]);
}
function poly(pts) { let out = []; for (let i = 1; i < pts.length; i++) out = out.concat(line(...pts[i - 1], ...pts[i]).slice(i > 1 ? 1 : 0)); return out; }
function arc(cx, cy, r, a0, a1, ry = r) {
  const n = Math.max(6, Math.ceil((Math.abs(a1 - a0) * Math.PI / 180 * r) / 14));
  return Array.from({ length: n + 1 }, (_, i) => { const a = (lerp(a0, a1, i / n) * Math.PI) / 180; return [cx + r * Math.cos(a), cy + ry * Math.sin(a)]; });
}
function bez(p0, p1, p2, p3) {
  const len = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) + Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
  const n = Math.max(8, Math.ceil(len / 14));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
  });
}
const join = (...parts) => parts.reduce((acc, p, i) => acc.concat(i ? p.slice(1) : p), []);
// a rounded rectangle drawn as one stroke from its top-left corner, clockwise
function rrect(x1, y1, x2, y2, r = 46) {
  return join(line(x1 + r, y2, x2 - r, y2), arc(x2 - r, y2 - r, r, 90, 0), line(x2, y2 - r, x2, y1 + r), arc(x2 - r, y1 + r, r, 0, -90),
    line(x2 - r, y1, x1 + r, y1), arc(x1 + r, y1 + r, r, -90, -180), line(x1, y1 + r, x1, y2 - r), arc(x1 + r, y2 - r, r, 180, 90), line(x1 + r, y2, x1 + r + 30, y2));
}
const dot = (x, y) => arc(x, y, 26, 0, 380);
const rot = (pts, deg, cx = 500, cy = 500) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a); return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]); };
const move = (pts, dx, dy, k = 1) => pts.map(([x, y]) => [500 + (x - 500) * k + dx, 500 + (y - 500) * k + dy]);

// a hand never repeats a line exactly: slow, small drift across each stroke
function wobble(pts, amp = 7) {
  const f1 = 1 + 2 * rnd(), f2 = 1 + 2 * rnd(), p1 = 6 * rnd(), p2 = 6 * rnd();
  return pts.map(([x, y], i) => { const t = i / Math.max(1, pts.length - 1); return [x + amp * Math.sin(f1 * t * Math.PI + p1), y + amp * Math.sin(f2 * t * Math.PI + p2)]; });
}

// ---------- the icons: name -> strokes ----------
const nib = (k = 1, dx = 0, dy = 0, deg = 0) => [
  join(bez([500, 110], [420, 260], [300, 430], [300, 620]), poly([[300, 620], [345, 870], [655, 870], [700, 620]]), bez([700, 620], [700, 430], [580, 260], [500, 110])),
  line(500, 130, 500, 470),
  arc(500, 520, 40, 90, 450),
].map((s) => move(rot(s, deg), dx, dy, k));
const sheet = () => [poly([[230, 880], [610, 880], [790, 700], [790, 120], [230, 120], [230, 880]]), poly([[610, 870], [610, 700], [780, 700]])];
const ICONS = {
  ChevronDown: [poly([[250, 630], [500, 380], [750, 630]])],
  ChevronUp: [poly([[250, 370], [500, 620], [750, 370]])],
  ChevronLeft: [poly([[630, 250], [380, 500], [630, 750]])],
  ChevronRight: [poly([[370, 250], [620, 500], [370, 750]])],
  X: [line(250, 750, 750, 250), line(250, 250, 750, 750)],
  Check: [poly([[190, 510], [410, 290], [820, 730]])],
  ArrowLeft: [line(830, 500, 190, 500), poly([[430, 740], [190, 500], [430, 260]])],
  Info: [arc(500, 500, 380, 90, 452), dot(500, 705), line(500, 585, 500, 285)],
  Search: [arc(440, 560, 270, 135, 497), line(632, 368, 860, 140)],
  Lock: [rrect(220, 120, 780, 560, 50), join(line(345, 560, 345, 680), arc(500, 680, 155, 180, 0), line(655, 680, 655, 560)), line(500, 390, 500, 290)],
  LockOpen: [rrect(220, 120, 780, 560, 50), join(line(345, 560, 345, 700), arc(500, 700, 155, 180, 10)), line(500, 390, 500, 290)],
  Share: [poly([[330, 610], [210, 610], [210, 130], [790, 130], [790, 610], [670, 610]]), line(500, 330, 500, 880), poly([[350, 730], [500, 880], [650, 730]])],
  Download: [line(500, 860, 500, 330), poly([[330, 500], [500, 330], [670, 500]]), line(170, 150, 830, 150)],
  Shuffle: [bez([140, 290], [470, 290], [520, 710], [840, 710]), bez([140, 710], [470, 710], [520, 290], [840, 290]), poly([[720, 820], [850, 710], [720, 600]]), poly([[720, 400], [850, 290], [720, 180]])],
  LayoutDashboard: [rrect(140, 540, 450, 860, 34), rrect(550, 540, 860, 860, 34), rrect(140, 140, 450, 460, 34), rrect(550, 140, 860, 460, 34)],
  Mails: [rrect(100, 130, 760, 620, 40), poly([[110, 610], [430, 380], [750, 610]]), poly([[250, 620], [250, 770], [900, 770], [900, 290], [760, 290]])],
  MailOpen: [poly([[150, 560], [150, 150], [850, 150], [850, 560]]), poly([[150, 560], [500, 840], [850, 560]]), poly([[160, 560], [500, 330], [840, 560]])],
  PenLine: [...nib(0.78, 30, 60, -40), line(160, 120, 840, 120)],
  PenNib: nib(),
  Paper: sheet(),
  FileText: [...sheet(), line(340, 560, 660, 560), line(340, 360, 600, 360)],
  Ink: [join(bez([500, 880], [600, 720], [780, 560], [780, 380]), arc(500, 380, 280, 0, -180), bez([220, 380], [220, 560], [400, 720], [500, 880]))],
  Link: (() => {
    const pill = (x1, x2) => join(arc(x1 + 110, 500, 110, 90, 270), line(x1 + 110, 390, x2 - 110, 390), arc(x2 - 110, 500, 110, -90, 90), line(x2 - 110, 610, x1 + 90, 610));
    return [rot(pill(120, 560), 45), rot(pill(440, 880), 45)];
  })(),
  Ellipsis: [dot(230, 500), dot(500, 500), dot(770, 500)],
  RotateCcw: [arc(510, 470, 330, 160, -165), poly([[180, 820], [200, 585], [430, 620]])],
  Users: [arc(380, 650, 150, 90, 452), bez([120, 150], [130, 400], [630, 400], [640, 150]), arc(690, 700, 125, 200, 452), bez([720, 440], [880, 420], [900, 300], [900, 150])],
  Loader: [arc(500, 500, 360, 90, 360)],
  Film: [rrect(150, 150, 850, 850, 40), line(310, 160, 310, 840), line(690, 160, 690, 840), line(160, 500, 310, 500), line(690, 500, 840, 500)],
  ImagePlay: [rrect(130, 170, 870, 830, 46), poly([[420, 330], [420, 670], [680, 500], [420, 330]])],
  SlidersHorizontal: [line(140, 690, 860, 690), line(140, 310, 860, 310), arc(360, 690, 75, 0, 360), arc(640, 310, 75, 0, 360)],
  Heart: [join(bez([500, 160], [300, 330], [140, 470], [160, 640]), bez([160, 640], [180, 840], [450, 860], [500, 680]), bez([500, 680], [550, 860], [820, 840], [840, 640]), bez([840, 640], [860, 470], [700, 330], [500, 160]))],
};

// "Aa" for the Fonts page: the hand's own A and a, through the same pen
function aa() {
  const out = [];
  let x = 0;
  const glyphs = ['A', 'a'].map((ch) => { const g = E.makeGlyph(HAND, ch); const o = { g, x }; x += g.advance * 0.92; return o; });
  const s = Math.min(880 / Math.max(x, 1), 1.25);
  for (const { g, x: gx } of glyphs) for (const st of g.strokes) out.push(st.center.map(([px, py]) => [60 + (gx + px) * s, 190 + py * s]));
  return out;
}
ICONS.CaseSensitive = aa();

// added after the first set, so every earlier drawing keeps its seeds (each stroke draws the next seed in order):
// the export lab's Play, Pause and Sparkles, the hand Pointer, and the header's List and Menu
ICONS.Play = [poly([[330, 800], [330, 200], [810, 500], [330, 800]])];
ICONS.Pause = [line(380, 790, 380, 210), line(620, 790, 620, 210)];
ICONS.Sparkles = [
  join(bez([430, 860], [450, 560], [500, 500], [790, 470]), bez([790, 470], [500, 440], [450, 380], [430, 80]), bez([430, 80], [410, 380], [360, 440], [70, 470]), bez([70, 470], [360, 500], [410, 560], [430, 860])),
  line(800, 920, 800, 700), line(690, 810, 910, 810),
];
ICONS.Pointer = [
  join(line(400, 470, 400, 830), arc(455, 830, 55, 180, 0), line(510, 830, 510, 560)),
  join(line(510, 620, 510, 640), arc(565, 640, 55, 180, 0), line(620, 640, 620, 560)),
  join(line(620, 600, 620, 610), arc(675, 610, 55, 180, 0), bez([730, 610], [740, 420], [720, 250], [640, 160]), bez([640, 160], [560, 110], [430, 110], [360, 170]), bez([360, 170], [300, 230], [230, 360], [200, 470]), bez([200, 470], [250, 520], [330, 520], [400, 470])),
];
ICONS.LayoutList = [dot(190, 720), line(330, 720, 850, 720), dot(190, 500), line(330, 500, 850, 500), dot(190, 280), line(330, 280, 850, 280)];
ICONS.Menu = [line(170, 740, 830, 740), line(170, 500, 830, 500), line(170, 260, 830, 260)];

// ---------- ink them ----------
const num = (v) => Math.round(v);
const toD = (c) => 'M' + c.map(([x, y]) => num(x) + ' ' + num(1000 - y)).join('L') + 'Z';
const out = {};
let seedOff = 0;
for (const [name, strokes] of Object.entries(ICONS)) {
  const ds = [];
  for (const s of strokes) {
    const pts = s.length > 3 ? wobble(s, name === 'CaseSensitive' ? 0 : 6) : s;
    const o = E.penOutline(PEN, pts, ++seedOff);
    if (o && o.length > 2) ds.push(toD(E.simplify ? E.simplify(o, 1.2) : o));
  }
  out[name] = ds.join('');
}
const file = path.join(import.meta.dirname, 'engine-icons.ts');
fs.writeFileSync(file,
  `// GENERATED by make-engine-icons.mjs: the Reading Room's icons drawn with the engine's fountain pen.\n` +
  `// viewBox 0 0 1000 1000, filled with currentColor.\n` +
  `export const ENGINE_ICONS: Record<string, string> = ${JSON.stringify(out, null, 1)};\n`);
console.log('wrote', file, Object.keys(out).length, 'icons', Math.round(fs.statSync(file).size / 1024) + ' kB');

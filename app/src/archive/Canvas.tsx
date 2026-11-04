// All letters as a table you can wander: the letters scattered around "All letters" like paper on a desk, a
// field that loops in every direction. Drag or swipe (with a little glide), scroll with a trackpad or wheel, or use
// the arrow keys. A tap opens a letter; a drag never does.
//
// The field is one tile, wrapped: every letter has a place in it (cells around a clearing for the heading, a touch
// of scatter and tilt), and the tile is always larger than the screen, so each letter shows at most once. Only the
// letters near the screen are on the page; moving updates their positions directly (no re-render per frame), and
// letters come and go as they near the screen. A search or a century regathers the matching letters around the
// heading. Reduced motion: no glide.
//
// In the Reading Room the scatter sits on a hidden table (the layout study, proposal 2): equal cells, each letter
// standing on its row's shelf line at its own paper's size (one scale for every paper), barely tilted, with a
// two-line label under it (title; place, year and, for a letter lost in transit, why, in small capitals). The
// heading's cells stay empty: a quiet zone no letter enters.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type FocusEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { cardAspect } from './card-protocol';
import { cardKey, cards, cardSize } from './cards';
import { cardLetter } from './Card';
import { circumstanceLabel, fromTo, lostInTransit, opening, whereWhen } from './data';
import type { ArchiveLetter } from './model';
// the look in use: the Reading Room lays the letters on a table (no numbers on the sheets: the list has them)
import { LOOK } from '@/lib/look';
import { letterHash } from './route';
import { paperSize } from './paper-of';
// look C (?look=postmarked): each letter in its addressed envelope (src/themes/postmarked/)
import { EnvelopeCard } from '@/themes/postmarked/EnvelopeCard';

export type ViewId = 'canvas' | 'grid';
function readView(): ViewId {
  try {
    const asked = new URLSearchParams(location.search).get('view');
    if (asked === 'canvas' || asked === 'grid') { sessionStorage.setItem('seedhand:view', asked); return asked; }
    const kept = sessionStorage.getItem('seedhand:view');
    if (kept === 'canvas' || kept === 'grid') return kept;
  } catch { /* storage off: the default */ }
  return 'canvas';
}
export const VIEW: ViewId = typeof location !== 'undefined' ? readView() : 'canvas';

// ---------- the field ----------
interface Placed {
  id: string;
  letter?: ArchiveLetter;
  /** centre, in the tile (px, the heading at 0,0) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** degrees */
  tilt: number;
  aspect: number;
  /** the table: the sheet at its paper's size (px) and its own tilt, standing on the cell's shelf */
  sheet?: { w: number; h: number; tilt: number };
}
interface Field {
  items: Placed[];
  tileW: number;
  tileH: number;
}

function rand(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * Lay the letters out on a tile: cells around a clearing for the heading, the first letters nearest the middle
 * (so a search's matches gather there), some cells left empty so the spacing varies, each letter a little off its
 * cell's centre and a little tilted. The tile is at least the screen plus a margin each way, so nothing repeats on
 * screen. The heading's row is as tall as the heading needs (its measured height and `space` on each side, against
 * the tallest letter and its scatter), so no letter reaches into it at any text size.
 */
function layField(letters: ArchiveLetter[], o: { cardW: number; captionH: number; head: { w: number; h: number }; space: number; minW: number; minH: number }): Field {
  const gapX = Math.round(o.cardW * 0.34), gapY = Math.round(o.cardW * 0.3);
  const cellW = o.cardW + gapX;
  // rows sized for a typical letter (tall ones reach into the gap below, which the scatter leaves room for)
  const cellH = Math.round(o.cardW * 1.16) + o.captionH + gapY;
  // how far a letter can reach from its cell's centre: the tallest sheet (card-protocol.ts caps it at 1.42 its
  // width), its caption, the scatter, and what the tilt (±3.5°) adds
  const tilt = Math.sin((3.5 * Math.PI) / 180);
  const tallest = o.cardW * 1.42 + o.captionH;
  const reachY = tallest / 2 + gapY * 0.175 + (o.cardW / 2) * tilt;
  const reachX = o.cardW / 2 + gapX * 0.35 + (tallest / 2) * tilt;
  // the heading's row: the next rows' letters stop `space` short of the heading
  const midH = Math.max(cellH, Math.ceil(o.head.h + 2 * o.space + 2 * reachY - cellH));
  const n = letters.length;
  // about a fifth of the cells stay empty, for uneven spacing
  const want = Math.ceil(n * 1.22) + 8;
  let cols = Math.max(3, Math.round(Math.sqrt((want * cellH) / cellW)));
  let rows = Math.max(3, Math.ceil(want / cols));
  cols = Math.max(cols, Math.ceil(o.minW / cellW));
  rows = Math.max(rows, Math.ceil((o.minH - midH) / cellH) + 1);
  // odd counts put a cell (row and column) right on the heading, so the clearing is one row tall, not two
  cols += 1 - (cols % 2);
  rows += 1 - (rows % 2);
  const tileW = cols * cellW, tileH = (rows - 1) * cellH + midH;
  const r = rand('field:' + n);
  // cells, centred on the heading; in its row, the ones a letter would reach the heading from are the clearing
  const mid = (rows - 1) / 2;
  const cells: { cx: number; cy: number; d: number }[] = [];
  for (let j = 0; j < rows; j++) {
    const k = j - mid;
    const cy = k === 0 ? 0 : Math.sign(k) * (midH / 2 + (Math.abs(k) - 0.5) * cellH);
    for (let i = 0; i < cols; i++) {
      const cx = -tileW / 2 + (i + 0.5) * cellW;
      const clear = k === 0 && Math.abs(cx) - reachX < o.head.w / 2 + o.space;
      if (!clear) cells.push({ cx, cy, d: Math.hypot(cx / cellW, cy / cellH) + r() * 0.9 });
    }
  }
  cells.sort((a, b) => a.d - b.d);
  // leave some cells empty (never the nearest ring, so the heading isn't left alone)
  const slots = cells.filter((_, k) => k < 6 || r() > 0.17).slice(0, n);
  const items: Placed[] = letters.map((l, k) => {
    const c = slots[k] ?? cells[k % cells.length];
    const aspect = cardAspect(l.text);
    const h = Math.round(o.cardW * aspect) + o.captionH;
    return {
      id: l.id, letter: l, aspect,
      x: c.cx + (r() - 0.5) * gapX * 0.7,
      y: c.cy + (r() - 0.5) * gapY * 0.35,
      w: o.cardW, h, tilt: (r() - 0.5) * 7,
    };
  });
  items.push({ id: 'heading', x: 0, y: 0, w: o.head.w, h: o.head.h, tilt: 0, aspect: 0 });
  return { items, tileW, tileH };
}

/** The table's measures: a cell's width is the widest paper's, its shelf as tall as the tallest paper. */
interface TableSize {
  /** px per mm, the same for every paper */
  k: number;
  cellInner: number;
  shelfH: number;
  labelH: number;
}

/**
 * The Reading Room's table: letters in equal cells around the heading, nearest first (so a search's matches gather
 * there), each sheet at its paper's size standing on its row's shelf line, the label under the shelf. A cell is left
 * empty when anything in it would come within `space` of the heading. Tilt stays under 0.7° either way.
 */
function layTable(letters: ArchiveLetter[], papers: Map<string, { w: number; h: number }>, t: TableSize, o: { head: { w: number; h: number }; space: number; minW: number; minH: number }): Field {
  const gapX = Math.round(t.cellInner * 0.3), gapY = Math.round(t.cellInner * 0.2);
  const cellW = t.cellInner + gapX;
  const itemH = t.shelfH + t.labelH;
  const cellH = itemH + gapY;
  const n = letters.length;
  const quiet = (cx: number, cy: number) =>
    Math.abs(cx) - t.cellInner / 2 < o.head.w / 2 + o.space && Math.abs(cy) - itemH / 2 < o.head.h / 2 + o.space;
  let cols = Math.max(3, Math.round(Math.sqrt(((n + 6) * cellH) / cellW)), Math.ceil(o.minW / cellW));
  let rows = Math.max(3, Math.ceil((n + 6) / cols), Math.ceil(o.minH / cellH));
  cols += 1 - (cols % 2);
  rows += 1 - (rows % 2);
  const r = rand('table:' + n);
  let cells: { cx: number; cy: number; d: number }[] = [];
  for (;;) {
    cells = [];
    for (let j = 0; j < rows; j++) {
      const cy = (j - (rows - 1) / 2) * cellH;
      for (let i = 0; i < cols; i++) {
        const cx = (i - (cols - 1) / 2) * cellW;
        if (!quiet(cx, cy)) cells.push({ cx, cy, d: Math.hypot(cx / cellW, cy / cellH) });
      }
    }
    if (cells.length >= n) break;
    rows += 2;
  }
  // nearest first, rows read left to right within a ring (a little give, so the order is felt more than seen)
  for (const c of cells) c.d += r() * 0.35;
  cells.sort((a, b) => a.d - b.d);
  const items: Placed[] = letters.map((l, k) => {
    const c = cells[k];
    const p = papers.get(l.id) ?? { w: 148, h: 210 };
    return {
      id: l.id, letter: l, aspect: p.h / p.w,
      x: c.cx, y: c.cy, w: t.cellInner, h: itemH, tilt: 0,
      sheet: { w: Math.round(p.w * t.k), h: Math.round(p.h * t.k), tilt: (r() - 0.5) * 1.4 },
    };
  });
  items.push({ id: 'heading', x: 0, y: 0, w: o.head.w, h: o.head.h, tilt: 0, aspect: 0 });
  return { items, tileW: cols * cellW, tileH: rows * cellH };
}

/** The page's rem in px: 16 by default, more when the reader has asked for larger text. Read again on a resize and
 * whenever `refresh` is called (the heading changing size is the sure sign the text size has). */
const readRem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
function useRootRem() {
  const [rem, setRem] = useState(readRem);
  const refresh = useCallback(() => setRem(readRem()), []);
  useEffect(() => {
    window.addEventListener('resize', refresh);
    return () => window.removeEventListener('resize', refresh);
  }, [refresh]);
  return [rem, refresh] as const;
}

/** Where a tile position lands on screen, wrapped so it's always within half a tile of the camera. */
const wrap = (d: number, size: number) => ((((d + size / 2) % size) + size) % size) - size / 2;

// ---------- the view ----------
interface Props {
  letters: ArchiveLetter[];
  /** the letters that match the search and filters, in order */
  shown: ArchiveLetter[];
  heading: ReactNode;
  empty: ReactNode | null;
  onOpen: () => void;
  /** the index is on screen (not under an open letter) */
  active: boolean;
  /** show the letters as a list (the grid) */
  onList: () => void;
}

const MARGIN = 280;

// ---------- where you are on the table: the running head's middle (SiteHeader's `centre`) ----------
// The decade of the letter nearest the middle of the screen and a few of that decade's places near it ("the 1790s ·
// Cairo, Madrid, Westminster"); nothing while the heading is nearest. Kept in a tiny store so only the readout
// re-renders as you drag, and only when the words change.
let readoutNow = '';
const readoutSubs = new Set<() => void>();
function setReadout(v: string) {
  if (v === readoutNow) return;
  readoutNow = v;
  readoutSubs.forEach((fn) => fn());
}
export function useCanvasReadout() {
  return useSyncExternalStore((cb) => { readoutSubs.add(cb); return () => readoutSubs.delete(cb); }, () => readoutNow, () => '');
}
function readoutOf(near: { it: Placed; d: number }[]) {
  const first = near[0];
  if (!first || first.it.id === 'heading' || first.it.letter?.year == null) return '';
  const decade = Math.floor(first.it.letter.year / 10) * 10;
  const places: string[] = [];
  for (const { it } of near) {
    const l = it.letter;
    if (!l?.place || l.year == null || Math.floor(l.year / 10) * 10 !== decade) continue;
    const place = l.place.replace(/\s*\([^)]*\)/g, '').split(/,\s*/)[0];
    if (place && !places.includes(place)) places.push(place);
    if (places.length === 3) break;
  }
  return `the ${decade}s${places.length ? ` · ${places.join(', ')}` : ''}`;
}

/** The Reading Room lays the letters on a table (layTable); the other looks scatter them (layField). */
const TABLE = LOOK === 'reading-room';

export function LetterCanvas({ letters, shown, heading, empty, onOpen, active, onList }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const narrow = vp.w < 640;
  const cardW = narrow ? 150 : vp.w < 1024 ? 190 : 224;
  const captionH = narrow ? 44 : 50;
  // the heading: its measure in rem (larger text, a wider heading), its height as it really is (measured below:
  // the intro, a look's finding aid, a "no letters match" note, at any text size); the space around it in rem too
  const [rem, refreshRem] = useRootRem();
  const [headH, setHeadH] = useState<number | null>(null);
  const head = {
    w: Math.round(narrow ? Math.min(20.625 * rem, vp.w - 40) : Math.min(35 * rem, vp.w - 80)),
    h: headH ?? Math.round((narrow ? 18.75 : 18) * rem),
  };
  const space = Math.round(1.5 * rem);
  // the table: every paper at one scale, the widest filling a cell; the shelf as tall as the tallest paper; the label
  // under it at most four lines (two of title, two of small capitals: library.css clamps them), in rem
  const papers = useMemo(() => new Map(letters.map((l) => [l.id, paperSize(l)])), [letters]);
  const table = useMemo((): TableSize | null => {
    if (!TABLE) return null;
    let w = 0, h = 0;
    for (const p of papers.values()) { w = Math.max(w, p.w); h = Math.max(h, p.h); }
    const k = cardW / (w || 148);
    return { k, cellInner: cardW, shelfH: Math.round((h || 210) * k), labelH: Math.round(5.125 * rem) };
  }, [papers, cardW, rem]);
  const field = useMemo(
    () => {
      const o = { head, space, minW: vp.w + MARGIN * 2 + cardW, minH: vp.h + MARGIN * 2 + cardW * 1.6 };
      return table ? layTable(shown, papers, table, o) : layField(shown, { cardW, captionH, ...o });
    },
    // the field changes with what's shown and the screen's class, not every pixel of a resize
    [shown, cardW, captionH, head.w, head.h, space, table, papers, Math.ceil(vp.w / 200), Math.ceil(vp.h / 200)],
  );
  // measured when the heading is on the page, and again whenever it changes size (a face loads, the text grows);
  // kept while it's panned out of sight. Steps of 4 px, so a sub-pixel wobble doesn't lay the field out again.
  const headObs = useRef<ResizeObserver | null>(null);
  const measureHead = useCallback((el: HTMLElement | null) => {
    headObs.current?.disconnect();
    headObs.current = null;
    if (!el) return;
    const take = () => {
      const h = Math.ceil(el.offsetHeight / 4) * 4;
      if (h > 0) setHeadH((was) => (was === h ? was : h));
      refreshRem();
    };
    take();
    headObs.current = new ResizeObserver(take);
    headObs.current.observe(el);
  }, [refreshRem]);
  const size = useMemo(() => cardSize(cardW), [cardW]);

  // the camera: the tile position at the centre of the screen
  const cam = useRef({ x: 0, y: 0 });
  const els = useRef(new Map<string, HTMLElement>());
  const [visible, setVisible] = useState<string[]>([]);
  const visibleKey = useRef('');

  const place = useCallback((it: Placed) => {
    const sx = wrap(it.x - cam.current.x, field.tileW) + vp.w / 2;
    const sy = wrap(it.y - cam.current.y, field.tileH) + vp.h / 2;
    return { sx, sy, near: sx + it.w / 2 > -MARGIN && sx - it.w / 2 < vp.w + MARGIN && sy + it.h / 2 > -MARGIN && sy - it.h / 2 < vp.h + MARGIN };
  }, [field, vp.w, vp.h]);
  const transformOf = (it: Placed, sx: number, sy: number) =>
    `translate3d(${(sx - it.w / 2).toFixed(1)}px, ${(sy - it.h / 2).toFixed(1)}px, 0) rotate(${it.tilt.toFixed(2)}deg)`;

  /** Move everything to the camera: transforms directly, and the set of letters near the screen when it changes. */
  const byId = useMemo(() => new Map(field.items.map((it) => [it.id, it])), [field]);
  const frame = useCallback(() => {
    const near: { id: string; sx: number; sy: number }[] = [];
    for (const it of field.items) {
      const p = place(it);
      if (!p.near) continue;
      near.push({ id: it.id, sx: p.sx, sy: p.sy });
      const el = els.current.get(it.id);
      if (el) el.style.transform = transformOf(it, p.sx, p.sy);
    }
    // the Reading Room's running head: where you are (the letters nearest the middle of the screen)
    if (TABLE) {
      const cx = vp.w / 2, cy = vp.h / 2;
      const byDist = near
        .map((n) => ({ it: byId.get(n.id)!, d: Math.hypot(n.sx - cx, n.sy - cy) }))
        .filter((n) => n.it && n.d < Math.max(vp.w, vp.h) * 0.6)
        .sort((a, b) => a.d - b.d);
      setReadout(readoutOf(byDist));
    }
    // reading order for Tab: rows from the top, left to right
    near.sort((a, b) => (Math.abs(a.sy - b.sy) > 120 ? a.sy - b.sy : a.sx - b.sx));
    const key = near.map((n) => n.id).join(',');
    if (key !== visibleKey.current) {
      visibleKey.current = key;
      setVisible(near.map((n) => n.id));
    }
  }, [field, place, byId, vp.w, vp.h]);
  useLayoutEffect(frame, [frame]);

  // a new set of letters (a search, a century): gather them around the heading, from the middle
  const fieldKey = shown.map((l) => l.id).join(',');
  const firstField = useRef(true);
  useLayoutEffect(() => {
    if (firstField.current) { firstField.current = false; return; }
    cam.current = { x: 0, y: 0 };
    frame();
    const stage = stageRef.current;
    stage?.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
  }, [fieldKey]);

  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  // the page itself doesn't scroll in this view: the field does
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => { root.style.overflow = before; };
  }, [active]);

  // ---------- moving: drag with a glide, wheel and trackpad, arrow keys ----------
  const reduce = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const anim = useRef<number | null>(null);
  const stop = () => { if (anim.current != null) cancelAnimationFrame(anim.current); anim.current = null; };
  const moveBy = useCallback((dx: number, dy: number) => {
    cam.current.x += dx;
    cam.current.y += dy;
    frame();
  }, [frame]);
  /** a smooth move by (dx, dy), for keys and focus */
  const glideTo = useCallback((dx: number, dy: number, ms = 320) => {
    stop();
    if (reduce) { moveBy(dx, dy); return; }
    const from = { ...cam.current };
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      cam.current = { x: from.x + dx * e, y: from.y + dy * e };
      frame();
      anim.current = k < 1 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  }, [frame, moveBy, reduce]);

  const drag = useRef<{ id: number; x: number; y: number; moved: boolean; vx: number; vy: number; t: number } | null>(null);
  const suppressClick = useRef(false);
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-no-pan]')) return;
    stop();
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, vx: 0, vy: 0, t: performance.now() };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      d.moved = true;
      // only now take the pointer: a tap still reaches the letter it lands on
      stageRef.current?.setPointerCapture(e.pointerId);
      stageRef.current?.classList.add('is-dragging');
    }
    const now = performance.now();
    const dt = Math.max(1, now - d.t);
    d.vx = 0.8 * (dx / dt) + 0.2 * d.vx;
    d.vy = 0.8 * (dy / dt) + 0.2 * d.vy;
    d.x = e.clientX; d.y = e.clientY; d.t = now;
    moveBy(-dx, -dy);
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    stageRef.current?.classList.remove('is-dragging');
    if (!d.moved) return;
    suppressClick.current = true;
    setTimeout(() => { suppressClick.current = false; }, 0);
    if (reduce || performance.now() - d.t > 80) return;
    // the glide: the hand's last speed, slowing down
    let vx = d.vx, vy = d.vy, last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(32, t - last);
      last = t;
      const f = Math.pow(0.94, dt / 16);
      vx *= f; vy *= f;
      moveBy(-vx * dt, -vy * dt);
      anim.current = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  };
  const onClickCapture = (e: MouseEvent) => {
    if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); }
  };

  // wheel and two-finger trackpad pan (not pinch: that's the browser's zoom)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !active) return;
    const on = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      e.preventDefault();
      stop();
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vp.h : 1;
      moveBy(e.deltaX * k, e.deltaY * k);
    };
    stage.addEventListener('wheel', on, { passive: false });
    return () => stage.removeEventListener('wheel', on);
  }, [active, moveBy, vp.h]);

  // arrow keys pan (not while typing in a field)
  useEffect(() => {
    if (!active) return;
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
      const step = narrow ? 180 : 260;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!d) return;
      e.preventDefault();
      glideTo(d[0], d[1], 260);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [active, glideTo, narrow]);

  // Tab: a letter that takes the focus comes to the middle. Keyboard focus only: a click focuses the link too (in
  // Chromium), and gliding then would carry the letter out from under the pointer before the click lands
  const onFocusIn = (e: FocusEvent) => {
    const t = e.target as HTMLElement;
    try { if (!t.matches(':focus-visible')) return; } catch { /* an older browser: glide as before */ }
    const el = t.closest<HTMLElement>('[data-place]');
    if (!el) return;
    const it = field.items.find((x) => x.id === el.dataset.place);
    if (!it) return;
    const p = place(it);
    const inset = 80;
    if (p.sx - it.w / 2 > inset && p.sx + it.w / 2 < vp.w - inset && p.sy - it.h / 2 > inset && p.sy + it.h / 2 < vp.h - 120) return;
    glideTo(p.sx - vp.w / 2, p.sy - vp.h / 2);
  };

  useEffect(() => () => { stop(); setReadout(''); }, []);

  return (
    <div
      ref={stageRef}
      className="letter-canvas fixed inset-0 touch-none overflow-hidden select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
      onFocus={onFocusIn}
    >
      <a href="#" onClick={(e) => { e.preventDefault(); onList(); }} className="sr-only focus:not-sr-only focus:fixed focus:top-16 focus:left-4 focus:z-40 focus:rounded-lg focus:bg-[var(--lib-surface)] focus:px-3 focus:py-2 focus:text-[13px] focus:shadow-[var(--lib-surface-shadow)]">
        Show the letters as a list
      </a>
      <ul role="list" aria-label="All letters, scattered" className="contents">
        {visible.map((id) => {
          const it = byId.get(id);
          if (!it) return null;
          const p = place(it);
          const style: CSSProperties = { width: it.w, transform: transformOf(it, p.sx, p.sy) };
          const ref = (el: HTMLElement | null) => { if (el) els.current.set(id, el); else els.current.delete(id); };
          if (id === 'heading') {
            return (
              <li key={id} ref={ref} data-place={id} className="canvas-item absolute top-0 left-0" style={style}>
                {/* its own height (measured: the field makes room for it) */}
                <div ref={measureHead}>
                  {heading}
                  {empty}
                </div>
              </li>
            );
          }
          // the Reading Room: on the table, at its paper's size
          if (table && it.sheet) return <TableCard key={id} letter={it.letter!} sheet={it.sheet} shelfH={table.shelfH} cellInner={table.cellInner} style={style} itemRef={ref} onOpen={onOpen} />;
          // look C (?look=postmarked): each letter in its addressed envelope
          const Card = LOOK === 'postmarked' ? EnvelopeCard : CanvasCard;
          return <Card key={id} letter={it.letter!} aspect={it.aspect} size={size} style={style} itemRef={ref} onOpen={onOpen} />;
        })}
      </ul>
    </div>
  );
}

const CanvasCard = memo(function CanvasCard({ letter, aspect, size, style, itemRef, onOpen }: {
  letter: ArchiveLetter; aspect: number; size: { css: number; width: number }; style: CSSProperties; itemRef: (el: HTMLElement | null) => void; onOpen: () => void;
}) {
  const paperRef = useRef<HTMLDivElement>(null);
  const key = cardKey(letter.id, undefined, size);
  const img = useSyncExternalStore((cb) => cards.subscribe(key, cb), () => cards.get(key));
  const [loaded, setLoaded] = useState(false);
  // near the screen (it's on the page at all): write it; gone again: never mind
  useEffect(() => {
    const el = paperRef.current;
    if (!el || img) return;
    cards.want({ key, letter: cardLetter(letter), width: size.width, css: size.css, aspect, el });
    return () => cards.unwant(key);
  }, [key, img, letter, size, aspect]);
  const b = img ? img.bleed / img.width : 0;
  const special = lostInTransit(letter);
  return (
    <li ref={itemRef} data-place={letter.id} className="canvas-item absolute top-0 left-0" style={style}>
      <a
        href={letterHash(letter.id)}
        onClick={onOpen}
        draggable={false}
        title={`${fromTo(letter)}\n${whereWhen(letter)}`}
        className="archive-card group block rounded-[3px] outline-none"
      >
        <div ref={paperRef} className="relative isolate" style={{ aspectRatio: `1 / ${aspect}` }}>
          <div aria-hidden className={cn('archive-sheet-blank absolute inset-0 rounded-[1px] bg-[var(--paper)]', loaded && 'is-gone')} />
          {img && (
            <img
              src={img.url}
              alt=""
              aria-hidden
              decoding="async"
              draggable={false}
              onLoad={() => { setLoaded(true); cards.shown(); }}
              style={{ left: `${-b * 100}%`, marginTop: `${-b * 100}%`, width: `${(1 + 2 * b) * 100}%` }}
              className={cn('absolute top-0 h-auto max-w-none select-none', img.fresh && 'card-in')}
            />
          )}
        </div>
        <h3 className="canvas-title font-letter mt-2.5 pr-1 leading-[1.25] text-foreground/85 text-pretty">
          {letter.title ?? opening(letter.text, 48)}
        </h3>
        <span className="sr-only">
          {special ? `${circumstanceLabel(letter)}. ` : ''}{fromTo(letter)}. {whereWhen(letter)}.
        </span>
      </a>
    </li>
  );
});

/** A place for a label's small capitals: the first and last parts of a long one, nothing in brackets
 * ("Mount Rest, Clay-Ashland, Liberia" → "Mount Rest, Liberia"; "Béxar (San Antonio), Mexican Texas" → "Béxar, Mexican Texas"). */
function labelPlace(place: string | undefined) {
  const parts = (place ?? '').replace(/\s*\([^)]*\)/g, '').split(/,\s*/).filter(Boolean);
  return parts.length > 2 ? `${parts[0]}, ${parts[parts.length - 1]}` : parts.join(', ');
}

/**
 * A letter on the Reading Room's table: its sheet at its paper's size standing on the shelf (bottom-aligned in a
 * shelf as tall as the tallest paper), a little askew; under the shelf a museum label, the title, then place, year
 * and, for a letter lost in transit, why (in red), in small capitals. The label starts at the sheet's left edge.
 * Under the pointer or the keyboard's focus the letter lifts and the rest of the table steps back a little
 * (library.css); no number on the sheet and nothing added to the label, so the table stays clean (the list keeps the
 * numbers).
 */
const TableCard = memo(function TableCard({ letter, sheet, shelfH, cellInner, style, itemRef, onOpen }: {
  letter: ArchiveLetter; sheet: { w: number; h: number; tilt: number }; shelfH: number; cellInner: number;
  style: CSSProperties; itemRef: (el: HTMLElement | null) => void; onOpen: () => void;
}) {
  const paperRef = useRef<HTMLDivElement>(null);
  const size = useMemo(() => cardSize(sheet.w), [sheet.w]);
  const key = cardKey(letter.id, undefined, size) + '|sheet';
  const img = useSyncExternalStore((cb) => cards.subscribe(key, cb), () => cards.get(key));
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const el = paperRef.current;
    if (!el || img) return;
    cards.want({ key, letter: cardLetter(letter), width: size.width, css: size.css, aspect: sheet.h / sheet.w, full: true, el });
    return () => cards.unwant(key);
  }, [key, img, letter, size, sheet.w, sheet.h]);
  const b = img ? img.bleed / img.width : 0;
  const special = lostInTransit(letter);
  const inset = Math.max(0, (cellInner - sheet.w) / 2);
  const place = labelPlace(letter.place);
  return (
    <li ref={itemRef} data-place={letter.id} className="canvas-item table-item absolute top-0 left-0" style={style}>
      <a
        href={letterHash(letter.id)}
        onClick={onOpen}
        draggable={false}
        title={`${fromTo(letter)}\n${whereWhen(letter)}`}
        className="archive-card table-card group block outline-none"
      >
        <div className="flex items-end justify-center" style={{ height: shelfH }}>
          <div ref={paperRef} className="table-sheet relative isolate shrink-0" style={{ width: sheet.w, height: sheet.h, '--tilt': `${sheet.tilt.toFixed(2)}deg` } as CSSProperties}>
            <div aria-hidden className={cn('archive-sheet-blank absolute inset-0 rounded-[1px] bg-[var(--paper)]', loaded && 'is-gone')} />
            {img && (
              <img
                src={img.url}
                alt=""
                aria-hidden
                decoding="async"
                draggable={false}
                onLoad={() => { setLoaded(true); cards.shown(); }}
                style={{ left: `${-b * 100}%`, marginTop: `${-b * 100}%`, width: `${(1 + 2 * b) * 100}%` }}
                className={cn('absolute top-0 h-auto max-w-none select-none', img.fresh && 'card-in')}
              />
            )}
          </div>
        </div>
        <div className="table-label" style={{ marginLeft: inset }}>
          <h3 className="table-title">{letter.title ?? opening(letter.text, 48)}</h3>
          <p className="table-meta">
            {[place, letter.year != null ? String(letter.year) : ''].filter(Boolean).join(' · ')}
            {special && <>{place || letter.year != null ? ' · ' : ''}<span className="table-status">{circumstanceLabel(letter)}</span></>}
          </p>
        </div>
        <span className="sr-only">
          {special ? `${circumstanceLabel(letter)}. ` : ''}{fromTo(letter)}. {whereWhen(letter)}.
        </span>
      </a>
    </li>
  );
});

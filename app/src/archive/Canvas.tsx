// All letters as a table you can wander: the letters scattered around "All letters" like paper on a desk, a
// field that loops in every direction. Drag or swipe (with a little glide), scroll with a trackpad or wheel, or use
// the arrow keys. A tap opens a letter; a drag never does.
//
// The field is one tile, wrapped: every letter has a place in it (cells around a clearing for the heading, a touch
// of scatter and tilt), and the tile is always larger than the screen, so each letter shows at most once. Only the
// letters near the screen are on the page; moving updates their positions directly (no re-render per frame), and
// letters come and go as they near the screen. A search or a century regathers the matching letters around the
// heading. Reduced motion: no glide.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type FocusEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { cardAspect } from './card-protocol';
import { cardKey, cards, cardSize } from './cards';
import { cardLetter } from './Card';
import { circumstanceLabel, fromTo, lostInTransit, opening, whereWhen } from './data';
import type { ArchiveLetter } from './model';
// the look being compared (?look=reading-room): the letter's number stamped on its sheet (src/themes/reading-room/)
import { LOOK } from '@/lib/look';
import { CardStamp } from '@/themes/reading-room/SheetMarks';
import { letterHash } from './route';

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
 * screen.
 */
function layField(letters: ArchiveLetter[], o: { cardW: number; captionH: number; head: { w: number; h: number }; minW: number; minH: number }): Field {
  const gapX = Math.round(o.cardW * 0.34), gapY = Math.round(o.cardW * 0.3);
  const cellW = o.cardW + gapX;
  // rows sized for a typical letter (tall ones reach into the gap below, which the scatter leaves room for)
  const cellH = Math.round(o.cardW * 1.16) + o.captionH + gapY;
  const n = letters.length;
  // about a fifth of the cells stay empty, for uneven spacing
  const want = Math.ceil(n * 1.22) + 8;
  let cols = Math.max(3, Math.round(Math.sqrt((want * cellH) / cellW)));
  let rows = Math.max(3, Math.ceil(want / cols));
  cols = Math.max(cols, Math.ceil(o.minW / cellW));
  rows = Math.max(rows, Math.ceil(o.minH / cellH));
  // odd counts put a cell (row and column) right on the heading, so the clearing is one row tall, not two
  cols += 1 - (cols % 2);
  rows += 1 - (rows % 2);
  const tileW = cols * cellW, tileH = rows * cellH;
  const r = rand('field:' + n);
  // cells, centred on the heading; the ones under the heading (and a little around it) are the clearing
  const cells: { cx: number; cy: number; d: number }[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const cx = -tileW / 2 + (i + 0.5) * cellW;
      const cy = -tileH / 2 + (j + 0.5) * cellH;
      const clear = Math.abs(cx) < o.head.w / 2 + cellW * 0.4 && Math.abs(cy) < o.head.h / 2 + cellH * 0.3;
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

export function LetterCanvas({ shown, heading, empty, onOpen, active, onList }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const narrow = vp.w < 640;
  const cardW = narrow ? 150 : vp.w < 1024 ? 190 : 224;
  const captionH = narrow ? 44 : 50;
  const head = narrow ? { w: Math.min(330, vp.w - 40), h: 300 } : { w: 560, h: 290 };
  const field = useMemo(
    () => layField(shown, { cardW, captionH, head, minW: vp.w + MARGIN * 2 + cardW, minH: vp.h + MARGIN * 2 + cardW * 1.6 }),
    // the field changes with what's shown and the screen's class, not every pixel of a resize
    [shown, cardW, captionH, head.w, head.h, Math.ceil(vp.w / 200), Math.ceil(vp.h / 200)],
  );
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
  const frame = useCallback(() => {
    const near: { id: string; sx: number; sy: number }[] = [];
    for (const it of field.items) {
      const p = place(it);
      if (!p.near) continue;
      near.push({ id: it.id, sx: p.sx, sy: p.sy });
      const el = els.current.get(it.id);
      if (el) el.style.transform = transformOf(it, p.sx, p.sy);
    }
    // reading order for Tab: rows from the top, left to right
    near.sort((a, b) => (Math.abs(a.sy - b.sy) > 120 ? a.sy - b.sy : a.sx - b.sx));
    const key = near.map((n) => n.id).join(',');
    if (key !== visibleKey.current) {
      visibleKey.current = key;
      setVisible(near.map((n) => n.id));
    }
  }, [field, place]);
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

  // Tab: a letter that takes the focus comes to the middle
  const onFocusIn = (e: FocusEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-place]');
    if (!el) return;
    const it = field.items.find((x) => x.id === el.dataset.place);
    if (!it) return;
    const p = place(it);
    const inset = 80;
    if (p.sx - it.w / 2 > inset && p.sx + it.w / 2 < vp.w - inset && p.sy - it.h / 2 > inset && p.sy + it.h / 2 < vp.h - 120) return;
    glideTo(p.sx - vp.w / 2, p.sy - vp.h / 2);
  };

  useEffect(() => () => stop(), []);

  const byId = useMemo(() => new Map(field.items.map((it) => [it.id, it])), [field]);
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
              <li key={id} ref={ref} data-place={id} className="canvas-item absolute top-0 left-0" style={{ ...style, height: it.h }}>
                {heading}
                {empty}
              </li>
            );
          }
          return <CanvasCard key={id} letter={it.letter!} aspect={it.aspect} size={size} style={style} itemRef={ref} onOpen={onOpen} />;
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
          {LOOK === 'reading-room' && <CardStamp id={letter.id} />}
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

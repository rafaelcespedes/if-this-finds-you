import { createContext, memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ALL_PAPERS, isShaped, SHADOW_BLEED, type PaperSpec } from '@/lib/papers';
import { paintHere, paintOff, paintsOffThread, warmPaper, type PaperBitmap, type PaperJob } from '@/lib/paper/client';
import { hideMarks, markBox, planMarks, printMarks, setNoteWriter, showMarks, type MarkInput } from '@/lib/paper/marks';
import { writeNote } from '@/lib/paper/pencil-note';
import { hideWear, showWear, wearLevel, wornPaper, type WearLevel } from '@/lib/paper/wear';
import { perf } from '@/lib/perf';
import { sampleById } from '@/lib/samples';
import { cn } from '@/lib/utils';

/**
 * Whether the pad's guide sheet shows through (pad, airmail). It's there while you write and stays in the pad
 * when the letter is sent, so the reader view and the found letter set this to false (and the JPEG has none).
 */
export const PaperGuide = createContext(true);

// the archivist's pencilled notes are written in a real hand, here on the page
setNoteWriter(writeNote);

/**
 * Printed marks for the letter on these sheets (a look's datestamp, number, cancellation; lib/paper/marks.ts). Wrap a
 * letter's sheets in <PaperMarks value={{ id, hand, place, year, number, look }}>: the marks are printed into the first
 * sheet's paper (those stamped before the letter was written) or onto a layer over its writing (those stamped after).
 * Nothing is printed without it.
 */
export const PaperMarks = createContext<MarkInput | null>(null);

/**
 * Which letter these sheets are (a found letter's id, or the writer's seed for your own) and its year: the sheets
 * wear as that letter does (lib/paper/wear.ts), the same wherever it's shown. Without it, the marks' letter, if any.
 */
export const PaperLetter = createContext<{ id: string; year?: number | null } | null>(null);

interface Props {
  paper: PaperSpec;
  /** CSS px per mm */
  pxPerMm: number;
  /** paint only this part of the sheet (mm), for swatches */
  crop?: { x: number; y: number; w: number; h: number };
  /** cross-fade from the paper shown before (a new look) */
  fade?: boolean;
  /** which sheet of the letter (a deckle, a tear and the guide sit a little differently on each) */
  sheet?: number;
  /** how worn (lib/paper/wear.ts), for side-by-side comparison; else the page's ?wear= */
  wear?: WearLevel;
  className?: string;
}

// Painted sheets, kept so switching back to a paper costs a copy, not a repaint (a few sheet-sized bitmaps).
// Swatches have their own, larger store so the picker never pushes a sheet out. Paintings still on their way from
// the worker are shared, so two canvases asking for the same sheet wait for one painting.
const painted = new Map<string, PaperBitmap>();
const swatches = new Map<string, PaperBitmap>();
const coming = new Map<string, Promise<PaperBitmap>>();
const KEEP = 6;
const KEEP_SWATCHES = 48;

function keep(store: Map<string, PaperBitmap>, key: string, bmp: PaperBitmap, max: number) {
  store.set(key, bmp);
  while (store.size > max) {
    const [old, b] = store.entries().next().value!;
    store.delete(old);
    // a canvas showing it holds its own copy
    if ('close' in b) b.close();
  }
}

function desk() {
  return getComputedStyle(document.documentElement).getPropertyValue('--desk').trim() || '#eeebe4';
}

/** How far past the screen a sheet keeps its painted paper (a screen's height above and below). */
const NEAR = '100% 0px';

let warmed = false;

/**
 * A sheet of paper painted on a canvas at the screen's pixel density. The painting happens in a worker where the
 * browser allows it: until the new paper arrives the old one stays (its own size), then they swap. A long letter's
 * sheets far from the screen give their bitmaps back (each is several megabytes) and are painted again as they come
 * near.
 */
export const PaperCanvas = memo(function PaperCanvas({ paper, pxPerMm, crop, fade, sheet = 0, wear, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const shown = useRef<string | null>(null);
  const wanted = useRef<string | null>(null);
  // the first sheets start painted (they're the ones on screen); the rest wait to be seen near
  const [near, setNear] = useState(() => !!crop || sheet < 2);
  useEffect(() => {
    const c = ref.current;
    if (crop || !c || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: NEAR });
    io.observe(c);
    return () => io.disconnect();
  }, [crop]);
  const guide = useContext(PaperGuide);
  const given = useContext(PaperMarks);
  // a found letter's provenance and kind come from its record, for the marks of its era
  const markInput = useMemo(() => {
    if (!given || (given.origin !== undefined && given.kind !== undefined)) return given;
    const s = sampleById(given.id) as { origin?: string; kind?: string } | undefined;
    return { ...given, origin: given.origin ?? s?.origin ?? null, kind: given.kind ?? s?.kind ?? null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [given?.id, given?.hand, given?.place, given?.year, given?.number, given?.cancel, given?.look, given?.badge, given?.origin, given?.kind, given?.mode]);
  const plan = useMemo(
    () => (markInput && !crop && sheet === 0 ? planMarks(paper, markInput) : null),
    [paper, crop, sheet, markInput],
  );
  const under = plan?.marks.filter((m) => m.layer === 'under') ?? [];
  const over = plan?.marks.filter((m) => m.layer === 'over') ?? [];
  const overRef = useRef<HTMLCanvasElement>(null);
  // the layer over the writing covers only its marks (a few mm round them), not the whole sheet
  const overBox = useMemo(() => {
    if (!over.length) return null;
    const bs = over.map(markBox);
    const x0 = Math.max(0, Math.min(...bs.map((b) => b[0])) - 3), y0 = Math.max(0, Math.min(...bs.map((b) => b[1])) - 3);
    const x1 = Math.min(paper.w, Math.max(...bs.map((b) => b[2])) + 3), y1 = Math.min(paper.h, Math.max(...bs.map((b) => b[3])) + 3);
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, paper.w, paper.h]);
  // a download or a video of this letter prints the same marks
  useEffect(() => {
    if (!plan || !markInput) return;
    const owner = {};
    showMarks(paper.id, markInput, owner);
    return () => hideMarks(owner);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);
  // this letter's sheet of the paper, aged as its letter is (lib/paper/wear.ts); a swatch shows the paper new
  const letter = useContext(PaperLetter);
  const wearId = letter?.id ?? markInput?.id ?? '';
  const wearYear = letter ? letter.year : markInput?.year;
  const sheetOf = useMemo(() => (crop ? paper : wornPaper(paper, wearId, wearYear, wear ?? wearLevel())), [paper, crop, wearId, wearYear, wear]);
  // a download or a video of this letter is printed on the same worn sheet
  useEffect(() => {
    if (crop || sheet !== 0 || !sheetOf.wear) return;
    const owner = {};
    showWear(paper.id, sheetOf.wear.seed, wearYear, owner);
    return () => hideWear(owner);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetOf]);
  const region = crop ?? { x: 0, y: 0, w: paper.w, h: paper.h };
  // a shaped sheet (deckle, tear, flaps) paints its own shadow just outside itself
  const bleed = !crop && isShaped(sheetOf) ? SHADOW_BLEED : 0;
  const cssW = region.w * pxPerMm;
  const cssH = region.h * pxPerMm;

  useLayoutEffect(() => {
    const c = ref.current;
    if (!c || cssW <= 0) return;
    if (!near) {
      // far from the screen: the bitmap goes (the sheet keeps its size; it's painted again on the way back)
      if (c.width) { c.width = 0; c.height = 0; }
      shown.current = wanted.current = null;
      return;
    }
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const k = pxPerMm * dpr;
    const b = Math.round(bleed * dpr);
    const w = Math.round(region.w * k) + 2 * b;
    const h = Math.round(region.h * k) + 2 * b;
    const key = `${paper.id}|${guide ? 'g' : ''}|${sheet}|${region.x}|${region.y}|${w}x${h}${under.length ? '|m' + plan!.key : ''}${sheetOf.wear ? `|w${sheetOf.wear.seed}:${sheetOf.wear.amount}` : ''}`;
    if (shown.current === key) return;
    wanted.current = key;
    const asked = performance.now();

    // the canvas takes the new paper's size only when the new paper is in it, so the old one never stretches
    const show = (src: PaperBitmap) => {
      if (wanted.current !== key || ref.current !== c) return;
      // the old paper fades out over the new one
      if (fade && shown.current && c.width && !crop) ghost(c, cssW, cssH);
      c.width = w;
      c.height = h;
      c.style.width = `${cssW + 2 * bleed}px`;
      c.style.height = `${cssH + 2 * bleed}px`;
      c.style.left = bleed ? `${-bleed}px` : '';
      c.style.top = bleed ? `${-bleed}px` : '';
      c.getContext('2d')?.drawImage(src, 0, 0);
      shown.current = key;
      if (!warmed) { warmed = true; warmPaper(ALL_PAPERS); }
    };

    const store = crop ? swatches : painted;
    const have = store.get(key);
    if (have) { show(have); return; }
    const job: Omit<PaperJob, 'id'> = {
      paper: sheetOf,
      w,
      h,
      tx: b - region.x * k,
      ty: b - region.y * k,
      // a swatch may look past the sheet's edge, onto the desk
      fill: crop ? desk() : undefined,
      o: {
        pxPerMm: k,
        grainScale: dpr,
        // a swatch shows its cut edges against the desk; a sheet lets the real desk show
        holeFill: crop ? desk() : 'clear',
        guide,
        sheet,
        shadow: bleed ? 'full' : 'contact',
        marks: under.length ? under : undefined,
      },
    };
    const max = crop ? KEEP_SWATCHES : KEEP;
    if (!paintsOffThread()) {
      // no painting in workers here: paint now, as the page always did
      const src = perf.time(crop ? 'paper swatch paint' : 'paper sheet paint', () => paintHere(job));
      keep(store, key, src, max);
      show(src);
      return;
    }
    let p = coming.get(key);
    if (!p) {
      p = paintOff(job).then((src) => {
        coming.delete(key);
        keep(store, key, src, max);
        return src;
      });
      coming.set(key, p);
    }
    p.then((src) => {
      if (wanted.current !== key) return;
      show(src);
      perf.samples.push({ name: crop ? 'paper swatch ready' : 'paper sheet ready', ms: performance.now() - asked });
    });
  }, [sheetOf, pxPerMm, region.x, region.y, region.w, region.h, cssW, cssH, fade, crop, guide, sheet, bleed, near, plan]);

  // marks stamped after the letter was written: a layer over the writing, multiplied into it
  useLayoutEffect(() => {
    const c = overRef.current;
    if (!c || !over.length || !overBox || cssW <= 0) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const k = pxPerMm * dpr;
    const w = Math.round(overBox.w * k), h = Math.round(overBox.h * k);
    // a size that moved by less than a pixel keeps what's painted
    const key = `${plan!.key}|${Math.round(w / 2)}x${Math.round(h / 2)}`;
    if (c.dataset.key === key) return;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.translate(-overBox.x * k, -overBox.y * k);
    perf.time('paper marks paint', () => printMarks(ctx, over, k, 'over', sheetOf));
    c.dataset.key = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, pxPerMm, overBox, cssW]);

  // the size follows the painted paper (set in show); before any paper arrives, the canvas holds the sheet's place
  return (
    <>
      <canvas ref={ref} aria-hidden className={cn('block', className)} style={{ maxWidth: 'none' }} />
      {over.length > 0 && (
        <canvas
          ref={overRef}
          aria-hidden
          className="pointer-events-none absolute block"
          style={{ left: overBox!.x * pxPerMm, top: overBox!.y * pxPerMm, width: overBox!.w * pxPerMm, height: overBox!.h * pxPerMm, zIndex: 1, mixBlendMode: 'multiply' }}
        />
      )}
    </>
  );
});

/** A copy of the canvas as it is now, laid over it and fading away, clipped to the new sheet. */
function ghost(c: HTMLCanvasElement, newW: number, newH: number) {
  const g = document.createElement('canvas');
  g.width = c.width;
  g.height = c.height;
  g.getContext('2d')?.drawImage(c, 0, 0);
  g.className = c.className;
  g.style.cssText = c.style.cssText;
  g.style.pointerEvents = 'none';
  // the old sheet may be bigger: it never shows past the new one
  const left = -(parseFloat(c.style.left) || 0), top = -(parseFloat(c.style.top) || 0);
  const oldW = parseFloat(c.style.width) || newW, oldH = parseFloat(c.style.height) || newH;
  g.style.clipPath = `inset(${top}px ${Math.max(0, oldW - left - newW)}px ${Math.max(0, oldH - top - newH)}px ${left}px)`;
  g.setAttribute('aria-hidden', 'true');
  c.after(g);
  g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' }).onfinish = () => g.remove();
}

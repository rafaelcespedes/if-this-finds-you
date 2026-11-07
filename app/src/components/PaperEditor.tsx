// Typing directly on the paper (docs/research/editor-ux.md §3). A real, invisible textarea holds the
// text, the selection, undo, IME and screen-reader access; this component draws the caret and the
// selection onto the handwriting and turns pointer input on the sheet into text positions.
//
// - The caret: a bar in the ink colour is where you are. With the pen's state given (penCaughtUp, insertsAbove), a
//   bead of ink at its foot is the pen, there once the pen has caught up with you; it lifts off the line while the
//   pen hovers over a fix; and where typing would go above the line, a small amber ‸ sits under it instead. Every
//   change is instant: the only motion is the blink. Away from the letter, an ink dot rests at its end.
// - Selection is a warm amber highlighter (a UI colour, never ink), swept in on pointer selections.
// - Pen-only formatting: ⌘U underlines by hand (again for double), ⌘B presses harder (on a selection: goes over it;
//   with none: for what's typed next), ⌘I leans in, ⌘↩ P.S.; ⌥⌘1 Title, ⌥⌘2 Heading, ⌥⌘0 Body, ⇧⌘7 bullets,
//   ⇧⌘9 numbers, ⇧⌘L checklist, ⇧⌘U tick the item, ⇧⌘E highlight
// - Up/Down/Home/End follow the written lines; IME compositions own the keys while they last.
// - The writing app (/write, `pencil`): the pen writes in ink, and every mark that only shows what will happen is an
//   editor's red pencil, a UI colour no ink uses: an upright hairline caret, the ‸ where words will go above the line,
//   a tick while you're pressing Backspace when the next press will cross out (the page says when: `marks`), a bar under
//   one letter that will be written over, a dashed line where a strike will go, the selection's wash, the touch
//   handles and the loupe. The pen's own state is ink: a nib where the
//   ink is up to while the pen is behind you. Without it (the home page's desk) everything is as it was.
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { across, type CaretPos, type Geometry, type Side } from '@/lib/geometry';
import type { Edit } from '@/lib/edits';
import { wordAt } from '@/lib/doc';
import { historyKey, isComposingKey, isMac, useEditInput, type Composition } from '@/hooks/useEditInput';
import { keepInView } from '@/hooks/useVisualViewport';
import { cn } from '@/lib/utils';

export type FormatCommand = 'underline' | 'press' | 'ps'
  // what's typed next: leaning in (⌘I), pressed harder (⌘B with no selection)
  | 'lean' | 'weight'
  // the line at the caret: ⌥⌘1, ⌥⌘2, ⌥⌘0; lists: ⇧⌘7, ⇧⌘9, ⇧⌘L; tick the item at the caret: ⇧⌘U; the highlighter: ⇧⌘E
  | 'title' | 'heading' | 'body' | 'bullets' | 'numbers' | 'checklist' | 'check' | 'highlight';
/** shortcuts with a modifier besides ⌘ (by physical key: ⌥ and ⇧ change e.key) */
const FORMAT_KEYS: Record<string, FormatCommand> = {
  'alt+Digit1': 'title', 'alt+Digit2': 'heading', 'alt+Digit0': 'body',
  'shift+Digit7': 'bullets', 'shift+Digit9': 'numbers', 'shift+KeyL': 'checklist', 'shift+KeyU': 'check', 'shift+KeyE': 'highlight',
};
/** commands about the caret's line: the caret is passed as it is, never widened to its word (the others, with no
 *  selection, get the word at the caret, as ⌘B and ⌘I always have: the page asks the selection for what's typed next) */
const AT_CARET = new Set<FormatCommand>(['title', 'heading', 'body', 'bullets', 'numbers', 'checklist', 'check']);

export interface PaperEditorApi {
  focus: () => void;
  blur: () => void;
  /** the current selection (or the caret) in the live text */
  selection: () => [number, number];
  setSelection: (from: number, to?: number) => void;
  /** start writing at a point on the page (client px): the nearest line and letter, the end when outside the lines */
  placeAt: (clientX: number, clientY: number) => void;
  /** the caret's line on the page (CSS px from the letter's top left): where a margin note goes, beside it; null without one */
  caretRect: () => { left: number; top: number; height: number } | null;
  /** which side of its offset the caret is on ('before': put before a crossed-out word by an arrow key, or a line's end) */
  side: () => Side;
}

interface Props {
  /** the logical text (also what screen readers read) */
  text: string;
  /** every change, as one Edit (see lib/edits.ts) */
  onEdit: (e: Edit) => void;
  /** where writing starts on an empty sheet (the first line's start): the caret waits there before the first key */
  start?: CaretPos | null;
  /** undo and redo, the page's own (the browser's are cancelled) */
  onHistory?: (dir: 'undo' | 'redo') => void;
  /** pen-only formatting on a range (or the word at the caret) */
  onFormat: (cmd: FormatCommand, from: number, to: number) => void;
  writerName: string;
  /** where the written text sits (from the worker's boxes, or the engine's own geometry) */
  geometry: Geometry | null;
  /** CSS px per mm, sheet size in mm, gap between sheets in px */
  pxPerMm: number;
  sheetW: number;
  sheetH: number;
  gapPx: number;
  ink: string;
  /** pen width and x-height in font units, for the ink-dot caret */
  penWidthU: number;
  xHeightU: number;
  onEditingChange?: (editing: boolean) => void;
  /** an IME is composing: the app holds page writes and link updates until it commits */
  onComposingChange?: (composing: boolean) => void;
  /** Ink mode: the writer is considering a fix at the pen head; the pen hovers instead of resting */
  hovering?: boolean;
  /**
   * Ink mode: the drawn pen has caught up (nothing typed is left for it to write). Given, the caret shows the pen: a
   * bead of ink at the bar's foot when the caret is at the end of the writing and the pen rests there, lifted off the
   * line while it hovers over a fix; while the pen is still behind you, the bar stays solid (it blinks once it rests).
   */
  penCaughtUp?: boolean;
  /** Ink mode: typing at this offset would go above the line (InkSession.insertsAbove): a small amber ‸ under the line */
  insertsAbove?: (at: number) => boolean;
  /** how the page takes changes (In ink, In pencil, Fair copy): the textarea's description says which, for screen readers */
  mode?: 'ink' | 'pencil' | 'fair';
  /** someone is about to write (the pointer comes over the letter, a finger lands on it): get ready */
  onIntent?: () => void;
  /** the page shows a letter that isn't in the text (a found letter before the reply's first key): the text
   *  is empty, so an IME composes into an empty field, and the caret rests at the end of what's shown */
  blank?: boolean;
  /** the writing app's marks (/write): the red pencil, and what it needs to know about the page. Absent: the home page's look */
  pencil?: Pencil;
  children: ReactNode;
}

/** the caret's size where it sits (1: the line's; an insertion above the line about 0.6), where the ink before it ends,
 *  and the lowest ink of the lines above it, over it (font units, sheet-local) */
export interface PencilFit { scale: number; inkRight?: number; ceil?: number }
/** a strike to come, on one line: from x0 to x1 (font units, sheet-local), the baseline at each end */
export interface PencilSpan { sheet: number; x0: number; x1: number; y0: number; y1: number }
/** What the red pencil needs to know (Desk, CleanDesk). Every part is optional: what's missing isn't shown. */
export interface Pencil {
  /** what's typed next: pressed harder (⌘B), leaning (⌘I) */
  typing?: { weight: number; lean: number };
  /** at a caret: Backspace crosses out (the letter before is ink, or a crossed-out word is there); typing goes above the line */
  marks?: (at: number) => { strike: boolean; above: boolean };
  /** the letter at offset i is on the paper (one such letter selected is written over) */
  inked?: (i: number) => boolean;
  /** the caret's size where it sits, and the ink before it */
  fit?: (c: CaretPos) => PencilFit;
  /** where the drawn pen is (sheet-local font units, on the baseline), asked every frame while it's behind you */
  nib?: () => { sheet: number; x: number; y: number } | null;
  /** where strikes will go: the letters the pen hovers over, before the ink lands */
  strikes?: PencilSpan[];
}

interface Sel {
  start: number;
  end: number;
  dir: 'forward' | 'backward' | 'none';
  focused: boolean;
}

const AMBER = '#f3d27a';
/** the touch handles' amber (a UI colour, never ink): the ‸ where typing would go above the line */
const CARET_AMBER = '#d9a520';
/** the editor's red pencil (/write; write.css sets it, lighter on the dark desk) */
const PENCIL = 'var(--wr-pencil, #c4402a)';
/** ⌘I: the caret leans this much */
const LEAN_TAN = Math.tan((16 * Math.PI) / 180);
/** the loupe: its radius (px) and how much larger the line shows in it */
const LOUPE_R = 46;
const LOUPE_ZOOM = 1.7;
/** the red pencil's hairline: about 1.6 px at a desktop's writing size, a little finer or bolder with the size, never the pen's weight */
const hairFor = (xhPx: number) => Math.max(1.25, Math.min(2.2, 0.1 * xhPx));
/** a ribbon's baseline: its top and bottom edges are the line's frame `asc` above and `desc` below it */
function ribbonBase(points: [number, number][], asc: number, desc: number): [number, number][] {
  const n = points.length >> 1, t = asc / Math.max(1, asc + desc);
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[points.length - 1 - i];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** the writing mode, said to screen readers (the same words as the writing menu's hints) */
const MODE_SAID: Record<NonNullable<Props['mode']>, string> = {
  ink: 'In ink: what’s written stays. Deleting written words crosses them out, and crossed-out words aren’t in the text. Undo lifts only ink still wet. ',
  pencil: 'In pencil: changes rub out and are written again. ',
  fair: 'Fair copy: every change redraws the page cleanly. ',
};

export const PaperEditor = forwardRef<PaperEditorApi, Props>(function PaperEditor(
  { text, onEdit, onHistory, start, onFormat, writerName, geometry: geo, pxPerMm, sheetW, sheetH, gapPx, ink, penWidthU, xHeightU, onEditingChange, onComposingChange, hovering, penCaughtUp, insertsAbove, mode = 'fair', blank, onIntent, pencil, children },
  apiRef,
) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const goalX = useRef<number | null>(null);
  const [sel, setSel] = useState<Sel>({ start: text.length, end: text.length, dir: 'none', focused: false });
  const [composition, setComposition] = useState<Composition | null>(null);
  // where a wrapped line's end and the next line's start share an offset, which one the caret is on: the line's
  // end after End or ⌘→ (until the caret moves), the next line's start otherwise
  const [side, setSide] = useState<Side>('after');
  const sideAt = useRef<number | null>(null);
  const onComposition = useCallback((c: Composition | null) => {
    setComposition(c);
    onComposingChange?.(c != null);
  }, [onComposingChange]);
  // an edit made with the caret put before a crossed-out word (an arrow key: Ink mode, geometry.step) says so
  const sideRef = useRef<Side>('after');
  sideRef.current = side;
  const onEditSided = useCallback((e: Edit) => {
    const at = sideAt.current;
    onEdit(at != null && sideRef.current === 'before' && (e.at === at || e.at + e.del === at) ? { ...e, side: 'before' } : e);
  }, [onEdit]);
  const input = useEditInput(ta, text, onEditSided, 'paper', onComposition, onHistory);
  const descId = useId();
  // the shortcuts' key by its name on this keyboard (Command on Apple's, Ctrl elsewhere), as the keys themselves follow isMac
  const modKey = isMac() ? 'Command' : 'Ctrl';
  // indices in the live text <-> indices in the text the page was written from
  const toMap = useCallback((i: number) => (geo ? (blank ? geo.text.length : across(i, text, geo.text)) : i), [geo, text, blank]);
  const fromMap = useCallback((i: number) => (geo ? across(i, geo.text, text) : i), [geo, text]);
  // a line's end: past keys the page hasn't drawn yet (End lands after the last letter typed, not one short)
  const fromMapEnd = (i: number) => (geo ? across(i, geo.text, text, 'right') : i);
  const u = geo ? geo.unitsPerMm : 1;
  const k = pxPerMm / u; // CSS px per font unit
  const pitch = sheetH * pxPerMm + gapPx; // CSS px from one sheet's top to the next

  const sync = useCallback(() => {
    const el = ta.current;
    if (!el) return;
    const focused = document.activeElement === el;
    if (sideAt.current != null && (el.selectionStart !== sideAt.current || el.selectionEnd !== sideAt.current)) {
      sideAt.current = null;
      setSide('after');
    }
    setSel((s) =>
      s.start === el.selectionStart && s.end === el.selectionEnd && s.focused === focused && s.dir === el.selectionDirection
        ? s
        : { start: el.selectionStart, end: el.selectionEnd, dir: el.selectionDirection as Sel['dir'], focused },
    );
  }, []);

  // rest the caret at the end of the note, where you'd carry on writing
  useLayoutEffect(() => {
    const el = ta.current;
    if (el && document.activeElement !== el) el.setSelectionRange(el.value.length, el.value.length);
    sync();
  }, [sync]);

  useEffect(() => {
    document.addEventListener('selectionchange', sync);
    return () => document.removeEventListener('selectionchange', sync);
  }, [sync]);
  useEffect(() => onEditingChange?.(sel.focused), [sel.focused, onEditingChange]);

  const focusAt = useCallback((index: number | null, extend = false, anchorAt?: number) => {
    const el = ta.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (index != null) {
      if (extend) {
        const anchor = anchorAt ?? (el.selectionDirection === 'backward' ? el.selectionEnd : el.selectionStart);
        el.setSelectionRange(Math.min(anchor, index), Math.max(anchor, index), index < anchor ? 'backward' : 'forward');
      } else el.setSelectionRange(index, index);
    }
    sync();
  }, [sync]);

  // a caret placed by the app after an edit it made (P.S.), once React has written the new value
  const pendingCaret = useRef<number | null>(null);
  // where the caret's line is (for the page: a margin note beside it), as last drawn
  const caretRectRef = useRef<{ left: number; top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    if (pendingCaret.current == null || !ta.current) return;
    const at = Math.min(pendingCaret.current, ta.current.value.length);
    pendingCaret.current = null;
    focusAt(at);
  }, [text, focusAt]);

  useImperativeHandle(apiRef, () => ({
    focus: () => focusAt(null),
    blur: () => { ta.current?.blur(); sync(); },
    selection: () => (ta.current ? [ta.current.selectionStart, ta.current.selectionEnd] : [text.length, text.length]),
    setSelection: (from, to) => focusAt(to ?? from, to != null, from),
    placeAt: (x, y) => placeAt.current(x, y),
    caretRect: () => caretRectRef.current,
    side: () => (sideAt.current != null ? sideRef.current : 'after'),
  }), [focusAt, sync, text.length]);
  const placeAt = useRef<(x: number, y: number) => void>(() => {});

  // ---------- pointer ----------
  const pointToIndex = (clientX: number, clientY: number) => {
    if (!geo || !wrap.current) return text.length;
    const r = wrap.current.getBoundingClientRect();
    const lx = clientX - r.left;
    const ly = clientY - r.top;
    const sheet = Math.max(0, Math.min(geo.sheets - 1, Math.floor(ly / pitch)));
    return fromMap(geo.hit(sheet, lx / k, (ly - sheet * pitch) / k));
  };
  const drag = useRef<{ anchor: number; id: number } | null>(null);
  const lastDown = useRef<{ t: number; x: number; y: number; count: number; type: string }>({ t: 0, x: 0, y: 0, count: 0, type: '' });
  const [sweep, setSweep] = useState(0); // bumps when a pointer selection finishes, to sweep the highlighter in
  const [pointerSel, setPointerSel] = useState(false);

  // touch: a long press or a double tap picks the word under the finger (done on the finger's lift, which iOS counts
  // as a tap, so the keyboard may open), then two handles move either end; a plain tap still places the caret
  const press = useRef<{ id: number; x: number; y: number; timer: number; armed: boolean } | null>(null);
  const skipClick = useRef(false);
  const [touchSel, setTouchSel] = useState(false);
  // (the red pencil, on a touch screen) a long press that then moves drags the caret, the line shown larger in a
  // loupe above the finger, as iOS does; the loupe also shows while a handle is dragged. `loupe`: the finger's x on
  // the letter (px), while one of those drags lasts
  const caretDrag = useRef<number | null>(null);
  const [loupe, setLoupe] = useState<number | null>(null);
  const fingerX = (clientX: number) => clientX - (wrap.current?.getBoundingClientRect().left ?? 0);
  const selectWordAt = (clientX: number, clientY: number) => {
    const idx = pointToIndex(clientX, clientY);
    const [a, b] = wordAt(text, idx);
    if (b <= a) { focusAt(idx); return; }
    focusAt(b, true, a);
    setPointerSel(true);
    setTouchSel(true);
    setSweep((n) => n + 1);
  };

  // mouse and pen: press to place, drag to select, double-click a word, triple-click a line.
  // Touch keeps tap-to-place in onClick, because iOS only opens the keyboard from a tap.
  const onPointerDown = (e: React.PointerEvent) => {
    onIntent?.();
    // count clicks ourselves: pointer events don't reliably carry a click count (a finger lands less exactly)
    const ld = lastDown.current;
    const near = e.timeStamp - ld.t < 450 && Math.hypot(e.clientX - ld.x, e.clientY - ld.y) < (e.pointerType === 'touch' ? 24 : 5);
    lastDown.current = { t: e.timeStamp, x: e.clientX, y: e.clientY, count: near ? ld.count + 1 : 1, type: e.pointerType };
    if (e.pointerType === 'touch') {
      // a new touch: whatever click a handle's drag or a long press was waiting to swallow never came
      skipClick.current = false;
      if (press.current) window.clearTimeout(press.current.timer);
      const p = { id: e.pointerId, x: e.clientX, y: e.clientY, timer: 0, armed: false };
      p.timer = window.setTimeout(() => { p.armed = true; navigator.vibrate?.(8); }, 450);
      press.current = p;
      return;
    }
    if (e.button !== 0) return;
    setTouchSel(false);
    e.preventDefault(); // keep focus in the textarea, no native text selection
    goalX.current = null;
    const idx = pointToIndex(e.clientX, e.clientY);
    const clicks = lastDown.current.count;
    if (clicks === 2) {
      const [a, b] = wordAt(text, idx);
      focusAt(b, true, a);
      setPointerSel(b > a);
      setSweep((n) => n + 1);
      return;
    }
    if (clicks >= 3) {
      const edges = geo ? geo.edges(toMap(idx)) : { start: 0, end: text.length };
      focusAt(fromMap(edges.end), true, fromMap(edges.start));
      setPointerSel(true);
      setSweep((n) => n + 1);
      return;
    }
    const el = ta.current;
    const anchor = e.shiftKey && el ? (el.selectionDirection === 'backward' ? el.selectionEnd : el.selectionStart) : idx;
    focusAt(idx, e.shiftKey, anchor);
    setPointerSel(false);
    drag.current = { anchor, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    // a finger that moves is scrolling (or dragging the page), not pressing
    const p = press.current;
    const moved = p && p.id === e.pointerId ? Math.hypot(e.clientX - p.x, e.clientY - p.y) : 0;
    if (p && pencil && p.armed && moved > 4) {
      // the long press, then a drag: the caret follows the finger (the touchmove that would scroll is held, below)
      window.clearTimeout(p.timer);
      press.current = null;
      caretDrag.current = e.pointerId;
      skipClick.current = true;
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* (a pointer that's gone) */ }
      setPointerSel(false);
      setTouchSel(false);
    } else if (p && moved > 8) { window.clearTimeout(p.timer); press.current = null; }
    if (caretDrag.current != null && caretDrag.current === e.pointerId) {
      goalX.current = null;
      focusAt(pointToIndex(e.clientX, e.clientY));
      setLoupe(fingerX(e.clientX));
      return;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    focusAt(pointToIndex(e.clientX, e.clientY), true, d.anchor);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (caretDrag.current != null && caretDrag.current === e.pointerId) {
      caretDrag.current = null;
      setLoupe(null);
      return;
    }
    const p = press.current;
    if (p && p.id === e.pointerId) {
      window.clearTimeout(p.timer);
      press.current = null;
      if (p.armed && e.type === 'pointerup') {
        // the long press: the word under the finger (the click that follows would only place the caret)
        skipClick.current = true;
        selectWordAt(e.clientX, e.clientY);
        return;
      }
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const el = ta.current;
    if (el && el.selectionEnd > el.selectionStart) {
      setPointerSel(true);
      setSweep((n) => n + 1);
    }
  };
  const onClick = (e: React.MouseEvent) => {
    // touch taps only (pointer events above handle mouse and pen); keyboard "clicks" have detail 0
    if (lastDown.current.type !== 'touch' && e.detail !== 0) return;
    if (skipClick.current) { skipClick.current = false; return; }
    goalX.current = null;
    // a double tap: the word
    if (lastDown.current.type === 'touch' && lastDown.current.count === 2) { selectWordAt(e.clientX, e.clientY); return; }
    setPointerSel(false);
    setTouchSel(false);
    focusAt(pointToIndex(e.clientX, e.clientY));
  };

  placeAt.current = (x, y) => { onIntent?.(); goalX.current = null; setPointerSel(false); setTouchSel(false); focusAt(pointToIndex(x, y)); };

  // the handles at a touch selection's ends: drag either one; the text line is just above the finger (the red
  // pencil's handles sit lower, in the gap under the line: `dy` is how far above the finger the line's middle is)
  const handleDrag = useRef<{ id: number; other: number; dy: number } | null>(null);
  const onHandleDown = (which: 'start' | 'end', dy = 24) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* (a pointer that's gone) */ }
    handleDrag.current = { id: e.pointerId, other: which === 'start' ? sel.end : sel.start, dy };
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const h = handleDrag.current;
    if (!h || h.id !== e.pointerId) return;
    e.stopPropagation();
    const idx = pointToIndex(e.clientX, e.clientY - h.dy);
    if (idx !== h.other) focusAt(idx, true, h.other);
    if (pencil) setLoupe(fingerX(e.clientX));
  };
  const onHandleUp = (e: React.PointerEvent) => {
    if (handleDrag.current?.id !== e.pointerId) return;
    e.stopPropagation();
    handleDrag.current = null;
    setLoupe(null);
    setPointerSel(true);
    // the click the lift makes would only place the caret where the finger left off
    skipClick.current = true;
  };

  // ---------- keys ----------
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // an IME owns the keys while it composes: arrows walk its candidates, Escape cancels it
    if (isComposingKey(e)) return;
    // Enter is never cancelled (on iOS that leaves the keyboard stuck in lowercase), except ⌘↩
    const el = e.currentTarget;
    setPointerSel(false);
    setTouchSel(false);
    if (e.key === 'Escape') {
      // writing stops, but focus stays on the letter, so Tab carries on from here (not from the page's top)
      el.blur();
      wrap.current?.focus({ preventScroll: true });
      sync();
      return;
    }
    const hist = onHistory ? historyKey(e) : null;
    if (hist) {
      e.preventDefault();
      onHistory!(hist);
      return;
    }
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    const fk = mod && (e.altKey !== e.shiftKey) ? FORMAT_KEYS[(e.altKey ? 'alt+' : 'shift+') + e.code] : undefined;
    if (fk) {
      e.preventDefault();
      format(fk);
      return;
    }
    if (mod && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 'u' || key === 'i' || key === 'b') {
        e.preventDefault();
        format(key === 'b' ? (el.selectionStart === el.selectionEnd ? 'weight' : 'press') : key === 'i' ? 'lean' : 'underline');
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        format('ps');
        return;
      }
    }
    if (!geo) return;
    const head = el.selectionDirection === 'backward' ? el.selectionStart : el.selectionEnd;
    const lineKey = e.key === 'Home' || e.key === 'End' || (isMac() && e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'));
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const v = geo.vertical(toMap(head), e.key === 'ArrowUp' ? -1 : 1, goalX.current, side);
      goalX.current = v.goalX;
      focusAt(fromMap(v.o), e.shiftKey);
      return;
    }
    goalX.current = null;
    // Left/Right across a crossed-out word (Ink mode): a stop on each side of it, though it has one offset
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey && el.selectionStart === el.selectionEnd && geo.step) {
      const st = geo.step(toMap(head), e.key === 'ArrowLeft' ? -1 : 1, sideAt.current === head ? side : 'after');
      if (st) {
        e.preventDefault();
        const to = fromMap(st.o);
        focusAt(to);
        sideAt.current = st.side === 'before' ? to : null;
        setSide(st.side);
        return;
      }
    }
    if (lineKey && !e.altKey) {
      e.preventDefault();
      const edges = geo.edges(toMap(head), side);
      const toEnd = e.key === 'End' || e.key === 'ArrowRight';
      const to = toEnd ? fromMapEnd(edges.end) : fromMap(edges.start);
      // the end of this line, not the start of the next (the same offset where the line wraps)
      sideAt.current = toEnd && !e.shiftKey ? to : null;
      setSide(toEnd && !e.shiftKey ? 'before' : 'after');
      focusAt(to, e.shiftKey);
    }
  };

  const format = (cmd: FormatCommand) => {
    const el = ta.current;
    if (!el) return;
    if (cmd === 'ps') {
      const t = el.value.replace(/\s+$/, '');
      const ins = (t.length ? '\n\n' : '') + 'P.S. ';
      onEdit({ at: t.length, del: el.value.length - t.length, ins, kind: 'type', t: Date.now(), source: 'paper' });
      pendingCaret.current = t.length + ins.length;
      return;
    }
    let [a, b] = [el.selectionStart, el.selectionEnd];
    if (a === b && !AT_CARET.has(cmd)) [a, b] = wordAt(el.value, a);
    onFormat(cmd, a, b);
  };

  // ---------- caret & selection geometry ----------
  const head = sel.dir === 'backward' ? sel.start : sel.end;
  // nothing written yet: the caret waits where the first letter will go (launch QA: a blank sheet showed none)
  const caret = useMemo(() => (geo ? geo.caret(toMap(head), side) ?? (!text && start ? start : null) : null), [geo, head, toMap, side, text, start]);
  const asc = geo ? geo.ascU : 740, desc = geo ? geo.descU : 200;
  // a found letter on the page (blank: the first key starts a reply on a fresh sheet): the caret isn't anywhere in
  // it, so the textarea waits at the sheet's top and nothing scrolls the letter to its end
  const caretPx = caret && !blank ? { left: caret.x * k, top: caret.sheet * pitch + (caret.y - asc) * k } : { left: 0, top: 0 };
  const caretH = (asc + desc) * k;
  caretRectRef.current = caret && !blank ? { left: caretPx.left, top: caretPx.top, height: caretH } : null;
  const atEnd = /^\s*$/.test(text.slice(head));

  // highlighter ribbons: one shape per written line, following (and leaning with) that line
  const runs = useMemo(() => {
    if (!geo || sel.start === sel.end) return [];
    return geo.ribbons(toMap(sel.start), toMap(sel.end)).map((rb) =>
      rb.points.map(([x, y]) => `${(x * k).toFixed(1)},${(rb.sheet * pitch + y * k).toFixed(1)}`).join(' '),
    );
  }, [geo, sel.start, sel.end, toMap, k, pitch]);

  // the red pencil's selection: the same ribbons, each with its baseline (px) for the line under it
  const xhL = xHeightU * k; // the writer's x-height at this size, px
  const bands = useMemo(() => {
    if (!pencil || !geo || sel.start === sel.end) return [];
    return geo.ribbons(toMap(sel.start), toMap(sel.end)).map((rb) => {
      const px = (q: [number, number]): [number, number] => [q[0] * k, rb.sheet * pitch + q[1] * k];
      return { pts: rb.points.map((q) => px(q).map((v) => v.toFixed(1)).join(',')).join(' '), base: ribbonBase(rb.points, asc, desc).map(px) };
    });
  }, [pencil, geo, sel.start, sel.end, toMap, k, pitch, asc, desc]);
  // exactly one letter of ink selected: the next letter is written over it (a bar under it, not a wash)
  const overwrite = !!pencil && bands.length === 1 && sel.end - sel.start === 1 && /\S/.test(text[sel.start] ?? '') && !!pencil.inked?.(sel.start);
  // the red pencil's handles sit in the gap under the line: this far below the baseline (px)
  const linePx = geo ? geo.lineMm * pxPerMm : 4 * xhL;
  const knobDrop = Math.max(0.9 * xhL, (linePx - 0.4 * xhL) / 2);

  // a touch selection's handles: just under each end's baseline
  const handles = useMemo(() => {
    if (!touchSel || !sel.focused || sel.start === sel.end || !geo) return null;
    const at = (o: number, side: Side) => {
      const c = geo.caret(toMap(o), side);
      return c ? { x: c.x * k, y: c.sheet * pitch + (c.y + desc * 0.6) * k, base: c.sheet * pitch + c.y * k } : null;
    };
    const start = at(sel.start, 'after'), end = at(sel.end, 'before');
    return start && end ? { start, end } : null;
  }, [touchSel, sel, geo, toMap, k, pitch, desc]);

  // the selection chip: what a pen can do with a pointer selection (the red pencil's: under the selection's last
  // line, clear of its handles, never over the line above)
  const chip = useMemo(() => {
    if (!pointerSel || !sel.focused || sel.start === sel.end || !geo) return null;
    if (pencil) {
      const last = bands[bands.length - 1];
      if (!last) return null;
      const under = Math.max(...last.base.map((q) => q[1])) + 0.36 * xhL;
      return { left: Math.min(...last.base.map((q) => q[0])), top: under + (touchSel ? knobDrop + 10 : 10) };
    }
    const first = geo.ribbons(toMap(sel.start), toMap(sel.end))[0];
    if (!first) return null;
    const minX = Math.min(...first.points.map((q) => q[0])), minY = Math.min(...first.points.map((q) => q[1]));
    return { left: minX * k, top: first.sheet * pitch + minY * k - 40 };
  }, [pointerSel, sel, geo, toMap, k, pitch, pencil, bands, xhL, touchSel, knobDrop]);

  // the chip's width, once shown (the red pencil keeps it on the paper)
  const chipEl = useRef<HTMLDivElement>(null);
  const [chipW, setChipW] = useState(200);
  useLayoutEffect(() => { if (pencil && chip && chipEl.current && chipEl.current.offsetWidth !== chipW) setChipW(chipEl.current.offsetWidth); });

  // the hidden textarea is one written line tall and runs to the line's end, so screen readers can find it
  const lineH = Math.max(18, geo ? geo.lineMm * pxPerMm : caretH);
  const lineW = Math.max(40, sheetW * pxPerMm - caretPx.left - 8);
  const preedit = composition && composition.text && geo ? geo.caret(toMap(composition.from)) : null;

  // keep the caret's line above the on-screen keyboard (and on screen at all) while writing
  useEffect(() => {
    if (!sel.focused || !wrap.current || !caret || blank) return;
    const r = wrap.current.getBoundingClientRect();
    keepInView(r.top + caretPx.top, r.top + caretPx.top + caretH, lineH);
    // only when the caret moves to another line, not on every render
  }, [sel.focused, Math.round(caretPx.top)]);

  // the caret stays solid for a moment after each move, then blinks
  const [moveKey, setMoveKey] = useState(0);
  useLayoutEffect(() => setMoveKey((n) => n + 1), [caretPx.left, caretPx.top]);

  const dot = Math.max(3, penWidthU * k * 1.6);

  // ---------- the red pencil (/write) ----------
  const collapsed = sel.start === sel.end;
  // what Backspace and typing would do here, and the caret's size and the ink before it (asked once per caret move)
  const pMarks = useMemo(() => (pencil?.marks && collapsed ? pencil.marks(head) : null), [pencil?.marks, collapsed, head]);
  const pFit = useMemo(() => (pencil?.fit && caret ? pencil.fit(caret) : null), [pencil?.fit, caret]);
  const hair = hairFor(xhL);
  // the nib: the drawn pen's head, in ink, while the pen is behind you (a frame loop that only moves one dot)
  const nibEl = useRef<SVGCircleElement>(null);
  const nibFn = useRef(pencil?.nib);
  nibFn.current = pencil?.nib;
  const nibOn = !!pencil?.nib && sel.focused && penCaughtUp === false && !blank;
  useEffect(() => {
    if (!nibOn) return;
    let raf = 0;
    const step = () => {
      const el = nibEl.current, n = nibFn.current?.();
      if (el) {
        if (n) {
          el.setAttribute('cx', (n.x * k).toFixed(1));
          el.setAttribute('cy', (n.sheet * pitch + n.y * k - 0.05 * xhL).toFixed(1));
          el.removeAttribute('visibility');
        } else el.setAttribute('visibility', 'hidden');
      }
      raf = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(raf);
  }, [nibOn, k, pitch, xhL]);
  // a caret or handle being dragged on a touch screen: the page doesn't scroll under the finger
  useEffect(() => {
    const el = wrap.current;
    if (!el || !pencil) return;
    const hold = (e: TouchEvent) => { if (caretDrag.current != null || handleDrag.current) e.preventDefault(); };
    el.addEventListener('touchmove', hold, { passive: false });
    return () => el.removeEventListener('touchmove', hold);
  }, [!!pencil]);
  // the loupe's picture: the sheet under the caret, copied once as the drag starts (its paper is a canvas: drawn across)
  const loupeHost = useRef<HTMLDivElement>(null);
  const loupeSheet = loupe != null && caret ? caret.sheet : -1;
  useLayoutEffect(() => {
    const host = loupeHost.current;
    if (!host || loupeSheet < 0 || !wrap.current) return;
    const sheetEl = wrap.current.querySelectorAll('[data-sheet-ink]')[loupeSheet]?.parentElement;
    if (!sheetEl) return;
    const copy = sheetEl.cloneNode(true) as HTMLElement;
    const from = sheetEl.querySelectorAll('canvas'), to = copy.querySelectorAll('canvas');
    to.forEach((c, i) => { try { c.getContext('2d')?.drawImage(from[i], 0, 0); } catch { /* (an empty canvas) */ } });
    copy.removeAttribute('aria-label');
    copy.removeAttribute('role');
    Object.assign(copy.style, { position: 'absolute', left: '0px', top: `${loupeSheet * pitch}px`, boxShadow: 'none' });
    host.replaceChildren(copy);
    return () => host.replaceChildren();
  }, [loupeSheet, pitch]);

  return (
    <div
      ref={wrap}
      data-paper
      role="group"
      aria-label="Letter"
      tabIndex={-1}
      // no long-press callout over the paper (the press picks a word instead); never user-select: none here, which
      // stops iOS typing into the textarea inside
      className="relative mx-auto cursor-text touch-manipulation [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-ring"
      style={{ width: sheetW * pxPerMm }}
      onPointerDown={onPointerDown}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') onIntent?.(); }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // after a touch, the browser's own mouse press would focus the letter's frame (it can be focused, for Esc)
      // and take the focus from the text a long press just selected
      onMouseDown={(e) => { if (lastDown.current.type === 'touch') e.preventDefault(); }}
      // a long press picks a word: no browser menu over the paper (Android's image menu)
      onContextMenu={(e) => { if (lastDown.current.type === 'touch') e.preventDefault(); }}
      onClick={onClick}
    >
      {children}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {pencil && bands.length > 0 && (overwrite
          // one letter of ink selected: a bar under it (the next letter is written over it)
          ? (
            <svg className="absolute inset-0 overflow-visible" width="100%" height="100%" style={{ color: PENCIL, opacity: sel.focused ? 1 : 0.4 }} data-pencil="over">
              <polyline points={bands[0].base.map(([x, y]) => `${x.toFixed(1)},${(y + 0.28 * xhL).toFixed(1)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )
          // a light red wash: readable on every paper, the yellow pad too (no line under it, which read as ⌘U's
          // underline: Rafael, 7 Nov)
          : (
            <svg
              key={sweep}
              className={cn('absolute inset-0 overflow-visible mix-blend-multiply', sweep > 0 && pointerSel && 'highlighter-sweep')}
              width="100%"
              height="100%"
              style={{ color: PENCIL, opacity: sel.focused ? 1 : 0.4 }}
              data-pencil="select"
            >
              <g opacity={0.13}>
                {bands.map((b, i) => <polygon key={i} points={b.pts} fill="currentColor" stroke="currentColor" strokeWidth={5} strokeLinejoin="round" />)}
              </g>
            </svg>
          ))}
        {!pencil && runs.length > 0 && (
          <svg
            key={sweep}
            className={cn('absolute inset-0 overflow-visible mix-blend-multiply', sweep > 0 && pointerSel && 'highlighter-sweep')}
            width="100%"
            height="100%"
            style={{ opacity: sel.focused ? 1 : 0.4 }}
          >
            {/* fill and the rounding stroke at full strength, faded together: no darker rim where they overlap */}
            <g opacity={0.42}>
              {runs.map((pts, i) => (
                <polygon key={i} points={pts} fill={AMBER} stroke={AMBER} strokeWidth={5} strokeLinejoin="round" />
              ))}
            </g>
          </svg>
        )}
        {preedit && composition && (
          <span
            className="absolute rounded-[3px] bg-[color-mix(in_oklab,var(--paper)_88%,transparent)] px-0.5 whitespace-pre underline decoration-dotted decoration-[1.5px] underline-offset-[3px]"
            style={{
              left: preedit.x * k,
              top: preedit.sheet * pitch + (preedit.y - asc * 0.62) * k,
              fontSize: Math.max(15, asc * 0.62 * k),
              lineHeight: 1,
              color: `color-mix(in oklab, ${ink} 78%, transparent)`,
            }}
          >
            {composition.text}
          </span>
        )}
        {caret && sel.start === sel.end && !composition && !(blank && sel.focused) && (() => {
          // the caret leans with the writing when the engine knows the lean (its top point)
          const bx = caret.x * k, by = caret.sheet * pitch + caret.y * k;
          const lean = caret.top ? (caret.top[0] - caret.x) / Math.max(1, caret.y - caret.top[1]) : 0;
          const hx = xHeightU * k;
          if (atEnd && !sel.focused) {
            // the pen at rest: an ink dot on the baseline, a hairline up to the x-height
            return (
              <svg key="rest" className="absolute inset-0 overflow-visible" width="100%" height="100%" style={{ opacity: 0.18 }}>
                <line x1={bx + dot * 0.6} y1={by} x2={bx + dot * 0.6 + lean * hx} y2={by - hx} stroke={ink} strokeOpacity={0.3} strokeWidth={1} />
                <circle cx={bx + dot * 0.6} cy={by} r={dot / 2} fill={ink} />
              </svg>
            );
          }
          if (pencil) {
            // the red pencil: a hairline, upright (never slanted with the hand, never the pen's weight), from a third
            // of an x-height under the baseline to the tall letters' tops; at the end of the writing, half a letter on
            // from the last one, where the next goes. In an insertion above the line, at the insertion's size
            const s = pFit?.scale ?? 1;
            const xh = xhL * s;
            const cx = atEnd && pFit?.inkRight != null ? Math.max(bx, pFit.inkRight * k + 0.45 * xh) : bx;
            const top = by - 1.85 * xh, bottom = by + 0.32 * xh;
            const typing = pencil.typing;
            // ⌘B pressed harder: a heavier caret; ⌘I leaning: it leans. A badge says which
            const w = typing?.weight ? hair * 2.125 : hair;
            const tilt = typing?.lean ? LEAN_TAN : 0;
            const xAt = (y: number) => cx + tilt * (bottom - y);
            if (!sel.focused) {
              return (
                <svg key="away" className="absolute inset-0 overflow-visible" width="100%" height="100%" style={{ color: PENCIL, opacity: 0.3 }} data-caret="away">
                  <line x1={cx} y1={bottom} x2={xAt(top)} y2={top} stroke="currentColor" strokeWidth={hair} strokeLinecap="round" />
                </svg>
              );
            }
            // typing here goes above the line: a ‸ in the line, and a dashed caret up where the words will be written
            // (an insertion already under way, drawn above, carries the caret itself: nothing more then)
            const above = !hovering && s >= 0.85 && !!pMarks?.above;
            // Backspace here crosses out (the letter before is ink): a short tick reaching back over the word
            const strike = !above && !!pMarks?.strike;
            const badges = [typing?.weight ? 'B' : null, typing?.lean ? 'I' : null].filter(Boolean) as string[];
            const yTick = by - 0.5 * xh;
            // above the line: the bar stands on the baseline, and the ‸ hangs under it, 2 px clear (the two never
            // fuse into a ⅄); the dashed caret up where the words will be written stops 2 px short of the ink of the
            // line above (its descenders too), and goes when there's no room for it
            const barBottom = above ? by : bottom;
            const wedgeW = Math.max(1.6, hair);
            const apex = barBottom + w / 2 + 2 + wedgeW / 2;
            const ghostBase = by - 1.9 * xhL, gx = 0.62 * xhL;
            const ghostBottom = ghostBase + 0.32 * gx;
            const ceilPx = pFit?.ceil != null && caret ? caret.sheet * pitch + pFit.ceil * k : -Infinity;
            const ghostTop = Math.max(ghostBase - 1.85 * gx, ceilPx + 2 + hair / 2);
            return (
              <>
                {/* solid while you type (each move starts it again), blinking once you stop: write.css */}
                <svg key={moveKey} className="caret-blink absolute inset-0 overflow-visible" width="100%" height="100%" style={{ color: PENCIL }} data-caret={strike ? 'strike' : above ? 'above' : 'pencil'}>
                  <line x1={xAt(barBottom)} y1={barBottom} x2={xAt(top)} y2={top} stroke="currentColor" strokeWidth={w} strokeLinecap="round" />
                  {strike && <line x1={xAt(yTick) - 0.85 * xh} y1={yTick} x2={xAt(yTick)} y2={yTick} stroke="currentColor" strokeWidth={hair} strokeLinecap="round" />}
                </svg>
                {(above || badges.length > 0) && (
                  <svg className="absolute inset-0 overflow-visible" width="100%" height="100%" style={{ color: PENCIL }}>
                    {above && (
                      <>
                        <polyline points={`${(cx - 0.42 * xhL).toFixed(1)},${(apex + 0.48 * xhL).toFixed(1)} ${cx.toFixed(1)},${apex.toFixed(1)} ${(cx + 0.42 * xhL).toFixed(1)},${(apex + 0.48 * xhL).toFixed(1)}`} fill="none" stroke="currentColor" strokeWidth={wedgeW} strokeLinecap="round" strokeLinejoin="round" data-pencil="wedge" />
                        {ghostBottom - ghostTop >= 4 && (
                          <line x1={cx} y1={ghostBottom} x2={cx} y2={ghostTop} stroke="currentColor" strokeWidth={hair} strokeLinecap="round" strokeDasharray="2 3" opacity={0.9} data-pencil="ghost" />
                        )}
                      </>
                    )}
                    {badges.map((b, i) => {
                      const x = xAt(top) + 5 + i * 22, y = top - 0.1 * xh - 15;
                      return (
                        <g key={b} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} data-pencil={'mode-' + b}>
                          <rect width={19} height={19} rx={4.5} fill="currentColor" />
                          <text x={9.5} y={14} textAnchor="middle" fontFamily="-apple-system, BlinkMacSystemFont, system-ui, sans-serif" fontSize={13.5} fontWeight={b === 'B' ? 800 : 500} fontStyle={b === 'I' ? 'italic' : 'normal'} fill="#fff">{b}</text>
                        </g>
                      );
                    })}
                  </svg>
                )}
              </>
            );
          }
          // writing: the bar, in the pen's ink, from just under the baseline to the letters' tops (you). With the pen's
          // state given, the bead at its foot is the pen: there once it has caught up, lifted while it hovers over a fix.
          // Every change is instant; only the bar blinks (solid for a moment after each move, and while the pen is behind)
          const nib = penCaughtUp !== undefined;
          const top = by - asc * k * 1.05, bottom = by + desc * k * 0.6;
          const w = Math.max(2.25, Math.min(3.5, dot * 0.7));
          // at the end of the writing, a small gap after the last letter (where the next one goes)
          const cx = bx + (atEnd ? Math.max(3, dot) : 0);
          const above = !hovering && !atEnd && !!insertsAbove?.(head);
          const blink = sel.focused && !hovering && (!nib || !atEnd || !!penCaughtUp);
          const bead = nib && sel.focused && atEnd && (hovering || penCaughtUp);
          const r = Math.max(1.5, dot * 0.5);
          return (
            <>
              <svg key={sel.focused ? moveKey : 'rest'} className={cn('absolute inset-0 overflow-visible', blink && 'caret-blink')} width="100%" height="100%" style={{ opacity: sel.focused ? (hovering ? 0.55 : 1) : 0.18 }}>
                <line x1={cx - lean * (bottom - by)} y1={bottom} x2={cx + lean * (by - top)} y2={top} stroke={ink} strokeOpacity={0.92} strokeWidth={w} strokeLinecap="round" />
              </svg>
              {(bead || (above && sel.focused)) && (
                <svg className="absolute inset-0 overflow-visible" width="100%" height="100%" data-nib={bead ? (hovering ? 'lifted' : 'bead') : 'above'}>
                  {bead && (hovering
                    ? <circle cx={cx + lean * 0.3 * hx} cy={by - 0.3 * hx} r={r} fill={ink} fillOpacity={0.7} />
                    // (faint: at full strength, a resting bead reads as a full stop)
                    : <circle cx={cx} cy={by} r={r} fill={ink} fillOpacity={0.35} />)}
                  {above && (
                    <polyline points={`${cx - 3},${by + 5.5} ${cx},${by + 1.5} ${cx + 3},${by + 5.5}`} fill="none" stroke={CARET_AMBER} strokeOpacity={0.75} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
                  )}
                </svg>
              )}
            </>
          );
        })()}
        {nibOn && (
          // the pen's head, where the ink is up to: ink, not pencil (it is the pen), half strength so it never reads as a dot
          <svg className="absolute inset-0 overflow-visible" width="100%" height="100%" data-nib="pen">
            <circle ref={nibEl} r={(0.13 * xhL).toFixed(2)} fill={ink} fillOpacity={0.55} visibility="hidden" />
          </svg>
        )}
        {pencil?.strikes && pencil.strikes.length > 0 && (
          // Backspace pressed on ink: where the strike will go, before the pen draws it (the letters stay as they are)
          <svg className="absolute inset-0 overflow-visible" width="100%" height="100%" style={{ color: PENCIL }} data-pencil="strike">
            {pencil.strikes.map((sp, i) => {
              const top = sp.sheet * pitch;
              return <line key={i} x1={sp.x0 * k - 3} y1={top + sp.y0 * k - 0.48 * xhL} x2={sp.x1 * k + 3} y2={top + sp.y1 * k - 0.55 * xhL} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeDasharray="5 4" opacity={0.85} />;
            })}
          </svg>
        )}
      </div>
      {chip && loupe == null && (
        <div
          ref={chipEl}
          className={cn('selection-chip absolute z-10 flex h-8 items-center gap-0.5 rounded-md bg-panel px-1 text-[0.7812rem] shadow-[0_1px_2px_rgba(60,45,20,0.1),0_8px_24px_-10px_rgba(60,45,20,0.35)]', pencil && 'w-max whitespace-nowrap')}
          // (the red pencil's: kept on the paper, never wrapped onto two lines near its right edge)
          style={{ left: pencil ? Math.max(0, Math.min(chip.left - 6, sheetW * pxPerMm - chipW)) : Math.max(0, chip.left - 6), top: Math.max(-36, chip.top) }}
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
        >
          <ChipButton onClick={() => format('underline')}>Underline</ChipButton>
          <ChipButton onClick={() => format('press')}>Press harder</ChipButton>
          <ChipButton onClick={() => { void navigator.clipboard?.writeText(text.slice(sel.start, sel.end)); setPointerSel(false); }}>Copy</ChipButton>
        </div>
      )}
      {pencil && handles && (
        // the red pencil's handles: a thin red line at each end of the selection, its knob in the gap under the line
        // (never over the next line's letters); the finger takes it by a 44 px target around the knob
        <>
          <svg aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-visible" width="100%" height="100%" style={{ color: PENCIL }} data-pencil="handles">
            {(['start', 'end'] as const).map((which) => {
              const c = handles[which];
              return (
                <g key={which}>
                  <line x1={c.x} y1={c.base - 1.85 * xhL} x2={c.x} y2={c.base + knobDrop} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
                  <circle cx={c.x} cy={c.base + knobDrop} r={4.5} fill="currentColor" />
                </g>
              );
            })}
          </svg>
          {(['start', 'end'] as const).map((which) => {
            const c = handles[which];
            return (
              <div
                key={which}
                aria-hidden
                className="absolute z-10 size-11 -translate-x-1/2 -translate-y-1/2 touch-none"
                style={{ left: c.x, top: c.base + knobDrop }}
                onPointerDown={onHandleDown(which, knobDrop + 0.7 * xhL)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
                onClick={(e) => e.stopPropagation()}
              />
            );
          })}
        </>
      )}
      {pencil && loupe != null && caret && (() => {
        // the loupe: the line under the finger, larger, above it (below it when there's no room above: the top of the
        // screen, where the status bar and the toolbar are). It follows the finger; inside it, the caret (or the end
        // being dragged) is in the middle, so it shows what the finger hides even past a line's end
        // (a handle: the end it moves, on its own side of a wrap, as the handle is drawn)
        const end = handleDrag.current && handles ? (sel.dir === 'backward' ? handles.start : handles.end) : null;
        const by = end ? end.base : caret.sheet * pitch + caret.y * k;
        const sheetPx = sheetW * pxPerMm;
        const hx = end ? end.x : caret.x * k;
        const fx = hx, fy = by - 0.75 * xhL;
        const cx = Math.max(LOUPE_R + 2, Math.min(sheetPx - LOUPE_R - 2, loupe));
        const wrapTop = wrap.current?.getBoundingClientRect().top ?? 0;
        let cy = by - 1.9 * xhL - 12 - LOUPE_R;
        if (wrapTop + cy - LOUPE_R < 56) cy = by + knobDrop + 18 + LOUPE_R;
        return (
          <div aria-hidden data-loupe className="wr-loupe pointer-events-none absolute z-20" style={{ left: cx - LOUPE_R, top: cy - LOUPE_R, width: LOUPE_R * 2, height: LOUPE_R * 2 }}>
            <div className="absolute top-0 left-0 origin-top-left" style={{ width: sheetPx, transform: `translate(${LOUPE_R}px, ${LOUPE_R}px) scale(${LOUPE_ZOOM}) translate(${-fx}px, ${-fy}px)` }}>
              <div ref={loupeHost} />
              <svg className="absolute top-0 left-0 overflow-visible" width={sheetPx} height={1} style={{ color: PENCIL }}>
                {collapsed
                  ? <line x1={hx} y1={by + 0.32 * xhL} x2={hx} y2={by - 1.85 * xhL} stroke="currentColor" strokeWidth={hair / LOUPE_ZOOM * 1.2} strokeLinecap="round" />
                  : bands.map((b, i) => <polygon key={i} points={b.pts} fill="currentColor" fillOpacity={0.13} />)}
              </svg>
            </div>
          </div>
        );
      })()}
      {!pencil && handles && (['start', 'end'] as const).map((which) => {
        const c = handles[which];
        return (
          <div
            key={which}
            aria-hidden
            className="absolute z-10 flex size-11 -translate-x-1/2 touch-none justify-center"
            style={{ left: c.x, top: c.y }}
            onPointerDown={onHandleDown(which)}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mt-0.5 block size-4 rounded-full shadow-[0_1px_2px_rgba(60,45,20,0.3)]" style={{ background: CARET_AMBER }} />
          </div>
        );
      })}
      <textarea
        ref={ta}
        value={text}
        {...input}
        onChange={(e) => { input.onChange(e); sync(); }}
        onSelect={sync}
        onKeyDown={onKeyDown}
        onKeyUp={sync}
        onFocus={sync}
        onBlur={sync}
        aria-label={`Letter in ${writerName}’s hand`}
        aria-describedby={descId}
        spellCheck
        autoCorrect="on"
        autoCapitalize="sentences"
        autoComplete="off"
        enterKeyHint="enter"
        {...{ writingsuggestions: 'false', 'data-gramm': 'false', 'data-gramm_editor': 'false', 'data-enable-grammarly': 'false' }}
        className="pointer-events-none absolute m-0 resize-none overflow-hidden border-0 p-0 text-[1rem] leading-none whitespace-pre opacity-0 outline-none"
        style={{ left: caretPx.left, top: caretPx.top, width: lineW, height: lineH, caretColor: 'transparent' }}
      />
      <span id={descId} hidden>
        {blank ? 'Typing starts your reply, on a fresh sheet. ' : ''}
        {MODE_SAID[mode]}
        {`${modKey} U underlines, ${modKey} B presses harder, ${modKey} Return adds a P.S.`}
        {geo?.summary ? ` This draft has ${geo.summary}.` : ''}
      </span>
    </div>
  );
});

function ChipButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-6 rounded-[5px] px-2 text-foreground transition-colors duration-150 hover-device:hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
    >
      {children}
    </button>
  );
}

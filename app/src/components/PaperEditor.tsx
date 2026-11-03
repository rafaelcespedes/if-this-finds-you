// Typing directly on the paper (docs/research/editor-ux.md §3). A real, invisible textarea holds the
// text, the selection, undo, IME and screen-reader access; this component draws the caret and the
// selection onto the handwriting and turns pointer input on the sheet into text positions.
//
// - The caret is the pen: an ink dot at the end of the letter, a fine line mid-text.
// - Selection is a warm amber highlighter (a UI colour, never ink), swept in on pointer selections.
// - Pen-only formatting: ⌘U/⌘I underline by hand (again for double), ⌘B press harder, ⌘↩ P.S.
// - Up/Down/Home/End follow the written lines; IME compositions own the keys while they last.
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { across, type Geometry } from '@/lib/geometry';
import type { Edit } from '@/lib/edits';
import { wordAt } from '@/lib/doc';
import { isComposingKey, isMac, useEditInput, type Composition } from '@/hooks/useEditInput';
import { keepInView } from '@/hooks/useVisualViewport';
import { cn } from '@/lib/utils';

export type FormatCommand = 'underline' | 'press' | 'ps';

export interface PaperEditorApi {
  focus: () => void;
  blur: () => void;
  /** the current selection (or the caret) in the live text */
  selection: () => [number, number];
  setSelection: (from: number, to?: number) => void;
}

interface Props {
  /** the logical text (also what screen readers read) */
  text: string;
  /** every change, as one Edit (see lib/edits.ts) */
  onEdit: (e: Edit) => void;
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
  /** the page shows a letter that isn't in the text (a found letter before the reply's first key): the text
   *  is empty, so an IME composes into an empty field, and the caret rests at the end of what's shown */
  blank?: boolean;
  children: ReactNode;
}

interface Sel {
  start: number;
  end: number;
  dir: 'forward' | 'backward' | 'none';
  focused: boolean;
}

const AMBER = '#f3d27a';

export const PaperEditor = forwardRef<PaperEditorApi, Props>(function PaperEditor(
  { text, onEdit, onFormat, writerName, geometry: geo, pxPerMm, sheetW, sheetH, gapPx, ink, penWidthU, xHeightU, onEditingChange, onComposingChange, hovering, blank, children },
  apiRef,
) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const goalX = useRef<number | null>(null);
  const [sel, setSel] = useState<Sel>({ start: text.length, end: text.length, dir: 'none', focused: false });
  const [composition, setComposition] = useState<Composition | null>(null);
  const onComposition = useCallback((c: Composition | null) => {
    setComposition(c);
    onComposingChange?.(c != null);
  }, [onComposingChange]);
  const input = useEditInput(ta, text, onEdit, 'paper', onComposition);
  const descId = useId();
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
  }), [focusAt, sync, text.length]);

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

  // mouse and pen: press to place, drag to select, double-click a word, triple-click a line.
  // Touch keeps tap-to-place in onClick, because iOS only opens the keyboard from a tap.
  const onPointerDown = (e: React.PointerEvent) => {
    // count clicks ourselves: pointer events don't reliably carry a click count
    const ld = lastDown.current;
    const near = e.timeStamp - ld.t < 450 && Math.hypot(e.clientX - ld.x, e.clientY - ld.y) < 5;
    lastDown.current = { t: e.timeStamp, x: e.clientX, y: e.clientY, count: near ? ld.count + 1 : 1, type: e.pointerType };
    if (e.pointerType === 'touch' || e.button !== 0) return;
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
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    focusAt(pointToIndex(e.clientX, e.clientY), true, d.anchor);
  };
  const onPointerUp = (e: React.PointerEvent) => {
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
    goalX.current = null;
    setPointerSel(false);
    focusAt(pointToIndex(e.clientX, e.clientY));
  };

  // ---------- keys ----------
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // an IME owns the keys while it composes: arrows walk its candidates, Escape cancels it
    if (isComposingKey(e)) return;
    // Enter is never cancelled (on iOS that leaves the keyboard stuck in lowercase), except ⌘↩
    const el = e.currentTarget;
    setPointerSel(false);
    if (e.key === 'Escape') {
      // writing stops, but focus stays on the letter, so Tab carries on from here (not from the page's top)
      el.blur();
      wrap.current?.focus({ preventScroll: true });
      sync();
      return;
    }
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    if (mod && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === 'u' || key === 'i' || key === 'b') {
        e.preventDefault();
        format(key === 'b' ? 'press' : 'underline');
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
      const v = geo.vertical(toMap(head), e.key === 'ArrowUp' ? -1 : 1, goalX.current);
      goalX.current = v.goalX;
      focusAt(fromMap(v.o), e.shiftKey);
      return;
    }
    goalX.current = null;
    if (lineKey && !e.altKey) {
      e.preventDefault();
      const edges = geo.edges(toMap(head));
      const toEnd = e.key === 'End' || e.key === 'ArrowRight';
      focusAt(toEnd ? fromMapEnd(edges.end) : fromMap(edges.start), e.shiftKey);
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
    if (a === b) [a, b] = wordAt(el.value, a);
    onFormat(cmd, a, b);
  };

  // ---------- caret & selection geometry ----------
  const head = sel.dir === 'backward' ? sel.start : sel.end;
  const caret = useMemo(() => (geo ? geo.caret(toMap(head)) : null), [geo, head, toMap]);
  const asc = geo ? geo.ascU : 740, desc = geo ? geo.descU : 200;
  const caretPx = caret ? { left: caret.x * k, top: caret.sheet * pitch + (caret.y - asc) * k } : { left: 0, top: 0 };
  const caretH = (asc + desc) * k;
  const atEnd = /^\s*$/.test(text.slice(head));

  // highlighter ribbons: one shape per written line, following (and leaning with) that line
  const runs = useMemo(() => {
    if (!geo || sel.start === sel.end) return [];
    return geo.ribbons(toMap(sel.start), toMap(sel.end)).map((rb) =>
      rb.points.map(([x, y]) => `${(x * k).toFixed(1)},${(rb.sheet * pitch + y * k).toFixed(1)}`).join(' '),
    );
  }, [geo, sel.start, sel.end, toMap, k, pitch]);

  // the selection chip: what a pen can do with a pointer selection
  const chip = useMemo(() => {
    if (!pointerSel || !sel.focused || sel.start === sel.end || !geo) return null;
    const first = geo.ribbons(toMap(sel.start), toMap(sel.end))[0];
    if (!first) return null;
    const minX = Math.min(...first.points.map((q) => q[0])), minY = Math.min(...first.points.map((q) => q[1]));
    return { left: minX * k, top: first.sheet * pitch + minY * k - 40 };
  }, [pointerSel, sel, geo, toMap, k, pitch]);

  // the hidden textarea is one written line tall and runs to the line's end, so screen readers can find it
  const lineH = Math.max(18, geo ? geo.lineMm * pxPerMm : caretH);
  const lineW = Math.max(40, sheetW * pxPerMm - caretPx.left - 8);
  const preedit = composition && composition.text && geo ? geo.caret(toMap(composition.from)) : null;

  // keep the caret's line above the on-screen keyboard (and on screen at all) while writing
  useEffect(() => {
    if (!sel.focused || !wrap.current || !caret) return;
    const r = wrap.current.getBoundingClientRect();
    keepInView(r.top + caretPx.top, r.top + caretPx.top + caretH, lineH);
    // only when the caret moves to another line, not on every render
  }, [sel.focused, Math.round(caretPx.top)]);

  // the caret stays solid for a moment after each move, then breathes
  const [moveKey, setMoveKey] = useState(0);
  useLayoutEffect(() => setMoveKey((n) => n + 1), [caretPx.left, caretPx.top]);

  const dot = Math.max(3, penWidthU * k * 1.6);

  return (
    <div
      ref={wrap}
      data-paper
      role="group"
      aria-label="Letter"
      tabIndex={-1}
      className="relative mx-auto cursor-text touch-manipulation focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-ring"
      style={{ width: sheetW * pxPerMm }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onClick}
    >
      {children}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {runs.length > 0 && (
          <svg
            key={sweep}
            className={cn('absolute inset-0 overflow-visible mix-blend-multiply', sweep > 0 && pointerSel && 'highlighter-sweep')}
            width="100%"
            height="100%"
            style={{ opacity: sel.focused ? 1 : 0.4 }}
          >
            {runs.map((pts, i) => (
              <polygon key={i} points={pts} fill={AMBER} fillOpacity={0.42} stroke={AMBER} strokeOpacity={0.42} strokeWidth={5} strokeLinejoin="round" />
            ))}
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
        {caret && sel.start === sel.end && !composition && (() => {
          // the caret leans with the writing when the engine knows the lean (its top point)
          const bx = caret.x * k, by = caret.sheet * pitch + caret.y * k;
          const lean = caret.top ? (caret.top[0] - caret.x) / Math.max(1, caret.y - caret.top[1]) : 0;
          const opacity = sel.focused ? 0.85 : 0.18;
          const key = sel.focused ? moveKey : 'rest';
          if (atEnd) {
            // the pen at rest: an ink dot on the baseline, a hairline up to the x-height
            const hx = xHeightU * k;
            return (
              <svg key={key} className={cn('absolute inset-0 overflow-visible', sel.focused && (hovering ? 'pen-hover' : 'caret-breathe'))} width="100%" height="100%" style={{ opacity }}>
                <line x1={bx + dot * 0.6} y1={by} x2={bx + dot * 0.6 + lean * hx} y2={by - hx} stroke={ink} strokeOpacity={0.3} strokeWidth={1} />
                <circle cx={bx + dot * 0.6} cy={by} r={dot / 2} fill={ink} />
              </svg>
            );
          }
          const top = by - asc * k, bottom = by + desc * k;
          return (
            <svg key={key} className={cn('absolute inset-0 overflow-visible', sel.focused && 'caret-breathe')} width="100%" height="100%" style={{ opacity }}>
              <line x1={bx - lean * desc * k} y1={bottom} x2={bx + lean * asc * k} y2={top} stroke={ink} strokeWidth={1.5} strokeLinecap="round" />
            </svg>
          );
        })()}
      </div>
      {chip && (
        <div
          className="selection-chip absolute z-10 flex h-8 items-center gap-0.5 rounded-md bg-panel px-1 text-[12.5px] shadow-[0_1px_2px_rgba(60,45,20,0.1),0_8px_24px_-10px_rgba(60,45,20,0.35)]"
          style={{ left: Math.max(0, chip.left - 6), top: Math.max(-36, chip.top) }}
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
        >
          <ChipButton onClick={() => format('underline')}>Underline</ChipButton>
          <ChipButton onClick={() => format('press')}>Press harder</ChipButton>
          <ChipButton onClick={() => { void navigator.clipboard?.writeText(text.slice(sel.start, sel.end)); setPointerSel(false); }}>Copy</ChipButton>
        </div>
      )}
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
        className="pointer-events-none absolute m-0 resize-none overflow-hidden border-0 p-0 text-[16px] leading-none whitespace-pre opacity-0 outline-none"
        style={{ left: caretPx.left, top: caretPx.top, width: lineW, height: lineH, caretColor: 'transparent' }}
      />
      <span id={descId} hidden>
        {blank ? 'Typing starts your reply, on a fresh sheet. ' : ''}Fair copy: the page is rewritten cleanly as you type. Command U underlines, Command B presses harder, Command Return adds a P.S.
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

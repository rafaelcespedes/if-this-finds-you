// Typing directly on the paper (docs/research/editor-ux.md §3). A real, invisible textarea holds the
// text, the selection, undo, IME and screen-reader access; this component draws the caret and the
// selection onto the handwriting and turns pointer input on the sheet into text positions.
//
// - The caret is the pen: an ink dot at the end of the letter, a fine line mid-text.
// - Selection is a warm amber highlighter (a UI colour, never ink), swept in on pointer selections.
// - Pen-only formatting: ⌘U/⌘I underline by hand (again for double), ⌘B press harder, ⌘↩ P.S.
// - Up/Down/Home/End follow the written lines; IME compositions own the keys while they last.
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildMap, caretAt, indexOnLine, lineAtY, lineEdges, translateIndex, type Box, type TextMap } from '@/lib/caret';
import type { WriteResult } from '@/lib/write-protocol';
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
  result: WriteResult | null;
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
  { text, onEdit, onFormat, writerName, result, pxPerMm, sheetW, sheetH, gapPx, ink, penWidthU, xHeightU, onEditingChange, onComposingChange, children },
  apiRef,
) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const goalX = useRef<number | null>(null);
  const [sel, setSel] = useState<Sel>({ start: text.length, end: text.length, dir: 'none', focused: false });
  const map = useMemo<TextMap | null>(() => (result ? buildMap(result) : null), [result]);
  const [composition, setComposition] = useState<Composition | null>(null);
  const onComposition = useCallback((c: Composition | null) => {
    setComposition(c);
    onComposingChange?.(c != null);
  }, [onComposingChange]);
  const input = useEditInput(ta, text, onEdit, 'paper', onComposition);
  const descId = useId();
  // indices in the live text <-> indices in the text the page was written from
  const toMap = useCallback((i: number) => (map ? translateIndex(i, text, map.res.text) : i), [map, text]);
  const fromMap = useCallback((i: number) => (map ? translateIndex(i, map.res.text, text) : i), [map, text]);
  const u = result ? result.unitsPerMm : 1;
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
    if (!map || !wrap.current) return text.length;
    const r = wrap.current.getBoundingClientRect();
    const lx = clientX - r.left;
    const ly = clientY - r.top;
    const sheet = Math.max(0, Math.min(map.res.svgs.length - 1, Math.floor(ly / pitch)));
    const yU = (ly - sheet * pitch) / k;
    const line = lineAtY(map, sheet, yU);
    return fromMap(indexOnLine(map, line, lx / k));
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
      const line = map ? caretAt(map, toMap(idx)).line : 0;
      const edges = map ? lineEdges(map, line) : { start: 0, end: text.length };
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
      el.blur();
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
    if (!map) return;
    const head = el.selectionDirection === 'backward' ? el.selectionStart : el.selectionEnd;
    const c = caretAt(map, toMap(head));
    const lineKey = e.key === 'Home' || e.key === 'End' || (isMac() && e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'));
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      if (goalX.current == null) goalX.current = c.x;
      const target = c.line + (e.key === 'ArrowUp' ? -1 : 1);
      const idx = target < 0 ? 0 : fromMap(indexOnLine(map, target, goalX.current));
      focusAt(idx, e.shiftKey);
      return;
    }
    goalX.current = null;
    if (lineKey && !e.altKey) {
      e.preventDefault();
      const edges = lineEdges(map, c.line);
      const toEnd = e.key === 'End' || e.key === 'ArrowRight';
      focusAt(fromMap(toEnd ? edges.end : edges.start), e.shiftKey);
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
  const caret = useMemo(() => (map ? caretAt(map, toMap(head)) : null), [map, head, toMap]);
  const emU = result ? result.emMm * u : 1000;
  const asc = 0.74 * emU, desc = 0.2 * emU;
  const caretPx = caret ? { left: caret.x * k, top: caret.sheet * pitch + (caret.y - asc) * k } : { left: 0, top: 0 };
  const caretH = (asc + desc) * k;
  const atEnd = /^\s*$/.test(text.slice(head));

  // highlighter runs: one shape per written line, following that line's own baseline
  const runs = useMemo(() => {
    if (!map || sel.start === sel.end) return [];
    const a = toMap(sel.start), b = toMap(sel.end);
    const byLine = new Map<string, Box[]>();
    for (const box of map.boxes) {
      if (box.i < a || box.i >= b) continue;
      const key = box.sheet + ':' + box.line;
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key)!.push(box);
    }
    return [...byLine.values()].map((boxes) => {
      const top = boxes.map((bx) => [bx.x, bx.y - asc * 0.92] as const);
      const end = boxes[boxes.length - 1];
      top.push([end.x + end.adv, end.y - asc * 0.92]);
      const bottom = [...boxes].reverse().map((bx) => [bx.x, bx.y + desc * 0.9] as const);
      bottom.unshift([end.x + end.adv, end.y + desc * 0.9]);
      const sheet = boxes[0].sheet;
      const pts = [...top, ...bottom].map(([x, y]) => `${(x * k).toFixed(1)},${(sheet * pitch + y * k).toFixed(1)}`);
      return pts.join(' ');
    });
  }, [map, sel.start, sel.end, toMap, k, pitch, asc, desc]);

  // the selection chip: what a pen can do with a pointer selection
  const chip = useMemo(() => {
    if (!pointerSel || !sel.focused || sel.start === sel.end || !map) return null;
    const a = toMap(sel.start);
    const first = map.boxes.find((bx) => bx.i >= a);
    if (!first) return null;
    return { left: first.x * k, top: first.sheet * pitch + (first.y - asc) * k - 40 };
  }, [pointerSel, sel, map, toMap, k, pitch, asc]);

  // the hidden textarea is one written line tall and runs to the line's end, so screen readers can find it
  const lineH = Math.max(18, result ? result.lineMm * pxPerMm : caretH);
  const lineW = Math.max(40, sheetW * pxPerMm - caretPx.left - 8);
  const preedit = composition && composition.text && map ? caretAt(map, toMap(composition.from)) : null;

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
      role="group"
      aria-label="Letter"
      className="sheet-stack relative mx-auto cursor-text touch-manipulation"
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
        {caret && sel.start === sel.end && !composition && (atEnd ? (
          // the pen at rest: an ink dot on the baseline, a hairline up to the x-height
          <div key={sel.focused ? moveKey : 'rest'} className={cn('absolute', sel.focused && 'caret-breathe')} style={{ left: caretPx.left + dot * 0.6, top: caret.sheet * pitch + caret.y * k, opacity: sel.focused ? 0.85 : 0.18 }}>
            <span className="absolute w-px" style={{ left: -0.5, bottom: 0, height: xHeightU * k, background: ink, opacity: 0.3 }} />
            <span className="absolute rounded-full" style={{ width: dot, height: dot, left: -dot / 2, top: -dot / 2, background: ink }} />
          </div>
        ) : (
          <div
            key={sel.focused ? moveKey : 'rest'}
            className={cn('absolute rounded-full', sel.focused && 'caret-breathe')}
            style={{ left: caretPx.left - 0.75, top: caretPx.top, width: 1.5, height: caretH, background: ink, opacity: sel.focused ? 0.85 : 0.18 }}
          />
        ))}
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
        Fair copy: the page is rewritten cleanly as you type. Command U underlines, Command B presses harder, Command Return adds a P.S.
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

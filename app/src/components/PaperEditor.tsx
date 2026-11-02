// Typing directly on the paper. A real (invisible) textarea holds the text, the selection, undo,
// IME and screen-reader access; this component draws the caret and selection onto the handwriting
// and turns clicks on the sheet into caret positions. Up/Down/Home/End follow the written lines.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildMap, caretAt, indexOnLine, lineAtY, lineEdges, translateIndex, type TextMap } from '@/lib/caret';
import type { WriteResult } from '@/lib/write-protocol';
import type { Edit } from '@/lib/edits';
import { useEditInput } from '@/hooks/useEditInput';
import { cn } from '@/lib/utils';

interface Props {
  /** the logical text (also what screen readers read) */
  text: string;
  /** every change, as one Edit (see lib/edits.ts) */
  onEdit: (e: Edit) => void;
  writerName: string;
  result: WriteResult | null;
  /** CSS px per mm, sheet size in mm, gap between sheets in px */
  pxPerMm: number;
  sheetW: number;
  sheetH: number;
  gapPx: number;
  ink: string;
  onEditingChange?: (editing: boolean) => void;
  children: ReactNode;
}

interface Sel {
  start: number;
  end: number;
  dir: 'forward' | 'backward' | 'none';
  focused: boolean;
}

export function PaperEditor({ text, onEdit, writerName, result, pxPerMm, sheetW, sheetH, gapPx, ink, onEditingChange, children }: Props) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const goalX = useRef<number | null>(null);
  const [sel, setSel] = useState<Sel>({ start: text.length, end: text.length, dir: 'none', focused: false });
  const map = useMemo<TextMap | null>(() => (result ? buildMap(result) : null), [result]);
  const input = useEditInput(ta, text, onEdit, 'paper');
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

  const focusAt = useCallback((index: number | null, extend = false) => {
    const el = ta.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (index != null) {
      if (extend) {
        const anchor = el.selectionDirection === 'backward' ? el.selectionEnd : el.selectionStart;
        el.setSelectionRange(Math.min(anchor, index), Math.max(anchor, index), index < anchor ? 'backward' : 'forward');
      } else el.setSelectionRange(index, index);
    }
    sync();
  }, [sync]);

  // ---------- pointer: click to place the caret, shift-click to extend ----------
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

  const onMouseDown = (e: React.MouseEvent) => {
    // keep focus in the textarea while clicking around the sheet
    if (e.button === 0 && sel.focused) e.preventDefault();
  };
  const onClick = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    goalX.current = null;
    focusAt(pointToIndex(e.clientX, e.clientY), e.shiftKey);
  };

  // ---------- keys that should follow the handwriting, not the hidden textarea ----------
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if (e.key === 'Escape') {
      el.blur();
      sync();
      return;
    }
    if (!map) return;
    const head = el.selectionDirection === 'backward' ? el.selectionStart : el.selectionEnd;
    const c = caretAt(map, toMap(head));
    const mac = /Mac|iPhone|iPad/.test(navigator.platform);
    const lineKey = e.key === 'Home' || e.key === 'End' || (mac && e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'));
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

  // ---------- caret & selection geometry ----------
  const caret = useMemo(() => (map ? caretAt(map, toMap(sel.dir === 'backward' ? sel.start : sel.end)) : null), [map, sel, toMap]);
  const emU = result ? result.emMm * u : 1000;
  const asc = 0.74 * emU, desc = 0.2 * emU;

  const rects = useMemo(() => {
    if (!map || sel.start === sel.end) return [];
    const out: { sheet: number; x: number; y: number; w: number }[] = [];
    const a = toMap(sel.start), b2 = toMap(sel.end);
    const inSel = map.boxes.filter((b) => b.i >= a && b.i < b2);
    inSel.forEach((b, j) => {
      const next = inSel[j + 1];
      const w = next && next.line === b.line ? next.x - b.x : b.adv;
      out.push({ sheet: b.sheet, x: b.x, y: b.y, w });
    });
    return out;
  }, [map, sel.start, sel.end, toMap]);

  // keep the hidden textarea at the caret, so mobile keyboards and IME popups appear in the right place
  const caretPx = caret ? { left: caret.x * k, top: caret.sheet * pitch + (caret.y - asc) * k } : { left: 0, top: 0 };
  const caretH = (asc + desc) * k;

  // restart the blink whenever the caret moves, so it stays solid while typing
  const [blinkKey, setBlinkKey] = useState(0);
  useLayoutEffect(() => setBlinkKey((n) => n + 1), [caretPx.left, caretPx.top]);

  return (
    <div ref={wrap} className="sheet-stack relative mx-auto cursor-text" style={{ width: sheetW * pxPerMm }} onMouseDown={onMouseDown} onClick={onClick}>
      {children}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {rects.map((r, i) => (
          <div
            key={i}
            className="absolute rounded-[2px]"
            style={{
              left: r.x * k,
              top: r.sheet * pitch + (r.y - asc) * k,
              width: Math.max(2, r.w * k),
              height: caretH,
              background: `color-mix(in oklab, ${ink} ${sel.focused ? 16 : 9}%, transparent)`,
            }}
          />
        ))}
        {result && text.length === 0 && (
          <div
            className="absolute text-faint italic"
            style={{
              left: result.leftU * k + 4,
              top: result.firstMm * pxPerMm - Math.max(13, result.emMm * pxPerMm * 0.42) * 1.05,
              fontSize: Math.max(13, result.emMm * pxPerMm * 0.42),
              lineHeight: 1,
            }}
          >
            Start writing your note…
          </div>
        )}
        {caret && sel.start === sel.end && (
          <div
            key={sel.focused ? blinkKey : 'rest'}
            className={cn('absolute rounded-full transition-opacity duration-200', sel.focused && 'paper-caret')}
            style={{ left: caretPx.left - 0.75, top: caretPx.top, width: 1.5, height: caretH, background: ink, opacity: sel.focused ? 0.85 : 0.18 }}
          />
        )}
      </div>
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
        aria-label={`Letter in ${writerName}’s hand. Type to write.`}
        spellCheck={false}
        autoCapitalize="sentences"
        autoComplete="off"
        className={cn(
          'pointer-events-none absolute m-0 resize-none overflow-hidden border-0 p-0 text-[16px] leading-none whitespace-pre opacity-0 outline-none',
        )}
        style={{ left: caretPx.left, top: caretPx.top, width: 2, height: Math.max(16, caretH), caretColor: 'transparent' }}
      />
    </div>
  );
}

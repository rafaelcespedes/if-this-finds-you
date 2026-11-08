// (a) Size: the row is the slider (DialKit's idea, the approved prototype). "Size" in it on the left, the value on the
// right; a fill from the left that moves by transform only; a thin needle that turns pencil-red while it's held; a
// ruler of 5% ticks on hover or focus, and the writer's own size (100%) caught like a detent. Drives the same
// onLook({ size }) as the range it replaces, on the same 0.8 to 1.45, shown as a percent.
//
// Pointer: a tap (under 3 px) glides there in 180 ms; a drag follows exactly; ⌥ moves it a fifth as far, ⇧ snaps it to
// fives; within 1.5 of 100% it catches (a 4 ms buzz on touch, where there is one); past the ends the bar gives up to
// 6 px and settles back (--ease-give); a double-click puts it back to 100%. Keys: arrows ±1, ⇧ or Page Up/Down ±10,
// Home, End, Backspace or 0 back to 100%, Enter types a number (Esc cancels). The small and large A step by 5.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { KEY } from './controls';

const MIN = 80, MAX = 145, DEF = 100, RANGE = MAX - MIN;
const clamp = (x: number) => Math.min(MAX, Math.max(MIN, x));
const toPct = (size: number) => clamp(Math.round(size * 100));
/** the needle's centre for a value, in px from the bar's left (the needle runs 4 px in from either end) */
const xOf = (val: number, w: number) => ((val - MIN) / RANGE) * (w - 14) + 5.5;
const TICKS = Array.from({ length: RANGE / 5 + 1 }, (_, i) => MIN + i * 5);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

type Drag = { id: number; x0: number; last: number; moved: boolean; vv: number; left: number; start: number; touch: boolean };

export function SizeSlider({ value, onChange }: { value: number; onChange: (size: number) => void }) {
  const [v, setV] = useState(() => toPct(value));
  const vRef = useRef(v);
  vRef.current = v;
  const drag = useRef<Drag | null>(null);
  // the note's size from outside (another note, undo): followed, unless a finger or the mouse has it
  useEffect(() => { if (!drag.current) setV(toPct(value)); }, [value]);

  const root = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const out = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState(300);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    setW(el.offsetWidth);
    const ro = new ResizeObserver(() => setW(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // the needle fades as it comes to the label or the value
  useLayoutEffect(() => {
    const el = root.current, l = label.current, o = out.current;
    if (!el || !l || !o) return;
    const x = xOf(v, w);
    el.toggleAttribute('data-dodge', x < l.offsetLeft + l.offsetWidth + 8 || x > o.offsetLeft - 8);
  }, [v, w]);

  const glideT = useRef(0);
  const flashT = useRef(0);
  const settleT = useRef(0);
  useEffect(() => () => { window.clearTimeout(glideT.current); window.clearTimeout(flashT.current); window.clearTimeout(settleT.current); }, []);
  const set = useCallback((nv: number, glide?: boolean) => {
    const next = clamp(Math.round(nv));
    const el = root.current;
    if (glide && el) {
      el.setAttribute('data-glide', '');
      window.clearTimeout(glideT.current);
      glideT.current = window.setTimeout(() => el.removeAttribute('data-glide'), 220);
    }
    if (next === vRef.current) return;
    vRef.current = next;
    setV(next);
    onChange(next / 100);
  }, [onChange]);
  /** back to the writer's own size, the detent showing for a moment */
  const reset = () => {
    set(DEF, true);
    const el = root.current;
    if (!el) return;
    el.setAttribute('data-caught', '');
    window.clearTimeout(flashT.current);
    flashT.current = window.setTimeout(() => el.removeAttribute('data-caught'), 500);
  };

  // ---------- typing a value: Enter on the slider, or rest on the number a moment and click it ----------
  const [editing, setEditing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const startEdit = () => { finished.current = false; setEditing(true); };
  const endEdit = (commit: boolean) => {
    if (finished.current) return;
    finished.current = true;
    const n = parseFloat(input.current?.value ?? '');
    setEditing(false);
    if (commit && !Number.isNaN(n)) set(n, true);
    requestAnimationFrame(() => root.current?.focus());
  };
  useEffect(() => {
    if (!editing) return;
    input.current?.focus();
    input.current?.select();
    // Esc cancels the number, and nothing else: not the panel it's in (which closes on Esc), not the page
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      endEdit(false);
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  const [armed, setArmed] = useState(false);
  const armT = useRef(0);
  useEffect(() => () => window.clearTimeout(armT.current), []);

  // ---------- the pointer ----------
  const ppu = () => (w - 14) / RANGE;
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || editing) return;
    if (armed && (e.target as Element).closest('.wr-sl-value')) return;
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { id: e.pointerId, x0: e.clientX, last: e.clientX, moved: false, vv: vRef.current, left: r.left, start: vRef.current, touch: e.pointerType === 'touch' };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current, el = root.current;
    if (!d || !el || e.pointerId !== d.id) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) < 3) return;
    if (!d.moved) {
      // the first move: the value comes to the pointer, then follows it
      d.moved = true;
      el.setAttribute('data-held', '');
      d.vv = MIN + (e.clientX - d.left - 5.5) / ppu();
    } else {
      d.vv += ((e.clientX - d.last) / ppu()) * (e.altKey ? 0.2 : 1);
    }
    d.last = e.clientX;
    let nv = clamp(d.vv);
    if (e.shiftKey) nv = Math.round(nv / 5) * 5;
    // the writer's own size catches, like a detent
    const caught = Math.abs(nv - DEF) <= 1.5 && !e.altKey;
    if (caught && !el.hasAttribute('data-caught') && d.touch && typeof navigator.vibrate === 'function') navigator.vibrate(4);
    el.toggleAttribute('data-caught', caught);
    if (caught) nv = DEF;
    set(nv);
    // past the ends the bar gives, up to 6 px, easing off
    const over = d.vv < MIN ? (MIN - d.vv) * ppu() : d.vv > MAX ? (d.vv - MAX) * ppu() : 0;
    if (over > 0 && !reduced()) {
      const give = 6 * Math.sqrt(Math.min(over, 160) / 160);
      el.style.setProperty('--origin', d.vv < MIN ? 'right' : 'left');
      el.style.setProperty('--give', String(1 + give / w));
    } else el.style.setProperty('--give', '1');
  };
  const end = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current, el = root.current;
    if (!d || !el || e.pointerId !== d.id) return;
    drag.current = null;
    if (cancelled) { if (d.moved) set(d.start, true); }
    else if (!d.moved) {
      // a tap: it glides there
      const val = MIN + (e.clientX - d.left - 5.5) / ppu();
      set(Math.abs(val - DEF) <= 1.5 ? DEF : val, true);
    }
    el.removeAttribute('data-held');
    el.removeAttribute('data-caught');
    el.setAttribute('data-settle', '');
    el.style.setProperty('--give', '1');
    window.clearTimeout(settleT.current);
    settleT.current = window.setTimeout(() => el.removeAttribute('data-settle'), 220);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (editing || e.metaKey || e.ctrlKey) return;
    const big = e.shiftKey ? 10 : 1;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowUp') set(vRef.current + big, true);
    else if (k === 'ArrowLeft' || k === 'ArrowDown') set(vRef.current - big, true);
    else if (k === 'PageUp') set(vRef.current + 10, true);
    else if (k === 'PageDown') set(vRef.current - 10, true);
    else if (k === 'Home') set(MIN, true);
    else if (k === 'End') set(MAX, true);
    else if (k === 'Backspace' || k === 'Delete' || k === '0') reset();
    else if (k === 'Enter') startEdit();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="wr-size">
      <div className="wr-size-row">
        <button type="button" className="wr-size-a" tabIndex={-1} aria-label="Smaller" onClick={() => set(vRef.current - 5, true)}>A</button>
        <div
          ref={root}
          className="wr-sl"
          role="slider"
          tabIndex={0}
          aria-label="Writing size"
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={v}
          aria-valuetext={`${v} percent${v === DEF ? ', the writer’s own size' : ''}`}
          // (a phone sheet doesn't take a drag that starts here)
          data-vaul-no-drag=""
          style={{ '--p': (v - MIN) / RANGE, '--w': `${w}px` } as React.CSSProperties}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => end(e, false)}
          onPointerCancel={(e) => end(e, true)}
          onLostPointerCapture={(e) => end(e, false)}
          onDoubleClick={(e) => { if (!(e.target as Element).closest('.wr-sl-value')) reset(); }}
          onKeyDown={onKeyDown}
        >
          <div className="wr-sl-track">
            <div className="wr-sl-fill" />
            <div className="wr-sl-ticks" aria-hidden>
              {TICKS.map((t) => <i key={t} data-ten={t % 10 === 0 || undefined} style={{ left: xOf(t, w) }} />)}
            </div>
            <div className="wr-sl-home" aria-hidden style={{ left: xOf(DEF, w) - 0.25 }} />
            <div className="wr-sl-needle" aria-hidden />
          </div>
          <span ref={label} className="wr-sl-label" aria-hidden>Size</span>
          <span
            ref={out}
            className="wr-sl-value"
            aria-hidden={!editing || undefined}
            data-armed={armed || undefined}
            onPointerEnter={() => { window.clearTimeout(armT.current); armT.current = window.setTimeout(() => setArmed(true), 600); }}
            onPointerLeave={() => { window.clearTimeout(armT.current); setArmed(false); }}
            onPointerDown={(e) => { if (armed && !editing) { e.preventDefault(); e.stopPropagation(); startEdit(); } }}
          >
            {editing ? (
              <input
                ref={input}
                defaultValue={v}
                inputMode="numeric"
                aria-label="Size in percent"
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); endEdit(true); } }}
                onBlur={() => endEdit(true)}
              />
            ) : <span className="wr-sl-n">{v}</span>}
            <span className="wr-sl-u">%</span>
          </span>
        </div>
        <button type="button" className="wr-size-a wr-size-big" tabIndex={-1} aria-label="Larger" onClick={() => set(vRef.current + 5, true)}>A</button>
      </div>
      <p className="wr-sl-help" aria-hidden>
        Drag · <kbd>{KEY.alt}</kbd> fine · <kbd>{KEY.shift}</kbd> by 5 · double-click resets · <kbd>↵</kbd> types
      </p>
    </div>
  );
}

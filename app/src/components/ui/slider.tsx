import * as React from 'react';
import { Slider as SliderPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * A slider. `mark` draws a small dot on the track (the hand's natural value, for seed-relative controls);
 * double-clicking (or double-tapping) the track or thumb calls `onReset`.
 *
 * Touch works like a phone's own sliders: a finger landing on the track never jumps the value (so scrolling
 * a sheet past a slider can't change it), a sideways drag moves the value from where it was, and an
 * up/down drag is left to the sheet or the scroll. While a finger is sliding, the root carries
 * `data-active`, so the sheet around it can step back and show the page.
 */
function Slider({
  className,
  mark,
  onReset,
  onValueChange,
  onValueCommit,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-valuetext': ariaValueText,
  'aria-description': ariaDescription,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & { mark?: number; onReset?: () => void; 'aria-description'?: string }) {
  const min = props.min ?? 0;
  const max = props.max ?? 100;
  const step = props.step ?? 1;
  const value = (props.value ?? props.defaultValue ?? [min])[0];
  const valuePct = ((value - min) / (max - min || 1)) * 100;
  const markPct = mark == null ? null : Math.min(100, Math.max(0, ((mark - min) / (max - min || 1)) * 100));
  const [active, setActive] = React.useState(false);
  const touch = React.useRef<{ id: number; x: number; y: number; v: number; w: number; sliding: boolean; last: number } | null>(null);
  const lastTap = React.useRef(0);
  // the page stays shown for a moment after the finger lifts, so quick nudges don't flicker the sheet
  const settle = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(settle.current), []);
  const current = React.useRef(value);
  current.current = value;

  // within 4% of the writer's own value the value catches on it, like a dial's detent (learned from DialKit)
  const detent = true;
  const bars = true;
  const caught = React.useRef(false);
  // only a pointer catches: arrow keys step by less than the catch, so they'd never get past it
  const pointing = React.useRef(false);
  const catchMark = (v: number) => {
    if (!detent || mark == null || !pointing.current) return v;
    const near = Math.abs(v - mark) <= (max - min) * 0.04;
    if (near && !caught.current && typeof navigator.vibrate === 'function') navigator.vibrate(4);
    caught.current = near;
    if (rootRef.current) rootRef.current.toggleAttribute('data-caught', near);
    return near ? mark : v;
  };
  const rootRef = React.useRef<HTMLSpanElement>(null);
  // a tap settles (the thumb glides to it); a drag follows the pointer exactly; past the ends the track gives a little
  React.useEffect(() => {
    const el = rootRef.current;
    if (!detent || !el) return;
    let start: { x: number; rect: DOMRect } | null = null;
    const down = (e: PointerEvent) => { if (e.button === 0) { pointing.current = true; start = { x: e.clientX, rect: el.getBoundingClientRect() }; } };
    const move = (e: PointerEvent) => {
      if (!start) return;
      if (Math.abs(e.clientX - start.x) > 3) el.dataset.dragging = '';
      const past = e.clientX < start.rect.left ? e.clientX - start.rect.left : e.clientX > start.rect.right ? e.clientX - start.rect.right : 0;
      const give = Math.sign(past) * 6 * Math.sqrt(Math.min(Math.max(0, Math.abs(past) - 12) / 160, 1));
      el.style.setProperty('--give', `${give.toFixed(2)}px`);
    };
    const up = () => { start = null; pointing.current = false; caught.current = false; el.removeAttribute('data-caught'); delete el.dataset.dragging; el.style.setProperty('--give', '0px'); };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [detent]);

  const snap = (v: number) => {
    const s = Math.round((v - min) / step) * step + min;
    return Math.min(max, Math.max(min, Number(s.toFixed(6))));
  };

  // composeEventHandlers in Radix skips its own pointer handling when we've called preventDefault
  const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.pointerType !== 'touch' || props.disabled) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY, v: current.current, w: Math.max(40, r.width - 20), sliding: false, last: current.current };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const t = touch.current;
    if (!t || e.pointerId !== t.id) return;
    e.preventDefault();
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    if (!t.sliding) {
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
        t.sliding = true;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ }
        window.clearTimeout(settle.current);
        if (!active) {
          setActive(true);
          announce(e.currentTarget, true);
        }
      } else if (Math.abs(dy) > 6) {
        // up or down: the sheet's drag, or the scroll
        touch.current = null;
        return;
      } else {
        // not decided yet: keep the sheet from starting a drag
        e.stopPropagation();
        return;
      }
    }
    e.stopPropagation();
    const v = catchMark(snap(t.v + (dx / t.w) * (max - min)));
    if (v !== t.last) {
      t.last = v;
      onValueChange?.([v]);
    }
  };
  const onPointerEnd = (e: React.PointerEvent<HTMLSpanElement>) => {
    const t = touch.current;
    if (!t || e.pointerId !== t.id) return;
    e.preventDefault();
    touch.current = null;
    if (t.sliding) {
      const el = e.currentTarget;
      window.clearTimeout(settle.current);
      settle.current = window.setTimeout(() => {
        setActive(false);
        announce(el, false);
      }, 400);
      onValueCommit?.([t.last]);
      return;
    }
    if (e.type !== 'pointerup') return;
    // a double tap puts it back
    const now = performance.now();
    if (now - lastTap.current < 320) {
      lastTap.current = 0;
      onReset?.();
    } else lastTap.current = now;
  };

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      data-active={active ? '' : undefined}
      // controls research #1: where the value line would run into the name (left) or the word (right)
      data-edge={bars && (valuePct < 24 || valuePct > 70) ? '' : undefined}
      className={cn('relative flex h-5 w-full touch-none select-none items-center pointer-coarse:h-11 data-[disabled]:opacity-45', className)}
      onDoubleClick={onReset}
      ref={rootRef}
      onValueChange={detent ? (v) => onValueChange?.([catchMark(v[0])]) : onValueChange}
      onValueCommit={onValueCommit}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-[3px] w-full grow overflow-hidden rounded-full bg-[#928a7d]">
        <SliderPrimitive.Range className="absolute h-full bg-[var(--mark)]" />
      </SliderPrimitive.Track>
      {markPct != null && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--panel)] shadow-[0_0_0_1.5px_color-mix(in_oklab,var(--ink)_55%,transparent)]"
          style={{ left: `calc(${markPct}% + ${(0.5 - markPct / 100) * 16}px)` }}
        />
      )}
      {(props.value ?? props.defaultValue ?? [0]).map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          // the thumb is what a screen reader lands on, so its name and value go there
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-valuetext={ariaValueText}
          aria-description={ariaDescription}
          className={cn(
            "relative block size-4 rounded-full border border-[color-mix(in_oklab,var(--ink)_30%,transparent)] bg-[#fffefb] shadow-[0_1px_2px_rgba(30,24,12,0.18),0_2px_6px_-2px_rgba(30,24,12,0.18)] transition-[scale,box-shadow] duration-(--st-dur) ease-(--ease-out) active:duration-(--dur-press) after:absolute after:-inset-3 after:content-[''] hover-device:hover:scale-110 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:size-5",
            active && 'scale-110 shadow-[0_1px_2px_rgba(30,24,12,0.2),0_4px_10px_-2px_rgba(30,24,12,0.25)]',
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

/** Tells the page a finger started or stopped sliding (the phone sheet moves the letter clear of it). */
function announce(el: Element, active: boolean) {
  el.dispatchEvent(new CustomEvent('seedhand:slide', { bubbles: true, detail: { active } }));
}

export { Slider };

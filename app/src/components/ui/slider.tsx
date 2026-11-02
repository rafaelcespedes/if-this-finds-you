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
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & { mark?: number; onReset?: () => void }) {
  const min = props.min ?? 0;
  const max = props.max ?? 100;
  const step = props.step ?? 1;
  const value = (props.value ?? props.defaultValue ?? [min])[0];
  const markPct = mark == null ? null : Math.min(100, Math.max(0, ((mark - min) / (max - min || 1)) * 100));
  const [active, setActive] = React.useState(false);
  const touch = React.useRef<{ id: number; x: number; y: number; v: number; w: number; sliding: boolean; last: number } | null>(null);
  const lastTap = React.useRef(0);
  const current = React.useRef(value);
  current.current = value;

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
        setActive(true);
        announce(e.currentTarget, true);
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
    const v = snap(t.v + (dx / t.w) * (max - min));
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
      setActive(false);
      announce(e.currentTarget, false);
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
      className={cn('relative flex h-5 w-full touch-none select-none items-center pointer-coarse:h-11 data-[disabled]:opacity-45', className)}
      onDoubleClick={onReset}
      onValueChange={onValueChange}
      onValueCommit={onValueCommit}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-[3px] w-full grow overflow-hidden rounded-full bg-[#dcd6ca]">
        <SliderPrimitive.Range className="absolute h-full bg-[color-mix(in_oklab,var(--ink)_78%,transparent)]" />
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
          className={cn(
            "relative block size-4 rounded-full border border-[color-mix(in_oklab,var(--ink)_30%,transparent)] bg-[#fffefb] shadow-[0_1px_2px_rgba(30,24,12,0.18),0_2px_6px_-2px_rgba(30,24,12,0.18)] transition-[transform,box-shadow] duration-150 ease-out after:absolute after:-inset-3 after:content-[''] hover-device:hover:scale-110 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:size-5",
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

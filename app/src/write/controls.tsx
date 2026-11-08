// The writing app's own controls (Rafael, 7 Nov: "a new set of modern controls"; the approved prototype, controls a-h).
// Only /notes uses these: the site's shared parts (components/ui) stay as the home page has them. Styles: write.css,
// "the control set". One way of doing each thing everywhere:
//   - a choice of a few (Pen, Tip, Kind, Shape, Appearance): a segmented control, a recessed well with a raised card
//     that slides to the choice (Segmented, useIndicator)
//   - any radio group (those, the inks, the papers): roving focus, arrows move and wrap, Home and End (radioKeys)
//   - buttons (Button), with feedback in place (useDone); a switch for later toggles (Switch)
//   - key chips, one per key (Keys); custom tooltips with key chips for the toolbar (Tooltips, tip())
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

// ---------- keys ----------

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** the modifier keys as their chips show them */
export const KEY = { mod: isMac() ? '⌘' : 'Ctrl', alt: isMac() ? '⌥' : 'Alt', shift: '⇧' } as const;

/** Key chips, one per key (⌥ ⌘ N is three chips) */
export function Keys({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <span className={`wr-keys${className ? ` ${className}` : ''}`} aria-hidden>
      {keys.map((k, i) => <kbd key={i}>{k}</kbd>)}
    </span>
  );
}

// ---------- tooltips ----------

/** The props that give a control a tooltip: its words and, optionally, its keys (one chip per key). */
export const tip = (label: string, keys?: string[], side?: 'top' | 'bottom') => ({
  'data-tip': label,
  ...(keys?.length ? { 'data-keys': keys.join(' ') } : {}),
  ...(side ? { 'data-tip-side': side } : {}),
});

/**
 * The one tooltip on the page, for every control carrying `data-tip` (tip()). The first waits 500 ms and fades in over
 * 120 ms with a 3 px rise; moving on to the next within 400 ms shows it at once. Esc, a press, a key or a scroll hides
 * it; keyboard focus shows it at once (and it describes the control while it shows). None on touch.
 */
export function Tooltips() {
  const ref = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const touchOnly = matchMedia('(hover: none) and (pointer: coarse)');
    let showT = 0, hideAt = -1e9, owner: HTMLElement | null = null, ownDescribed = false;
    const place = (target: HTMLElement) => {
      el.textContent = '';
      const words = document.createElement('span');
      words.textContent = target.dataset.tip ?? '';
      el.append(words);
      const keys = target.dataset.keys?.split(' ').filter(Boolean) ?? [];
      el.toggleAttribute('data-keys', keys.length > 0);
      if (keys.length) {
        const k = document.createElement('span');
        k.className = 'wr-tip-keys';
        for (const key of keys) { const c = document.createElement('kbd'); c.textContent = key; k.append(c); }
        el.append(k);
      }
      const r = target.getBoundingClientRect();
      // (its layout size: the rise it starts from scales it a little)
      const w = el.offsetWidth, h = el.offsetHeight;
      const top = target.dataset.tipSide === 'top';
      const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
      const y = top ? r.top - h - 8 : r.bottom + 8;
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      el.style.setProperty('--from', top ? '3px' : '-3px');
    };
    const show = (target: HTMLElement, now: boolean) => {
      window.clearTimeout(showT);
      const warm = el.hasAttribute('data-open') || performance.now() - hideAt < 400;
      const go = () => {
        if (!target.isConnected) return;
        if (owner && owner !== target) release();
        owner = target;
        place(target);
        el.toggleAttribute('data-instant', warm);
        el.setAttribute('data-open', '');
        if (!target.hasAttribute('aria-describedby')) { target.setAttribute('aria-describedby', el.id); ownDescribed = true; }
      };
      if (warm || now) go(); else showT = window.setTimeout(go, 500);
    };
    const release = () => {
      if (owner && ownDescribed) owner.removeAttribute('aria-describedby');
      owner = null; ownDescribed = false;
    };
    const hide = () => {
      window.clearTimeout(showT);
      if (!el.hasAttribute('data-open')) return;
      el.removeAttribute('data-open');
      el.removeAttribute('data-instant');
      release();
      hideAt = performance.now();
    };
    const tipOf = (t: EventTarget | null) => ((t as Element | null)?.closest?.('[data-tip]') as HTMLElement | null) ?? null;
    const over = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || touchOnly.matches) return;
      const t = tipOf(e.target);
      if (t && t !== owner) show(t, false);
    };
    const out = (e: PointerEvent) => {
      const t = tipOf(e.target);
      if (t && !t.contains(e.relatedTarget as Node | null)) { if (t === owner) hide(); else window.clearTimeout(showT); }
    };
    const focus = (e: FocusEvent) => {
      const t = tipOf(e.target);
      if (t && (e.target as Element).matches(':focus-visible') && !touchOnly.matches) show(t, true);
    };
    const key = (e: KeyboardEvent) => { if (e.key !== 'Shift' && e.key !== 'Meta' && e.key !== 'Alt' && e.key !== 'Control') hide(); };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', key, true);
    window.addEventListener('scroll', hide, { capture: true, passive: true });
    window.addEventListener('blur', hide);
    return () => {
      hide();
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('scroll', hide, { capture: true });
      window.removeEventListener('blur', hide);
    };
  }, [host]);
  return host ? createPortal(<div ref={ref} id="wr-tip" className="wr-tip" role="tooltip" />, host) : null;
}

// ---------- radio groups ----------

/** A radio group's keys, on the group: arrows move and choose (and wrap), Home and End; the chosen one is the group's
 *  tab stop (tabStop). Choosing is a click on the radio, so each group's own click handler does it. */
export function radioKeys(e: React.KeyboardEvent<HTMLElement>) {
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>(':scope > [role="radio"]')];
  const i = items.indexOf(e.target as HTMLElement);
  if (i < 0) return;
  let n = -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % items.length;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + items.length) % items.length;
  else if (e.key === 'Home') n = 0;
  else if (e.key === 'End') n = items.length - 1;
  if (n < 0) return;
  e.preventDefault();
  e.stopPropagation();
  items[n].focus();
  items[n].click();
}
/** the group's one tab stop: the chosen item, or the first when none is */
export const tabStop = (checked: boolean, index: number, anyChecked: boolean) => (checked || (!anyChecked && index === 0) ? 0 : -1);

/**
 * The piece that slides to the chosen item of a group (the segmented card, the ink's ring): measured from the chosen
 * item, moved by transform. Never on the first paint, nor when the group's items change or it resizes: then it's
 * simply there. Pressing the chosen item squeezes it a little.
 */
export function useIndicator(group: RefObject<HTMLElement | null>, ind: RefObject<HTMLElement | null>, value: unknown, items: string) {
  const place = useCallback(() => {
    const g = group.current, f = ind.current;
    if (!g || !f) return;
    const on = g.querySelector<HTMLElement>(':scope > [aria-checked="true"]');
    if (!on) { f.style.opacity = '0'; return; }
    f.style.opacity = '1';
    f.style.width = `${on.offsetWidth}px`;
    f.style.height = `${on.offsetHeight}px`;
    f.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
  }, [group, ind]);
  // a new set of items (another paper's kinds): placed at once
  useLayoutEffect(() => {
    const g = group.current;
    if (!g) return;
    g.removeAttribute('data-ready');
    place();
    let b = 0;
    const a = requestAnimationFrame(() => { b = requestAnimationFrame(() => g.setAttribute('data-ready', '')); });
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, [items, group, place]);
  // a new choice: it slides
  useLayoutEffect(() => { place(); }, [value, place]);
  useEffect(() => {
    const g = group.current;
    if (!g || typeof ResizeObserver === 'undefined') return;
    let t = 0;
    const ro = new ResizeObserver(() => {
      g.removeAttribute('data-ready');
      place();
      cancelAnimationFrame(t);
      t = requestAnimationFrame(() => g.setAttribute('data-ready', ''));
    });
    ro.observe(g);
    const down = (e: PointerEvent) => {
      const it = (e.target as Element).closest('[aria-checked]');
      if (it?.parentElement === g && it.getAttribute('aria-checked') === 'true') ind.current?.setAttribute('data-press', '');
    };
    const up = () => ind.current?.removeAttribute('data-press');
    g.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => { ro.disconnect(); cancelAnimationFrame(t); g.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, [group, ind, place]);
}

// ---------- (b) the segmented control ----------

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  /** grid columns this one takes (Pen's "Their own") */
  span?: number;
  /** what a screen reader calls it, when the label isn't words */
  name?: string;
}
interface SegProps<T extends string> {
  options: SegOption<T>[];
  value: T | undefined;
  onChange: (v: T) => void;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  /** a grid of this many columns (else the items share a row, wrapping) */
  cols?: number;
  className?: string;
}
/** One choice of a few: a recessed well; the chosen item a raised card that slides to it (180 ms, never on the first
 *  paint). A radio group: the chosen item is its tab stop; arrows move and wrap; Home, End. */
export function Segmented<T extends string>({ options, value, onChange, cols, className, ...aria }: SegProps<T>) {
  const group = useRef<HTMLDivElement>(null);
  const ind = useRef<HTMLSpanElement>(null);
  useIndicator(group, ind, value, options.map((o) => o.value).join('|'));
  const any = options.some((o) => o.value === value);
  return (
    <div
      ref={group}
      role="radiogroup"
      {...aria}
      className={`wr-seg${className ? ` ${className}` : ''}`}
      data-grid={cols ? '' : undefined}
      style={cols ? ({ '--cols': cols } as React.CSSProperties) : undefined}
      onKeyDown={radioKeys}
    >
      <span ref={ind} className="wr-seg-ind" aria-hidden />
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.name}
          tabIndex={tabStop(o.value === value, i, any)}
          className="wr-seg-item"
          data-span={o.span && o.span > 1 ? '' : undefined}
          style={o.span && o.span > 1 ? ({ '--span': o.span } as React.CSSProperties) : undefined}
          onClick={() => { if (o.value !== value) onChange(o.value); }}
        >
          <span>{o.icon}{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- (g) buttons ----------

/** A moment of feedback in place (Copied, Saved): true for 1.6 s after flash() */
export function useDone(ms = 1600): [boolean, () => void] {
  const [done, setDone] = useState(false);
  const t = useRef(0);
  useEffect(() => () => window.clearTimeout(t.current), []);
  const flash = useCallback(() => {
    setDone(true);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setDone(false), ms);
  }, [ms]);
  return [done, flash];
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
  size?: 'md' | 'sm';
  icon?: ReactNode;
  /** feedback in place: the icon becomes a tick and the label reads `doneLabel` while true (useDone) */
  done?: boolean;
  doneLabel?: string;
};
/** A button: 36 px (28 small), primary on the app's "on" colour or secondary on the hover tint; presses to .97;
 *  disabled is plainly off (never faded). With `done`, its icon swaps for a tick and its label says so. */
export function Button({ variant = 'secondary', size = 'md', icon, done, doneLabel, className, children, ...rest }: ButtonProps) {
  const swaps = doneLabel != null;
  return (
    <button
      type="button"
      {...rest}
      className={`wr-button wr-button-${variant}${size === 'sm' ? ' wr-button-sm' : ''}${className ? ` ${className}` : ''}`}
      data-done={done || undefined}
    >
      {swaps ? (
        <span className="wr-swap" aria-hidden>{icon}<Check /></span>
      ) : icon}
      {swaps ? (
        <span className="wr-button-label">
          {/* both words hold the button's width; the one showing is read out */}
          <span aria-hidden={done || undefined}>{children}</span>
          <span aria-hidden={!done || undefined}>{doneLabel}</span>
        </span>
      ) : children}
    </button>
  );
}

// ---------- (f) the switch ----------

/** On or off, for later toggles: the whole row is the switch (36 px; 44 on touch); a 30 × 18 track, a 14 px knob
 *  that travels 12 px and stretches while held. */
export function Switch({ label, hint, checked, onChange, disabled }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} className="wr-sw-row" onClick={() => onChange(!checked)}>
      <span className="wr-sw-text">{label}{hint && <small>{hint}</small>}</span>
      <span className="wr-sw" aria-hidden />
    </button>
  );
}

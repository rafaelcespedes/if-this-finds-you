// The hint ladder (ideas-feel.md, idea 4): one quiet line in the margin, shown the first time a hidden gesture becomes
// useful, and retired once it's been used. Never a tour: at most eight notes, each seen once or twice.
//
//   const hints = useHints({ phone, mac, stet });
//   hints.trigger('again')           // the moment came: shown if the rules allow (true when it shows)
//   hints.used('again')              // its gesture was used: retired for good on this device
//   <MarginNote note={hints.note} /> // placed by the page; hints.announce goes to the page's live region, once
//
// Rules: one note on screen at a time. At least 60 s between notes, unless a note answers the action that brought it
// (direct: ⌘U → "⌘U again…", ⌘Z on dry ink). Each note shows at most twice per device, and is retired the first time
// its gesture is used. Any key or pointerdown takes it away in the same frame; untouched, it goes after 6 s (a 130 ms
// fade). Kept in localStorage under `seedhand:hints` as { id: { shown, used } }; nothing leaves the device.
// The rules are plain functions over a store (createHints), so they can be checked without a page; useHints is the
// React side: state, the 6 s timer, the keys and pointer that dismiss it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type HintId = 'grey' | 'strike' | 'again' | 'hold' | 'double' | 'above' | 'select' | 'dry';
/** a note's words: plain text and keycaps */
export type HintPart = string | { kbd: string };

interface HintSpec {
  /** the words, given how the page is used (a phone, a Mac, whether the engine writes stet) */
  parts: (c: { phone: boolean; mod: string; stet: boolean }) => HintPart[] | null;
  /** shown at most this many times per device (Infinity: never retired) */
  max: number;
  /** fades in (a note brought by a pause or by the pen finishing a mark); otherwise it's simply there */
  fade: boolean;
  /** stays until it's retired (the first visit's line), and then fades out over this long (ms) */
  persist?: number;
  /** answers the action that brought it: no 60 s wait after another note */
  direct?: boolean;
}

/** The ladder, in the order someone usually meets it (VOICE.md: one sentence, plain, contractions). */
export const HINTS: Record<HintId, HintSpec> = {
  // the first grey letters ever, at the bottom, until 12 words are ink or the first crossing-out (Desk)
  grey: { parts: () => ['Grey letters delete cleanly until the pen reaches them.'], max: 1, fade: true, persist: 600 },
  // the pen finishes the first strike or overwrite ever, +300 ms
  strike: { parts: () => ['Ink stays, so ', { kbd: '⌫' }, ' crosses it out.'], max: 2, fade: true },
  // the caret rests 1.2 s beside a struck word (not inked out yet), the pen idle
  again: { parts: (c) => (c.phone ? ['Tap ', { kbd: '⌫' }, ' again to cross it out harder.'] : [{ kbd: '⌫' }, ' again crosses it out harder.']), max: 2, fade: true },
  // two presses crossing out again within 2 s (on a computer)
  hold: { parts: (c) => (c.phone ? null : ['Hold ', { kbd: '⌫' }, ' to scribble it out.']), max: 2, fade: true, direct: true },
  // the first ⌘U, once the underline is drawn
  double: { parts: (c) => (c.phone ? null : [{ kbd: `${c.mod}U` }, ' again for a double underline.']), max: 2, fade: true, direct: true },
  // the first click or tap that lands mid-ink (the caret's amber ‸ already shows)
  above: { parts: () => ['Typing here goes above the line.'], max: 2, fade: false, direct: true },
  // the first pointer selection over ink (a second, muted line in the selection chip)
  select: { parts: () => ['Type to write above it, or ', { kbd: '⌫' }, ' to cross it out.'], max: 2, fade: false, direct: true },
  // ⌘Z on dry ink (in place of the toast): never retired, but terse
  dry: {
    parts: (c) => (c.stet ? ['The ink is dry. ', { kbd: `${c.mod}Z` }, ' on a crossed-out word brings it back.'] : ['The ink is dry. ', { kbd: '⌫' }, ' crosses it out.']),
    max: Infinity, fade: false, direct: true,
  },
};

export const HINTS_KEY = 'seedhand:hints';
/** the quiet time between two notes (ms), unless one answers an action */
export const HINT_GAP = 60_000;
/** an untouched note goes after this long (ms) */
export const HINT_FOR = 6_000;
/** its fade out when it goes on its own (ms; the site's --dur-out) */
export const HINT_OUT = 130;

type Record_ = Partial<Record<HintId, { shown: number; used: boolean }>>;
export interface HintStore { read(): Record_; write(r: Record_): void }

/** localStorage, or nothing at all when the browser won't keep it (private mode): the notes just come back next time */
export function localHintStore(storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null): HintStore {
  let mem: Record_ = {};
  return {
    read() {
      try { const o = JSON.parse(storage?.getItem(HINTS_KEY) || 'null'); if (o && typeof o === 'object') mem = o; } catch { /* unreadable: start over */ }
      return mem;
    },
    write(r) { mem = r; try { storage?.setItem(HINTS_KEY, JSON.stringify(r)); } catch { /* not kept: fine */ } },
  };
}

export interface ShownNote {
  id: HintId;
  parts: HintPart[];
  /** the words as plain text (keycaps as their key), for a live region */
  text: string;
  fade: boolean;
  /** stays until retired */
  persist: boolean;
  /** going: fading out over `outMs`, then gone */
  leaving: boolean;
  outMs: number;
  /** a new showing (a note shown again is a new one) */
  n: number;
}

/** The ladder's rules over a store and a clock: no page, no timers. */
export function createHints(store: HintStore, ctx: { phone: boolean; mac: boolean; stet: boolean }, clock: () => number = () => Date.now()) {
  let lastShown = -Infinity, n = 0;
  const mod = ctx.mac ? '⌘' : 'Ctrl+';
  const words = (id: HintId) => HINTS[id].parts({ phone: ctx.phone, mod, stet: ctx.stet });
  const plain = (parts: HintPart[]) => parts.map((p) => (typeof p === 'string' ? p : p.kbd)).join('');
  return {
    /** may `id` show now? (`showing`: the id of the note on screen, if any) */
    allowed(id: HintId, showing: HintId | null, o: { direct?: boolean } = {}): boolean {
      const spec = HINTS[id];
      if (!words(id)) return false;
      const r = store.read()[id];
      if (r?.used || (r?.shown ?? 0) >= spec.max) return false;
      // one at a time: a note answering an action may take the place of one that doesn't
      if (showing && showing !== id && !(spec.direct || o.direct)) return false;
      if (!(spec.direct || o.direct) && clock() - lastShown < HINT_GAP) return false;
      return true;
    },
    /** it shows: counted (and the quiet time starts) */
    show(id: HintId): ShownNote {
      const parts = words(id) ?? [];
      const all = store.read();
      all[id] = { shown: (all[id]?.shown ?? 0) + 1, used: !!all[id]?.used };
      store.write(all);
      const spec = HINTS[id];
      // (the first visit's line, at the bottom, isn't a margin note: it doesn't start the quiet time)
      if (!spec.persist) lastShown = clock();
      return { id, parts, text: plain(parts), fade: spec.fade, persist: !!spec.persist, leaving: false, outMs: spec.persist ?? HINT_OUT, n: ++n };
    },
    /** its gesture was used: never shown again */
    use(id: HintId) {
      const all = store.read();
      if (all[id]?.used) return;
      all[id] = { shown: all[id]?.shown ?? 0, used: true };
      store.write(all);
    },
    /** shown before on this device (the live region says a note only the first time) */
    seen: (id: HintId) => (store.read()[id]?.shown ?? 0) > 0,
    retired: (id: HintId) => { const r = store.read()[id]; return !!r?.used || (r?.shown ?? 0) >= HINTS[id].max; },
  };
}

/**
 * The hint ladder for a page. `note` is the one to show (MarginNote draws it; the page places it), `announce` its words
 * the first time it's shown on this device (for the page's aria-live region), or null.
 */
export function useHints(o: { phone?: boolean; mac?: boolean; stet?: boolean; store?: HintStore } = {}) {
  const phone = !!o.phone, mac = o.mac ?? (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), stet = o.stet ?? true;
  const store = useMemo(() => o.store ?? localHintStore(), [o.store]);
  const rules = useMemo(() => createHints(store, { phone, mac, stet }), [store, phone, mac, stet]);
  const [note, setNote] = useState<ShownNote | null>(null);
  const [announce, setAnnounce] = useState<string | null>(null);
  const noteRef = useRef(note);
  noteRef.current = note;

  const trigger = useCallback((id: HintId, t: { direct?: boolean } = {}): boolean => {
    const cur = noteRef.current;
    if (cur?.id === id && !cur.leaving) return true;
    if (!rules.allowed(id, cur && !cur.leaving ? cur.id : null, t)) return false;
    const first = !rules.seen(id);
    const shown = rules.show(id);
    noteRef.current = shown;
    setNote(shown);
    setAnnounce(first ? shown.text : null);
    return true;
  }, [rules]);
  const used = useCallback((id: HintId) => {
    rules.use(id);
    const cur = noteRef.current;
    // (the first visit's line fades out as it always did; any other note on screen for it just goes)
    if (cur?.id === id) setNote(cur.persist ? { ...cur, leaving: true } : null);
  }, [rules]);
  const dismiss = useCallback(() => {
    const cur = noteRef.current;
    if (cur && !cur.persist) setNote(null);
  }, []);

  // a key or a pointerdown takes it away in the same frame (no transition: it's a key response)
  useEffect(() => {
    if (!note || note.persist || note.leaving) return;
    const away = () => setNote((cur) => (cur && !cur.persist ? null : cur));
    window.addEventListener('keydown', away, true);
    window.addEventListener('pointerdown', away, true);
    // untouched, it goes after 6 s, fading out
    const t = window.setTimeout(() => setNote((cur) => (cur && cur.n === note.n ? { ...cur, leaving: true } : cur)), HINT_FOR);
    return () => { window.removeEventListener('keydown', away, true); window.removeEventListener('pointerdown', away, true); window.clearTimeout(t); };
  }, [note]);
  // a note going is gone once its fade is over
  useEffect(() => {
    if (!note?.leaving) return;
    const t = window.setTimeout(() => setNote((cur) => (cur && cur.n === note.n ? null : cur)), note.outMs);
    return () => window.clearTimeout(t);
  }, [note]);

  return { note, announce, trigger, used, dismiss, retired: rules.retired };
}

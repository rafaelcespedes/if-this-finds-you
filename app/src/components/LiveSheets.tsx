// The live writing renderer (engines with incremental runs): the other implementation behind the app's
// single writing boundary, next to Writing.tsx (whole-sheet SVG from the worker).
//
// Each keystroke patches the sheets' DOM by word run (runChanges: add / move / remove), so only the edited
// word is drawn again. The pen catches up with the typing: letters appear first as faint graphite
// "thoughts", then the writer's pen inks over them (createPen + paintPen), a word behind in fair copy.
// The thought letters are a layer of their own, patched a word at a time. In Ink mode the pen keeps about a breath
// behind (createPen's lag), copies a paste out in seconds, and fresh ink looks wet until it dries (wetMs).
//
// Each sheet is three SVGs, one layer each: settled ink (written and dry) at the bottom, drying ink (written, still
// wet) over it, and the live one on top (what the pen is writing, the thought letters, extras). A frame or a key
// repaints only the live layer, a drying step only the drying one, so a full sheet costs about what an empty one does.
// Runs go down a layer in batches: when the pen rests, or once enough have finished while it writes on.
import { memo, useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import * as E from '@engine';
import { PaperCanvas } from '@/components/PaperCanvas';
import { sheetPaper, sheetShadow } from '@/lib/papers';
import { SheetMarks } from '@/components/SheetView';
import { sheetFrame, sheetOfLine, type Live } from '@/lib/live';
import { scopeIds, edgeForScreen } from '@/lib/writing';
import { GHOST_OPACITY, INK_THOUGHT, THOUGHT_FILL, WET_LOOK, eventLift, inkDarkens, inkGhost, wetNext, wetStep, type InkExtras, type ThoughtWord } from '@/lib/ink';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as unknown as Record<string, any>;
const now = () => performance.now() / 1000;
const NS = 'http://www.w3.org/2000/svg';
let instances = 0;

interface Props {
  live: Live;
  pxPerMm: number;
  gapPx: number;
  /** CSS ink colour (flat ink) and the engine ink key when it models ink */
  ink: string;
  inkKey: string | null;
  /** per-sheet markup for underlines, signature, page numbers, the placeholder; with a draft, the thought letters by word */
  extras: string[] | InkExtras;
  /** changes when the writer changes: drawn again from scratch, and the pen doesn't re-write it */
  handKey: string;
  /** the first visit: let the pen write the letter out */
  writeOut?: boolean;
  /** hold back the unfinished word (fair copy), a few letters, or nothing (ink: the pen already paces it) */
  hold: number | 'word';
  /**
   * Ink mode: letters typed but not yet handed to the pen (shown as thought letters). The drawn pen counts them as
   * waiting and keeps about 1.2 s behind the whole backlog, and its own letters never blink out between thought and ink.
   */
  trail?: number;
  /** keys of letters shown faded (Ink mode: letters Backspaced at the pen head while the writer considers the fix) */
  dim?: string[];
  /** the drawn pen, for whoever paces what's handed to it (Ink mode: the next word goes when this one is drawn) */
  penRef?: MutableRefObject<{ at(now: number): { letters: number } } | null>;
  /**
   * Ink mode: how long this pen's ink stays wet (ms, InkSession.wetMs). Fresh ink then looks wet, a little deeper, and
   * dries back to its colour in five steps over the window, from the moment the pen lifts off it (iron gall the other
   * way: pale, then darker). Without it, ink is drawn as it is.
   */
  wetMs?: number;
  /** the drawn pen came to rest (nothing left to write, nothing typed waiting for it), or set off again */
  onPenRest?: (resting: boolean) => void;
  /**
   * The ghost of the next press (InkSession.ghostAt; behind the GHOST flag): its marks drawn faint in graphite, fading
   * in. Taken away (null), it goes at once, unless those marks are now being written: then it stays under them until
   * the pen has inked them, the way thought letters become ink.
   */
  ghost?: { items: any[] } | null;
}

/** the five drying steps as SVG filters (a gamma curve on the colour: deeper, or for iron gall paler) */
function wetFilters(doc: Document, prefix: string, darkens: boolean): SVGFilterElement[] {
  return WET_LOOK.gamma.map((g, n) => {
    const f = doc.createElementNS(NS, 'filter') as SVGFilterElement;
    const e = String(darkens ? WET_LOOK.ironGall[n] : g), a = String(darkens ? 1 : WET_LOOK.alpha[n]);
    for (const [k, v] of [['id', `${prefix}-${n}`], ['x', '-5%'], ['y', '-25%'], ['width', '110%'], ['height', '150%'], ['color-interpolation-filters', 'sRGB']]) f.setAttribute(k, v);
    const t = doc.createElementNS(NS, 'feComponentTransfer');
    for (const ch of ['R', 'G', 'B']) {
      const fn = doc.createElementNS(NS, `feFunc${ch}`);
      fn.setAttribute('type', 'gamma');
      fn.setAttribute('exponent', e);
      t.appendChild(fn);
    }
    const fa = doc.createElementNS(NS, 'feFuncA');
    fa.setAttribute('type', 'linear');
    fa.setAttribute('slope', a);
    t.appendChild(fa);
    f.appendChild(t);
    return f;
  });
}

/** the thought letters of one sheet: one path per word, kept while the word is, replaced when it's laid out again */
function patchThoughts(svg: SVGSVGElement, words: ThoughtWord[]) {
  const s = svg as SVGSVGElement & { __thoughts?: SVGGElement; __words?: Map<string, Element> };
  let g = s.__thoughts;
  if (!g || !g.isConnected) {
    g = svg.ownerDocument.createElementNS(NS, 'g') as SVGGElement;
    g.setAttribute('class', 'thoughts');
    g.setAttribute('fill', THOUGHT_FILL);
    g.setAttribute('fill-opacity', String(INK_THOUGHT));
    svg.appendChild(g);
    s.__thoughts = g;
    s.__words = new Map();
  }
  const have = s.__words!;
  const want = new Set(words.map((w) => w.id));
  for (const [id, el] of have) if (!want.has(id)) { el.remove(); have.delete(id); }
  for (const w of words) {
    if (have.has(w.id)) continue;
    const el = svg.ownerDocument.createElementNS(NS, 'path');
    el.setAttribute('d', w.d);
    g.appendChild(el);
    have.set(w.id, el);
  }
}

export const LiveSheets = memo(function LiveSheets({ live, pxPerMm, gapPx, ink, inkKey, extras, handKey, writeOut, hold, trail, penRef, dim, wetMs, onPenRest, ghost }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const svgs = useRef<SVGSVGElement[]>([]);
  const drys = useRef<SVGSVGElement[]>([]);
  const wets = useRef<SVGSVGElement[]>([]);
  const dimmed = useRef(false);
  const prev = useRef<{ page: any; key: string } | null>(null);
  const pen = useRef<any>(null);
  const raf = useRef(0);
  const uid = useRef(0);
  if (!uid.current) uid.current = ++instances;
  // wet ink: the runs written since the pen started, by id: their event, items, and the drying step they show
  const wet = useRef(new Map<string, { ev: number; from: number; to: number; el: Element; step: number; lift?: number }>());
  const wetTimer = useRef(0);
  const darkens = useRef(false);
  const rest = useRef<boolean | null>(null);
  const restCb = useRef(onPenRest);
  restCb.current = onPenRest;
  const rushOff = useRef<(() => void) | null>(null);
  const sheets = live.sheets.length;
  const renderInk = inkKey && inkKey !== 'auto' ? inkKey : inkKey === 'auto' ? undefined : 'currentColor';
  // (Ink mode's pen is paced differently: a switch between the two starts a fresh pen)
  const drawKey = `${handKey}|${live.emPx.toFixed(3)}|${live.paper.id}|${renderInk ?? 'own'}|${trail != null ? 'ink' : 'fair'}`;
  const wetId = (s: number, n: number) => `sh-wet-${uid.current}-${s}-${n}`;

  // ---------- the DOM: one svg per sheet, runs patched by id ----------
  useLayoutEffect(() => {
    const host = root.current;
    if (!host) return;
    const { page, p, emPx } = live;
    const fresh = !prev.current || prev.current.key !== drawKey;
    const hosts = [...host.querySelectorAll<HTMLDivElement>('[data-sheet-ink]')];
    const dryHosts = [...host.querySelectorAll<HTMLDivElement>('[data-sheet-dry]')];
    const wetHosts = [...host.querySelectorAll<HTMLDivElement>('[data-sheet-wet]')];
    if (fresh) darkens.current = inkDarkens(p, inkKey);
    // (re)build sheet skeletons where needed
    hosts.forEach((h, s) => {
      if (!fresh && svgs.current[s] && h.contains(svgs.current[s])) return;
      const f = sheetFrame(live, s, renderInk);
      h.innerHTML = scopeIds(f.open + f.close, 'L' + s);
      svgs.current[s] = h.querySelector('svg') as SVGSVGElement;
      // (the drying and settled layers under it, each with defs of its own)
      const d = dryHosts[s], w = wetHosts[s];
      if (d) { d.innerHTML = scopeIds(f.open + f.close, 'D' + s); drys.current[s] = d.querySelector('svg') as SVGSVGElement; }
      if (w) { w.innerHTML = scopeIds(f.open + f.close, 'W' + s); wets.current[s] = w.querySelector('svg') as SVGSVGElement; }
      // a touch screen keeps the ink's rough edge off, so a pinch doesn't blur it (lib/writing.ts EDGE_OFF)
      edgeForScreen(svgs.current[s]); edgeForScreen(drys.current[s]); edgeForScreen(wets.current[s]);
    });
    svgs.current.length = hosts.length;
    drys.current.length = dryHosts.length;
    wets.current.length = wetHosts.length;
    const runEl = (id: string) => {
      for (const list of [svgs.current, wets.current, drys.current]) {
        for (const svg of list) {
          const el = svg?.querySelector(`[data-run="${CSS.escape(id)}"]`);
          if (el) return el;
        }
      }
      return null;
    };
    const opts = { emPx, strokeKeys: true };
    if (fresh) {
      // (a sheet drawn as it is goes straight to the settled layer; one the pen writes out goes to the live one first)
      const into = writeOut && !prev.current ? inkGroup : dryGroup;
      for (const run of page.runs) into(sheetOfLine(live, run.line))?.insertAdjacentHTML('beforeend', engine.renderRun(p, page, run, opts));
      // a new writer, paper or size: no re-writing of the whole letter, unless it's the first visit
      // Ink mode (a trail): what the pen is handed already showed as thought letters, so it shows at once (no fade
      // from nothing), and the pen keeps about 1.2 s behind the whole backlog (createPen's lag), copies a paste out
      // within 6 s, and forgets a letter an undo took away (written again if it comes back)
      pen.current = engine.createPen(trail != null ? { hold, speed: 1.5, lag: 1.2, copy: 5.5, fadeIn: 0, forget: true } : { hold, fast: 12 });
      pen.current.sync(page, now());
      // (what's on the sheet already is old ink: it isn't wet)
      if (!writeOut || prev.current) pen.current.finish(now(), true);
      wet.current.clear();
    } else {
      const c = engine.runChanges(prev.current!.page, page);
      for (const id of c.remove) { runEl(id)?.remove(); wet.current.delete(id); }
      for (const r of c.move) {
        const el = runEl(r.id);
        if (!el) continue;
        el.setAttribute('transform', engine.runTransform(r, emPx));
        el.setAttribute('data-pid', r.pid);
        // a word that crossed a page break moves to the other sheet (in its own layer)
        const s = sheetOfLine(live, r.line);
        const g = drys.current.some((d) => d?.contains(el)) ? dryGroup(s) : wets.current.some((d) => d?.contains(el)) ? wetGroup(s) : inkGroup(s);
        if (g && el.parentNode !== g) g.appendChild(el);
      }
      for (const r of c.add) {
        const g = inkGroup(sheetOfLine(live, r.line));
        if (!g) continue;
        g.insertAdjacentHTML('beforeend', engine.renderRun(p, page, r, opts));
        // new ink: watched while it dries
        const ev = page.items[r.from]?.ev;
        if (wetMs && typeof ev === 'number' && g.lastElementChild) wet.current.set(r.id, { ev, from: r.from, to: r.to, el: g.lastElementChild, step: -2 });
      }
      pen.current?.sync(page, now());
    }
    // a copy-out finished by a click or Esc: everything handed over since is written at once too
    if (pen.current?.rush) { pen.current.finish(now()); if (!(trail && trail > 0)) pen.current.rush = false; }
    // a copy of the runs as they are now: an engine may keep updating the same runs list (Ink mode's sheet
    // does), so the next diff must compare against what was drawn, not against a live array
    prev.current = { page: { ...page, runs: (page.runs as any[]).map((r) => ({ ...r })) }, key: drawKey };
    if (pen.current) pen.current.trail = trail ?? 0;
    if (penRef) penRef.current = pen.current;
    // for debugging and QA: the live pen and page
    (window as unknown as { __seedhandLive: unknown }).__seedhandLive = { pen: pen.current, page, svgs: svgs.current, drys: drys.current };
    tick();
    settle(false);
  });

  // ---------- the layers: runs written go down to the drying layer, runs dry to the settled one, a batch at a time ----------
  const group = (svg: SVGSVGElement | undefined) => svg?.querySelector(':scope > g:not(.extras):not(.thoughts)') as SVGGElement | null;
  const inkGroup = (s: number) => group(svgs.current[s]);
  const wetGroup = (s: number) => group(wets.current[s]);
  const dryGroup = (s: number) => group(drys.current[s]);
  const settle = (all: boolean) => {
    const toWet: [Element, SVGGElement][] = [], toDry: [Element, SVGGElement][] = [];
    svgs.current.forEach((_, s) => {
      const g = inkGroup(s), w = wetGroup(s), d = dryGroup(s);
      if (!g || !w || !d) return;
      for (const el of g.children) {
        const id = el.getAttribute('data-run');
        // (still being written, or dimmed: it stays live)
        if (id == null || el.querySelector('[data-s]:not(.sh-ok), [mask]')) continue;
        (wet.current.has(id) || el.hasAttribute('filter') ? toWet : toDry).push([el, wet.current.has(id) || el.hasAttribute('filter') ? w : d]);
      }
      for (const el of w.children) {
        const id = el.getAttribute('data-run');
        if (id == null || wet.current.has(id) || el.hasAttribute('filter') || el.querySelector('[data-s]:not(.sh-ok)')) continue;
        toDry.push([el, d]);
      }
    });
    // (each batch repaints the layer it goes to once: when the pen rests, or once enough is done while it writes on)
    if (toWet.length && (all || toWet.length >= 8)) for (const [el, d] of toWet) d.appendChild(el);
    if (toDry.length && (all || toDry.length >= 24)) for (const [el, d] of toDry) d.appendChild(el);
  };
  /** the sheet a run is on, whichever layer it's in */
  const sheetOfEl = (el: Element) => {
    const svg = el.closest('svg') as SVGSVGElement | null;
    for (const list of [svgs.current, wets.current, drys.current]) { const s = svg ? list.indexOf(svg) : -1; if (s >= 0) return s; }
    return -1;
  };

  // ---------- extra ink, and the thought letters a word at a time ----------
  useLayoutEffect(() => {
    const words = (extras as InkExtras).thoughts;
    svgs.current.forEach((svg, s) => {
      const g = svg?.querySelector(':scope > g.extras') as (Element & { __html?: string }) | null;
      const html = extras[s] ?? '';
      if (g && g.__html !== html) { g.innerHTML = html; g.__html = html; }
      if (svg) patchThoughts(svg, words?.[s] ?? []);
    });
  });

  // ---------- the ghost of the next press: faint, fading in; it stays under its marks while the pen inks them ----------
  const ghostShown = useRef<{ items: any[]; keys: string[] } | null>(null);
  const ghostEls = useRef<SVGGElement[]>([]);
  const dropGhost = () => { for (const g of ghostEls.current) g.remove(); ghostEls.current = []; ghostShown.current = null; };
  useLayoutEffect(() => {
    const was = ghostShown.current;
    if (ghost && was?.items === ghost.items && ghostEls.current.every((g) => g.isConnected)) return;
    if (!ghost) {
      // the press came: its marks are on the page now, being written over the ghost (it goes once they're inked)
      const page = prev.current?.page;
      const written = !!was && !!page && was.keys.some((k) => page.items.some((it: any) => it.key === k));
      if (!written) dropGhost();
      return;
    }
    dropGhost();
    const per = inkGhost(live, ghost.items);
    svgs.current.forEach((svg, s) => {
      if (!svg || !per[s]) return;
      const g = svg.ownerDocument.createElementNS(NS, 'g') as SVGGElement;
      g.setAttribute('class', 'ghost-in');
      g.setAttribute('fill', THOUGHT_FILL);
      g.setAttribute('fill-opacity', String(GHOST_OPACITY));
      g.innerHTML = per[s];
      svg.appendChild(g);
      ghostEls.current.push(g);
    });
    ghostShown.current = { items: ghost.items, keys: ghost.items.map((it) => String(it.key)) };
  });
  // (the pen has inked the marks the ghost showed: it's done)
  const ghostDone = () => {
    const was = ghostShown.current, pn = pen.current;
    if (!was || ghost || !pn) return;
    if (was.keys.every((k) => pn.liftedAt(k) !== undefined)) dropGhost();
  };

  // ---------- wet ink: each run of fresh ink steps through its drying, then is left alone ----------
  const wetPaint = () => {
    window.clearTimeout(wetTimer.current);
    const pn = pen.current, page = prev.current?.page;
    if (!wetMs || !pn || !page || !wet.current.size) return;
    const t = performance.now();
    const lifted = (k: string) => pn.liftedAt(k) as number | undefined;
    const lifts = new Map<number, number | null | undefined>();
    let next = Infinity;
    for (const [id, w] of wet.current) {
      if (!w.el.isConnected) { wet.current.delete(id); continue; }
      // (a run shows wet once all of it is inked; its event dries from when the pen lifts off the event's last stroke,
      // kept once known)
      let inked = w.lift != null;
      for (let i = w.from; i < w.to && !inked; i++) {
        const it = page.items[i];
        if (it && (it.kind === 'glyph' || it.kind === 'mark') && it.g?.strokes.length && lifted(it.key) === undefined) break;
        if (i === w.to - 1) inked = true;
      }
      if (w.to <= w.from) inked = true;
      let step = -2;
      if (inked) {
        if (w.lift == null && !lifts.has(w.ev)) lifts.set(w.ev, eventLift(page, w.ev, lifted));
        const L = w.lift ?? lifts.get(w.ev);
        if (typeof L === 'number') w.lift = L;
        if (L === null) step = 0;
        else if (L === undefined || !Number.isFinite(L)) step = -1;
        else { step = wetStep(t - L, wetMs); if (step >= 0) next = Math.min(next, L + wetNext(step, wetMs)); }
      }
      if (step !== w.step) {
        const s = sheetOfEl(w.el);
        // (each sheet's own filters, in its live layer, made the first time it has wet ink: a filter that isn't there
        // would hide the word)
        const svg = svgs.current[s] as (SVGSVGElement & { __wet?: boolean }) | undefined;
        if (svg && !svg.__wet) {
          const defs = svg.querySelector('defs') ?? svg.insertBefore(svg.ownerDocument.createElementNS(NS, 'defs'), svg.firstChild);
          for (const f of wetFilters(svg.ownerDocument, `sh-wet-${uid.current}-${s}`, darkens.current)) defs.appendChild(f);
          svg.__wet = true;
        }
        if (step >= 0 && s >= 0) w.el.setAttribute('filter', `url(#${wetId(s, step)})`);
        else w.el.removeAttribute('filter');
        w.step = step;
      }
      if (step === -1) wet.current.delete(id);
    }
    // nothing per frame once the pen rests: the next step is set for when it's due
    if (Number.isFinite(next)) wetTimer.current = window.setTimeout(wetPaint, Math.max(16, next - t + 4));
    // all dry, and the pen resting: down to the settled layer, together
    else if (!wet.current.size && rest.current) settle(true);
  };

  // ---------- the pen: paint while it has letters to ink ----------
  const dimSet = dim?.length ? new Set(dim) : undefined;
  const tick = () => {
    cancelAnimationFrame(raf.current);
    const step = () => {
      const p = pen.current;
      const page = prev.current?.page;
      if (!p || !page) return;
      const state = p.at(now());
      const po = { emPx: live.emPx, thought: trail != null ? INK_THOUGHT : undefined, dim: dimSet };
      for (const svg of svgs.current) if (svg) engine.paintPen(svg, page, state, po);
      // (the settled layer only ever changes when letters on it are dimmed, or no longer are)
      if (dimSet || dimmed.current) for (const svg of [...wets.current, ...drys.current]) if (svg) engine.paintPen(svg, page, state, po);
      dimmed.current = !!dimSet;
      wetPaint();
      ghostDone();
      const moving = !!(state.busy || state.writing);
      // a copy-out: a click or Esc finishes it, as the first write-out does
      if (state.copying && !rushOff.current) {
        const rush = (e: Event) => {
          if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
          const pn = pen.current;
          if (!pn) return;
          pn.rush = true;
          pn.finish(now());
          tick();
        };
        window.addEventListener('pointerdown', rush, true);
        window.addEventListener('keydown', rush, true);
        rushOff.current = () => { window.removeEventListener('pointerdown', rush, true); window.removeEventListener('keydown', rush, true); rushOff.current = null; };
      } else if (!state.copying && rushOff.current) rushOff.current();
      const resting = !moving && !(trail && trail > 0);
      if (resting !== rest.current) { rest.current = resting; restCb.current?.(resting); }
      if (moving) raf.current = requestAnimationFrame(step);
      else settle(true);
    };
    // painted now, before this frame shows: a run just added would otherwise show in full ink for one frame (a
    // word, or a strike, flashing before the pen writes it)
    step();
  };
  useEffect(() => () => { cancelAnimationFrame(raf.current); window.clearTimeout(wetTimer.current); rushOff.current?.(); dropGhost(); }, []);

  // a click or key during the first write-out finishes it (editor-ux.md §3.4)
  useEffect(() => {
    if (!writeOut) return;
    const finish = () => { pen.current?.finish(now()); tick(); };
    window.addEventListener('pointerdown', finish, { once: true });
    window.addEventListener('keydown', finish, { once: true });
    return () => { window.removeEventListener('pointerdown', finish); window.removeEventListener('keydown', finish); };
    // only for the first visit
  }, [writeOut]);

  return (
    <div ref={root} className="flex flex-col" style={{ gap: gapPx }}>
      {Array.from({ length: sheets }, (_, s) => (
        <div
          key={s}
          className="relative isolate shrink-0 rounded-[1.5px]"
          style={{ width: live.paper.w * pxPerMm, height: live.paper.h * pxPerMm, boxShadow: sheetShadow(live.paper) }}
          aria-label={sheets > 1 ? `Page ${s + 1} of ${sheets}` : undefined}
          role={sheets > 1 ? 'group' : undefined}
        >
          <PaperCanvas paper={sheetPaper(live.paper, s)} sheet={s} pxPerMm={pxPerMm} className="absolute inset-0 rounded-[1.5px]" />
          <SheetMarks paper={live.paper} index={s} count={sheets} pxPerMm={pxPerMm} />
          {/* settled ink, a layer of its own: what the pen writes on top never repaints it */}
          <div data-sheet-dry className="writing writing-fill pointer-events-none absolute inset-0 will-change-transform" style={{ color: ink }} />
          <div data-sheet-wet className="writing writing-fill pointer-events-none absolute inset-0 will-change-transform" style={{ color: ink }} />
          <div data-sheet-ink className="writing writing-fill pointer-events-none absolute inset-0" style={{ color: ink }} />
        </div>
      ))}
    </div>
  );
});

// The live writing renderer (engines with incremental runs): the other implementation behind the app's
// single writing boundary, next to Writing.tsx (whole-sheet SVG from the worker).
//
// Each keystroke patches the sheets' DOM by word run (runChanges: add / move / remove), so only the edited
// word is drawn again. The pen catches up with the typing: letters appear first as faint graphite
// "thoughts", then the writer's pen inks over them (createPen + paintPen), a word behind in fair copy.
import { memo, useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import * as E from '@engine';
import { PaperCanvas } from '@/components/PaperCanvas';
import { sheetPaper, sheetShadow } from '@/lib/papers';
import { SheetMarks } from '@/components/SheetView';
import { sheetFrame, sheetOfLine, type Live } from '@/lib/live';
import { scopeIds } from '@/lib/writing';
import { INK_THOUGHT } from '@/lib/ink';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as unknown as Record<string, any>;
const now = () => performance.now() / 1000;

interface Props {
  live: Live;
  pxPerMm: number;
  gapPx: number;
  /** CSS ink colour (flat ink) and the engine ink key when it models ink */
  ink: string;
  inkKey: string | null;
  /** per-sheet markup for underlines, signature, page numbers, the placeholder */
  extras: string[];
  /** changes when the writer changes: drawn again from scratch, and the pen doesn't re-write it */
  handKey: string;
  /** the first visit: let the pen write the letter out */
  writeOut?: boolean;
  /** hold back the unfinished word (fair copy), a few letters, or nothing (ink: the pen already paces it) */
  hold: number | 'word';
  /**
   * Ink mode: letters typed but not yet handed to the pen (shown as thought letters). The drawn pen counts them as
   * waiting and speeds up with the whole backlog, and its own letters never blink out between thought and ink.
   */
  trail?: number;
  /** keys of letters shown faded (Ink mode: letters Backspaced at the pen head while the writer considers the fix) */
  dim?: string[];
  /** the drawn pen, for whoever paces what's handed to it (Ink mode: the next word goes when this one is drawn) */
  penRef?: MutableRefObject<{ at(now: number): { letters: number } } | null>;
}


export const LiveSheets = memo(function LiveSheets({ live, pxPerMm, gapPx, ink, inkKey, extras, handKey, writeOut, hold, trail, penRef, dim }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const svgs = useRef<SVGSVGElement[]>([]);
  const prev = useRef<{ page: any; key: string } | null>(null);
  const pen = useRef<any>(null);
  const raf = useRef(0);
  const sheets = live.sheets.length;
  const renderInk = inkKey && inkKey !== 'auto' ? inkKey : inkKey === 'auto' ? undefined : 'currentColor';
  // (Ink mode's pen is paced differently: a switch between the two starts a fresh pen)
  const drawKey = `${handKey}|${live.emPx.toFixed(3)}|${live.paper.id}|${renderInk ?? 'own'}|${trail != null ? 'ink' : 'fair'}`;

  // ---------- the DOM: one svg per sheet, runs patched by id ----------
  useLayoutEffect(() => {
    const host = root.current;
    if (!host) return;
    const { page, p, emPx } = live;
    const fresh = !prev.current || prev.current.key !== drawKey;
    const hosts = [...host.querySelectorAll<HTMLDivElement>('[data-sheet-ink]')];
    // (re)build sheet skeletons where needed
    hosts.forEach((h, s) => {
      if (!fresh && svgs.current[s] && h.contains(svgs.current[s])) return;
      const f = sheetFrame(live, s, renderInk);
      h.innerHTML = scopeIds(f.open + f.close, 'L' + s);
      svgs.current[s] = h.querySelector('svg') as SVGSVGElement;
    });
    svgs.current.length = hosts.length;
    const inkGroup = (s: number) => svgs.current[s]?.querySelector(':scope > g:not(.extras)') as SVGGElement | null;
    const runEl = (id: string) => {
      for (const svg of svgs.current) {
        const el = svg?.querySelector(`[data-run="${CSS.escape(id)}"]`);
        if (el) return el;
      }
      return null;
    };
    const opts = { emPx, strokeKeys: true };
    if (fresh) {
      for (const run of page.runs) inkGroup(sheetOfLine(live, run.line))?.insertAdjacentHTML('beforeend', engine.renderRun(p, page, run, opts));
      // a new writer, paper or size: no re-writing of the whole letter, unless it's the first visit
      // Ink mode (a trail): what the pen is handed already showed as thought letters, so it shows at once (no fade
      // from nothing), and the pen speeds up gently with the whole backlog: 1.5x at 6 letters, 3.5x at 12
      pen.current = engine.createPen(trail != null ? { hold, speed: 1.5, fast: 3.5, behind: 6, fadeIn: 0 } : { hold, fast: 12 });
      pen.current.sync(page, now());
      if (!writeOut || prev.current) pen.current.finish(now());
    } else {
      const c = engine.runChanges(prev.current!.page, page);
      for (const id of c.remove) runEl(id)?.remove();
      for (const r of c.move) {
        const el = runEl(r.id);
        if (!el) continue;
        el.setAttribute('transform', engine.runTransform(r, emPx));
        el.setAttribute('data-pid', r.pid);
        // a word that crossed a page break moves to the other sheet
        const g = inkGroup(sheetOfLine(live, r.line));
        if (g && el.parentNode !== g) g.appendChild(el);
      }
      for (const r of c.add) inkGroup(sheetOfLine(live, r.line))?.insertAdjacentHTML('beforeend', engine.renderRun(p, page, r, opts));
      pen.current?.sync(page, now());
    }
    // a copy of the runs as they are now: an engine may keep updating the same runs list (Ink mode's sheet
    // does), so the next diff must compare against what was drawn, not against a live array
    prev.current = { page: { ...page, runs: (page.runs as any[]).map((r) => ({ ...r })) }, key: drawKey };
    if (pen.current) pen.current.trail = trail ?? 0;
    if (penRef) penRef.current = pen.current;
    // for debugging and QA: the live pen and page
    (window as unknown as { __seedhandLive: unknown }).__seedhandLive = { pen: pen.current, page, svgs: svgs.current };
    tick();
  });

  // ---------- extra ink: cheap, redrawn whole ----------
  useLayoutEffect(() => {
    svgs.current.forEach((svg, s) => {
      const g = svg?.querySelector(':scope > g.extras');
      if (g) g.innerHTML = extras[s] ?? '';
    });
  });

  // ---------- the pen: paint while it has letters to ink ----------
  const dimSet = dim?.length ? new Set(dim) : undefined;
  const tick = () => {
    cancelAnimationFrame(raf.current);
    const step = () => {
      const p = pen.current;
      const page = prev.current?.page;
      if (!p || !page) return;
      const state = p.at(now());
      for (const svg of svgs.current) if (svg) engine.paintPen(svg, page, state, { emPx: live.emPx, thought: trail != null ? INK_THOUGHT : undefined, dim: dimSet });
      if (state.busy || state.writing) raf.current = requestAnimationFrame(step);
    };
    // painted now, before this frame shows: a run just added would otherwise show in full ink for one frame (a
    // word, or a strike, flashing before the pen writes it)
    step();
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

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
          <div data-sheet-ink className="writing writing-fill pointer-events-none absolute inset-0" style={{ color: ink }} />
        </div>
      ))}
    </div>
  );
});

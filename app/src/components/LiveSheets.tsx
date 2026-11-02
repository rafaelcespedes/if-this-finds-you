// The live writing renderer (engines with incremental runs): the other implementation behind the app's
// single writing boundary, next to Writing.tsx (whole-sheet SVG from the worker).
//
// Each keystroke patches the sheets' DOM by word run (runChanges: add / move / remove), so only the edited
// word is drawn again. The pen catches up with the typing: letters appear first as faint graphite
// "thoughts", then the writer's pen inks over them (createPen + paintPen), a word behind in fair copy.
import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import * as E from '@engine';
import { PaperCanvas } from '@/components/PaperCanvas';
import { sheetFrame, sheetOfLine, type Live } from '@/lib/live';
import { scopeIds } from '@/lib/writing';

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
  /** hold back the unfinished word (fair copy) or the last 2 letters (ink) */
  hold: 2 | 'word';
}

export const LiveSheets = memo(function LiveSheets({ live, pxPerMm, gapPx, ink, inkKey, extras, handKey, writeOut, hold }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const svgs = useRef<SVGSVGElement[]>([]);
  const prev = useRef<{ page: any; key: string } | null>(null);
  const pen = useRef<any>(null);
  const raf = useRef(0);
  const sheets = live.sheets.length;
  const renderInk = inkKey && inkKey !== 'auto' ? inkKey : inkKey === 'auto' ? undefined : 'currentColor';
  const drawKey = `${handKey}|${live.emPx.toFixed(3)}|${live.paper.id}|${renderInk ?? 'own'}`;

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
      pen.current = engine.createPen({ hold, fast: 12 });
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
    prev.current = { page, key: drawKey };
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
  const tick = () => {
    cancelAnimationFrame(raf.current);
    const step = () => {
      const p = pen.current;
      const page = prev.current?.page;
      if (!p || !page) return;
      const state = p.at(now());
      for (const svg of svgs.current) if (svg) engine.paintPen(svg, page, state, { emPx: live.emPx });
      if (state.busy || state.writing) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
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
          style={{ width: live.paper.w * pxPerMm, height: live.paper.h * pxPerMm, boxShadow: 'var(--sheet-shadow)' }}
          aria-label={sheets > 1 ? `Page ${s + 1} of ${sheets}` : undefined}
          role={sheets > 1 ? 'group' : undefined}
        >
          <PaperCanvas paper={live.paper} pxPerMm={pxPerMm} className="absolute inset-0 rounded-[1.5px]" />
          <div data-sheet-ink className="writing writing-fill pointer-events-none absolute inset-0" style={{ color: ink }} />
        </div>
      ))}
    </div>
  );
});

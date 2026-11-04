// A shared letter written out in front of the reader, with the engine's own timing (animate.js): each stroke
// revealed along its centreline, fast on straights and slow at turns, pen-ups between strokes, pauses
// between words and lines, dots and bars after their word. Played at about 3x a real hand, the whole letter
// between 2.5 and 6.5 s. One timeline drives every sheet: each sheet's SVG holds its own strokes, numbered as
// on the whole page, so sheet 2 starts writing where sheet 1 ends. A tap (or key) finishes it.
// Reduced motion: no writing, the sheets fade in (200 ms).
import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import * as E from '@engine';
import { UPM } from '@engine';
import { PaperCanvas } from '@/components/PaperCanvas';
import { sheetPaper, sheetShadow } from '@/lib/papers';
import { SheetMarks } from '@/components/SheetView';
import { sheetFrame, sheetOfLine, type Live } from '@/lib/live';
import { liftInkEdge, scopeIds } from '@/lib/writing';
import { liveInk } from '@/lib/write-live';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as unknown as Record<string, any>;
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

/** The engine can time and play a page stroke by stroke. */
export const CAN_PLAY = typeof engine.timeline === 'function' && typeof engine.playSVG === 'function';

interface Props {
  live: Live;
  extras: string[];
  inkKey: string | null;
  /** CSS colour of flat ink */
  ink: string;
  pxPerMm: number;
  gapPx: number;
  /** changes to write it out again (Replay) */
  token: number;
  /** changes to jump to the end */
  finishToken: number;
}

export const ReaderSheets = memo(function ReaderSheets({ live, extras, inkKey, ink, pxPerMm, gapPx, token, finishToken }: Props) {
  const hosts = useRef<(HTMLDivElement | null)[]>([]);
  const players = useRef<any[]>([]);

  useLayoutEffect(() => {
    const { p, page, emPx } = live;
    const sc = emPx / UPM;
    const inkOpt = liveInk(inkKey);
    // page-wide stroke numbers: where each item's strokes start (letters and correction marks are written)
    const kOf: number[] = [];
    let k = 0;
    for (const it of page.items as any[]) { kOf.push(k); if (it.kind === 'glyph' || it.kind === 'mark') k += it.g.strokes.length; }
    const bySheet: number[][] = live.sheets.map(() => []);
    (page.items as any[]).forEach((it, i) => bySheet[sheetOfLine(live, it.line)].push(i));

    const tl = engine.timeline(page);
    // about 3x a real hand, the whole letter in 2.5 to 6.5 s
    const target = Math.min(6.5, Math.max(2.5, tl.duration / 3));
    const rate = tl.duration / target;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const made: any[] = [];
    live.sheets.forEach((_, s) => {
      const host = hosts.current[s];
      if (!host) return;
      const idx = bySheet[s];
      const items = idx.map((i) => page.items[i]);
      let svg: string = engine.renderSVG(p, { ...page, items }, { width: live.widthPx, emPx, ink: inkOpt, strokeIds: true });
      // this sheet's strokes keep their page-wide numbers, so the page's timeline finds them
      const off = idx.length ? kOf[idx[0]] : 0;
      svg = svg.replace(/data-k="(\d+)"/g, (_m, n) => `data-k="${Number(n) + off}"`);
      // the sheet's window onto the page
      const f = sheetFrame(live, s, inkOpt);
      const top = live.sheets[s].shiftU * sc;
      svg = svg
        .replace(/viewBox="[^"]*"/, `viewBox="0 ${top.toFixed(2)} ${live.widthPx} ${live.heightPx}"`)
        .replace(/(<svg[^>]*?)\sheight="[^"]*"/, `$1 height="${live.heightPx}"`);
      host.innerHTML = scopeIds(svg, `R${token}s${s}`);
      const el = host.querySelector('svg');
      if (!el) return;
      // the signature, underlines and page number land when the writing is done
      const fill = (f.close.match(/<g class="extras"[^>]*>/) || ['<g class="extras">'])[0];
      el.insertAdjacentHTML('beforeend', `${fill}${extras[s] ?? ''}</g>`);
      const extrasEl = el.querySelector(':scope > g.extras');
      // the signature, underlines and page number land when the pen is done
      // the ink's rough edge is off while the pen writes (lib/writing.ts liftInkEdge) and comes back when it's done
      const edge = { back: () => {} };
      const player = engine.playSVG(el, page, { emPx, timeline: tl, rate, reducedMotion: reduce, onEnd: () => { edge.back(); showExtras([{ extras: extrasEl }]); } });
      made.push({ player, extras: extrasEl, host, el, edge });
    });
    players.current = made;

    if (reduce) {
      for (const m of made) m.host.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE_OUT });
      return () => made.forEach((m) => m.player.destroy());
    }
    for (const m of made) {
      m.extras?.setAttribute('opacity', '0');
      m.edge.back = liftInkEdge(m.el);
      m.player.play();
    }
    return () => made.forEach((m) => m.player.destroy());
  }, [live, extras, inkKey, token]);

  useEffect(() => {
    if (!finishToken) return;
    for (const m of players.current) m.player.skip();
    showExtras(players.current);
  }, [finishToken]);

  return (
    <div className="flex flex-col" style={{ gap: gapPx }}>
      {live.sheets.map((_, s) => (
        <div
          key={s}
          className="relative isolate shrink-0 rounded-[1.5px]"
          style={{ width: live.paper.w * pxPerMm, height: live.paper.h * pxPerMm, boxShadow: sheetShadow(live.paper) }}
          aria-label={live.sheets.length > 1 ? `Page ${s + 1} of ${live.sheets.length}` : undefined}
          role={live.sheets.length > 1 ? 'group' : undefined}
        >
          <PaperCanvas paper={sheetPaper(live.paper, s)} sheet={s} pxPerMm={pxPerMm} className="absolute inset-0 rounded-[1.5px]" />
          <SheetMarks paper={live.paper} index={s} count={live.sheets.length} pxPerMm={pxPerMm} />
          <div ref={(el) => { hosts.current[s] = el; }} aria-hidden className="writing writing-fill pointer-events-none absolute inset-0" style={{ color: ink }} />
        </div>
      ))}
    </div>
  );
});

function showExtras(made: { extras: Element | null }[]) {
  for (const m of made) {
    const g = m.extras as SVGGElement | null;
    if (!g || g.getAttribute('opacity') !== '0') continue;
    g.removeAttribute('opacity');
    g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: EASE_OUT });
  }
}

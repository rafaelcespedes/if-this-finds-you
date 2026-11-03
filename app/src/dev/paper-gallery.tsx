// Dev only (http://127.0.0.1:5173/papers.html, not in the build): every paper and variant, whole, up close and
// as the picker's swatch, with the time each took to paint. ?guide=0 shows them as sent; ?k=4 changes the scale.
import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { makeHand } from '@engine';
import { PaperCanvas, PaperGuide, PaperMarks } from '@/components/PaperCanvas';
import { liveLayout, sheetSVG } from '@/lib/live';
import { SAMPLES } from '@/lib/samples';
import type { MarkLook } from '@/lib/paper/marks';
import { ALL_PAPERS, getPaper, paintPaper, sheetShadow, type PaperSpec } from '@/lib/papers';
import '../index.css';

const q = new URLSearchParams(location.search);
const GUIDE = q.get('guide') !== '0';
const K = parseFloat(q.get('k') || '1.5');
const ONLY = q.get('only');

/** Paint each paper once at the screen's density and time it (the cost of a cache miss on New hand). */
function timings() {
  const dpr = Math.min(3, devicePixelRatio || 1);
  const out = new Map<string, number>();
  for (const p of ALL_PAPERS) {
    const k = 3.7 * dpr;
    const c = document.createElement('canvas');
    c.width = Math.round(p.w * k);
    c.height = Math.round(p.h * k);
    const ctx = c.getContext('2d')!;
    const t0 = performance.now();
    paintPaper(ctx, { ...p, id: p.id + ':t' }, { pxPerMm: k, grainScale: dpr, holeFill: 'clear', guide: true, shadow: 'full' });
    ctx.getImageData(0, 0, 1, 1); // wait for the GPU to finish
    out.set(p.id, performance.now() - t0);
  }
  return out;
}

function Sheet({ p }: { p: PaperSpec }) {
  return (
    <div className="relative shrink-0 rounded-[1.5px]" style={{ width: p.w * K, height: p.h * K, boxShadow: sheetShadow(p) }}>
      <PaperCanvas paper={p} pxPerMm={K} className="absolute inset-0 rounded-[1.5px]" />
    </div>
  );
}

const VIEW = q.get('view') || 'sheets';

// view=marks: every badge (1-6) on a few papers, over real handwriting. ?papers=pad,laid,… &look=postmarked
const BADGE_NAMES = ['Double-ring datestamp', 'Ring and bars', 'Receipt oval', 'Registry box', 'Straight-line mark', 'Pencilled note'];
const HANDS: [string, string][] = [['quiet-heron-17', 'script'], ['maple-river-42', 'print'], ['amber-wren-9', 'spencerian'], ['salt-cedar-31', 'quebec-print']];
function Lettered({ paperId, badge, i, look }: { paperId: string; badge: number; i: number; look: MarkLook }) {
  const paper = getPaper(paperId);
  const letter = SAMPLES[(i * 7 + badge * 3) % SAMPLES.length];
  const [seed, style] = HANDS[(i + badge) % HANDS.length];
  const svg = useMemo(() => {
    const live = liveLayout(makeHand(seed, style), letter.text.slice(0, 520), paper, 1, 1, false);
    return sheetSVG(live, 0, 'currentColor', '');
  }, [letter, paper, seed, style]);
  const raw = letter as unknown as { place?: string; year?: number };
  return (
    <PaperMarks value={{ id: letter.id, hand: seed, place: raw.place ?? 'Lisbon', year: raw.year ?? 1838, number: 4 + i * 31 + badge, look, badge }}>
      <div className="relative isolate shrink-0 rounded-[1.5px]" style={{ width: paper.w * K, height: paper.h * K, boxShadow: sheetShadow(paper) }}>
        <PaperCanvas paper={paper} pxPerMm={K} className="absolute inset-0 rounded-[1.5px]" />
        <div className="writing writing-fill pointer-events-none absolute inset-0 overflow-hidden" style={{ color: '#1f2a44' }} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </PaperMarks>
  );
}
const Z = parseFloat(q.get('z') || '6');

function Gallery() {
  const ms = useMemo(() => (q.get('time') ? timings() : new Map<string, number>()), []);
  const papers = ALL_PAPERS.filter((p) => !ONLY || ONLY.split(',').some((o) => p.id.startsWith(o)));
  const label = (p: PaperSpec) => (
    <span>
      {p.name} · {p.variant} <span className="text-muted-foreground">{p.id}{ms.get(p.id) ? ` ${ms.get(p.id)!.toFixed(1)} ms` : ''}</span>
    </span>
  );
  return (
    <PaperGuide.Provider value={GUIDE}>
      <main className="min-h-screen bg-desk p-6 text-[12px] text-foreground">
        {VIEW === 'sheets' && (
          <div className="flex flex-wrap items-end gap-x-8 gap-y-10">
            {papers.map((p) => (
              <div key={p.id} className="grid gap-2">
                <Sheet p={p} />
                {label(p)}
              </div>
            ))}
          </div>
        )}
        {VIEW === 'marks' && (
          <div className="grid gap-10">
            {[1, 2, 3, 4, 5, 6].filter((b) => !q.get('badges') || q.get('badges')!.split(',').includes(String(b))).map((badge) => (
              <section key={badge} className="grid gap-3">
                <h2 className="text-[14px] font-medium">{badge}. {BADGE_NAMES[badge - 1]}</h2>
                <div className="flex flex-wrap items-start gap-8">
                  {(q.get('papers') || 'pad,laid,airmail,notebook,postcard').split(',').map((id, i) => (
                    <Lettered key={id} paperId={id} badge={badge} i={i} look={(q.get('look') as MarkLook) || 'reading-room'} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        {VIEW === 'swatches' && (
          <div className="flex flex-wrap gap-3">
            {papers.map((p) => (
              <div key={p.id} className="grid w-[86px] gap-1">
                <div className="overflow-hidden rounded-[5px] shadow-[0_0_0_0.5px_rgba(60,45,20,0.16),0_1px_2px_rgba(60,45,20,0.08)]">
                  <PaperCanvas paper={p} pxPerMm={2.1} crop={{ ...p.swatch, w: 40, h: 30 }} className="h-auto! w-full!" />
                </div>
                <span className="truncate">{p.variant}</span>
              </div>
            ))}
          </div>
        )}
        {VIEW === 'close' && (
          <div className="flex flex-wrap gap-6">
            {papers.map((p) => (
              <div key={p.id} className="grid gap-1">
                <PaperCanvas paper={p} pxPerMm={Z} crop={{ ...p.swatch, w: 40, h: 30 }} />
                {label(p)}
              </div>
            ))}
          </div>
        )}
      </main>
    </PaperGuide.Provider>
  );
}

// window.__paperCost('pad', { finish: {} }) times a paint with a patch, to see what each layer costs
(window as unknown as Record<string, unknown>).__paperCost = (id: string, patch: Partial<PaperSpec> = {}, guide = true, n = 5) => {
  const dpr = Math.min(3, devicePixelRatio || 1);
  const base = ALL_PAPERS.find((p) => p.id === id)!;
  const k = 3.7 * dpr;
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = { ...base, ...patch };
    const c = document.createElement('canvas');
    c.width = Math.round(p.w * k);
    c.height = Math.round(p.h * k);
    const ctx = c.getContext('2d')!;
    const t0 = performance.now();
    paintPaper(ctx, p, { pxPerMm: k, grainScale: dpr, holeFill: 'clear', guide, shadow: 'full' });
    ctx.getImageData(0, 0, 1, 1);
    times.push(performance.now() - t0);
  }
  return times.map((t) => +t.toFixed(1));
};

// one root, even when the module hot-reloads
const host = document.getElementById('root') as HTMLElement & { __root?: ReturnType<typeof createRoot> };
host.__root ??= createRoot(host);
host.__root.render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);

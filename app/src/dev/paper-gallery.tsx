// Dev only (http://127.0.0.1:5173/papers.html, not in the build): every paper and variant, whole, up close and
// as the picker's swatch, with the time each took to paint. ?guide=0 shows them as sent; ?k=4 changes the scale.
import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { PaperCanvas, PaperGuide } from '@/components/PaperCanvas';
import { ALL_PAPERS, paintPaper, sheetShadow, type PaperSpec } from '@/lib/papers';
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

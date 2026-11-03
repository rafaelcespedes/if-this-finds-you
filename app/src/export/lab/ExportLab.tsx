// Export lab (/export-lab.html): pick a letter, a hand, a shape and a format, watch the clip, download it.
// The preview draws the very scene the export records (previewScene), at screen size, in real time.
// URL: ?sample=stockdell-1838&seed=quiet-heron-17&style=script&paper=laid&pen=fountain&ink=sepia
//      &aspect=4:5&framing=lines&format=mp4&fps=30
// For automation, window.__exportLab has { state(), exportNow(), last }.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Pause, Play, RotateCcw, Shuffle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DEFAULT_STATE, type NoteState } from '@/lib/state';
import { SAMPLES, sampleById, sampleCredit } from '@/lib/samples';
import { PAPERS, type PaperId } from '@/lib/papers';
import { PEN_CHOICES } from '@/lib/pens';
import { AUTO_INK, INK_FAMILIES } from '@/lib/inks';
import { rollLook } from '@/lib/roll';
import { describeHand, writerName } from '@/lib/hands';
import { styleNames, makeHand, withOverrides } from '@engine';
import { effective } from '@/lib/params';
import { saveBlob, cn } from '@/lib/utils';
import { exportSupport, exportWriting, previewScene, type Aspect, type ExportFormat, type ExportResult, type Framing, type Scene } from '../index';

interface Config {
  sample: string;
  look: Pick<NoteState, 'seed' | 'style' | 'pen' | 'penSize' | 'ink' | 'paper' | 'size' | 'offsets'>;
  aspect: Aspect;
  framing: Framing;
  format: ExportFormat;
  fps: number;
  credit: boolean;
  wordmark: boolean;
}

const ASPECTS: { id: Aspect; label: string; hint: string }[] = [
  { id: '4:5', label: '4:5', hint: 'Feed' },
  { id: '1:1', label: '1:1', hint: 'Square' },
  { id: '16:9', label: '16:9', hint: 'Wide' },
  { id: '9:16', label: '9:16', hint: 'Stories' },
];
const FORMATS: { id: ExportFormat; label: string }[] = [
  { id: 'mp4', label: 'MP4' },
  { id: 'webm', label: 'WebM' },
  { id: 'gif', label: 'GIF' },
];
const FRAMINGS: { id: Framing; label: string; hint: string }[] = [
  { id: 'lines', label: 'First lines', hint: 'Close, near a real hand’s speed' },
  { id: 'page', label: 'Whole letter', hint: 'The first sheet, sped up to fit' },
];

function initial(): Config {
  const q = new URLSearchParams(location.search);
  const sample = sampleById(q.get('sample'))?.id ?? SAMPLES.find((s) => s.id === 'stockdell-1838')?.id ?? SAMPLES[0].id;
  return {
    sample,
    look: {
      seed: q.get('seed') ?? DEFAULT_STATE.seed,
      style: q.get('style') ?? DEFAULT_STATE.style,
      pen: q.get('pen') ?? DEFAULT_STATE.pen,
      penSize: DEFAULT_STATE.penSize,
      ink: q.get('ink') ?? DEFAULT_STATE.ink,
      paper: (q.get('paper') as PaperId) ?? DEFAULT_STATE.paper,
      size: Number(q.get('size')) || 1,
      offsets: {},
    },
    aspect: (q.get('aspect') as Aspect) ?? '4:5',
    framing: (q.get('framing') as Framing) ?? 'lines',
    format: (q.get('format') as ExportFormat) ?? 'mp4',
    fps: Number(q.get('fps')) || 30,
    credit: q.get('credit') !== '0',
    wordmark: q.get('wordmark') !== '0',
  };
}

const noteOf = (c: Config): NoteState => {
  const s = sampleById(c.sample)!;
  return { ...DEFAULT_STATE, ...c.look, text: s.text, sample: s.id, marks: [], signed: false, reader: false, inkLog: null, replyTo: null, occasion: null };
};

const mb = (n: number) => (n / 1048576).toFixed(n < 1048576 ? 2 : 1) + ' MB';

export function ExportLab() {
  const [cfg, setCfg] = useState<Config>(initial);
  const set = (patch: Partial<Config>) => setCfg((c) => ({ ...c, ...patch }));
  const setLook = (patch: Partial<Config['look']>) => setCfg((c) => ({ ...c, look: { ...c.look, ...patch } }));
  const state = useMemo(() => noteOf(cfg), [cfg]);
  const [support, setSupport] = useState<{ mp4: boolean; webm: boolean; gif: boolean } | null>(null);
  useEffect(() => { exportSupport().then(setSupport); }, []);

  // keep the URL in step, so a view can be shared and reloaded
  useEffect(() => {
    const q = new URLSearchParams({
      sample: cfg.sample, seed: cfg.look.seed, style: cfg.look.style, paper: cfg.look.paper, pen: cfg.look.pen, ink: cfg.look.ink,
      aspect: cfg.aspect, framing: cfg.framing, format: cfg.format, fps: String(cfg.fps),
    });
    if (cfg.look.size !== 1) q.set('size', cfg.look.size.toFixed(2));
    if (!cfg.credit) q.set('credit', '0');
    if (!cfg.wordmark) q.set('wordmark', '0');
    history.replaceState(null, '', '?' + q.toString().replace(/%3A/g, ':'));
  }, [cfg]);

  const hand = useMemo(() => {
    const natural = makeHand(state.seed, state.style);
    return withOverrides(natural, effective(natural, state).overrides);
  }, [state]);
  const sample = sampleById(cfg.sample)!;

  // ---------- preview ----------
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [building, setBuilding] = useState(false);
  const [box, setBox] = useState({ w: 480, h: 600 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ratio = { '4:5': 4 / 5, '1:1': 1, '16:9': 16 / 9, '9:16': 9 / 16 }[cfg.aspect];
  const cssW = Math.max(120, Math.min(box.w, box.h * ratio));
  const cssH = cssW / ratio;
  const opts = useMemo(
    () => ({ format: cfg.format, aspect: cfg.aspect, framing: cfg.framing, fps: cfg.format === 'gif' ? undefined : cfg.fps, branding: { credit: cfg.credit, wordmark: cfg.wordmark } }),
    [cfg.format, cfg.aspect, cfg.framing, cfg.fps, cfg.credit, cfg.wordmark],
  );
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const previewW = Math.round(cssW * dpr);
  useEffect(() => {
    let live = true;
    setBuilding(true);
    const id = setTimeout(() => {
      previewScene(state, { ...opts, previewWidth: previewW })
        .then((s) => { if (live) { setScene(s); setBuilding(false); } })
        .catch((e) => { console.error(e); if (live) setBuilding(false); });
    }, 120);
    return () => { live = false; clearTimeout(id); };
  }, [state, opts, previewW]);

  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const clock = useRef({ start: 0, from: 0 });
  useEffect(() => {
    if (!scene) return;
    const c = canvasRef.current!;
    c.width = scene.width;
    c.height = scene.height;
    clock.current = { start: performance.now(), from: 0 };
    setPlaying(true);
    setTime(0);
  }, [scene]);
  useEffect(() => {
    if (!scene) return;
    const ctx = canvasRef.current!.getContext('2d', { alpha: false })!;
    if (!playing) { scene.draw(ctx, time); return; }
    let raf = 0;
    const loop = () => {
      let v = clock.current.from + (performance.now() - clock.current.start) / 1000;
      if (v >= scene.seconds) {
        if (cfg.format === 'gif') { clock.current = { start: performance.now(), from: 0 }; v = 0; }
        else { v = scene.seconds; scene.draw(ctx, v); setTime(v); setPlaying(false); return; }
      }
      scene.draw(ctx, v);
      setTime(v);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scene, playing, cfg.format]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = () => {
    if (!scene) return;
    const from = time >= scene.seconds - 0.01 ? 0 : time;
    clock.current = { start: performance.now(), from };
    setPlaying(true);
  };
  const scrub = (v: number) => { setPlaying(false); setTime(v); };

  // ---------- export ----------
  const [busy, setBusy] = useState<{ fraction: number; label: string } | null>(null);
  const [result, setResult] = useState<(ExportResult & { url: string }) | null>(null);
  const abort = useRef<AbortController | null>(null);
  const runExport = useCallback(async (over?: Partial<typeof opts>) => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setBusy({ fraction: 0, label: 'Getting the page ready' });
    let shown = 0;
    try {
      const res = await exportWriting(state, {
        ...opts, ...over, signal: ac.signal,
        // about ten updates a second: re-rendering the panel every frame would slow the export down
        onProgress: (p) => {
          const now = performance.now();
          if (p.phase === 'render' && p.frame !== p.frames && now - shown < 100) return;
          shown = now;
          setBusy({ fraction: p.fraction, label: p.phase === 'render' ? `Writing frame ${p.frame} of ${p.frames}` : p.phase === 'done' ? 'Done' : 'Getting the page ready' });
        },
      });
      setResult((old) => { if (old) URL.revokeObjectURL(old.url); return { ...res, url: URL.createObjectURL(res.blob) }; });
      (window as unknown as { __exportLab: Record<string, unknown> }).__exportLab.last = res;
      console.info('[export]', res.filename, mb(res.blob.size), `${res.width}x${res.height}`, `${res.frames} frames`, `${(res.ms.total / 1000).toFixed(1)} s`, res.codec, res.pace);
      return res;
    } catch (e) {
      if ((e as Error).name !== 'AbortError') { console.error(e); alert((e as Error).message); }
      return null;
    } finally {
      setBusy(null);
    }
  }, [state, opts]);

  useEffect(() => {
    (window as unknown as { __exportLab: Record<string, unknown> }).__exportLab = {
      ...((window as unknown as { __exportLab?: Record<string, unknown> }).__exportLab ?? {}),
      state: () => state, exportNow: runExport, scene,
    };
  }, [state, runExport, scene]);

  const newHand = () => {
    const look = rollLook(state, { variety: 60, locked: new Set() });
    setLook({
      seed: look.seed ?? state.seed, style: look.style ?? state.style, pen: look.pen ?? state.pen, penSize: look.penSize ?? state.penSize,
      ink: look.ink ?? state.ink, paper: look.paper ?? state.paper, size: look.size ?? state.size, offsets: look.offsets ?? {},
    });
  };
  const anotherLetter = () => {
    const pool = SAMPLES.filter((s) => s.id !== cfg.sample);
    set({ sample: pool[Math.floor(Math.random() * pool.length)].id });
  };

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-border bg-panel px-5 py-5 lg:w-[340px] lg:border-r">
        <header>
          <h1 className="text-[15px] font-semibold tracking-[-0.01em]">Export lab</h1>
          <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">A letter writing itself out, as a video or GIF to share.</p>
        </header>

        <Field label="Letter">
          <select className={selectCls} value={cfg.sample} onChange={(e) => set({ sample: e.target.value })}>
            {SAMPLES.map((s) => (
              <option key={s.id} value={s.id}>{s.author}, {s.year}{s.title ? ` · ${s.title}` : ''}</option>
            ))}
          </select>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="truncate text-[12px] text-muted-foreground">{sampleCredit(sample)}</p>
            <Button variant="ghost" size="sm" onClick={anotherLetter}><Shuffle aria-hidden /> Another</Button>
          </div>
        </Field>

        <Field label="Hand">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{writerName(cfg.look.seed)}</p>
              <p className="truncate text-[12px] text-muted-foreground">{describeHand(hand)}</p>
            </div>
            <Button variant="outline" size="sm" onClick={newHand}><Sparkles aria-hidden /> New hand</Button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select className={selectCls} value={cfg.look.style} onChange={(e) => setLook({ style: e.target.value })} aria-label="Style">
              {styleNames().map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className={selectCls} value={cfg.look.seed} onChange={(e) => setLook({ seed: e.target.value })} aria-label="Seed" spellCheck={false} />
          </div>
        </Field>

        <div className="grid grid-cols-3 gap-2">
          <Field label="Paper">
            <select className={selectCls} value={cfg.look.paper} onChange={(e) => setLook({ paper: e.target.value as PaperId })}>
              {PAPERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Pen">
            <select className={selectCls} value={cfg.look.pen} onChange={(e) => setLook({ pen: e.target.value })}>
              {PEN_CHOICES.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Ink">
            <select className={selectCls} value={cfg.look.ink} onChange={(e) => setLook({ ink: e.target.value })}>
              <option value={AUTO_INK}>Pen’s own</option>
              {INK_FAMILIES.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Shape">
          <Segmented items={ASPECTS.map((a) => ({ id: a.id, label: a.label, sub: a.hint }))} value={cfg.aspect} onChange={(aspect) => set({ aspect })} />
        </Field>
        <Field label="Framing">
          <Segmented items={FRAMINGS.map((f) => ({ id: f.id, label: f.label }))} value={cfg.framing} onChange={(framing) => set({ framing })} />
          <p className="mt-1.5 text-[12px] text-muted-foreground">{FRAMINGS.find((f) => f.id === cfg.framing)?.hint}</p>
        </Field>
        <Field label="Format">
          <Segmented
            items={FORMATS.map((f) => ({ id: f.id, label: f.label, disabled: support ? !support[f.id] : false }))}
            value={cfg.format}
            onChange={(format) => set({ format })}
          />
          {cfg.format !== 'gif' && (
            <div className="mt-2">
              <Segmented items={[{ id: '30', label: '30 fps' }, { id: '60', label: '60 fps' }]} value={String(cfg.fps)} onChange={(v) => set({ fps: Number(v) })} />
            </div>
          )}
        </Field>
        <Field label="Branding">
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={cfg.credit} onChange={(e) => set({ credit: e.target.checked })} /> Credit line</label>
          <label className="mt-1 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={cfg.wordmark} onChange={(e) => set({ wordmark: e.target.checked })} /> “If This Finds You”</label>
        </Field>

        <div className="mt-auto flex flex-col gap-2 pt-2">
          {busy ? (
            <div className="flex flex-col gap-1.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${Math.round(busy.fraction * 100)}%` }} />
              </div>
              <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                <span>{busy.label}</span>
                <button className="underline-offset-2 hover:underline" onClick={() => abort.current?.abort()}>Cancel</button>
              </div>
            </div>
          ) : (
            <Button size="lg" onClick={() => runExport()}>Make the {FORMATS.find((f) => f.id === cfg.format)?.label}</Button>
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-4 p-4 lg:flex-row lg:p-6">
        <section className="flex min-h-[60vh] min-w-0 flex-1 flex-col items-center gap-3">
          <div ref={boxRef} className="relative flex w-full flex-1 items-center justify-center">
            <canvas
              ref={canvasRef}
              className="block rounded-[3px] bg-[var(--desk)] shadow-[0_1px_2px_rgba(60,45,20,0.08),0_12px_32px_-12px_rgba(60,45,20,0.28)]"
              style={{ width: cssW, height: cssH }}
              aria-label="Preview of the clip"
            />
            {building && <span className="absolute top-3 right-3 rounded-full bg-panel/90 px-2.5 py-1 text-[11.5px] text-muted-foreground">Writing…</span>}
          </div>
          <div className="flex w-full max-w-[560px] items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => (playing ? setPlaying(false) : play())} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { setTime(0); clock.current = { start: performance.now(), from: 0 }; setPlaying(true); }} aria-label="From the start">
              <RotateCcw aria-hidden />
            </Button>
            <input
              type="range" min={0} max={scene?.seconds ?? 1} step={0.01} value={Math.min(time, scene?.seconds ?? 1)}
              onChange={(e) => scrub(Number(e.target.value))} className="flex-1 accent-[var(--ink)]" aria-label="Scrub"
            />
            <span className="w-[84px] text-right text-[12px] tabular-nums text-muted-foreground">
              {time.toFixed(1)} / {(scene?.seconds ?? 0).toFixed(1)} s
            </span>
          </div>
          {scene && (
            <p className="text-[12px] text-muted-foreground">
              {scene.pace.lines} {scene.pace.lines === 1 ? 'line' : 'lines'} · writing {scene.pace.writeSeconds.toFixed(1)} s · up to {scene.pace.topSpeed.toFixed(1)}× a real hand
            </p>
          )}
        </section>

        {result && (
          <section className="flex w-full shrink-0 flex-col gap-3 lg:w-[300px]">
            <h2 className="text-[13px] font-semibold">Your file</h2>
            <div className="overflow-hidden rounded-md border border-border bg-[#fdfcf9]">
              {result.mime.startsWith('image/') ? (
                <img src={result.url} alt="The exported GIF" className="block w-full" />
              ) : (
                <video src={result.url} className="block w-full" controls autoPlay muted loop playsInline />
              )}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
              <dt className="text-muted-foreground">File</dt><dd className="truncate">{result.filename}</dd>
              <dt className="text-muted-foreground">Size</dt><dd>{mb(result.blob.size)}</dd>
              <dt className="text-muted-foreground">Frame</dt><dd>{result.width} × {result.height}, {result.fps} fps, {result.seconds.toFixed(1)} s</dd>
              <dt className="text-muted-foreground">Made in</dt><dd>{(result.ms.total / 1000).toFixed(1)} s</dd>
              <dt className="text-muted-foreground">Codec</dt><dd>{result.codec}</dd>
            </dl>
            <Button variant="outline" onClick={() => saveBlob(result.blob, result.filename)}><Download aria-hidden /> Download</Button>
          </section>
        )}
      </main>
    </div>
  );
}

const selectCls = 'h-9 w-full min-w-0 rounded-md border border-input bg-[#fdfcf9] px-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[11.5px] font-medium tracking-[0.02em] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ items, value, onChange }: { items: { id: T; label: string; sub?: string; disabled?: boolean }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 rounded-lg bg-muted p-1" role="radiogroup">
      {items.map((it) => (
        <button
          key={it.id}
          role="radio"
          aria-checked={value === it.id}
          disabled={it.disabled}
          onClick={() => onChange(it.id)}
          className={cn(
            'flex min-w-0 flex-1 flex-col items-center rounded-md px-1.5 py-1.5 text-[12.5px] font-medium transition-[background-color,box-shadow] duration-150 disabled:opacity-40',
            value === it.id ? 'bg-[#fdfcf9] shadow-[0_1px_2px_rgba(60,45,20,0.12)]' : 'text-muted-foreground hover-device:hover:text-foreground',
          )}
        >
          {it.label}
          {it.sub && <span className="text-[10.5px] font-normal text-muted-foreground">{it.sub}</span>}
        </button>
      ))}
    </div>
  );
}

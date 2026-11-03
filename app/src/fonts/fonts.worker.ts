// The Fonts view's worker: chooses the hands of a set (sample.ts), names them, builds their tool links, and writes
// each row's specimen line. The page sends what it wants on screen first; nothing here touches the DOM.
//
// Two kinds of specimen:
//   ink on paper: the engine's live renderer (ink as density, the pen's own texture) on a strip of the hand's paper,
//                 sent as a WebP image
//   plain:        the hand's outlines filled flat in the text colour, as the downloaded font draws them, sent as a
//                 small SVG (crisp at any size, and it takes the page's colour)
import '@/archive/worker-shim';
import * as E from '@engine';
import { layout, makeHand, styleNames, getStyle, UPM, withOverrides, type Hand } from '@engine';
import { CONTROLS, naturalValue, type PenSize } from '@/lib/controls';
import { PARAM_KEYS, MODELLED_INK } from '@/lib/engine-features';
import { writerName } from '@/lib/hands';
import { inkColor } from '@/lib/inks';
import { getPaper } from '@/lib/papers';
import { DEFAULT_STATE, encodeState } from '@/lib/state';
import { clamp } from '@/lib/utils';
import { PEN_LABEL, STYLE_LABEL, penWords, type Catalogue } from './filters';
import { BOX, boxHeight, type FontEntry, type FromWorker, type RenderSpec, type ToWorker } from './protocol';
import { neatOpts, sampleSet, type Look, type Picked } from './sample';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as unknown as Record<string, any>;
const post = (m: FromWorker, transfer?: Transferable[]) => (self as unknown as Worker).postMessage(m, transfer ?? []);

// ---------- what the engine has ----------

function catalogue(): Catalogue {
  const styles = (styleNames() as string[]).map((id) => {
    const st = getStyle(id) as any;
    const family = (st?.family === 'script' ? 'script' : 'print') as 'print' | 'script';
    const label = STYLE_LABEL[id] ?? String(st?.label ?? id).replace(/\s+\d{3,4}(?:\s*[–-]\s*\d{2,4})?$/, '');
    return { id, family, label };
  });
  const lookPens = (engine.LOOK_PENS as string[] | undefined) ?? Object.keys(PEN_LABEL);
  return { styles, pens: lookPens.filter((p) => p !== 'auto') };
}
const CAT = catalogue();

// ---------- a hand as a row ----------

/** The short tradition on a row ("Spencerian"); the everyday styles say only their family. */
const ATTR: Record<string, string> = { print: 'Everyday', script: 'Everyday', 'quebec-print': 'Québec school', 'adult-fr-2023': 'French everyday' };
const attrStyle = (style: string) => ATTR[style] ?? CAT.styles.find((s) => s.id === style)?.label ?? style;

/** The look's values as the tool's sliders store them: offsets from this writer's natural value. */
function offsetsOf(look: Look, natural: Hand) {
  const out: Record<string, number> = {};
  for (const c of CONTROLS) {
    const v = look.params[c.key];
    if (v == null || c.app) continue;
    const off = clamp(v, c.min, c.max) - naturalValue(c, natural);
    if (Math.abs(off) > (c.max - c.min) * 0.002) out[c.key] = +off.toFixed(3);
  }
  return out;
}

function entryOf(p: Picked, neatOnly: boolean): FontEntry {
  const { look, hand, profile } = p;
  const sheet = getPaper(look.paper);
  const overrides: Record<string, number | string> = {};
  const values: Record<string, number> = { ...look.params, ...(look.inkAge != null ? { inkAge: look.inkAge } : {}), ...(look.inkVariation != null ? { inkVariation: look.inkVariation } : {}) };
  for (const [k, v] of Object.entries(values)) if (PARAM_KEYS.has(k) && k !== 'size') overrides[k] = v;
  if (PARAM_KEYS.has('pen') && look.pen) overrides.pen = look.pen;
  if (PARAM_KEYS.has('tip') && look.tip) overrides.tip = look.tip;
  if (MODELLED_INK && look.ink) overrides.ink = look.ink;
  // the sampler's size is an x-height in mm; the tool's is relative to the paper's comfortable one (as the library)
  const size = look.size > 0 ? +Math.min(1.28, Math.max(0.84, look.size / sheet.xh)).toFixed(3) : 1;
  const tool = encodeState({
    ...DEFAULT_STATE, seed: look.seed, style: look.style, pen: look.pen, penSize: (look.tip || 'medium') as PenSize, ink: look.ink,
    paper: sheet.id, size, offsets: offsetsOf(look, hand), neatOnly, text: '', sample: null, inkLog: null, marks: [], replyTo: null, signed: false, reader: false,
  });
  return {
    id: `${look.seed}~${look.style}~${look.pen}~${look.tip}~${look.ink}`,
    seed: look.seed, style: look.style, family: look.family, neatOnly,
    pen: look.pen, tip: look.tip, ink: look.ink, paper: sheet.id, params: values, overrides,
    name: writerName(look.seed),
    attrs: [look.family === 'script' ? 'Joined' : 'Print', attrStyle(look.style), penWords(look.pen)],
    traits: { neatness: +profile.neatness.toFixed(2), lean: Math.round(profile.lean), legibility: +(look.legibility ?? 1).toFixed(2) },
    tool,
    tint: sheet.tint ?? '#fffdf8',
    inkColor: inkColor(look.ink),
  };
}

// ---------- specimens ----------

const hands = new Map<string, Hand>();
function handFor(e: FontEntry) {
  const key = `${e.id}|${e.neatOnly ? 1 : 0}`;
  let p = hands.get(key);
  if (!p) {
    p = withOverrides(makeHand(e.seed, e.style, neatOpts(e.neatOnly)), e.overrides);
    hands.set(key, p);
    // a few dozen hands at most (a set and its neighbours)
    if (hands.size > 64) hands.delete(hands.keys().next().value!);
  }
  return p;
}

/** The specimen's items: the text laid out in the hand, each line moved to its place in the box, cut to fit. */
function specimenItems(p: Hand, spec: RenderSpec) {
  const U = UPM;
  const em = spec.emPx;
  const pad = BOX.left * U;
  const widthU = (spec.width / em) * U;
  const one = spec.lines <= 1;
  const text = spec.text.replace(/\s+/g, ' ').trim().slice(0, 160) || ' ';
  const page = layout(p, text, { maxWidth: one ? 60 * U : Math.max(3 * U, widthU - 2 * pad), firstBaseline: BOX.above * U, lineHeight: BOX.pitch * U });
  // each line from the left edge, its baseline on the box's (the writer's drift inside a line stays)
  const byLine = new Map<number, any[]>();
  for (const it of page.items as any[]) {
    if (!byLine.has(it.line)) byLine.set(it.line, []);
    byLine.get(it.line)!.push(it);
  }
  const lines = [...byLine.keys()].sort((a, b) => a - b);
  const items: any[] = [];
  let right = 0;
  let clipped = lines.length > spec.lines;
  lines.slice(0, spec.lines).forEach((ln, i) => {
    const row = byLine.get(ln)!;
    const left = Math.min(...row.map((it) => it.x));
    const ys = row.filter((it) => it.kind === 'glyph').map((it) => it.y);
    const meanY = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : (BOX.above + i * BOX.pitch) * U;
    const dx = pad - left;
    const dy = (BOX.above + i * BOX.pitch) * U - meanY;
    for (const it of row) {
      const x = it.x + dx;
      const adv = it.kind === 'glyph' ? it.g.advance : (it.advance ?? 560);
      // a long line runs off the edge: keep what can show
      if (x > widthU) { clipped = true; continue; }
      if (x + adv > widthU) clipped = true;
      items.push({ ...it, x, y: it.y + dy });
      right = Math.max(right, x + adv);
    }
  });
  return { items, right, clipped };
}

async function render(job: number, e: FontEntry, spec: RenderSpec) {
  const t0 = performance.now();
  const p = handFor(e);
  const { items, right, clipped } = specimenItems(p, spec);
  const U = UPM;
  const em = spec.emPx;
  const H = boxHeight(em, spec.lines);
  const heightU = (H / em) * U;
  if (spec.mode === 'plain') {
    // only as wide as the writing (it's transparent)
    const W = Math.max(1, Math.min(spec.width, Math.ceil(((right + BOX.left * U) * em) / U)));
    const svg = (engine.renderSVG(p, { items, height: heightU }, { width: W, emPx: em, ink: 'currentColor' }) as string)
      .replace(/<defs>[\s\S]*?<\/defs>/, '')
      .replace(/\s(?:filter|fill-opacity|stroke-opacity|opacity)="[^"]*"/g, '')
      .replace(/\swidth="[\d.]+" height="[\d.]+"/, ' preserveAspectRatio="xMinYMin meet"');
    post({ type: 'rendered', job, svg, width: W, height: H, clipped, ms: performance.now() - t0 });
    return;
  }
  // ink on paper: a strip of the hand's paper as wide as the row, the ink laid on it by the live renderer
  const W = Math.max(1, Math.round(spec.width));
  const canvas = new OffscreenCanvas(1, 1);
  engine.renderCanvas(canvas, p, { items, height: heightU, lineHeight: BOX.pitch * U }, {
    width: W, height: H, emPx: em, dpr: spec.dpr, style: false,
    paper: { color: e.tint, grain: 1 },
    ink: MODELLED_INK ? e.ink : e.inkColor,
  });
  let blob: Blob;
  try { blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 }); } catch { blob = await canvas.convertToBlob(); }
  post({ type: 'rendered', job, blob, width: W, height: H, clipped, ms: performance.now() - t0 });
}

// ---------- messages ----------

let currentSet = 0;

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  if (m.type === 'hello') {
    post({ type: 'ready', catalogue: CAT, sampler: 'app' });
    // compile the ink renderer's shaders while the page lays out its rows
    try {
      engine.warmCanvas?.();
      const p = makeHand('warm-up-1', 'script');
      engine.renderCanvas(new OffscreenCanvas(64, 32), p, layout(p, 'Dear', { maxWidth: 4000, firstBaseline: 800, lineHeight: 1200 }), { width: 64, height: 32, emPx: 24, dpr: 1, style: false, paper: { transparent: true } });
    } catch { /* the first specimen does it */ }
    return;
  }
  if (m.type === 'set') {
    currentSet = m.req;
    const t0 = performance.now();
    try {
      const res = await sampleSet({
        setSeed: m.setSeed, filters: m.filters, count: m.count, neatOnly: m.neatOnly, catalogue: CAT,
        alive: () => currentSet === m.req,
        nameOf: (look) => writerName(look.seed),
        emit: (picked, index) => post({ type: 'entry', req: m.req, index, entry: entryOf(picked, m.neatOnly) }),
      });
      if (currentSet === m.req) post({ type: 'set-done', req: m.req, found: res.found, exhausted: res.exhausted, ms: performance.now() - t0 });
    } catch (err) {
      post({ type: 'failed', req: m.req, message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (m.type === 'render') {
    try {
      await render(m.job, m.entry, m.spec);
    } catch (err) {
      post({ type: 'failed', job: m.job, message: err instanceof Error ? err.message : String(err) });
    }
  }
};


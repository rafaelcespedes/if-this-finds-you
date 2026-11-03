// The Fonts view's worker: draws a set of hands with the engine's sampler (sampleLooks, docs/FILTERS.md), names them,
// builds their tool links, and writes each row's specimen. Nothing here touches the DOM.
//
// Two kinds of specimen (principle 7, "honest about limits": a font cycles a few versions of each letter, the live
// page varies without end, so the default shows what you download):
//   As a font: the generated font itself, built for the characters the row shows (buildFont with `chars`: the same
//              glyphs, alternates, joins and kerning as the download), sent as an .otf the page sets the line in
//   Live hand: the engine's live renderer (ink as density, the pen's own texture) on a strip of the hand's paper,
//              sent as a WebP image
// And the download itself: the whole font package (.otf, .ttf, licence, credits) for the same hand.
import '@/archive/worker-shim';
import * as E from '@engine';
import { layout, makeHand, styleNames, getStyle, UPM, withOverrides, type Hand } from '@engine';
import { CONTROLS, naturalValue, type PenSize } from '@/lib/controls';
import { PARAM_KEYS, MODELLED_INK } from '@/lib/engine-features';
import { writerName } from '@/lib/hands';
import { branded } from '@/lib/brand';
import { handSources } from '@/lib/credits';
import { inkColor } from '@/lib/inks';
import { getPaper } from '@/lib/papers';
import { SAMPLES, shortAuthor } from '@/lib/samples';
import { DEFAULT_STATE, encodeState } from '@/lib/state';
import { clamp } from '@/lib/utils';
import { PEN_LABEL, STYLE_LABEL, penWords, type Catalogue, type Constraints } from './filters';
import { BOX, boxHeight, type FontEntry, type FromWorker, type HandRecord, type LiveSpec, type Opening, type ToWorker } from './protocol';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as unknown as Record<string, any>;
const post = (m: FromWorker, transfer?: Transferable[]) => (self as unknown as Worker).postMessage(m, transfer ?? []);
const neatOpts = (neatOnly: boolean) => ({ neatOnly });
/** makeHand with the tradition pinned (a set may draw a tradition the seed wouldn't pick on its own) */
const handIn = makeHand as unknown as (seed: string, req: { style: string }, opts?: { neatOnly: boolean }) => Hand;

// ---------- what the engine has ----------

function catalogue(): Catalogue {
  const styles = (styleNames() as string[]).map((id) => {
    const st = getStyle(id) as any;
    const family = (st?.family === 'script' ? 'script' : 'print') as 'print' | 'script';
    const label = STYLE_LABEL[id] ?? String(st?.label ?? id).replace(/\s+\d{3,4}(?:\s*[–-]\s*\d{2,4})?$/, '');
    return { id, family, label };
  });
  const filter = (key: string) => (engine.LOOK_FILTERS as any[] | undefined)?.find((f) => f.key === key);
  const pens = ((filter('pen')?.values?.() as string[] | undefined) ?? Object.keys(PEN_LABEL)).filter((p) => p !== 'auto');
  const schoolings = (filter('schooling')?.values?.() as string[] | undefined) ?? [];
  return { styles, pens, schoolings };
}
const CAT = catalogue();

// ---------- a hand as a row ----------

const ATTR: Record<string, string> = { print: 'Everyday', script: 'Everyday', 'quebec-print': 'Québec school', 'adult-fr-2023': 'French everyday' };
const traditionOf = (style: string) => ATTR[style] ?? CAT.styles.find((s) => s.id === style)?.label ?? style;

/** The hand exactly as the row, the font and the tool draw it: the sampler's values, its pen and ink. */
function handOf(look: { seed: string; style: string; pen?: string; tip?: string; ink?: string; params: Record<string, number> }, neatOnly: boolean) {
  const over: Record<string, number | string> = { ...look.params };
  if (PARAM_KEYS.has('pen') && look.pen) over.pen = look.pen;
  if (PARAM_KEYS.has('tip') && look.tip) over.tip = look.tip;
  if (MODELLED_INK && look.ink) over.ink = look.ink;
  return withOverrides(handIn(look.seed, { style: look.style }, neatOpts(neatOnly)), over);
}

/** The look's values as the tool's sliders store them: offsets from this writer's natural value. */
function offsetsOf(params: Record<string, number>, natural: Hand) {
  const out: Record<string, number> = {};
  for (const c of CONTROLS) {
    const v = params[c.key];
    if (v == null || c.app) continue;
    const off = clamp(v, c.min, c.max) - naturalValue(c, natural);
    if (Math.abs(off) > (c.max - c.min) * 0.002) out[c.key] = +off.toFixed(3);
  }
  return out;
}

function entryOf(look: any, neatOnly: boolean): FontEntry {
  const sheet = getPaper(look.paper);
  const params: Record<string, number> = { ...look.params };
  if (look.inkAge != null) params.inkAge = look.inkAge;
  if (look.inkVariation != null) params.inkVariation = look.inkVariation;
  const natural = handIn(look.seed, { style: look.style }, neatOpts(neatOnly));
  // the sampler's size is an x-height in mm; the tool's is relative to the paper's comfortable one (as the library)
  const size = look.size > 0 ? +Math.min(1.28, Math.max(0.84, look.size / sheet.xh)).toFixed(3) : 1;
  const tool = encodeState({
    ...DEFAULT_STATE, seed: look.seed, style: look.style, pen: look.pen, penSize: (look.tip || 'medium') as PenSize, ink: look.ink,
    paper: sheet.id, size, offsets: offsetsOf(params, natural), neatOnly, text: '', sample: null, inkLog: null, marks: [], replyTo: null, signed: false, reader: false,
  });
  let schooled = '';
  try { schooled = engine.describeTraditions?.(handOf(look, neatOnly)) ?? ''; } catch { /* fine */ }
  return {
    id: `${look.seed}~${look.style}~${look.pen}~${look.tip}~${look.ink}`,
    seed: look.seed, style: look.style, family: look.family === 'script' ? 'script' : 'print', neatOnly,
    pen: look.pen, tip: look.tip, ink: look.ink, paper: sheet.id, params,
    name: writerName(look.seed),
    tradition: traditionOf(look.style),
    kind: look.label ?? '',
    schooled,
    matches: look.matches !== false,
    tool,
    tint: sheet.tint ?? '#fffdf8',
    inkColor: inkColor(look.ink),
  };
}

const hands = new Map<string, Hand>();
function handFor(e: FontEntry) {
  const key = `${e.id}|${e.neatOnly ? 1 : 0}`;
  let p = hands.get(key);
  if (!p) {
    p = handOf(e, e.neatOnly);
    hands.set(key, p);
    if (hands.size > 96) hands.delete(hands.keys().next().value!);
  }
  return p;
}

// ---------- the opening line: a real letter from the library, a different one for each set ----------

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const OPENINGS = SAMPLES.filter((s) => s.text && s.text.length > 40 && !(s as any).olderHandsOnly);
function openingFor(setSeed: string): Opening | null {
  if (!OPENINGS.length) return null;
  const s = OPENINGS[hash('opening:' + setSeed) % OPENINGS.length] as any;
  // the greeting and the first sentence, as far as a line shows (about 90 letters), else cut between words
  const flat = String(s.text).replace(/\s*\n+\s*/g, ' ').replace(/\s+/g, ' ').replace(/^…\s*/, '').trim();
  let text = flat;
  const stop = [...flat.slice(0, 92).matchAll(/[.!?](?=\s|$)/g)].map((m) => m.index!).filter((i) => i >= 24).pop();
  if (stop != null) text = flat.slice(0, stop + 1);
  else if (flat.length > 80) text = flat.slice(0, flat.lastIndexOf(' ', 80)).replace(/[,;:—–-]+$/, '') + '…';
  return { text, id: s.id, by: shortAuthor(s.author ?? ''), year: s.year };
}

// ---------- sets: pages of the engine's sampleSet, kept so "Show more" and Back are instant ----------

interface Page { looks: any[]; note: string | null; matched: number }
const sets = new Map<string, Page[]>();
let currentSet = 0;
function pageOf(setSeed: string, page: number, count: number, C: Constraints): Page {
  const key = `${setSeed}|${count}|${JSON.stringify(C)}`;
  let pages = sets.get(key);
  if (!pages) { pages = []; sets.set(key, pages); if (sets.size > 24) sets.delete(sets.keys().next().value!); }
  // the same pages sampleSet({ offset }) gives: each later page keeps away from the earlier ones, no repeats
  for (let k = pages.length; k <= page; k++) {
    const shown = pages.flatMap((p) => p.looks);
    const res = engine.sampleLooks(k ? `${setSeed}#${k}` : setSeed, count, C, { shown });
    pages.push({ looks: res.looks, note: res.note ?? null, matched: res.matched ?? res.looks.length });
  }
  return pages[page];
}

// ---------- specimens ----------

async function liveSpecimen(job: number, e: FontEntry, spec: LiveSpec) {
  const t0 = performance.now();
  const p = handFor(e);
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
      if (x > widthU) { clipped = true; continue; }
      items.push({ ...it, x, y: it.y + dy });
    }
  });
  const H = boxHeight(em, spec.lines);
  const W = Math.max(1, Math.round(spec.width));
  const canvas = new OffscreenCanvas(1, 1);
  engine.renderCanvas(canvas, p, { items, height: (H / em) * U, lineHeight: BOX.pitch * U }, {
    width: W, height: H, emPx: em, dpr: spec.dpr, style: false, paper: { color: e.tint, grain: 1 }, ink: MODELLED_INK ? e.ink : e.inkColor,
  });
  let blob: Blob;
  try { blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 }); } catch { blob = await canvas.convertToBlob(); }
  post({ type: 'live', job, blob, width: W, height: H, clipped, ms: performance.now() - t0 });
}

// clipper merges each letter's overlapping strokes into clean outlines, as in the download (without it, strokes
// wound against each other leave holes in a CFF font: a joined e reads as c)
let clipper: Promise<unknown> | null = null;
const loadClipper = () => (clipper ??= import('clipper-lib').then((m) => (m as { default?: unknown }).default ?? m));

/** The font for a row: built only for the characters it shows (and the space), by the download's every rule. */
async function fontSpecimen(job: number, e: FontEntry, chars: string) {
  const t0 = performance.now();
  const list = [...new Set([...chars, ' '])].filter((c) => c !== '\n');
  const built = engine.buildFont(null, handFor(e), { chars: list, ttf: false, name: e.name, clipper: await loadClipper() });
  const otf = built.otf as Uint8Array;
  const buf = otf.buffer.slice(otf.byteOffset, otf.byteOffset + otf.byteLength) as ArrayBuffer;
  post({ type: 'font', job, otf: buf, chars: list.join(''), ms: performance.now() - t0 }, [buf]);
}

async function fontPackage(job: number, e: FontEntry) {
  const pkg = await engine.buildFontPackage(handFor(e), { name: e.name, clipper: await loadClipper() });
  const zip = (pkg.zip as Uint8Array).buffer.slice(pkg.zip.byteOffset, pkg.zip.byteOffset + pkg.zip.byteLength) as ArrayBuffer;
  post({ type: 'package', job, zip, filename: pkg.filename }, [zip]);
}

// ---------- a hand's record ----------

const a = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
function recordOf(e: FontEntry): HandRecord {
  const p = handFor(e);
  const st = getStyle(e.style) as any;
  const t = st?.tradition ?? {};
  let taught = '';
  try { taught = engine.describeTraditions?.(p) ?? ''; } catch { /* fine */ }
  const paper = getPaper(e.paper).name;
  const pen = `${PEN_LABEL[e.pen] ?? e.pen}${e.tip && e.tip !== 'medium' ? `, ${e.tip} tip` : ''}`;
  // a reader's credit: the product's name, without the engine's notes to its own docs
  const sources = handSources(p).map((s) => ({ name: s.name, credit: branded(s.credit).replace(/\s*\([^)]*\.md[^)]*\)/g, ''), url: s.url }));
  const school = e.style === 'print' || e.style === 'script' ? `an everyday ${e.family === 'script' ? 'joined' : 'print'} hand` : `${a(String(t.name ?? e.tradition))} ${t.name ?? e.tradition}`;
  const about = `Drawn by the engine from ${school}, with ${a(penWords(e.pen))} ${penWords(e.pen)}, on ${a(paper)} ${paper.toLowerCase()}. ${e.name} is a fictional writer.`;
  const core = (engine.GF_LATIN_CORE as string[] | string | undefined) ?? [];
  const chars = (Array.isArray(core) ? core.join('') : String(core)).replace(/\s/g, '');
  return { taught, tradition: { name: String(t.name ?? e.tradition), region: t.region, era: t.era }, pen, paper, sources, chars, about };
}

// ---------- messages ----------

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  try {
    switch (m.type) {
      case 'hello':
        post({ type: 'ready', catalogue: CAT });
        void loadClipper();
        // compile the ink renderer's shaders while the page lays out its rows
        try {
          engine.warmCanvas?.();
          const p = makeHand('warm-up-1', 'script');
          engine.renderCanvas(new OffscreenCanvas(64, 32), p, layout(p, 'Dear', { maxWidth: 4000, firstBaseline: 800, lineHeight: 1200 }), { width: 64, height: 32, emPx: 24, dpr: 1, style: false, paper: { transparent: true } });
        } catch { /* the first specimen does it */ }
        return;
      case 'set': {
        currentSet = m.req;
        const t0 = performance.now();
        const res = pageOf(m.setSeed, m.page, m.count, { ...m.constraints, neatOnly: m.neatOnly });
        if (currentSet !== m.req) return;
        post({
          type: 'set', req: m.req, entries: res.looks.map((l) => entryOf(l, m.neatOnly)), note: res.note,
          exhausted: res.matched < m.count, matched: res.matched, opening: openingFor(m.setSeed), ms: performance.now() - t0,
        });
        return;
      }
      case 'font': await fontSpecimen(m.job, m.entry, m.chars); return;
      case 'live': await liveSpecimen(m.job, m.entry, m.spec); return;
      case 'package': await fontPackage(m.job, m.entry); return;
      case 'record': post({ type: 'record', job: m.job, record: recordOf(m.entry) }); return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (m.type === 'set') post({ type: 'failed', req: m.req, message });
    else if (m.type !== 'hello') post({ type: 'failed', job: m.job, message });
  }
};

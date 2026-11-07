// Every interaction of the writing page, as a walkthrough video (1080 x 1080): the ink demo's look (InkDemo.tsx: the
// site's paper, the keyboard on its glass plate, the bar naming each moment, the wet-ink timer), two scenes typed
// through the site's own InkSession (scripts/ink-every.ts, src/ink-live.ts): a letter, then a new note with titles,
// headings and lists. Each frame replays the ink log as it stood (replay is deterministic) and draws each stroke as
// the site's drawn pen did (createPen, recorded); the letters the pen hasn't reached show faint, as on the site.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AbsoluteFill, Sequence, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { getPaper, paintPaper, type PaperSpec } from '@/lib/papers';
import { inkOpts } from '@/lib/ink';
import scene1 from './data/ink-every-1.json';
import scene2 from './data/ink-every-2.json';
import { HAND, MEASURE, PAPER } from './setup';
import { engine, drawInk, UPM, clamp, easeInOutQuint, easeOutQuint } from './draw';
import { keyboard, PLATE, S0 } from './keyboard';

/* eslint-disable @typescript-eslint/no-explicit-any */
const C = { ink: '#1e2733', muted: '#575146', faint: '#8b857a' };
const GREY = (a: number) => `rgba(30, 39, 51, ${a})`;
const BAR_FILL = (() => {
  const tint = String((getPaper(PAPER) as any).tint ?? '#f8f6f0');
  const m = tint.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  const [r, g, b] = m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : [248, 246, 240];
  const mix = (c: number, d: number) => Math.round(c * 0.94 + d * 0.06);
  return `rgb(${mix(r, 30)}, ${mix(g, 39)}, ${mix(b, 51)})`;
})();

/** each moment's caption, in the order the video shows them */
const CAPTIONS: Record<string, string> = {
  ahead: 'Typing runs ahead of the pen, in grey',
  clean: 'Backspace before the pen gets there: gone',
  strike: 'Once it’s ink, Backspace crosses it out',
  again: 'Backspace again: crossed out harder',
  hold: 'Hold it: a scribble, then inked out',
  replace: 'Select a word and type: the new one goes above',
  insert: 'Click between two words and type: a caret',
  carry: 'Retype the last words: the pen carries on',
  weight: '⌘B with nothing selected: pressed harder',
  lean: '⌘I: what you type next leans in',
  over: 'Select a letter and retype: written over',
  underline: '⌘U: underlined by hand',
  double: '⌘U again: a double underline',
  retrace: '⌘B on words: gone over again',
  highlight: '⇧⌘E: a highlighter, under the ink',
  fast: 'Type in a burst: the hand hurries',
  slow: 'Type slowly: it takes more care',
  wet: 'Fresh ink stays wet for a few seconds',
  undo: '⌘Z lifts the ink while it’s wet',
  drying: 'Leave it, and the ink dries',
  dry: 'Dry ink stays: ⌘Z can’t lift it',
  strike2: 'Cross it out instead',
  stet: '⌘Z on a dry crossing-out: stet, and it stands',
  ps: '⌘↩: a P.S.',
  note: '⌥⌘N: a new note',
  title: '# and a space: a title',
  bullet: '- and a space: the writer’s own bullet',
  endlist: 'Return on an empty item ends the list',
  heading: '## and a space: a heading',
  number: '1. and a space: numbers',
  check: '[] and a space: a checklist',
  tick: 'Click a box: the pen ticks it',
};

// ---------- the hand, the paper, the replay ----------
const p = engine.withOverrides(engine.makeHand(HAND.seed, { style: HAND.style }, { neatOnly: true }), { ...HAND.params, pen: HAND.pen, tip: HAND.tip, ink: HAND.ink });
const paper0 = getPaper(PAPER);
const paper = { ...paper0, text: { ...paper0.text, right: paper0.text.left + (paper0.text.right - paper0.text.left) * MEASURE } } as PaperSpec;
const IO = inkOpts(p, paper, 1, 1);
type Rec = typeof scene1 & Record<string, any>;
export const SCENES = [scene1, scene2] as unknown as Rec[];
/** the scenes back to back (frames), a short pause between */
export const GAP = 0;
export const sceneFrames = (r: Rec) => Math.round(r.seconds * r.fps);
export const totalFrames = () => SCENES.reduce((a, r) => a + sceneFrames(r), 0) + GAP * (SCENES.length - 1);

const sheets = new WeakMap<Rec, Map<number, any>>();
function sheetAt(R: Rec, s: number) {
  let m = sheets.get(R);
  if (!m) sheets.set(R, (m = new Map()));
  let sh = m.get(s);
  if (!sh) {
    const ids = R.states[s].ids as number[];
    const doc = { ...engine.newInkDoc({ seed: HAND.seed, style: HAND.style, salt: R.salt }), log: ids.map((i) => R.events[i]) };
    sh = engine.replay(p, doc, IO.layout);
    m.set(s, sh);
  }
  return sh;
}
const frameAt = (R: Rec, t: number) => R.frames[Math.min(R.frames.length - 1, Math.max(0, Math.round(t * R.fps)))];

/** the top of the hint bar (just above the keyboard's plate), px */
const BAR_GAP = 22;
const KB = (S: number, SH: number) => keyboard(S, SH, { full: true, scale: 0.88 });
const barTop = (S: number, SH: number) => KB(S, SH).plate.y - (72 + BAR_GAP) * (Math.min(S, SH) / S0);

// the camera: what the scene writes, fitted to the window above the bar, no bigger than the column across the frame.
// It follows the writing a few lines at a time, as the page scrolls on the site (nothing written moves on the paper),
// and pulls back to the whole sheet at the end. Each key: from a moment (a caption's, or seconds before the scene's
// end), the lines (of the scene's last page) to show, or all of them.
type CamKey = { at: number | string; lines: [number, number] | 'all' };
const CAMS: CamKey[][] = [
  [{ at: 0, lines: [0, 2] }, { at: 'weight', lines: [0, 4] }, { at: 'fast', lines: [3, 8] }, { at: -3.2, lines: 'all' }],
  [{ at: 0, lines: [0, 2] }, { at: 'heading', lines: [3, 7] }, { at: -2.4, lines: 'all' }],
];
const PAN = 1.1; // s
function cameraFit(R: Rec, S: number, SH: number, lines: [number, number] | 'all') {
  const k0 = Math.min(S, SH) / S0;
  const PAPER_H = barTop(S, SH) / k0 - 20;
  const u = IO.u;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const it of sheetAt(R, R.states.length - 1).page.items as any[]) {
    if (!it.box || (lines !== 'all' && (it.line < lines[0] || it.line > lines[1]))) continue;
    x0 = Math.min(x0, it.box[0]); x1 = Math.max(x1, it.box[2]); y0 = Math.min(y0, it.box[1]); y1 = Math.max(y1, it.box[3]);
  }
  const colMm = paper.text.right - paper.text.left;
  const wMm = (x1 - x0) / u, hMm = (y1 - y0) / u;
  const k = Math.min((0.88 * S) / colMm, (0.9 * S) / wMm, ((PAPER_H - 110) * k0) / hMm);
  // the column where it is on the sheet when it fills the frame; centred when it doesn't
  const xc = (S - wMm * k) / 2 - (x0 / u) * k;
  const x = Math.min(xc, Math.max(0.06 * S - paper.text.left * k, S - 0.04 * S - (x1 / u) * k));
  // (never above the sheet's top edge)
  const y = Math.min(0, (PAPER_H * k0 - hMm * k) / 2 - (y0 / u) * k - 8 * k0);
  return { k, x, y, u };
}
function cameraKeys(R: Rec, i: number, S: number, SH: number) {
  return (CAMS[i] ?? [{ at: 0, lines: 'all' }]).map((c) => {
    const at = typeof c.at === 'number' ? (c.at < 0 ? R.seconds + c.at : c.at) : (R.notes as any[]).find((n) => n.note === c.at)!.t - 0.3;
    return { at, cam: cameraFit(R, S, SH, c.lines) };
  });
}
function cameraAt(keys: { at: number; cam: { k: number; x: number; y: number; u: number } }[], t: number) {
  let cam = keys[0].cam;
  for (let j = 1; j < keys.length; j++) {
    if (t < keys[j].at) break;
    const f = easeInOutQuint(clamp((t - keys[j].at) / PAN, 0, 1));
    const a = cam, b = keys[j].cam;
    // (the scale eased in proportion, the position with it, so the zoom feels even)
    const k = a.k * Math.pow(b.k / a.k, f);
    const w = b.k === a.k ? f : (k - a.k) / (b.k - a.k);
    cam = { k, x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w, u: a.u };
  }
  return cam;
}

/** a recorded key as the keys it presses */
function keysOf(key: string): string[] {
  if (key === 'click' || key === 'select') return [];
  if (key.includes('+')) return key.split('+').map((k) => (k.length === 1 ? k.toLowerCase() : k));
  if (key === '#') return ['Shift', '3'];
  if (/^[A-Z]$/.test(key)) return ['Shift', key.toLowerCase()];
  return [key];
}

const PRESS = 0.11;
/** the whole walkthrough: the scenes in turn */
export const InkEvery: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill>
      {SCENES.map((R, i) => {
        const n = sceneFrames(R);
        const el = (
          <Sequence key={i} from={from} durationInFrames={n}>
            <Scene R={R} i={i} />
          </Sequence>
        );
        from += n + GAP;
        return el;
      })}
      <UiFont />
    </AbsoluteFill>
  );
};

const Scene: React.FC<{ R: Rec; i: number }> = ({ R, i }) => {
  const first = i === 0;
  const frame = useCurrentFrame();
  const { width: S, height: SH, fps } = useVideoConfig();
  const k0 = Math.min(S, SH) / S0;
  const winH = barTop(S, SH) - 20 * k0;
  const t = frame / fps;
  const F = frameAt(R, t);
  const keys = useMemo(() => cameraKeys(R, i, S, SH), [R, i, S, SH]);
  const cam = cameraAt(keys, t);
  const kb = useMemo(() => KB(S, SH), [S, SH]);
  const BAR = kb.plate;
  const ref = useRef<HTMLCanvasElement>(null);
  const sheetCanvas = useMemo(() => {
    // painted once, at the closest the camera comes, and wider than its own A5 so no edge shows at the sides when the
    // camera pulls back
    const kMax = Math.max(...keys.map((c) => c.cam.k));
    const ext = Math.max(0, ...keys.map(({ cam: c }) => Math.ceil(Math.max(c.x, S - (c.x + paper.w * c.k)) / c.k) + 2));
    const wide = { ...paper, w: paper.w + 2 * ext } as PaperSpec;
    const c = document.createElement('canvas');
    c.width = Math.ceil(wide.w * kMax); c.height = Math.ceil(paper.h * kMax);
    paintPaper(c.getContext('2d')!, wide, { pxPerMm: kMax, grainScale: kMax / 4, holeFill: 'clear', shadow: 'none' });
    return { c, ext, kMax };
  }, [keys, S]);
  const sc = cam.k / cam.u;
  const shiftIt = (it: any) => ({ ...it, x: it.x + cam.x / sc, y: it.y + cam.y / sc, box: it.box && [it.box[0] + cam.x / sc, it.box[1] + cam.y / sc, it.box[2] + cam.x / sc, it.box[3] + cam.y / sc] });

  useLayoutEffect(() => {
    const h = delayRender(`ink ${frame}`);
    drawFrame();
    continueRender(h);
  }, [frame]); // eslint-disable-line react-hooks/exhaustive-deps

  function drawFrame() {
    const ctx = ref.current!.getContext('2d', { alpha: false })!;
    ctx.fillStyle = (paper as any).tint ?? '#f8f6f0';
    ctx.fillRect(0, 0, S, SH);
    // a new note comes in from below (⌥⌘N), the old one going up
    ctx.save();
    const enter = first ? 0 : 1 - easeOutQuint(clamp(t / 0.6, 0, 1));
    ctx.translate(0, enter * SH * 0.6);
    ctx.globalAlpha = 1 - enter;
    ctx.drawImage(sheetCanvas.c, cam.x - sheetCanvas.ext * cam.k, cam.y, sheetCanvas.c.width * (cam.k / sheetCanvas.kMax), sheetCanvas.c.height * (cam.k / sheetCanvas.kMax));
    ctx.globalAlpha = 1;
    const emPx = sc * UPM;
    const sh = sheetAt(R, F.s);
    // a selection (dragged across, held until its command), as the system draws one
    for (const sel of R.selections as any[]) {
      if (t < sel.t || t > sel.until + 0.25) continue;
      const frac = clamp((t - sel.t) / 0.6, 0, 1);
      const o = t > sel.until ? 1 - (t - sel.until) / 0.25 : 1;
      ctx.fillStyle = `rgba(44, 99, 214, ${0.16 * o})`;
      for (const b of idBoxes(R, sel.t, sel.ids, cam, easeInOutQuint(frac))) { ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 6 * k0); ctx.fill(); }
    }
    // the highlighter's swipes, under the ink (multiplied), each fading in as it's made
    for (const hl of (sh.page.highlights ?? []) as any[]) {
      const at = R.evTime[R.states[F.s].ids[hl.ev]] ?? 0;
      const a = clamp((t - at) / 0.35, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      const path = (pts: number[][]) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * sc + cam.x, y * sc + cam.y) : ctx.moveTo(x * sc + cam.x, y * sc + cam.y))); ctx.closePath(); };
      ctx.globalAlpha = 0.5 * a; ctx.fillStyle = hl.fill; path(hl.shape); ctx.fill();
      ctx.restore();
      if (hl.streaks?.length) { ctx.save(); ctx.globalAlpha = 0.22 * a; ctx.fillStyle = '#fff'; for (const s of hl.streaks) { path(s); ctx.fill(); } ctx.restore(); }
    }
    // the page's letters and marks: inked as the drawn pen drew them; handed to the pen but not drawn yet, faint
    const items = ((sh.page.items as any[]) ?? []).filter((it) => it.g && (it.kind === 'glyph' || it.kind === 'mark'));
    const timing = (it: any) => R.strokes[it.key] as [number, number][] | undefined;
    const progress = (it: any, si: number) => {
      const tm = timing(it);
      if (!tm || !tm[si]) return 0;
      const [a, b] = tm[si];
      return b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a), 0, 1);
    };
    const started = items.filter((it) => progress(it, 0) > 0);
    const waiting = items.filter((it) => it.kind === 'glyph' && !(timing(it) && t >= timing(it)![timing(it)!.length - 1][1]));
    if (waiting.length) drawInk(ctx, p, waiting.map(shiftIt), { emPx, width: S, height: winH, ink: '#6f6f78', alpha: 0.26 });
    const shifted = started.map(shiftIt);
    const orig = new Map(shifted.map((x, i) => [x, started[i]]));
    drawInk(ctx, p, shifted, { emPx, width: S, height: winH, reveal: (it: any, si: number) => progress(orig.get(it) ?? it, si) });
    // what an undo just lifted, fading off the page
    const lift = (R.lifts as any[]).find((l) => t >= l.t && t < l.t + 0.4);
    if (lift && F.s > 0) {
      const sBefore = R.states.findIndex((st: any) => st.t >= lift.t) - 1;
      const before = sheetAt(R, Math.max(0, sBefore)).page.items as any[];
      const keep = new Set((sh.page.items as any[]).map((it) => it.key));
      const gone = before.filter((it) => it.g && !keep.has(it.key)).map(shiftIt);
      if (gone.length) drawInk(ctx, p, gone, { emPx, width: S, height: winH, alpha: 1 - (t - lift.t) / 0.4 });
    }
    // the letters typed and not yet handed to the pen: faint graphite where they'll be written (the site's "thoughts")
    let draftItems: any[] = [];
    if (F.v.tail) {
      try {
        const d = engine.draftPage(sh, F.v, { haste: F.haste || 0, ...(F.style ? { style: F.style } : {}) });
        draftItems = ((d?.items ?? []) as any[]).filter((it) => it.kind === 'glyph' || it.kind === 'mark');
      } catch { /* none */ }
      if (draftItems.length) drawInk(ctx, p, draftItems.map(shiftIt), { emPx, width: S, height: winH, ink: '#6f6f78', alpha: 0.26 });
    }
    // the typing cursor at the end: after the last thought letter, or after the pen's last letter
    if (F.cur == null) {
      const glyphs = (sh.page.items as any[]).filter((it) => it.kind === 'glyph' && it.box && !it.above);
      // (the pen's last letter in the line of writing: the newest id, words added above the line aside)
      const lastInk = glyphs.reduce((a: any, b: any) => (!a || (b.id ?? -1) > (a.id ?? -1) ? b : a), null);
      const draftGlyphs = draftItems.filter((it) => it.kind === 'glyph' && it.box);
      const ref2 = draftGlyphs.length ? draftGlyphs[draftGlyphs.length - 1] : lastInk;
      const lastKey = (R.keys as any[]).filter((kk) => kk.t <= t).reduce((a: number, kk: any) => Math.max(a, kk.t), -10);
      const blink = t - lastKey < 0.5 || Math.floor(t * 2.2) % 2 === 0;
      const xh = paper.xh * cam.k;
      ctx.fillStyle = C.ink;
      if (ref2 && blink && !/\n$/.test(String(F.v.tail ?? ''))) {
        const b = shiftIt(ref2).box;
        ctx.fillRect(b[2] * sc + 4 * k0, shiftIt(ref2).y * sc - xh * 1.9, 2 * k0, xh * 2.4);
      } else if (!ref2 && blink) {
        ctx.fillRect(cam.x + paper.text.left * cam.k, cam.y + IO.lines.first * cam.k - xh * 1.9, 2 * k0, xh * 2.4);
      }
    }
    ctx.restore();
    // lines the camera has moved past fade off at the top, as a page scrolls
    const fade = ctx.createLinearGradient(0, 0, 0, 64 * k0);
    const tint = String((paper as any).tint ?? '#f8f6f0');
    fade.addColorStop(0, tint); fade.addColorStop(1, tint + '00');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, S, 64 * k0);
  }

  // ---------- the keyboard: keys down, and the ghost fingertips ----------
  const down = new Map<string, number>();
  const presses = (R.keys as any[]).flatMap((kk) => keysOf(kk.key).map((id, j, all) => ({ id, t: kk.t + (j < all.length - 1 ? 0 : all.length > 1 ? 0.03 : 0), hold: kk.dur ?? (all.length > 1 && j < all.length - 1 ? 0.24 : PRESS) })));
  for (const pr of presses) {
    const u = (t - pr.t) / pr.hold;
    if (u >= -0.3 && u <= 1.6) down.set(pr.id, Math.max(down.get(pr.id) ?? 0, u < 0 ? 0 : u <= 1 ? 1 : 1 - (u - 1) / 0.6));
  }
  const KEYS = kb.keys;
  const keyAt = (id: string) => KEYS.find((kk) => kk.id === id);
  const tips: { x: number; y: number; o: number; s: number }[] = [];
  for (const side of ['L', 'R'] as const) {
    const mine = presses.filter((pr) => { const kk = keyAt(pr.id); return kk && ((kk.x + kk.w / 2 < S / 2) === (side === 'L')); });
    const i = mine.findIndex((pr) => pr.t > t);
    const prev = i === -1 ? mine[mine.length - 1] : mine[i - 1];
    const nxt = i === -1 ? null : mine[i];
    const kp = prev && keyAt(prev.id), kn = nxt && keyAt(nxt.id);
    let x = 0, y = 0, o = 0, s = 1;
    if (kp && kn && nxt!.t - prev!.t < 0.8) {
      const u = easeInOutQuint(clamp((t - prev!.t - 0.04) / Math.max(0.06, nxt!.t - prev!.t - 0.06), 0, 1));
      x = kp.x + kp.w / 2 + (kn.x + kn.w / 2 - kp.x - kp.w / 2) * u;
      y = kp.y + kp.h / 2 + (kn.y + kn.h / 2 - kp.y - kp.h / 2) * u;
      o = 1;
    } else if (kn && nxt!.t - t < 0.25) {
      x = kn.x + kn.w / 2; y = kn.y + kn.h / 2; o = 1 - (nxt!.t - t) / 0.25;
    } else if (kp && t - prev!.t < 0.45 + (prev!.hold > PRESS ? prev!.hold : 0)) {
      x = kp.x + kp.w / 2; y = kp.y + kp.h / 2; o = 1 - clamp((t - prev!.t - (prev!.hold > PRESS ? prev!.hold : 0)) / 0.45, 0, 1);
    }
    if (kp && t - prev!.t < Math.max(PRESS, prev!.hold)) s = 0.86;
    if (o > 0.01) tips.push({ x, y, o, s });
  }

  // ---------- the pointer: clicks into the text, drags across words, a click on a box ----------
  const pointer = (() => {
    const from = { x: S * 0.82, y: winH * 0.95 };
    for (const sel of R.selections as any[]) {
      if (t < sel.t - 0.6 || t > sel.t + 1.4) continue;
      const boxes = idBoxes(R, sel.t, sel.ids, cam);
      if (!boxes.length) return null;
      const a = boxes[0], b = boxes[boxes.length - 1];
      const start = { x: a.x + 4, y: a.y + a.h * 0.6 }, end = { x: b.x + b.w - 4, y: b.y + b.h * 0.6 };
      if (t < sel.t) {
        const u = easeOutQuint(clamp((t - (sel.t - 0.6)) / 0.55, 0, 1));
        return { x: from.x + (start.x - from.x) * u, y: from.y + (start.y - from.y) * u, press: 1, o: clamp((t - (sel.t - 0.6)) / 0.15, 0, 1) };
      }
      const u = easeInOutQuint(clamp((t - sel.t) / 0.6, 0, 1));
      return { x: start.x + (end.x - start.x) * u, y: start.y + (end.y - start.y) * u, press: t < sel.t + 0.6 ? 0.9 : 1, o: t > sel.t + 1.0 ? 1 - (t - sel.t - 1.0) / 0.4 : 1 };
    }
    for (const c of R.clicks as any[]) {
      if (t < c.t - 0.75 || t > c.t + 0.6) continue;
      const target = clickTarget(R, c, cam);
      if (!target) return null;
      const u = easeOutQuint(clamp((t - (c.t - 0.75)) / 0.7, 0, 1));
      const o = t > c.t + 0.3 ? 1 - (t - c.t - 0.3) / 0.3 : clamp((t - (c.t - 0.75)) / 0.15, 0, 1);
      return { x: from.x + (target.x - from.x) * u, y: from.y + (target.y - from.y) * u, press: t >= c.t && t < c.t + 0.12 ? 0.86 : 1, o };
    }
    return null;
  })();

  // ---------- the bar: the caption, and the wet-ink timer ----------
  const wetFor = (R.wetMs ?? 3000) / 1000;
  const wet = F.wet != null;
  const left = F.wet == null ? 0 : F.wet < 0 ? wetFor : F.wet / 1000;
  const showChip = first ? t > 1.2 : true;
  const toast = (R.toasts as any[]).find((x) => t >= x.t && t < x.t + 2.2);
  const LEAD = 0.5;
  const note = [...(R.notes as any[])].reverse().find((n) => n.t <= t + LEAD && CAPTIONS[n.note]);
  const capO = note ? clamp((t - note.t + LEAD) / 0.25, 0, 1) : 0;
  const H = 72 * k0, Rr = PLATE.radius * k0, top = BAR.y - (72 + BAR_GAP) * k0;
  const TW = 262 * k0, G = 18 * k0;
  const capL = { x: BAR.x, w: BAR.w - TW - G };
  const chip = { x: BAR.x + BAR.w - TW, w: TW };
  const M = 24 * k0, TEXT = 21;

  return (
    <AbsoluteFill style={{ background: (paper as any).tint ?? '#f8f6f0' }}>
      <canvas ref={ref} width={S} height={SH} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <svg width={BAR.w + 2 * M} height={H + 2 * M} style={{ position: 'absolute', left: BAR.x - M, top: top - M, overflow: 'visible' }}>
        <defs>
          <filter id="goo" x="-10%" y="-40%" width="120%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={7 * k0} result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
          </filter>
        </defs>
        <g filter="url(#goo)" fill={BAR_FILL}>
          <rect x={M} y={M} width={capL.w} height={H} rx={Rr} />
          <rect x={M + BAR.w - TW} y={M} width={TW} height={H} rx={Rr} />
          <ellipse cx={M + capL.w + G / 2} cy={M + H / 2} rx={G / 2 + 10 * k0} ry={14 * k0} />
        </g>
      </svg>
      {showChip && wet && (() => {
        const inset = 4 * k0, w = (chip.w - 2 * inset) * (left / wetFor), h = H - 2 * inset;
        return <div style={{ position: 'absolute', left: chip.x + inset, top: top + inset, width: w, height: h, borderRadius: Math.min(Rr - inset, w / 2), background: GREY(0.055) }} />;
      })()}
      <div style={{ position: 'absolute', left: capL.x, top, width: capL.w, height: H, display: 'flex', alignItems: 'center', padding: `0 ${30 * k0}px`, fontFamily: '"RR Schibsted", system-ui, sans-serif' }}>
        <div style={{ fontSize: TEXT * k0, fontWeight: 400, color: C.ink, opacity: capO, whiteSpace: 'nowrap' }}>{note ? CAPTIONS[note.note] : ''}</div>
      </div>
      <div style={{ position: 'absolute', left: chip.x, top, width: chip.w, height: H, display: 'flex', alignItems: 'center', gap: 14 * k0, padding: `0 ${20 * k0}px 0 ${21 * k0}px`, fontFamily: '"RR Schibsted", system-ui, sans-serif', opacity: showChip ? 1 : 0 }}>
        <svg width={34 * k0} height={34 * k0} viewBox="0 0 34 34">
          <circle cx={17} cy={17} r={13} fill="none" stroke={wet ? C.ink : C.faint} strokeOpacity={0.16} strokeWidth={2.6} />
          <circle cx={17} cy={17} r={13} fill="none" stroke={C.ink} strokeWidth={2.6} strokeLinecap="round" opacity={wet ? 1 : 0}
            strokeDasharray={`${2 * Math.PI * 13}`} strokeDashoffset={`${2 * Math.PI * 13 * (wet ? 1 - left / wetFor : 1)}`} transform="rotate(-90 17 17)" />
          {wet && <line x1={17} y1={17} x2={17 + 7.5 * Math.sin(2 * Math.PI * (1 - left / wetFor))} y2={17 - 7.5 * Math.cos(2 * Math.PI * (1 - left / wetFor))} stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" />}
          <circle cx={17} cy={17} r={1.6} fill={wet ? C.ink : C.faint} />
        </svg>
        <div style={{ textAlign: 'left', lineHeight: 1 }}>
          <div style={{ fontSize: TEXT * k0, fontWeight: 400, color: wet ? C.ink : C.faint, fontVariantNumeric: 'tabular-nums' }}>{wet ? `${left.toFixed(1)} s` : 'dry'}</div>
          <div style={{ fontSize: 13.5 * k0, fontWeight: 400, color: wet ? C.muted : C.faint, marginTop: 1 * k0 }}>{wet ? 'wet ink · undo works' : 'undo can’t lift it'}</div>
        </div>
      </div>
      <div style={{
        position: 'absolute', left: kb.plate.x, top: kb.plate.y, width: kb.plate.w, height: kb.plate.h, borderRadius: PLATE.radius * k0,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.62), rgba(255,255,255,0.38))',
        boxShadow: `0 ${18 * k0}px ${44 * k0}px rgba(30, 39, 51, 0.13), 0 ${2 * k0}px ${6 * k0}px rgba(30, 39, 51, 0.06), inset 0 ${k0}px 0 rgba(255,255,255,0.9), inset 0 0 0 ${k0}px rgba(255,255,255,0.55)`,
        backdropFilter: `blur(${16 * k0}px)`,
      }} />
      {KEYS.map((kk) => {
        const d = down.get(kk.id) ?? 0;
        return (
          <div key={kk.id} style={{
            position: 'absolute', left: kk.x, top: kk.y + d * 2 * k0, width: kk.w, height: kk.h, borderRadius: 11 * k0,
            background: `rgba(${255 - 34 * d}, ${255 - 32 * d}, ${255 - 28 * d}, ${0.78 + 0.12 * d})`,
            boxShadow: `0 ${(1 - d) * 2 * k0}px ${(1 - d) * 3 * k0}px rgba(30, 39, 51, ${0.12 * (1 - d)}), inset 0 0 0 ${k0}px rgba(30, 39, 51, 0.06)`,
            display: 'flex', alignItems: kk.small ? 'flex-end' : 'center', justifyContent: kk.align === 'left' ? 'flex-start' : kk.align === 'right' ? 'flex-end' : 'center',
            padding: kk.small ? `0 ${10 * k0}px ${8 * k0}px` : 0,
            fontFamily: '"RR Schibsted", system-ui, sans-serif', fontSize: (kk.small ? 14 : kk.id === 'Meta' || kk.id === 'Alt' ? 22 : 21) * k0, color: d > 0.3 ? C.ink : C.muted, fontWeight: 450,
          }}>{kk.label}</div>
        );
      })}
      {tips.map((tp, i) => (
        <div key={i} style={{ position: 'absolute', left: tp.x - 25 * k0, top: tp.y - 25 * k0, width: 50 * k0, height: 50 * k0, borderRadius: '50%', background: 'radial-gradient(circle, rgba(30,39,51,0.20) 0%, rgba(30,39,51,0.10) 55%, rgba(30,39,51,0) 72%)', opacity: tp.o, transform: `scale(${tp.s})` }} />
      ))}
      {pointer && (
        <svg width={22 * k0} height={30 * k0} viewBox="0 0 22 30" style={{ position: 'absolute', left: pointer.x - 2 * k0, top: pointer.y - 2 * k0, opacity: pointer.o, transform: `scale(${pointer.press})`, transformOrigin: '2px 2px', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.25))' }}>
          <path d="M2 2 L2 24 L7.5 18.8 L11.2 27.4 L14.6 26 L10.9 17.5 L18.5 17.5 Z" fill="#111" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
        </svg>
      )}
      {toast && (
        <div style={{ position: 'absolute', left: '50%', top: winH - 108 * k0, transform: `translateX(-50%) translateY(${(1 - clamp((t - toast.t) / 0.25, 0, 1)) * 16 * k0}px)`, opacity: Math.min(clamp((t - toast.t) / 0.2, 0, 1), clamp((toast.t + 2.2 - t) / 0.3, 0, 1)), background: '#fbfaf7', borderRadius: 12 * k0, boxShadow: `0 ${8 * k0}px ${28 * k0}px rgba(30,39,51,0.14), 0 0 0 ${k0}px rgba(30,39,51,0.08)`, padding: `${16 * k0}px ${22 * k0}px`, fontFamily: '"RR Schibsted", system-ui, sans-serif', minWidth: 420 * k0 }}>
          <div style={{ fontSize: 21 * k0, fontWeight: 600, color: C.ink }}>{toast.title}</div>
          <div style={{ fontSize: 18 * k0, color: C.muted, marginTop: 3 * k0 }}>{toast.body}</div>
        </div>
      )}
    </AbsoluteFill>
  );
};

/** the glyphs with these ids at a moment (a selection's words, a click's letter) */
function glyphsWith(R: Rec, t: number, runs: [number, number][]) {
  const sh = sheetAt(R, frameAt(R, t).s);
  const inRun = (id: number) => runs.some(([a, b]) => id >= a && id <= b);
  return ((sh.page.items as any[]) ?? []).filter((it) => it.kind === 'glyph' && it.box && it.id != null && inRun(it.id)).sort((a, b) => a.id - b.id);
}
/** the boxes a selection covers: one per line, grown from the first letter as the pointer drags (`frac`) */
function idBoxes(R: Rec, t: number, runs: [number, number][], cam: { k: number; x: number; y: number; u: number }, frac = 1) {
  const gs0 = glyphsWith(R, t, runs);
  const n = Math.max(1, Math.round(gs0.length * frac));
  const gs = gs0.slice(0, n);
  const sc = cam.k / cam.u;
  const lines = new Map<number, any[]>();
  for (const g of gs) { const l = lines.get(g.line) ?? []; l.push(g); lines.set(g.line, l); }
  return [...lines.values()].map((ls) => {
    const x0 = Math.min(...ls.map((g) => g.box[0])), x1 = Math.max(...ls.map((g) => g.box[2]));
    const base = ls[0].y;
    return { x: x0 * sc + cam.x - 6, y: (base - 0.78 * UPM) * sc + cam.y, w: (x1 - x0) * sc + 12, h: 1.05 * UPM * sc };
  });
}
/** where a click lands: before or after a letter, or the middle of a checklist's box */
function clickTarget(R: Rec, c: any, cam: { k: number; x: number; y: number; u: number }) {
  const sc = cam.k / cam.u;
  if (c.box) return { x: ((c.box[0] + c.box[2]) / 2) * sc + cam.x, y: ((c.box[1] + c.box[3]) / 2) * sc + cam.y };
  const gs = glyphsWith(R, c.t, c.ids ?? []);
  const g = c.side === 'before' ? gs[0] : gs[gs.length - 1];
  if (!g) return null;
  return { x: (c.side === 'before' ? g.box[0] - 0.12 * UPM : g.box[2] + 0.1 * UPM) * sc + cam.x, y: (g.y - 0.25 * UPM) * sc + cam.y };
}

let uiFont: Promise<unknown> | null = null;
const UiFont: React.FC = () => {
  const [h] = useState(() => delayRender('ui font'));
  useLayoutEffect(() => {
    uiFont ??= new FontFace('RR Schibsted', `url(${staticFile('fonts/schibsted-grotesk-latin.woff2')}) format('woff2')`, { weight: '400 900' }).load().then((f) => document.fonts.add(f));
    uiFont.then(() => continueRender(h));
  }, [h]);
  return null;
};

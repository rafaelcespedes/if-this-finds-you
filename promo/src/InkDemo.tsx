// The ink demo (1:1, 1080): typing that behaves like ink. A sheet of the site's paper above, a minimal keyboard
// below with ghost fingertips pressing its keys; what's typed goes through the site's own Ink mode (the session is
// recorded by scripts/ink-session.ts with the engine's plan/penStep/apply/dropLast, the calls the site makes) and
// the ink log is replayed here frame by frame (replay is deterministic), every letter drawn stroke by stroke as the
// pen reaches it. The letters the pen hasn't reached yet show faint, as on the site. Shown, in order: a typo
// deleted before the pen gets there, Backspace on ink striking the word, a letter written over another, a word added
// above the line with a caret, undo lifting wet ink, and dry ink staying.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { getPaper, paintPaper, type PaperSpec } from '@/lib/papers';
import { inkOpts } from '@/lib/ink';
import { inkColor } from '@/lib/inks';
import session from './data/ink-session.json';
import { HAND, MEASURE, PAPER, PEN_SPEED } from './scene/ink-demo-setup';
import { engine, drawInk, UPM, clamp, easeInOutQuint, easeOutQuint } from './scene/ink';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const inkDemoSchema = z.object({
  /** a short line under the sheet naming what each moment shows */
  captions: z.boolean().default(true),
});
export type InkDemoProps = z.infer<typeof inkDemoSchema>;

const S0 = 1080;
const PAPER_H = 612; // the sheet's window, at 1080
const STRIP = { y: 612, h: 84 }; // the line between sheet and keyboard
const KB_TOP = 704;
const C = { room: '#e6e4de', ink: '#1e2733', muted: '#575146', faint: '#8b857a', red: '#9b3b2a', key: 'rgba(255, 255, 255, 0.62)', keyEdge: 'rgba(30, 39, 51, 0.10)' };
const SES = session as any;
/** the hand's ink (royal blue): the wet-ink timer is drawn in it, so it reads as the ink's own */
const INK_BLUE = inkColor(HAND.ink);
/** the room's ink grey at an alpha (the bar is grayscale) */
const GREY = (a: number) => `rgba(30, 39, 51, ${a})`;
/** the bar's grey as a solid colour (6% of the ink grey over the paper's tint): the goo needs an opaque fill */
const BAR_FILL = (() => {
  const tint = String((getPaper(PAPER) as any).tint ?? '#f8f6f0');
  const m = tint.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  const [r, g, b] = m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : [248, 246, 240];
  const mix = (c: number, d: number) => Math.round(c * 0.94 + d * 0.06);
  return `rgb(${mix(r, 30)}, ${mix(g, 39)}, ${mix(b, 51)})`;
})();
const blueA = (a: number) => {
  const m = INK_BLUE.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  return m ? `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})` : `rgba(44, 79, 163, ${a})`;
};
const CAPTIONS: Record<string, string> = {
  clean: 'A typo the pen hasn’t reached yet: gone',
  strike: 'A beat later, Backspace crosses it out',
  again: 'Hold Delete: crossed out harder, then inked out',
  replace: 'Select and retype: the new word goes above',
  insert: 'A word added above the line',
  underline: '⌘U: underlined by hand',
  retrace: '⌘B: gone over again',
  undo: 'Undo lifts the ink while it’s wet',
  over: 'One letter written over another',
  dry: 'Dry ink stays',
};

// ---------- the hand, the paper, the replay ----------
const p = engine.withOverrides(engine.makeHand(HAND.seed, { style: HAND.style }, { neatOnly: true }), { ...HAND.params, pen: HAND.pen, tip: HAND.tip, ink: HAND.ink });
const paper0 = getPaper(PAPER);
const paper = { ...paper0, text: { ...paper0.text, right: paper0.text.left + (paper0.text.right - paper0.text.left) * MEASURE } } as PaperSpec;
const IO = inkOpts(p, paper, 1, 1);
const sheets = new Map<number, any>();
/** the sheet at a state of the log (the events by id, as recorded), replayed once and kept */
function sheetAt(s: number) {
  let sh = sheets.get(s);
  if (!sh) {
    const ids = SES.states[s].ids as number[];
    const doc = { ...engine.newInkDoc({ seed: HAND.seed, style: HAND.style, salt: SES.salt }), log: ids.map((i) => SES.events[i]) };
    sh = engine.replay(p, doc, IO.layout);
    sheets.set(s, sh);
  }
  return sh;
}

// the camera: the final letter's writing fitted to the sheet's window, fixed for the whole video (nothing written
// ever moves)
function cameraFor(S: number) {
  const k0 = S / S0;
  const PAPER_H = barTop(S) / k0 - 20; // the writing's window: down to just above the bar
  const last = sheetAt(SES.states.length - 1);
  const u = IO.u;
  let y0 = Infinity, y1 = -Infinity;
  for (const it of last.page.items as any[]) { if (!it.box) continue; y0 = Math.min(y0, it.box[1]); y1 = Math.max(y1, it.box[3]); }
  const colMm = paper.text.right - paper.text.left;
  const hMm = (y1 - y0) / u;
  // the column across the frame (a little room either side), unless the letter would run past the window
  const k = Math.max(S / paper.w, Math.min((0.88 * S) / colMm, ((PAPER_H - 70) * k0) / hMm));
  const x = Math.min(0, Math.max(S - paper.w * k, 0.06 * S - paper.text.left * k));
  const y = (PAPER_H * k0 - hMm * k) / 2 - (y0 / u) * k - 26 * k0; // a little above the window's middle
  return { k, x, y, u };
}

/** the top of the hint bar (just above the keyboard's plate), px */
const barTop = (S: number) => keyboard(S).plate.y - (72 + 14) * (S / S0);

// ---------- the pen's clock: every letter and mark drawn in writing order, stroke by stroke ----------
interface Timed { it: any; start: number; dur: number }
function penClock(sh: any, ids: number[]): Timed[] {
  const items = (sh.page.items as any[]).map((it, i) => ({ it, i })).filter(({ it }) => it.g && (it.kind === 'glyph' || it.kind === 'mark'));
  items.sort((a, b) => (a.it.ev ?? 0) - (b.it.ev ?? 0) || (a.it.inkIndex ?? a.i) - (b.it.inkIndex ?? b.i) || a.i - b.i);
  const evT = (ev: number) => SES.evTime[ids[ev]] ?? 0;
  // how many letters each event wrote, and when the next one came (so the pen keeps up when it hurries)
  const per = new Map<number, number>();
  for (const { it } of items) per.set(it.ev ?? 0, (per.get(it.ev ?? 0) ?? 0) + 1);
  const evs = [...per.keys()].sort((a, b) => a - b);
  const next = new Map<number, number>();
  evs.forEach((e, j) => next.set(e, j + 1 < evs.length ? evT(evs[j + 1]) : Infinity));
  const out: Timed[] = [];
  let pen = 0;
  for (const { it } of items) {
    const ev = it.ev ?? 0;
    const room = (next.get(ev)! - evT(ev)) / (per.get(ev) || 1);
    const base = it.kind === 'mark' ? 0.32 : 1 / PEN_SPEED;
    const dur = clamp(Math.min(base, room * 0.95), 0.05, base);
    const start = Math.max(evT(ev), pen);
    out.push({ it, start, dur });
    pen = start + dur;
  }
  return out;
}

// ---------- the keyboard: only the keys a short letter needs, on a floating glass plate ----------
interface Key { id: string; label: string; x: number; y: number; w: number; h: number; small?: boolean; align?: 'left' | 'right' }
const PLATE = { pad: 22, radius: 30 };
function keyboard(S: number): { keys: Key[]; plate: { x: number; y: number; w: number; h: number } } {
  const k0 = S / S0;
  const U = 72 * k0, G = 8 * k0, H = 64 * k0;
  // the letters as they sit on any keyboard (each row a little further in), with the few keys the letter uses
  const rows: { offset: number; keys: [string, string, number, ('left' | 'right')?][] }[] = [
    { offset: 0, keys: [['q', 'Q', 1], ['w', 'W', 1], ['e', 'E', 1], ['r', 'R', 1], ['t', 'T', 1], ['y', 'Y', 1], ['u', 'U', 1], ['i', 'I', 1], ['o', 'O', 1], ['p', 'P', 1], ['Backspace', 'delete', 1.45, 'right']] },
    { offset: 0.3, keys: [['a', 'A', 1], ['s', 'S', 1], ['d', 'D', 1], ['f', 'F', 1], ['g', 'G', 1], ['h', 'H', 1], ['j', 'J', 1], ['k', 'K', 1], ['l', 'L', 1], ['Enter', 'return', 1.6, 'right']] },
    { offset: -0.55, keys: [['Shift', 'shift', 1.55, 'left'], ['z', 'Z', 1], ['x', 'X', 1], ['c', 'C', 1], ['v', 'V', 1], ['b', 'B', 1], ['n', 'N', 1], ['m', 'M', 1], [',', ',', 1], ['.', '.', 1]] },
    { offset: 0, keys: [['Meta', '⌘', 1.3], [' ', '', 5.2]] },
  ];
  const rowW = (r: (typeof rows)[number]) => r.keys.reduce((a, [, , w]) => a + w * U, 0) + G * (r.keys.length - 1);
  const W = Math.max(...rows.slice(0, 3).map((r) => rowW(r) + Math.abs(r.offset) * U));
  const x0 = (S - W) / 2;
  // the plate as far from the bottom edge as from the sides
  const pad0 = PLATE.pad * k0, side = x0 - pad0;
  const plateH = rows.length * H + (rows.length - 1) * G + 2 * pad0;
  const top = S - side - plateH + pad0;
  const keys: Key[] = [];
  rows.forEach((row, r) => {
    // the letter rows staggered as on a keyboard; the bottom row centred under the space between them
    let x = r === 3 ? (S - rowW(row)) / 2 : x0 + (row.offset > 0 ? row.offset * U : 0) + (r === 2 ? 0 : 0);
    if (r === 2) x = x0;
    for (const [id, label, w, align] of row.keys) {
      keys.push({ id, label, x, y: top + r * (H + G), w: w * U, h: H, small: label.length > 1, align });
      x += w * U + G;
    }
  });
  const pad = PLATE.pad * k0;
  const minX = Math.min(...keys.map((kk) => kk.x)), maxX = Math.max(...keys.map((kk) => kk.x + kk.w));
  const maxY = Math.max(...keys.map((kk) => kk.y + kk.h));
  return { keys, plate: { x: minX - pad, y: top - pad, w: maxX - minX + 2 * pad, h: maxY - top + 2 * pad } };
}
/** a recorded key as the keys it presses */
function keysOf(key: string): string[] {
  if (key === 'Meta+z') return ['Meta', 'z'];
  if (key === 'click') return [];
  if (/^[A-Z]$/.test(key)) return ['Shift', key.toLowerCase()];
  return [key];
}

// ---------- the pieces ----------
const PRESS = 0.11; // a key's press, s
export const InkDemo: React.FC<InkDemoProps> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { width: S, fps } = useVideoConfig();
  const k0 = S / S0;
  const t = frame / fps;
  const F = SES.frames[Math.min(SES.frames.length - 1, frame)];
  const cam = useMemo(() => cameraFor(S), [S]);
  const KB = useMemo(() => keyboard(S), [S]);
  const KEYS = KB.keys;
  const ref = useRef<HTMLCanvasElement>(null);
  const [handle] = useState(() => delayRender('ink demo'));
  const sheetCanvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = Math.ceil(paper.w * cam.k); c.height = Math.ceil(paper.h * cam.k);
    paintPaper(c.getContext('2d')!, paper, { pxPerMm: cam.k, grainScale: cam.k / 4, holeFill: 'clear', shadow: 'none' });
    return c;
  }, [cam]);
  useLayoutEffect(() => {
    const h = delayRender(`ink ${frame}`);
    const ctx = ref.current!.getContext('2d', { alpha: false })!;
    // the sheet fills the frame; the keyboard sits on it (Rafael: no band of its own, no divider)
    ctx.fillStyle = (paper as any).tint ?? '#f8f6f0';
    ctx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.drawImage(sheetCanvas, cam.x, cam.y);
    const sc = cam.k / cam.u, emPx = sc * UPM;
    // a selection (dragged across, held until its command), as the system draws one: a soft blue behind the words
    for (const sel of (SES.selections as any[])) {
      if (t < sel.t || t > sel.until + 0.25) continue;
      const frac = clamp((t - sel.t) / 0.7, 0, 1);
      const o = t > sel.until ? 1 - (t - sel.until) / 0.25 : 1;
      ctx.fillStyle = `rgba(44, 99, 214, ${0.16 * o})`;
      for (const b of selectionBoxes(sel, cam, easeInOutQuint(frac))) { ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 6 * k0); ctx.fill(); }
    }
    const shift = (it: any) => ({ ...it, x: it.x + cam.x / sc, y: it.y + cam.y / sc, box: it.box && [it.box[0] + cam.x / sc, it.box[1] + cam.y / sc, it.box[2] + cam.x / sc, it.box[3] + cam.y / sc] });
    const sh = sheetAt(F.s);
    const ids = SES.states[F.s].ids as number[];
    const timed = penClock(sh, ids);
    const drawn = timed.filter((x) => x.start <= t);
    const frac = new Map<any, number>();
    for (const x of drawn) frac.set(x.it, clamp((t - x.start) / x.dur, 0, 1));
    const items = drawn.map((x) => shift(x.it));
    const fracOf = new Map<any, number>();
    items.forEach((it, i) => fracOf.set(it, frac.get(drawn[i].it)!));
    drawInk(ctx, p, items, {
      emPx, width: S, height: PAPER_H * k0,
      reveal: (it: any, si: number) => {
        const f = fracOf.get(it) ?? 1;
        const n = it.g?.strokes?.length || 1;
        return clamp(f * n - si, 0, 1);
      },
    });
    // what an undo just lifted, fading off the page
    const lift = (SES.lifts as any[]).find((l) => t >= l.t && t < l.t + 0.35);
    if (lift && F.s > 0) {
      const before = sheetAt(F.s - 1).page.items as any[];
      const keep = new Set((sh.page.items as any[]).map((it) => it.key));
      const gone = before.filter((it) => it.g && !keep.has(it.key)).map(shift);
      if (gone.length) drawInk(ctx, p, gone, { emPx, width: S, height: PAPER_H * k0, alpha: 1 - (t - lift.t) / 0.35 });
    }
    // the letters the pen hasn't reached: faint graphite, where they'll be written (the site's "thoughts")
    let draftItems: any[] = [];
    if (F.v.tail) {
      try { const d = engine.draftPage(sh, F.v); draftItems = ((d?.items ?? []) as any[]).filter((it) => it.kind === 'glyph'); } catch { /* none */ }
      if (draftItems.length) drawInk(ctx, p, draftItems.map(shift), { emPx, width: S, height: PAPER_H * k0, ink: '#6f6f78', alpha: 0.26 });
    }
    // the typing cursor: after the last thought letter, or after the pen's last letter (hidden mid-text)
    if (F.cur == null) {
      const glyphs = (sh.page.items as any[]).filter((it) => it.kind === 'glyph' && it.box && !it.above);
      // the pen's last letter: the latest event's, and its last letter (a P.S. counts its letters on its own)
      const later = (a: any, b: any) => (b.ev ?? 0) - (a.ev ?? 0) || (b.inkIndex ?? 0) - (a.inkIndex ?? 0);
      const lastInk = glyphs.reduce((a: any, b: any) => (!a || later(a, b) > 0 ? b : a), null);
      const lastDraft = draftItems.length ? draftItems[draftItems.length - 1] : null;
      const ref2 = lastDraft ?? lastInk;
      const blink = t - (SES.keys as any[]).filter((kk) => kk.t <= t).reduce((a: number, kk: any) => Math.max(a, kk.t), -10) < 0.5 || Math.floor(t * 2.2) % 2 === 0;
      if (ref2 && blink) {
        const b = shift(ref2).box;
        const xh = paper.xh * cam.k;
        const xC = b[2] * sc + 4 * k0, base = shift(ref2).y * sc;
        ctx.fillStyle = C.ink;
        ctx.fillRect(xC, base - xh * 1.9, 2 * k0, xh * 2.4);
      } else if (!ref2 && blink) {
        ctx.fillStyle = C.ink;
        ctx.fillRect(cam.x + paper.text.left * cam.k, cam.y + IO.lines.first * cam.k - 34 * k0, 2 * k0, 42 * k0);
      }
    }
    ctx.restore();
    continueRender(h);
    continueRender(handle);
  }, [frame]); // eslint-disable-line react-hooks/exhaustive-deps

  // keys down now, and the ghost fingertips
  const down = new Map<string, number>(); // key id -> how pressed (0..1)
  const tips: { x: number; y: number; o: number; s: number }[] = [];
  const presses = (SES.keys as any[]).flatMap((kk) => keysOf(kk.key).map((id, j) => ({ id, t: kk.t + (j ? 0.03 : 0), hold: kk.key === 'Meta+z' && j === 0 ? 0.22 : PRESS })));
  for (const pr of presses) {
    const u = (t - pr.t) / pr.hold;
    if (u >= -0.3 && u <= 1.6) down.set(pr.id, Math.max(down.get(pr.id) ?? 0, u < 0 ? 0 : u <= 1 ? 1 : 1 - (u - 1) / 0.6));
  }
  const keyAt = (id: string) => KEYS.find((kk) => kk.id === id);
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
    } else if (kp && t - prev!.t < 0.45) {
      x = kp.x + kp.w / 2; y = kp.y + kp.h / 2; o = 1 - (t - prev!.t) / 0.45;
    }
    if (kp && t - prev!.t < PRESS) s = 0.86;
    if (o > 0.01) tips.push({ x, y, o, s });
  }

  // the pointer, for the clicks (into the text, then back to its end)
  const clicks = SES.clicks as { t: number; index: number; kind?: string; look?: string }[];
  const pointer = (() => {
    // a drag across words for a selection: in from the side, then across them
    for (const sel of (SES.selections as any[])) {
      if (t < sel.t - 0.6 || t > sel.t + 1.5) continue;
      const boxes = selectionBoxes(sel, cam);
      if (!boxes.length) return null;
      const a = boxes[0], b = boxes[boxes.length - 1];
      const start = { x: a.x + 4, y: a.y + a.h * 0.6 }, end = { x: b.x + b.w - 4, y: b.y + b.h * 0.6 };
      const from = { x: S * 0.82, y: PAPER_H * k0 * 0.95 };
      if (t < sel.t) {
        const u = easeOutQuint(clamp((t - (sel.t - 0.6)) / 0.55, 0, 1));
        return { x: from.x + (start.x - from.x) * u, y: from.y + (start.y - from.y) * u, press: 1, o: clamp((t - (sel.t - 0.6)) / 0.15, 0, 1) };
      }
      const u = easeInOutQuint(clamp((t - sel.t) / 0.7, 0, 1));
      return { x: start.x + (end.x - start.x) * u, y: start.y + (end.y - start.y) * u, press: t < sel.t + 0.7 ? 0.9 : 1, o: t > sel.t + 1.1 ? 1 - (t - sel.t - 1.1) / 0.4 : 1 };
    }
    for (const c of clicks) {
      if (t < c.t - 0.75 || t > c.t + 0.6) continue;
      const target = clickTarget(c as any, cam);
      if (!target) return null;
      const u = easeOutQuint(clamp((t - (c.t - 0.75)) / 0.7, 0, 1));
      const from = { x: S * 0.82, y: PAPER_H * k0 * 0.95 };
      const o = t > c.t + 0.3 ? 1 - (t - c.t - 0.3) / 0.3 : clamp((t - (c.t - 0.75)) / 0.15, 0, 1);
      return { x: from.x + (target.x - from.x) * u, y: from.y + (target.y - from.y) * u, press: t >= c.t && t < c.t + 0.12 ? 0.86 : 1, o };
    }
    return null;
  })();
  // the wet ink: a ring that drains over the 3 s undo can lift it
  const wetFor = 3;
  const since = t - F.wet;
  const wet = since >= 0 && since < wetFor;
  const showChip = t > 1.2;
  // the dry-ink note (the site's own words)
  const toast = (SES.toasts as any[]).find((x) => t >= x.t && t < x.t + 2.2);
  // the caption for this moment
  const LEAD = 0.6; // each hint comes in a little before its moment, so it's read as it happens
  const note = [...(SES.notes as any[])].reverse().find((n) => n.t <= t + LEAD && CAPTIONS[n.note]);
  const capO = note ? clamp((t - note.t + LEAD) / 0.25, 0, 1) : 0;

  return (
    <AbsoluteFill style={{ background: (paper as any).tint ?? '#f8f6f0' }}>
      <canvas ref={ref} width={S} height={S} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      {/* the hint and the wet-ink timer: two grey capsules with the keyboard plate's corners, joined by a gooey neck
          (the goo technique liquid-gooey is built on: an SVG blur and a sharp alpha threshold, so touching shapes merge
          into one surface while the words stay crisp on top). The neck swells a moment each time ink goes down. */}
      {(() => {
        const H = 72 * k0, R = PLATE.radius * k0, top = KB.plate.y - (72 + 14) * k0;
        const TW = 262 * k0, G = 18 * k0;
        const left = { x: KB.plate.x, w: KB.plate.w - TW - G };
        const right = { x: KB.plate.x + KB.plate.w - TW, w: TW };
        const M = 24 * k0; // the SVG's margin for the blur
        const swell = wet ? Math.exp(-since * 5) : 0;
        const TEXT = 21; // the hint and the timer's seconds, the same size (at 1080)
        const neckRy = (13 + 9 * swell) * k0;
        return (
          <>
            <svg width={KB.plate.w + 2 * M} height={H + 2 * M} style={{ position: 'absolute', left: KB.plate.x - M, top: top - M, overflow: 'visible' }}>
              <defs>
                <filter id="goo" x="-10%" y="-40%" width="120%" height="180%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation={7 * k0} result="blur" />
                  <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
                </filter>
              </defs>
              <g filter="url(#goo)" fill={BAR_FILL}>
                <rect x={M} y={M} width={left.w} height={H} rx={R} />
                <rect x={M + KB.plate.w - TW} y={M} width={TW} height={H} rx={R} />
                <ellipse cx={M + left.w + G / 2} cy={M + H / 2} rx={G / 2 + 10 * k0} ry={neckRy} />
              </g>
            </svg>
            {/* the timer's fill: a pill of its own, 4 px inside the capsule, a shade darker, draining as the ink dries */}
            {showChip && wet && (() => {
              const inset = 4 * k0, w = (right.w - 2 * inset) * (1 - since / wetFor), h = H - 2 * inset;
              return <div style={{ position: 'absolute', left: right.x + inset, top: top + inset, width: w, height: h, borderRadius: Math.min(R - inset, w / 2), background: GREY(0.055) }} />;
            })()}
            <div style={{ position: 'absolute', left: left.x, top, width: left.w, height: H, display: 'flex', alignItems: 'center', padding: `0 ${30 * k0}px`, fontFamily: '"RR Schibsted", system-ui, sans-serif' }}>
              <div style={{ fontSize: TEXT * k0, fontWeight: 400, color: C.ink, opacity: captions ? capO : 0 }}>{note ? CAPTIONS[note.note] : ''}</div>
            </div>
            <div style={{ position: 'absolute', left: right.x, top, width: right.w, height: H, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 14 * k0, padding: `0 ${20 * k0}px 0 ${18 * k0}px`, fontFamily: '"RR Schibsted", system-ui, sans-serif', opacity: showChip ? 1 : 0 }}>
              <svg width={34 * k0} height={34 * k0} viewBox="0 0 34 34">
                <circle cx={17} cy={17} r={13} fill="none" stroke={wet ? C.ink : C.faint} strokeOpacity={0.16} strokeWidth={2.6} />
                <circle cx={17} cy={17} r={13} fill="none" stroke={C.ink} strokeWidth={2.6} strokeLinecap="round" opacity={wet ? 1 : 0}
                  strokeDasharray={`${2 * Math.PI * 13}`} strokeDashoffset={`${2 * Math.PI * 13 * (wet ? since / wetFor : 1)}`} transform="rotate(-90 17 17)" />
                {wet && <line x1={17} y1={17} x2={17 + 7.5 * Math.sin(2 * Math.PI * (since / wetFor))} y2={17 - 7.5 * Math.cos(2 * Math.PI * (since / wetFor))} stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" />}
                <circle cx={17} cy={17} r={1.6} fill={wet ? C.ink : C.faint} />
              </svg>
              <div style={{ textAlign: 'left', lineHeight: 1.12 }}>
                <div style={{ fontSize: TEXT * k0, fontWeight: 400, color: wet ? C.ink : C.faint, fontVariantNumeric: 'tabular-nums' }}>{wet ? `${Math.max(0, wetFor - since).toFixed(1)} s` : 'dry'}</div>
                <div style={{ fontSize: 13.5 * k0, fontWeight: 400, color: wet ? C.muted : C.faint }}>{wet ? 'wet ink · undo works' : 'undo can’t lift it'}</div>
              </div>
            </div>
          </>
        );
      })()}
      {/* the keyboard: a frosted glass plate floating over the room, quiet keys on it, the pressed one sinking */}
      <div style={{
        position: 'absolute', left: KB.plate.x, top: KB.plate.y, width: KB.plate.w, height: KB.plate.h, borderRadius: PLATE.radius * k0,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.62), rgba(255,255,255,0.38))',
        boxShadow: `0 ${18 * k0}px ${44 * k0}px rgba(30, 39, 51, 0.13), 0 ${2 * k0}px ${6 * k0}px rgba(30, 39, 51, 0.06), inset 0 ${k0}px 0 rgba(255,255,255,0.9), inset 0 0 0 ${k0}px rgba(255,255,255,0.55)`,
        backdropFilter: `blur(${16 * k0}px)`,
      }} />
      {KEYS.map((kk) => {
        const d = down.get(kk.id) ?? 0;
        return (
          <div key={kk.id} style={{
            position: 'absolute', left: kk.x, top: kk.y + d * 2 * k0, width: kk.w, height: kk.h, borderRadius: 12 * k0,
            background: `rgba(${255 - 34 * d}, ${255 - 32 * d}, ${255 - 28 * d}, ${0.78 + 0.12 * d})`,
            boxShadow: `0 ${(1 - d) * 2 * k0}px ${(1 - d) * 3 * k0}px rgba(30, 39, 51, ${0.12 * (1 - d)}), inset 0 0 0 ${k0}px rgba(30, 39, 51, 0.06)`,
            display: 'flex', alignItems: kk.small ? 'flex-end' : 'center', justifyContent: kk.align === 'left' ? 'flex-start' : kk.align === 'right' ? 'flex-end' : 'center',
            padding: kk.small ? `0 ${11 * k0}px ${9 * k0}px` : 0,
            fontFamily: '"RR Schibsted", system-ui, sans-serif', fontSize: (kk.small ? 15 : kk.id === 'Meta' ? 24 : 23) * k0, color: d > 0.3 ? C.ink : C.muted, fontWeight: 450,
          }}>{kk.label}</div>
        );
      })}
      {tips.map((tp, i) => (
        <div key={i} style={{ position: 'absolute', left: tp.x - 27 * k0, top: tp.y - 27 * k0, width: 54 * k0, height: 54 * k0, borderRadius: '50%', background: 'radial-gradient(circle, rgba(30,39,51,0.20) 0%, rgba(30,39,51,0.10) 55%, rgba(30,39,51,0) 72%)', opacity: tp.o, transform: `scale(${tp.s})` }} />
      ))}
      {pointer && (
        <svg width={22 * k0} height={30 * k0} viewBox="0 0 22 30" style={{ position: 'absolute', left: pointer.x - 2 * k0, top: pointer.y - 2 * k0, opacity: pointer.o, transform: `scale(${pointer.press})`, transformOrigin: '2px 2px', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.25))' }}>
          <path d="M2 2 L2 24 L7.5 18.8 L11.2 27.4 L14.6 26 L10.9 17.5 L18.5 17.5 Z" fill="#111" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
        </svg>
      )}
      {toast && (
        <div style={{ position: 'absolute', left: '50%', top: (PAPER_H - 128) * k0, transform: `translateX(-50%) translateY(${(1 - clamp((t - toast.t) / 0.25, 0, 1)) * 16 * k0}px)`, opacity: Math.min(clamp((t - toast.t) / 0.2, 0, 1), clamp((toast.t + 2.2 - t) / 0.3, 0, 1)), background: '#fbfaf7', borderRadius: 12 * k0, boxShadow: `0 ${8 * k0}px ${28 * k0}px rgba(30,39,51,0.14), 0 0 0 ${k0}px rgba(30,39,51,0.08)`, padding: `${16 * k0}px ${22 * k0}px`, fontFamily: '"RR Schibsted", system-ui, sans-serif', minWidth: 420 * k0 }}>
          <div style={{ fontSize: 21 * k0, fontWeight: 600, color: C.ink }}>{toast.title}</div>
          <div style={{ fontSize: 18 * k0, color: C.muted, marginTop: 3 * k0 }}>{toast.body}</div>
        </div>
      )}
      <UiFont />
    </AbsoluteFill>
  );
};

/** the written letters at a moment, in writing order, and the text they spell (to find a word on the page) */
function glyphsAt(t: number) {
  const f = SES.frames[Math.min(SES.frames.length - 1, Math.max(0, Math.round(t * SES.fps)))];
  const glyphs = (sheetAt(f.s).page.items as any[]).filter((it) => it.kind === 'glyph' && it.box).sort((a, b) => (a.inkIndex ?? 0) - (b.inkIndex ?? 0));
  return { glyphs, text: glyphs.map((g) => g.ch).join('') };
}
/** where a click lands: just before a word ('before'), on a word ('at': the crossed-out one), or after the last letter */
function clickTarget(c: { t: number; kind?: string; look?: string }, cam: { k: number; x: number; y: number; u: number }) {
  const { glyphs, text } = glyphsAt(c.t);
  const at = c.look && c.kind !== 'end' ? text.indexOf(c.look.replace(/\s+/g, '')) : -1;
  const sc = cam.k / cam.u;
  if (at >= 0 && c.kind === 'at') {
    const ws = glyphs.slice(at, at + c.look!.length);
    const g0 = ws[0], g1 = ws[ws.length - 1];
    return { x: ((g0.box[0] + g1.box[2]) / 2) * sc + cam.x, y: (g0.y - 0.2 * UPM) * sc + cam.y };
  }
  const g = at >= 0 ? glyphs[at] : glyphs[glyphs.length - 1];
  if (!g) return null;
  return { x: (at >= 0 ? g.box[0] - 0.12 * UPM : g.box[2] + 0.1 * UPM) * sc + cam.x, y: (g.y - 0.25 * UPM) * sc + cam.y };
}
/** a selection's words on the page: one box per line, from the first letter of the first word to the last of the second */
function selectionBoxes(sel: { t: number; words?: string[] }, cam: { k: number; x: number; y: number; u: number }, frac = 1) {
  if (!sel.words) return [];
  const { glyphs, text } = glyphsAt(sel.t);
  const a = text.indexOf(sel.words[0]);
  const b = a < 0 ? -1 : text.indexOf(sel.words[1], a) + sel.words[1].length;
  if (a < 0 || b <= a) return [];
  const n = Math.max(1, Math.round((b - a) * frac));
  const ws = glyphs.slice(a, a + n);
  const sc = cam.k / cam.u;
  const lines = new Map<number, any[]>();
  for (const g of ws) { const l = lines.get(g.line) ?? []; l.push(g); lines.set(g.line, l); }
  return [...lines.values()].map((gs) => {
    const x0 = Math.min(...gs.map((g) => g.box[0])), x1 = Math.max(...gs.map((g) => g.box[2]));
    const base = gs[0].y;
    return { x: x0 * sc + cam.x - 6, y: (base - 0.78 * UPM) * sc + cam.y, w: (x1 - x0) * sc + 12, h: 1.05 * UPM * sc };
  });
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

// The writing app on a desktop, for a post (1920 x 1080): the real page (/write), filmed frame by frame in headless
// Chrome on the video's clock (scripts/desk-capture.mjs, scripts/desk-script.mjs), shown in a window on the desk's
// light ground, with a camera that goes in close on each moment and pulls back between them, the pointer drawn over
// it (the browser draws none), and the bar from the ink demo naming each moment. Nothing on the page is redrawn: every
// pixel inside the window is the site's.
import { useLayoutEffect, useMemo, useState } from 'react';
import { AbsoluteFill, Img, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import rec from './data/desk.json';

/* eslint-disable @typescript-eslint/no-explicit-any */
const R = rec as any;
export const inkDeskSchema = z.object({
  /** which filming's pictures: draft (1x, fast) or final (2x) */
  tag: z.string(),
  /** seconds of the filming skipped at the start (the empty sheet) */
  skip: z.number(),
  /** how the caption changes: rise (each caption its own pill, rising in as the last one sinks away), fixed (one pill
   *  as wide as the longest caption, the words dissolving), left (rise, from the bottom left corner) */
  pill: z.enum(['rise', 'fixed', 'left']).optional(),
});
export const deskFrames = (skip = 0.35) => Math.round((R.frames ?? 0) - skip * R.fps);

const C = { ink: '#1e2733', muted: '#575146', faint: '#8b857a', ground: '#ebe8e1' };
const FONT = '"RR Schibsted", system-ui, sans-serif';
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const mix = (a: number, b: number, u: number) => a + (b - a) * u;
const ease = (u: number) => { u = clamp(u, 0, 1); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
const easeOut = (u: number) => 1 - Math.pow(1 - clamp(u, 0, 1), 3);

// ---------- the stage: a window nearly the frame's width, its empty foot running off the bottom; the bar over it ----------
const OW = 1920, OH = 1080;
const PW = R.width as number, PH = R.height as number; // the page, CSS px
const TB = 40; // the window's title bar, page px
const BAR_H = 92, BAR_Y = OH - 40 - BAR_H; // the caption, floating over everything
const VIEW = { x: 0, y: 0, w: OW, h: OH - 120 }; // what the camera frames (the bar covers the rest)
const S0 = (OW * 0.94) / PW;
const WIN = { w: PW * S0, h: (PH + TB) * S0, x: (OW * 0.06) / 2, y: 36 };
/** a page point on the stage (before the camera) */
const stage = (x: number, y: number) => ({ x: WIN.x + x * S0, y: WIN.y + (TB + y) * S0 });
const REST = { x: OW / 2, y: VIEW.h / 2, z: 1 };

type Rect = [number, number, number, number];
type Cam = { x: number; y: number; z: number };

/** the camera at every frame: each cue's aim (following what it looks at), eased in from the one before */
function cameraPath(): Cam[] {
  const N = R.frames as number, fps = R.fps as number;
  const rects = R.rects as Record<string, Rect>[];
  const ptr = R.pointer as number[][];
  // the writing so far: where the caret has been
  const write: (Rect | null)[] = [];
  let box: Rect | null = null;
  for (let f = 0; f < N; f++) {
    const c = rects[f]?.caret;
    if (c && c[1] > 40) {
      const b: Rect = [c[0], c[1], 2, c[3]];
      box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[0] + box[2], b[0] + b[2]) - Math.min(box[0], b[0]), Math.max(box[1] + box[3], b[1] + b[3]) - Math.min(box[1], b[1])] : b;
    }
    write.push(box);
  }
  const rectOf = (name: string, f: number): Rect | null => (name === 'write' ? write[f] : rects[f]?.[name] ?? null);
  const fitZ = (w: number, h: number) => clamp(Math.min(2.2, (VIEW.w * 0.86) / w, (VIEW.h * 0.84) / h), ZMIN, 2.2);
  /** what a cue aims at, frame by frame (unsmoothed) */
  const aim = (cue: any, f: number): Cam => {
    const focus = cue.focus;
    if (focus === 'all') return { ...REST, z: cue.zoom ?? 1 };
    if (focus === 'caret') {
      const c = rects[f]?.caret, sheet = rects[f]?.sheet;
      if (!c) return REST;
      const p = stage(c[0], c[1] + c[3] / 2);
      const zz = cue.zoom ?? 2;
      // across: the writing's column (from where it starts to the sheet's right margin), keeping the caret well in
      const w = write[f];
      let x = p.x;
      if (sheet && w) {
        const col = stage((w[0] + sheet[0] + sheet[2] - 70) / 2, 0).x;
        const half = (VIEW.w / 2 / zz) * 0.8;
        x = clamp(col, p.x - half, p.x + half);
      }
      // down: the caret's line a little above the middle, but never so high that a sliver of the toolbar shows at the
      // top (on the first lines it would): then the view's top sits just under the toolbar and the line comes lower
      const bar = rects[f]?.bar;
      const below = bar ? stage(0, bar[1] + bar[3] + 8).y + VIEW.h / 2 / zz : -Infinity;
      return { x, y: Math.max(p.y + (0.5 - 0.4) * VIEW.h / zz, below), z: zz };
    }
    if (focus === 'pointer') { const p = stage(ptr[f][0], ptr[f][1]); return { x: p.x, y: p.y, z: cue.zoom ?? 2 }; }
    const names: string[] = Array.isArray(focus) ? focus : [focus];
    let u: Rect | null = null;
    for (const n of names) {
      const r = rectOf(n, f);
      if (!r) continue;
      u = u ? [Math.min(u[0], r[0]), Math.min(u[1], r[1]), Math.max(u[0] + u[2], r[0] + r[2]) - Math.min(u[0], r[0]), Math.max(u[1] + u[3], r[1] + r[3]) - Math.min(u[1], r[1])] : r;
    }
    if (!u) return REST;
    const a = stage(u[0] - 24, u[1] - 24), b = stage(u[0] + u[2] + 24, u[1] + u[3] + 24);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: cue.zoom ?? fitZ(b.x - a.x, b.y - a.y) };
  };
  // each cue's aim, smoothed both ways in time (no jitter as the caret steps letter by letter)
  const smooth = (xs: number[], tau: number) => {
    const k = 1 - Math.exp(-1 / (tau * fps));
    const a = [...xs];
    for (let i = 1; i < a.length; i++) a[i] = a[i - 1] + (a[i] - a[i - 1]) * k;
    for (let i = a.length - 2; i >= 0; i--) a[i] = a[i + 1] + (a[i] - a[i + 1]) * k;
    return a;
  };
  const cues = (R.cams as any[]).length ? (R.cams as any[]) : [{ t: 0, focus: 'all', zoom: 1, ease: 0 }];
  let path: Cam[] = Array.from({ length: N }, () => ({ ...REST }));
  cues.forEach((cue, i) => {
    const f0 = Math.round(cue.t * fps);
    const f1 = i + 1 < cues.length ? Math.round(cues[i + 1].t * fps + (cues[i + 1].ease ?? 0.9) * fps) : N;
    const raw: Cam[] = [];
    for (let f = 0; f < N; f++) raw.push(f >= f0 - 2 && f <= f1 ? aim(cue, clamp(f, f0, N - 1)) : aim(cue, clamp(f, f0, Math.min(f1, N - 1))));
    const xs = smooth(raw.map((c) => c.x), 0.35), ys = smooth(raw.map((c) => c.y), 0.35), zs = smooth(raw.map((c) => Math.log(c.z)), 0.3);
    const dur = Math.max(1, (cue.ease ?? 0.9) * fps);
    path = path.map((p, f) => {
      if (f < f0) return p;
      const u = ease((f - f0) / dur);
      return { x: mix(p.x, xs[f], u), y: mix(p.y, ys[f], u), z: Math.exp(mix(Math.log(p.z), zs[f], u)) };
    });
  });
  // the window is never smaller than ZMIN. Pulled back, the ground shows above and beside it by the same margin and
  // its foot runs off the bottom; closer in, it fills the frame across and its top doesn't come down into view
  return path.map((c) => {
    const z = Math.max(ZMIN, c.z);
    const VC = { x: VIEW.w / 2, y: VIEW.h / 2 };
    const side = (OW - WIN.w * z) / 2;
    if (side > 0) return { x: WIN.x + WIN.w / 2, y: WIN.y - (side - VC.y) / z, z };
    const hw = VC.x / z;
    const x = clamp(c.x, WIN.x + hw, WIN.x + WIN.w - hw);
    const y = Math.min(Math.max(c.y, WIN.y + VC.y / z), WIN.y + WIN.h - (OH - VC.y) / z);
    return { x, y, z };
  });
}
/** the farthest the camera pulls back: the window with a 96 px margin either side */
const ZMIN = (OW - 2 * 96) / (OW * 0.94);

// ---------- the pointer (macOS's arrow) ----------
const Arrow: React.FC<{ x: number; y: number; s: number; o: number; press: number }> = ({ x, y, s, o, press }) => (
  <svg width={28 * s} height={40 * s} viewBox="0 0 28 40" style={{ position: 'absolute', left: x - 2 * s, top: y - 2 * s, opacity: o, transform: `scale(${1 - 0.12 * press})`, transformOrigin: `${2 * s}px ${2 * s}px`, overflow: 'visible', filter: `drop-shadow(0 ${1.5 * s}px ${2.5 * s}px rgba(0,0,0,0.35))` }}>
    <path d="M2 2 L2 30 L8.6 23.8 L13 34.2 L17.6 32.2 L13.3 22 L22.4 22 Z" fill="#111" stroke="#fff" strokeWidth={2.2} strokeLinejoin="round" />
  </svg>
);

// ---------- the bar ----------

export const InkDesk: React.FC<z.infer<typeof inkDeskSchema>> = ({ tag, skip, pill = 'rise' }) => {
  const frame = useCurrentFrame() + Math.round(skip * R.fps);
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const path = useMemo(cameraPath, []);
  const cam = path[Math.min(frame, path.length - 1)];
  const f = Math.min(frame, R.frames - 1);
  const src = staticFile(`desk/${tag}/${String(f).padStart(5, '0')}.jpg`);

  // the camera: stage → screen
  const VC = { x: VIEW.w / 2, y: VIEW.h / 2 };
  const tx = (q: { x: number; y: number }) => ({ x: (q.x - cam.x) * cam.z + VC.x, y: (q.y - cam.y) * cam.z + VC.y });
  const win = tx({ x: WIN.x, y: WIN.y });
  const k = S0 * cam.z; // page px → screen px

  // the pointer: shown while it moves and clicks, hidden while typing (as macOS does)
  const ptr = R.pointer as number[][];
  let shownFor = 0;
  for (let i = f; i >= 0 && i > f - 6; i--) shownFor += ptr[i][2] ? 1 : 0;
  const po = shownFor / 6;
  const pp = tx(stage(ptr[f][0], ptr[f][1]));
  const click = (R.clicks as any[]).filter((c) => t >= c.t && t < c.t + 0.6).pop();
  const press = click ? Math.max(0, 1 - (t - click.t) / 0.18) : ptr[f][3] ? 1 : 0;
  const ring = click ? tx(stage(click.x, click.y)) : null;

  // the caption: the latest note; the one before it, on its way out; ⌫ before "Backspace", pressed with it
  const notes = R.notes as any[];
  const ni = notes.map((n) => n.t <= t + 0.1).lastIndexOf(true);
  const lit = (R.keys as any[]).some((kk) => kk.k === 'Backspace' && t >= kk.t && t < kk.t + (kk.dur ?? 0) + 0.14);

  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 30%, #f6f4ef 0%, ${C.ground} 70%, #e3dfd6 100%)` }}>
      <UiFont />
      {/* the window */}
      <div style={{ position: 'absolute', left: win.x, top: win.y, width: WIN.w * cam.z, height: WIN.h * cam.z, borderRadius: 12 * k, overflow: 'hidden', background: '#ffffff',
        boxShadow: `0 ${30 * k}px ${90 * k}px rgba(40,34,24,0.07), 0 ${2 * k}px ${8 * k}px rgba(40,34,24,0.035), 0 0 0 ${0.5 * k}px rgba(40,34,24,0.10)` }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: TB * k, background: '#f3f2f0', borderBottom: `${0.75 * k}px solid rgba(0,0,0,0.10)` }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c, i) => (
            <div key={c} style={{ position: 'absolute', left: (18 + i * 20) * k, top: (TB / 2 - 6) * k, width: 12 * k, height: 12 * k, borderRadius: '50%', background: c, boxShadow: `inset 0 0 0 ${0.5 * k}px rgba(0,0,0,0.18)` }} />
          ))}
          <div style={{ position: 'absolute', left: '50%', top: 7 * k, height: (TB - 14) * k, width: 340 * k, transform: 'translateX(-50%)', borderRadius: 7 * k, background: '#e6e5e2', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 * k, fontFamily: FONT, fontSize: 13 * k, color: '#4a4844', letterSpacing: 0.1 * k }}>
            <svg width={10 * k} height={12 * k} viewBox="0 0 10 12"><rect x="1" y="5" width="8" height="6.5" rx="1.4" fill="#8a8883" /><path d="M3 5 V3.6 a2 2 0 0 1 4 0 V5" fill="none" stroke="#8a8883" strokeWidth="1.3" /></svg>
            ifthisfindsyou.app/write
          </div>
        </div>
        <Img src={src} style={{ position: 'absolute', left: 0, top: TB * k, width: PW * k, height: PH * k }} />
      </div>
      {/* the pointer, and a ring where it clicks */}
      {ring && (() => {
        const u = (t - click.t) / 0.5;
        const r = (10 + 26 * easeOut(u)) * k;
        return <div style={{ position: 'absolute', left: ring.x - r, top: ring.y - r, width: 2 * r, height: 2 * r, borderRadius: '50%', border: `${2 * k}px solid rgba(30,39,51,${0.5 * (1 - u)})`, background: `rgba(30,39,51,${0.07 * (1 - u)})` }} />;
      })()}
      {po > 0 && <Arrow x={pp.x} y={pp.y} s={k * 0.95} o={po} press={press} />}

      {/* the narrator: frosted glass over everything */}
      <Narrator notes={notes} ni={ni} t={t} lit={lit} pill={pill} />
    </AbsoluteFill>
  );
};

// the caption's size: 42 px type at 1, set 12% smaller (everything in the pill scales with it)
const CAP = 0.88;
const CAP_PX = 42 * CAP, PAD_Y = 22 * CAP, PAD_X = 30 * CAP;
const GLASS: React.CSSProperties = {
  background: 'rgba(250, 249, 246, 0.5)', backdropFilter: 'blur(30px) saturate(180%)', WebkitBackdropFilter: 'blur(30px) saturate(180%)',
  boxShadow: '0 14px 40px rgba(40,34,24,0.14), 0 1px 4px rgba(40,34,24,0.08), inset 0 0 0 1px rgba(255,255,255,0.65), inset 0 1px 0 rgba(255,255,255,0.9)',
  borderRadius: 999, padding: `${PAD_Y}px ${PAD_X}px`, fontFamily: FONT, color: C.ink, fontSize: CAP_PX, fontWeight: 430, letterSpacing: -0.4 * CAP,
  whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', lineHeight: 1.1,
};
/** a caption's words, with a key cap before "Backspace" */
const Caption: React.FC<{ text: string; lit: boolean }> = ({ text, lit }) => (
  <>
    {text.split(/(Backspace)/).map((p, i) => p === 'Backspace' ? (
      <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
        <span style={{ width: 50 * CAP, height: 48 * CAP, marginRight: 12 * CAP, borderRadius: 11 * CAP, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 * CAP,
          background: lit ? 'rgba(30,39,51,0.14)' : 'rgba(255,255,255,0.75)', boxShadow: lit ? 'inset 0 1px 2px rgba(30,39,51,0.25)' : '0 1px 0 rgba(30,39,51,0.18), 0 0 0 1px rgba(30,39,51,0.08)', transform: `translateY(${lit ? 2 * CAP : 0}px)` }}>⌫</span>
        Backspace
      </span>
    ) : <span key={i} style={{ whiteSpace: 'pre' }}>{p}</span>)}
  </>
);
const OUT = 0.22, IN = 0.42, GAP = 0.08;
/** the bar's captions: each one's own pill, sized to its words */
const Narrator: React.FC<{ notes: any[]; ni: number; t: number; lit: boolean; pill: 'rise' | 'fixed' | 'left' }> = ({ notes, ni, t, lit, pill }) => {
  const at = (i: number) => notes[i].t - 0.1;
  if (pill === 'fixed') {
    // one pill, as wide as the longest caption (all of them stacked in one cell), the words dissolving one into the next
    const u = ni >= 0 ? easeOut((t - at(ni)) / 0.5) : 0;
    return (
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: OH - BAR_Y - BAR_H, display: 'flex', justifyContent: 'center' }}>
        <div style={{ ...GLASS, display: 'grid', justifyItems: 'center', opacity: ni >= 0 ? clamp((t - at(0)) / 0.3, 0, 1) : 0 }}>
          {notes.map((n, i) => {
            if (!n.note) return null;
            const o = i === ni ? u : i === ni - 1 ? 1 - clamp((t - at(ni)) / OUT, 0, 1) : 0;
            return <div key={i} style={{ gridArea: '1 / 1', display: 'flex', alignItems: 'center', opacity: o, filter: `blur(${(1 - o) * 6}px)` }}><Caption text={n.note} lit={lit} /></div>;
          })}
        </div>
      </div>
    );
  }
  // rise / left: the last caption sinks and fades, then the new one rises in, each pill its own size
  const shown: { i: number; o: number; y: number; s: number; b: number }[] = [];
  if (ni >= 1) { const u = clamp((t - at(ni)) / OUT, 0, 1); if (u < 1) shown.push({ i: ni - 1, o: 1 - u, y: 10 * u, s: 1 - 0.03 * u, b: 4 * u }); }
  if (ni >= 0 && notes[ni].note) { const u = easeOut((t - at(ni) - (ni >= 1 ? GAP : 0)) / IN); shown.push({ i: ni, o: u, y: 18 * (1 - u), s: 0.97 + 0.03 * u, b: 6 * (1 - u) }); }
  return (
    <>
      {shown.map(({ i, o, y, s, b }) => (
        <div key={i} style={{ position: 'absolute', left: pill === 'left' ? 72 : 0, right: pill === 'left' ? undefined : 0, bottom: OH - BAR_Y - BAR_H, display: 'flex', justifyContent: 'center' }}>
          <div style={{ ...GLASS, opacity: o, transform: `translateY(${y}px) scale(${s})`, transformOrigin: pill === 'left' ? 'left bottom' : 'center bottom' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', filter: b > 0.05 ? `blur(${b}px)` : undefined }}><Caption text={notes[i].note} lit={lit} /></span>
          </div>
        </div>
      ))}
    </>
  );
};

let uiFont: Promise<unknown> | null = null;
const UiFont: React.FC = () => {
  const [h] = useState(() => delayRender('ui font'));
  useLayoutEffect(() => {
    uiFont ??= new FontFace('RR Schibsted', `url(${staticFile('fonts/schibsted-grotesk-latin.woff2')}) format('woff2')`, { weight: '400 900' }).load().then((f) => document.fonts.add(f));
    uiFont.then(() => continueRender(h));
  }, [h]);
  return null;
};

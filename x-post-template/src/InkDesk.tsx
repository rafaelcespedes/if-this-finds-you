// The writing app on a desktop, for a post (1920 x 1080): the real page (/write), filmed frame by frame in headless
// Chrome on the video's clock (scripts/desk-capture.mjs, scripts/desk-script.mjs), shown in a window on the desk's
// light ground, with a camera that goes in close on each moment and pulls back between them, the pointer drawn over
// it (the browser draws none), and the bar from the ink demo naming each moment. Nothing on the page is redrawn: every
// pixel inside the window is the site's.
import { useLayoutEffect, useMemo, useState } from 'react';
import { AbsoluteFill, Img, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import rec from './data/desk-draft.json';

/* eslint-disable @typescript-eslint/no-explicit-any */
const R = rec as any;
export const inkDeskSchema = z.object({
  /** which filming's pictures: draft (1x, fast) or final (2x) */
  tag: z.string(),
  /** seconds of the filming skipped at the start (the empty sheet) */
  skip: z.number(),
});
export const deskFrames = (skip = 0.35) => Math.round((R.frames ?? 0) - skip * R.fps);

const C = { ink: '#1e2733', muted: '#575146', faint: '#8b857a', ground: '#ebe8e1' };
const FONT = '"RR Schibsted", system-ui, sans-serif';
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const mix = (a: number, b: number, u: number) => a + (b - a) * u;
const ease = (u: number) => { u = clamp(u, 0, 1); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
const easeOut = (u: number) => 1 - Math.pow(1 - clamp(u, 0, 1), 3);

// ---------- the stage: a window on the ground, the bar under it ----------
const OW = 1920, OH = 1080;
const PW = R.width as number, PH = R.height as number; // the page, CSS px
const TB = 40; // the window's title bar, page px
const BAR_H = 100, BAR_Y = OH - 44 - BAR_H; // the caption bar
const VIEW = { x: 0, y: 0, w: OW, h: BAR_Y - 22 }; // what the camera frames: above the bar
const S0 = Math.min((VIEW.h - 2 * 46) / (PH + TB), (OW - 2 * 120) / PW);
const WIN = { w: PW * S0, h: (PH + TB) * S0, x: (OW - PW * S0) / 2, y: 46 + (VIEW.h - 2 * 46 - (PH + TB) * S0) / 2 };
/** a page point on the stage (before the camera) */
const stage = (x: number, y: number) => ({ x: WIN.x + x * S0, y: WIN.y + (TB + y) * S0 });
const REST = { x: OW / 2, y: WIN.y + WIN.h / 2, z: 1 };

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
  const fitZ = (w: number, h: number) => Math.min(2.6, (VIEW.w * 0.84) / w, (VIEW.h * 0.82) / h);
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
      // down: the caret's line a little above the middle
      return { x, y: p.y + (0.5 - 0.4) * VIEW.h / zz, z: zz };
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
  // keep the window filling the frame when close in
  return path.map((c) => {
    const hw = VIEW.w / 2 / c.z, hh = VIEW.h / 2 / c.z, m = 40 / c.z;
    const x = WIN.w + 2 * m > 2 * hw ? clamp(c.x, WIN.x - m + hw, WIN.x + WIN.w + m - hw) : REST.x;
    const y = WIN.h + 2 * m > 2 * hh ? clamp(c.y, WIN.y - m + hh, WIN.y + WIN.h + m - hh) : REST.y;
    return { x, y, z: c.z };
  });
}

// ---------- the pointer (macOS's arrow) ----------
const Arrow: React.FC<{ x: number; y: number; s: number; o: number; press: number }> = ({ x, y, s, o, press }) => (
  <svg width={28 * s} height={40 * s} viewBox="0 0 28 40" style={{ position: 'absolute', left: x - 2 * s, top: y - 2 * s, opacity: o, transform: `scale(${1 - 0.12 * press})`, transformOrigin: `${2 * s}px ${2 * s}px`, overflow: 'visible', filter: `drop-shadow(0 ${1.5 * s}px ${2.5 * s}px rgba(0,0,0,0.35))` }}>
    <path d="M2 2 L2 30 L8.6 23.8 L13 34.2 L17.6 32.2 L13.3 22 L22.4 22 Z" fill="#111" stroke="#fff" strokeWidth={2.2} strokeLinejoin="round" />
  </svg>
);

// ---------- the bar ----------
const KEYCAPS: Record<string, string> = { Backspace: '⌫', Enter: '↩', Escape: 'esc' };

export const InkDesk: React.FC<z.infer<typeof inkDeskSchema>> = ({ tag, skip }) => {
  const frame = useCurrentFrame() + Math.round(skip * R.fps);
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const path = useMemo(cameraPath, []);
  const cam = path[Math.min(frame, path.length - 1)];
  const f = Math.min(frame, R.frames - 1);
  const src = staticFile(`desk/${tag}/${String(f).padStart(5, '0')}.jpg`);

  // the camera: stage → screen
  const VC = { x: VIEW.w / 2, y: VIEW.h / 2 + 8 };
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

  // the caption: the latest note, faded in; the keys it names, lit when pressed
  const notes = R.notes as any[];
  const LEAD = 0.15;
  const ni = notes.map((n) => n.t - LEAD <= t).lastIndexOf(true);
  const note = notes[ni];
  const capIn = note ? easeOut((t - note.t + LEAD) / 0.35) : 0;
  const keysOf = (n: any) => (n?.keys ?? []) as string[];
  const keys = keysOf(note);
  const lit = (R.keys as any[]).some((kk) => t >= kk.t && t < kk.t + (kk.dur ?? 0) + 0.16 && (kk.k === 'Backspace'));
  const end = note && /^If This Finds You/.test(note.note);
  const KW = keys.length ? 200 : 0;
  const BW = 1300, G = 18;
  const capW = BW - (KW ? KW + G : 0);
  const BX = (OW - BW) / 2;

  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 38%, #f4f2ed 0%, ${C.ground} 62%, #e2ded5 100%)` }}>
      <UiFont />
      {/* the window */}
      <div style={{ position: 'absolute', left: win.x, top: win.y, width: WIN.w * cam.z, height: WIN.h * cam.z, borderRadius: 14 * k, overflow: 'hidden', background: '#18181a',
        boxShadow: `0 ${30 * k}px ${80 * k}px rgba(40,34,24,0.28), 0 ${6 * k}px ${18 * k}px rgba(40,34,24,0.18), 0 0 0 ${1 * k}px rgba(0,0,0,0.55)` }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: TB * k, background: '#202023', borderBottom: `${k}px solid #0d0d0e` }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c, i) => (
            <div key={c} style={{ position: 'absolute', left: (18 + i * 20) * k, top: (TB / 2 - 6) * k, width: 12 * k, height: 12 * k, borderRadius: '50%', background: c, boxShadow: `inset 0 0 0 ${0.5 * k}px rgba(0,0,0,0.25)` }} />
          ))}
          <div style={{ position: 'absolute', left: '50%', top: 7 * k, height: (TB - 14) * k, width: 340 * k, transform: 'translateX(-50%)', borderRadius: 7 * k, background: '#2c2c30', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 * k, fontFamily: FONT, fontSize: 13 * k, color: '#d6d6da', letterSpacing: 0.1 * k }}>
            <svg width={10 * k} height={12 * k} viewBox="0 0 10 12"><rect x="1" y="5" width="8" height="6.5" rx="1.4" fill="#9a9aa0" /><path d="M3 5 V3.6 a2 2 0 0 1 4 0 V5" fill="none" stroke="#9a9aa0" strokeWidth="1.3" /></svg>
            ifthisfindsyou.app/write
          </div>
        </div>
        <Img src={src} style={{ position: 'absolute', left: 0, top: TB * k, width: PW * k, height: PH * k }} />
      </div>
      {/* the pointer, and a ring where it clicks */}
      {ring && (() => {
        const u = (t - click.t) / 0.5;
        const r = (10 + 26 * easeOut(u)) * k;
        return <div style={{ position: 'absolute', left: ring.x - r, top: ring.y - r, width: 2 * r, height: 2 * r, borderRadius: '50%', border: `${2.2 * k}px solid rgba(255,255,255,${0.85 * (1 - u)})`, background: `rgba(255,255,255,${0.18 * (1 - u)})`, boxShadow: `0 0 0 ${1 * k}px rgba(0,0,0,${0.25 * (1 - u)})` }} />;
      })()}
      {po > 0 && <Arrow x={pp.x} y={pp.y} s={k * 0.95} o={po} press={press} />}

      {/* the bar: the caption, and the key it's about */}
      <svg width={OW} height={BAR_H + 60} style={{ position: 'absolute', left: 0, top: BAR_Y - 30, overflow: 'visible' }}>
        <defs>
          <filter id="goo" x="-10%" y="-40%" width="120%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={8} result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
          </filter>
          <filter id="lift" x="-10%" y="-50%" width="120%" height="200%"><feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#000" floodOpacity="0.28" /></filter>
        </defs>
        <g filter="url(#lift)"><g filter="url(#goo)" fill="rgba(26,26,29,0.94)">
          <rect x={BX} y={30} width={capW} height={BAR_H} rx={BAR_H / 2} />
          {KW > 0 && <rect x={BX + capW + G} y={30} width={KW} height={BAR_H} rx={BAR_H / 2} />}
          {KW > 0 && <ellipse cx={BX + capW + G / 2} cy={30 + BAR_H / 2} rx={G / 2 + 12} ry={15} />}
        </g></g>
      </svg>
      <div style={{ position: 'absolute', left: BX, top: BAR_Y, width: capW, height: BAR_H, display: 'flex', alignItems: 'center', justifyContent: end ? 'center' : 'flex-start', padding: '0 48px', fontFamily: FONT, color: '#f3f1ec', overflow: 'hidden' }}>
        <div style={{ opacity: capIn, transform: `translateY(${(1 - capIn) * 10}px)`, fontSize: 43, fontWeight: 400, whiteSpace: 'nowrap', letterSpacing: -0.4 }}>
          {end ? <><span style={{ fontWeight: 600 }}>If This Finds You</span><span style={{ color: '#8f8c86' }}>{'  ·  '}</span>ifthisfindsyou.app/write</> : note?.note ?? ''}
        </div>
      </div>
      {KW > 0 && (
        <div style={{ position: 'absolute', left: BX + capW + G, top: BAR_Y, width: KW, height: BAR_H, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: FONT, opacity: capIn }}>
          {keys.map((kk) => {
            const [cap, ...rest] = kk.split(' ');
            return (
              <div key={kk} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ minWidth: 64, height: 60, borderRadius: 14, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: '#f3f1ec',
                  background: lit ? '#5b5b62' : '#3a3a40', boxShadow: lit ? 'inset 0 1px 2px rgba(0,0,0,0.3)' : '0 1px 0 rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)', transform: `translateY(${lit ? 2 : 0}px)` }}>{KEYCAPS[cap] ?? cap}</div>
                {rest.length > 0 && <span style={{ fontSize: 30, color: '#a9a59e' }}>{rest.join(' ')}</span>}
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
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

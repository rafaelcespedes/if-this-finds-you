// The fonts video: one row of the Fonts page's list, a cursor typing "The quick brown fox…" in that hand's real font;
// the camera pulls back to the whole list (every row in its own hand's font: scripts/list-fonts.ts builds them with
// the engine's buildFont, as the page's worker does), which scrolls faster and faster, stops, and pulls back again to
// the page itself in a browser window, where the pointer clears the tester and types; every row follows. No sound.
// The world is the page in its own CSS pixels (1600 × 1000, the browser's title bar above it); a camera (centre and
// zoom) frames it. The header and tester bar are the live page's own (public/fonts-page-top.png, from
// scripts/capture-page.mjs); the list, the typing and the window are drawn here. Timing: scene/fontlist-plan.ts.
import { useLayoutEffect, useMemo, useState } from 'react';
import { AbsoluteFill, Img, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import data from './data/list-fonts.json';
import page from './data/fonts-page.json';
import { LINE, LIST_TOP, ROW, T, TYPED, VIEW, rowsAt, rowsPerSecond } from './scene/fontlist-plan';
import { clamp, easeInOutQuint } from './scene/ink';

/* eslint-disable @typescript-eslint/no-explicit-any */
const HANDS = (data as any).hands as { n: number; file: string; name: string; words: string; seed: string }[];
const C = { room: '#e6e4de', ink: '#1e2733', muted: '#575146', rule: 'rgba(30, 39, 51, 0.12)', desk: '#d3d0c8', chrome: '#eceae4', slip: '#f8f5ec' };
const MARGIN = 40, ICONS_W = 112, ICONS_H = 34;
const LIST_W = VIEW.w - 2 * MARGIN;
const LINE_W = LIST_W - ICONS_W - 32; // the writing, up to the actions
const TITLE = 38; // the browser window's title bar, CSS px
const CLOSE_ROW = 2; // the row the video opens on

// ---------- fonts ----------
const loaded = new Map<number, Promise<void>>();
function loadFont(i: number) {
  const j = i % HANDS.length;
  let p = loaded.get(j);
  if (!p) {
    p = new FontFace(`lf-${j}`, `url(${staticFile(`list-fonts/${HANDS[j].file}`)}) format('opentype')`).load().then((f) => { document.fonts.add(f); });
    loaded.set(j, p);
  }
  return p;
}
let uiFonts: Promise<unknown> | null = null;
const loadUi = () => (uiFonts ??= new FontFace('RR Schibsted', `url(${staticFile('fonts/schibsted-grotesk-latin.woff2')}) format('woff2')`, { weight: '400 900' }).load().then((f) => document.fonts.add(f)));

// ---------- the camera ----------
interface Cam { x: number; y: number; z: number }
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const mix = (a: Cam, b: Cam, u: number): Cam => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), u)) });
const span = (t: number, [a, b]: number[]) => easeInOutQuint(clamp((t - a) / (b - a), 0, 1));
function cams(W: number) {
  const s = W / 1920;
  // close: one row's writing, the cursor a little in from the left edge; its neighbours out of frame
  const zc = 6.4;
  const close: Cam = { x: MARGIN - 0.1 * (1920 / zc) + (1920 / zc) / 2, y: LIST_TOP + CLOSE_ROW * ROW + 62, z: zc * s };
  // the list: edge to edge, the tester bar just above the frame
  const zl = 1920 / (LIST_W + 34);
  const list: Cam = { x: VIEW.w / 2, y: LIST_TOP + (1080 / zl) / 2, z: zl * s };
  // the page: the browser window across the frame, its top 50 px down, its foot running off the bottom
  const zp = 1820 / VIEW.w;
  const pageCam: Cam = { x: VIEW.w / 2, y: -TITLE - 50 / zp + (1080 / zp) / 2, z: zp * s };
  return { close, list, pageCam };
}
function camAt(t: number, W: number): Cam {
  const { close, list, pageCam } = cams(W);
  if (t < T.ease[0]) return close;
  if (t < T.pull[0]) return mix(close, list, span(t, T.ease));
  return mix(list, pageCam, span(t, T.pull));
}

// ---------- typing ----------
const typedOf = (text: string, t: number, [a, b]: number[]) => text.slice(0, Math.floor(clamp((t - a) / (b - a), 0, 1) * text.length + 1e-6));
const blinkOn = (t: number, from: number) => Math.floor((t - from) * 2.4) % 2 === 0;
const INPUT = page.input as { x: number; y: number; width: number; height: number };
const CLEAR = { x: INPUT.x + INPUT.width - 18, y: INPUT.y + INPUT.height / 2 };
const testerText = (t: number) => (t < T.click ? LINE : typedOf(TYPED, t, T.type));
function pointerAt(t: number) {
  // in from the lower right of the page to the tester's clear button, a small press on the click
  const from = { x: VIEW.w - 220, y: 640 };
  const u = span(t, T.move);
  const press = t >= T.click && t < T.click + 0.12 ? 0.86 : 1;
  const show = clamp((t - (T.move[0] - 0.2)) / 0.2, 0, 1);
  return { x: lerp(from.x, CLEAR.x, u), y: lerp(from.y, CLEAR.y, u), press, show };
}
const Pointer: React.FC<{ x: number; y: number; press: number; show: number }> = ({ x, y, press, show }) => (
  <svg width={22} height={30} viewBox="0 0 22 30" style={{ position: 'absolute', left: x - 2, top: y - 2, opacity: show, transform: `scale(${press})`, transformOrigin: '2px 2px', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.25))' }}>
    <path d="M2 2 L2 24 L7.5 18.8 L11.2 27.4 L14.6 26 L10.9 17.5 L18.5 17.5 Z" fill="#111" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
  </svg>
);

// ---------- the list ----------
const Row: React.FC<{ i: number; top: number; text: string; caret?: boolean; wide?: boolean }> = ({ i, top, text, caret, wide }) => (
  <div style={{ position: 'absolute', left: MARGIN, width: LIST_W, top, height: ROW, borderBottom: `1px solid ${C.rule}`, boxSizing: 'border-box' }}>
    {/* the row being typed runs past its own edge while the camera holds on it (the page would fade it there) */}
    <div style={{ position: 'absolute', left: 0, width: wide ? 4000 : LINE_W, top: 18, height: 91, overflow: 'hidden', WebkitMaskImage: wide ? undefined : 'linear-gradient(90deg, #000 calc(100% - 80px), transparent)' }}>
      <div style={{ fontFamily: `lf-${i % HANDS.length}`, fontSize: 64, lineHeight: '91px', color: C.ink, whiteSpace: 'nowrap' }}>
        {text || ' '}{caret && <span style={{ display: 'inline-block', width: 3, height: 58, background: C.ink, marginLeft: 3, verticalAlign: 'middle' }} />}
      </div>
    </div>
    <Img src={staticFile('fonts-row-icons.png')} style={{ position: 'absolute', right: -8, top: (ROW - ICONS_H) / 2 - 1, width: ICONS_W, height: ICONS_H }} />
  </div>
);

export const FontList: React.FC = () => {
  const frame = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const t = frame / fps;
  const cam = camAt(t, W);
  const scroll = rowsAt(t) * ROW; // CSS px
  const v = (rowsPerSecond(t) * ROW) / fps; // CSS px a frame
  const rowText = testerText(t);
  const first = Math.max(0, Math.floor(scroll / ROW));
  const last = Math.ceil((scroll + VIEW.h - LIST_TOP) / ROW);
  const rows = useMemo(() => { const r: number[] = []; for (let i = first; i <= last; i++) r.push(i); return r; }, [first, last]);
  const [handle] = useState(() => delayRender('fonts'));
  useLayoutEffect(() => {
    const h = delayRender(`rows ${first}-${last}`);
    Promise.all([loadUi(), ...rows.map(loadFont)]).then(() => document.fonts.ready).then(() => { continueRender(h); continueRender(handle); });
  }, [first, last]); // eslint-disable-line react-hooks/exhaustive-deps
  // the opening row: a blinking cursor, then the line typed in; the cursor stays a moment, then goes
  const opening = t < T.scroll[0];
  const openText = typedOf(LINE, t, T.rowType);
  const openCaret = t < T.rowType[0] ? blinkOn(t, 0) : t < T.rowType[1] ? true : t < T.rowType[1] + 0.4 && blinkOn(t, T.rowType[1]);
  // motion blur: along the scroll, about an eighth of a frame's travel (a hint of speed, the writing still there)
  const blur = Math.min(12, 0.13 * v);
  const p = pointerAt(t);
  const winShow = clamp((t - T.pull[0] - 0.3) / 0.6, 0, 1);
  const testerCaret = t >= T.click && (t < T.type[1] ? t >= T.type[0] || blinkOn(t, T.click) : blinkOn(t, T.type[1]));
  return (
    <AbsoluteFill style={{ background: C.desk }}>
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <filter id="vblur" x="0" y="-20%" width="100%" height="140%"><feGaussianBlur stdDeviation={`0 ${blur.toFixed(2)}`} /></filter>
      </svg>
      <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${W / 2 - cam.x * cam.z}px, ${H / 2 - cam.y * cam.z}px) scale(${cam.z})` }}>
        {/* the browser window: its title bar and address, a shadow on the desk (as the camera pulls back) */}
        <div style={{ position: 'absolute', left: 0, top: -TITLE, width: VIEW.w, height: VIEW.h + TITLE, borderRadius: 10, boxShadow: `0 18px 50px rgba(30, 39, 51, ${0.22 * winShow}), 0 0 0 1px rgba(30, 39, 51, ${0.12 * winShow})`, background: C.chrome, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 14, top: 13, display: 'flex', gap: 8 }}>
            {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />)}
          </div>
          <div style={{ position: 'absolute', left: VIEW.w / 2 - 170, top: 7, width: 340, height: 24, borderRadius: 7, background: 'rgba(30, 39, 51, 0.06)', display: 'grid', placeItems: 'center', fontFamily: '"RR Schibsted", system-ui, sans-serif', fontSize: 13, color: C.muted }}>
            ifthisfindsyou.app/fonts
          </div>
        </div>
        {/* the page's viewport */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: VIEW.w, height: VIEW.h, overflow: 'hidden', background: C.room }}>
          <div style={{ position: 'absolute', left: 0, top: LIST_TOP, width: VIEW.w, height: VIEW.h - LIST_TOP, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: VIEW.w, height: VIEW.h - LIST_TOP, filter: blur > 0.4 ? 'url(#vblur)' : undefined }}>
              {rows.map((i) => (i === CLOSE_ROW && opening
                ? <Row key={i} i={i} top={i * ROW - scroll} text={openText} caret={!!openCaret} wide={t < T.ease[1]} />
                : <Row key={i} i={i} top={i * ROW - scroll} text={rowText} />))}
            </div>
          </div>
          <Img src={staticFile('fonts-page-top.png')} style={{ position: 'absolute', left: 0, top: 0, width: VIEW.w, height: LIST_TOP }} />
          {/* the tester's words, drawn over the picture's own so they can be cleared and typed */}
          <div style={{ position: 'absolute', left: INPUT.x + 1, top: INPUT.y + 1, width: INPUT.width - 40, height: INPUT.height - 2, background: C.slip, display: 'flex', alignItems: 'center', paddingLeft: 7, fontFamily: '"RR Schibsted", system-ui, sans-serif', fontSize: 13, color: C.ink, whiteSpace: 'pre' }}>
            {testerText(t)}
            {testerCaret ? <span style={{ display: 'inline-block', width: 1, height: 16, background: C.ink, marginLeft: 1 }} /> : null}
          </div>
        </div>
        {p.show > 0 && <Pointer {...p} />}
      </div>
    </AbsoluteFill>
  );
};

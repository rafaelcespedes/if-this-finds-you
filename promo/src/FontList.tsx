// The fonts video: the Fonts page's list, every row set in its hand's real font (scripts/list-fonts.ts builds them
// with the engine's buildFont, as the page's worker does), scrolling faster and faster, stopping, then pulling back to
// the page itself in a browser window, where the pointer clears the tester and types; every row follows.
// The world is the page in its own CSS pixels (1024 × 720, the browser window's title bar above it); a camera
// (centre and zoom) frames it. The header and tester bar are the live page's own (public/fonts-page-top.png, from
// scripts/capture-page.mjs); the list, the typing and the window are drawn here. Timing: scene/fontlist-plan.ts.
import { useLayoutEffect, useMemo, useState } from 'react';
import { AbsoluteFill, Audio, Img, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import data from './data/list-fonts.json';
import page from './data/fonts-page.json';
import { LIST_TOP, ROW, T, TYPED, VIEW, rowsAt, rowsPerSecond } from './scene/fontlist-plan';
import { bezier, clamp, easeInOutQuint } from './scene/ink';

/* eslint-disable @typescript-eslint/no-explicit-any */
const HANDS = (data as any).hands as { n: number; file: string; name: string; words: string; seed: string }[];
const LINE = (data as any).line as string;
const C = { room: '#e6e4de', ink: '#1e2733', muted: '#575146', rule: 'rgba(30, 39, 51, 0.12)', desk: '#d3d0c8', chrome: '#eceae4', slip: '#f8f5ec' };
const MARGIN = 40, ICONS_W = 112, ICONS_H = 34, LINE_RIGHT = 984 - ICONS_W - 32;
const TITLE = 38; // the browser window's title bar, CSS px
const writeEase = bezier(0.33, 0.45, 0.35, 1);

// ---------- fonts ----------
const loaded = new Map<number, Promise<void>>();
function loadFont(i: number) {
  let p = loaded.get(i);
  if (!p) {
    const h = HANDS[i % HANDS.length];
    p = new FontFace(`lf-${i % HANDS.length}`, `url(${staticFile(`list-fonts/${h.file}`)}) format('opentype')`).load().then((f) => { document.fonts.add(f); });
    loaded.set(i, p);
  }
  return p;
}
let uiFonts: Promise<unknown> | null = null;
const loadUi = () => (uiFonts ??= Promise.all([
  new FontFace('RR Schibsted', `url(${staticFile('fonts/schibsted-grotesk-latin.woff2')}) format('woff2')`, { weight: '400 900' }).load().then((f) => document.fonts.add(f)),
]));

// ---------- the camera ----------
interface Cam { x: number; y: number; z: number }
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const mix = (a: Cam, b: Cam, u: number): Cam => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), u)) });
function camAt(t: number, W: number, H: number): Cam {
  // close: the first row's opening words, big; the list: full width, the header just above the frame; the page: the
  // whole browser window with the desk around it
  // (the third row, so the tester bar stays out of the close frame)
  const close: Cam = { x: MARGIN + (1920 / 3.4) / 2 - 24, y: LIST_TOP + 2 * ROW + ROW / 2 + 4, z: 3.4 * (W / 1920) };
  const listZ = (W / 1920) * 1.9;
  const list: Cam = { x: VIEW.w / 2, y: LIST_TOP + (H / listZ) / 2 - 6, z: listZ };
  const pageZ = (W / 1920) * 1.32;
  const pageCam: Cam = { x: VIEW.w / 2, y: (VIEW.h - TITLE) / 2, z: pageZ };
  if (t < T.ease[0]) return close;
  if (t < T.ease[1]) return mix(close, list, easeInOutQuint(clamp((t - T.ease[0]) / (T.ease[1] - T.ease[0]), 0, 1)));
  if (t < T.pull[0]) return list;
  if (t < T.pull[1]) return mix(list, pageCam, easeInOutQuint(clamp((t - T.pull[0]) / (T.pull[1] - T.pull[0]), 0, 1)));
  return pageCam;
}

// ---------- the tester and the pointer ----------
const INPUT = page.input as { x: number; y: number; width: number; height: number };
const CLEAR = { x: INPUT.x + INPUT.width - 18, y: INPUT.y + INPUT.height / 2 };
function testerText(t: number) {
  if (t < T.click) return LINE;
  if (t < T.type[0]) return '';
  const n = Math.floor(clamp((t - T.type[0]) / (T.type[1] - T.type[0]), 0, 1) * TYPED.length + 1e-6);
  return TYPED.slice(0, n);
}
function pointerAt(t: number) {
  // in from the lower right of the page to the tester's clear button, a small press on the click
  const from = { x: 900, y: 560 };
  const u = easeInOutQuint(clamp((t - T.move[0]) / (T.move[1] - T.move[0]), 0, 1));
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
const Row: React.FC<{ i: number; top: number; text: string; write?: number }> = ({ i, top, text, write }) => {
  const mask = write == null || write >= 1 ? undefined : `linear-gradient(to right, #000 45%, transparent 55%)`;
  return (
    <div style={{ position: 'absolute', left: MARGIN, width: 984 - MARGIN, top, height: ROW, borderBottom: `1px solid ${C.rule}`, boxSizing: 'border-box' }}>
      <div style={{ position: 'absolute', left: 0, right: 984 - MARGIN - LINE_RIGHT, top: 18, height: 91, overflow: 'hidden', WebkitMaskImage: 'linear-gradient(90deg, #000 calc(100% - 80px), transparent)' }}>
        <div style={{
          fontFamily: `lf-${i % HANDS.length}`, fontSize: 64, lineHeight: '91px', color: C.ink, whiteSpace: 'nowrap',
          WebkitMaskImage: mask, WebkitMaskSize: '220% 100%', WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: mask ? `${100 * (1 - (write ?? 1))}% 0` : undefined,
        }}>{text || ' '}</div>
      </div>
      <Img src={staticFile('fonts-row-icons.png')} style={{ position: 'absolute', right: -6, top: (ROW - ICONS_H) / 2 - 1, width: ICONS_W, height: ICONS_H }} />
    </div>
  );
};

export const FontList: React.FC = () => {
  const frame = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const t = frame / fps;
  const cam = camAt(t, W, H);
  const scroll = rowsAt(t) * ROW; // CSS px
  const v = rowsPerSecond(t) * ROW / fps; // CSS px a frame
  const text = t < T.click ? LINE : testerText(t);
  const first = Math.max(0, Math.floor(scroll / ROW));
  const last = Math.ceil((scroll + VIEW.h - LIST_TOP) / ROW);
  const rows = useMemo(() => { const r: number[] = []; for (let i = first; i <= last; i++) r.push(i); return r; }, [first, last]);
  const [handle] = useState(() => delayRender('fonts'));
  useLayoutEffect(() => {
    const h = delayRender(`rows ${first}-${last}`);
    Promise.all([loadUi(), ...rows.map(loadFont)]).then(() => document.fonts.ready).then(() => { continueRender(h); continueRender(handle); });
  }, [first, last]); // eslint-disable-line react-hooks/exhaustive-deps
  // the row in the close frame writes itself in (the page's fx-write, 0.9 s); its neighbours are already written, so
  // the first frame is never empty
  const writeOf = (i: number) => (i === 2 ? writeEase(clamp((t - T.write[0]) / (T.write[1] - T.write[0]), 0, 1)) : 1);
  // motion blur: along the scroll, about an eighth of a frame's travel (a hint of speed, the writing still there)
  const blur = Math.min(12, 0.13 * v);
  const p = pointerAt(t);
  const winShow = clamp((t - T.pull[0] - 0.3) / 0.6, 0, 1);
  return (
    <AbsoluteFill style={{ background: C.desk }}>
      <Audio src={staticFile('sound-fonts.wav')} />
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <filter id="vblur" x="0" y="-20%" width="100%" height="140%"><feGaussianBlur stdDeviation={`0 ${blur.toFixed(2)}`} /></filter>
      </svg>
      <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${W / 2 - cam.x * cam.z}px, ${H / 2 - cam.y * cam.z}px) scale(${cam.z})` }}>
        {/* the browser window: its title bar and URL, a shadow on the desk (shown as the camera pulls back) */}
        <div style={{ position: 'absolute', left: 0, top: -TITLE, width: VIEW.w, height: VIEW.h + TITLE, borderRadius: 10, boxShadow: `0 18px 50px rgba(30, 39, 51, ${0.22 * winShow}), 0 0 0 1px rgba(30, 39, 51, ${0.12 * winShow})`, background: C.chrome, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 14, top: 13, display: 'flex', gap: 8 }}>
            {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />)}
          </div>
          <div style={{ position: 'absolute', left: VIEW.w / 2 - 150, top: 7, width: 300, height: 24, borderRadius: 7, background: 'rgba(30, 39, 51, 0.06)', display: 'grid', placeItems: 'center', fontFamily: '"RR Schibsted", system-ui, sans-serif', fontSize: 12.5, color: C.muted }}>
            ifthisfindsyou.app/fonts
          </div>
        </div>
        {/* the page's viewport */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: VIEW.w, height: VIEW.h, overflow: 'hidden', background: C.room }}>
          <div style={{ position: 'absolute', left: 0, top: LIST_TOP, width: VIEW.w, height: VIEW.h - LIST_TOP, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: VIEW.w, height: VIEW.h - LIST_TOP, filter: blur > 0.4 ? 'url(#vblur)' : undefined }}>
              {rows.map((i) => <Row key={i} i={i} top={i * ROW - scroll} text={text} write={i < 8 ? writeOf(i) : undefined} />)}
            </div>
          </div>
          <Img src={staticFile('fonts-page-top.png')} style={{ position: 'absolute', left: 0, top: 0, width: VIEW.w, height: LIST_TOP }} />
          {/* the tester's words, drawn over the picture's own so they can be cleared and typed */}
          <div style={{ position: 'absolute', left: INPUT.x + 1, top: INPUT.y + 1, width: INPUT.width - 40, height: INPUT.height - 2, background: C.slip, display: 'flex', alignItems: 'center', paddingLeft: 7, fontFamily: '"RR Schibsted", system-ui, sans-serif', fontSize: 13, color: C.ink, whiteSpace: 'pre' }}>
            {testerText(t)}
            {t >= T.click && t < T.end && Math.floor((t - T.click) * 2.2) % 2 === 0 || (t >= T.type[0] && t < T.type[1]) ? <span style={{ display: 'inline-block', width: 1, height: 16, background: C.ink, marginLeft: 1 }} /> : null}
          </div>
        </div>
        {p.show > 0 && <Pointer {...p} />}
      </div>
    </AbsoluteFill>
  );
};

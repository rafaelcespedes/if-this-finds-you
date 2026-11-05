// The fonts video: one row of the Fonts page's list, a cursor typing "The quick brown fox…" in that hand's real font;
// the camera pulls back to the whole list (every row in its own hand's font: scripts/list-fonts.ts builds them with
// the engine's buildFont, as the page's worker does), which scrolls faster and faster, stops, and pulls back again to
// the page itself in a browser window, where the pointer clears the tester and types; every row follows. No sound.
// The world is the page in its own CSS pixels (1600 × 1000, the browser's title bar above it); a camera (centre and
// zoom) frames it. The header and tester bar are the live page's own (public/fonts-page-top.png, from
// scripts/capture-page.mjs); the list, the typing and the window are drawn here. Timing: scene/fontlist-plan.ts.
import { useLayoutEffect, useMemo, useState } from 'react';
import { AbsoluteFill, Img, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import data from './data/list-fonts.json';
import openFonts from './data/open-fonts.json';
import pageWide from './data/fonts-page.json';
import pageSquare from './data/fonts-page-1024.json';
import { LINE, ROW, T, rowsAt, rowsPerSecond, typeTimes } from './scene/fontlist-plan';

export const fontListSchema = z.object({
  /** the hand the video opens on: one of Rafael's favourites (src/data/open-fonts.json, 1-based), or 0 for the list's own */
  openHand: z.number().default(0),
  /** what the pointer types into the tester at the end */
  endText: z.string().default('Over a million handwritten fonts'),
  /** the page it's set in: 'wide' (1600 × 1000, for 16:9) or 'square' (1024 × 1150, for a square frame) */
  variant: z.enum(['wide', 'square']).default('wide'),
  /** the frame it draws into, px (0: the composition's own; set when it's placed inside another composition) */
  w: z.number().default(0),
  h: z.number().default(0),
});
export type FontListProps = z.infer<typeof fontListSchema>;
const OPEN = openFonts as { n: number; file: string; name: string; seed: string; words: string }[];
import { bezier, clamp, easeInOutQuint } from './scene/ink';

/* eslint-disable @typescript-eslint/no-explicit-any */
const HANDS = (data as any).hands as { n: number; file: string; name: string; words: string; seed: string }[];
const C = { room: '#e6e4de', ink: '#1e2733', muted: '#575146', rule: 'rgba(30, 39, 51, 0.12)', desk: '#d3d0c8', chrome: '#eceae4', slip: '#f8f5ec' };
const MARGIN = 40, ICONS_W = 112, ICONS_H = 34;
const TITLE = 38; // the browser window's title bar, CSS px
const CLOSE_ROW = 2; // the row the video opens on

// ---------- the page: photographed at two sizes (scripts/capture-page.mjs) ----------
interface Layout {
  view: { w: number; h: number };
  /** under the sticky header and tester bar */
  listTop: number;
  input: { x: number; y: number; width: number; height: number };
  /** the photo of the header and tester bar */
  top: string;
  listW: number;
  /** the writing, up to the actions */
  lineW: number;
  /** how tall a slice of the page the close frame shows (one row's writing, its neighbours out of frame) */
  closeH: number;
}
function layoutOf(page: any, top: string, closeH: number): Layout {
  const listW = page.width - 2 * MARGIN;
  return { view: { w: page.width, h: page.height }, listTop: page.bar.bottom, input: page.input, top, listW, lineW: listW - ICONS_W - 32, closeH };
}
const LAYOUTS: Record<'wide' | 'square', Layout> = {
  wide: layoutOf(pageWide, 'fonts-page-top.png', 169),
  square: layoutOf(pageSquare, 'fonts-page-1024-top.png', 160),
};

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
const openLoaded = new Map<number, Promise<void>>();
function loadOpen(n: number) {
  let p = openLoaded.get(n);
  if (!p) {
    p = new FontFace(`of-${n}`, `url(${staticFile(`open-fonts/${OPEN[n - 1].file}`)}) format('opentype')`).load().then((f) => { document.fonts.add(f); });
    openLoaded.set(n, p);
  }
  return p;
}
let uiFonts: Promise<unknown> | null = null;
const loadUi = () => (uiFonts ??= new FontFace('RR Schibsted', `url(${staticFile('fonts/schibsted-grotesk-latin.woff2')}) format('woff2')`, { weight: '400 900' }).load().then((f) => document.fonts.add(f)));

// ---------- the camera ----------
interface Cam { x: number; y: number; z: number }
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
/** between two cameras: a zoom about one point of the page (the anchor), the zoom eased in log space and the anchor's
 *  place on the screen moved on the same curve, so everything in the frame moves together, radially, as one zoom */
function mix(a: Cam, b: Cam, u: number, A: { x: number; y: number }, W: number, H: number): Cam {
  const z = Math.exp(lerp(Math.log(a.z), Math.log(b.z), u));
  const sx = lerp((A.x - a.x) * a.z, (A.x - b.x) * b.z, u), sy = lerp((A.y - a.y) * a.z, (A.y - b.y) * b.z, u);
  return { x: A.x - sx / z, y: A.y - sy / z, z };
}
const span = (t: number, [a, b]: number[], ease = easeInOutQuint) => ease(clamp((t - a) / (b - a), 0, 1));
// the pull backs: a gentle start, a long settle (a cubic-like in-out, softer than the quint)
const zoomEase = bezier(0.55, 0, 0.25, 1);
function cams(W: number, H: number, L: Layout) {
  // close: one row's writing, the cursor a little in from the left edge; its neighbours out of frame
  const zc = H / L.closeH, vw = W / zc;
  const close: Cam = { x: MARGIN - 0.1 * vw + vw / 2, y: L.listTop + CLOSE_ROW * ROW + 62, z: zc };
  // the list: edge to edge, the tester bar just above the frame
  const zl = W / (L.listW + 34);
  const list: Cam = { x: L.view.w / 2, y: L.listTop + H / zl / 2, z: zl };
  // the page: the browser window across the frame, its top 50 px down, its foot running off the bottom
  const zp = (W - 100) / L.view.w;
  const pageCam: Cam = { x: L.view.w / 2, y: -TITLE - 50 / zp + H / zp / 2, z: zp };
  return { close, list, pageCam };
}
function camAt(t: number, W: number, H: number, L: Layout): Cam {
  const { close, list, pageCam } = cams(W, H, L);
  if (t < T.ease[0]) return close;
  // anchors: the start of the opening line (the cursor's place), then the list's top-left corner
  if (t < T.pull[0]) return mix(close, list, span(t, T.ease, zoomEase), { x: MARGIN, y: L.listTop + CLOSE_ROW * ROW + 62 }, W, H);
  return mix(list, pageCam, span(t, T.pull, zoomEase), { x: MARGIN, y: L.listTop }, W, H);
}

// ---------- typing ----------
const timesCache = new Map<string, number[]>();
function typedOf(text: string, t: number, win: number[]) {
  const key = `${text}|${win.join()}`;
  let times = timesCache.get(key);
  if (!times) { times = typeTimes(text, win, text.length); timesCache.set(key, times); }
  let n = 0;
  while (n < times.length && times[n] <= t) n++;
  return text.slice(0, n);
}
const blinkOn = (t: number, from: number) => Math.floor((t - from) * 2.4) % 2 === 0;
const testerText = (t: number, end: string) => (t < T.click ? LINE : typedOf(end, t, T.type));
function pointerAt(t: number, L: Layout) {
  // in from beyond the frame's lower right, along a slight curve, slowing onto the tester's clear button; a press
  const CLEAR = { x: L.input.x + L.input.width - 18, y: L.input.y + L.input.height / 2 };
  const from = { x: L.view.w + 60, y: Math.min(820, L.view.h * 0.75) }, ctrl = { x: CLEAR.x + 420, y: CLEAR.y + 260 };
  const u = span(t, T.move, bezier(0.3, 0.1, 0.2, 1));
  const x = (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * ctrl.x + u * u * CLEAR.x;
  const y = (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * ctrl.y + u * u * CLEAR.y;
  const press = t >= T.click && t < T.click + 0.12 ? 0.86 : 1;
  return { x, y, press, show: t >= T.move[0] ? 1 : 0 };
}
const Pointer: React.FC<{ x: number; y: number; press: number; show: number }> = ({ x, y, press, show }) => (
  <svg width={22} height={30} viewBox="0 0 22 30" style={{ position: 'absolute', left: x - 2, top: y - 2, opacity: show, transform: `scale(${press})`, transformOrigin: '2px 2px', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.25))' }}>
    <path d="M2 2 L2 24 L7.5 18.8 L11.2 27.4 L14.6 26 L10.9 17.5 L18.5 17.5 Z" fill="#111" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
  </svg>
);

// ---------- the list ----------
/** a text cursor with serifs (an I-beam), its left edge on the rule's start when the line is empty */
const Caret: React.FC = () => (
  <svg width={14} height={62} viewBox="0 0 14 62" style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: 0 }}>
    <path d="M1.4 2.2 Q7 2.2 7 6.5 Q7 2.2 12.6 2.2 M7 6.5 L7 55.5 M1.4 59.8 Q7 59.8 7 55.5 Q7 59.8 12.6 59.8" fill="none" stroke={C.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Row: React.FC<{ i: number; top: number; text: string; L: Layout; caret?: boolean; wide?: boolean; family?: string }> = ({ i, top, text, L, caret, wide, family }) => (
  <div style={{ position: 'absolute', left: MARGIN, width: L.listW, top, height: ROW, borderBottom: `1px solid ${C.rule}`, boxSizing: 'border-box' }}>
    {/* the row being typed runs past its own edge while the camera holds on it (the page would fade it there) */}
    <div style={{ position: 'absolute', left: 0, width: wide ? 4000 : L.lineW, top: 18, height: 91, overflow: 'hidden', WebkitMaskImage: wide ? undefined : 'linear-gradient(90deg, #000 calc(100% - 80px), transparent)' }}>
      <div style={{ fontFamily: family ?? `lf-${i % HANDS.length}`, fontSize: 64, lineHeight: '91px', color: C.ink, whiteSpace: 'nowrap' }}>
        {text || (caret ? '' : '\u00a0')}{caret && <Caret />}
      </div>
    </div>
    <Img src={staticFile('fonts-row-icons.png')} style={{ position: 'absolute', right: -8, top: (ROW - ICONS_H) / 2 - 1, width: ICONS_W, height: ICONS_H }} />
  </div>
);

export const FontList: React.FC<FontListProps> = ({ openHand, endText, variant, w, h }) => {
  const frame = useCurrentFrame();
  const config = useVideoConfig();
  const W = w || config.width, H = h || config.height, fps = config.fps;
  const L = LAYOUTS[variant] ?? LAYOUTS.wide;
  const VIEW = L.view, LIST_TOP = L.listTop, INPUT = L.input;
  const t = frame / fps;
  const cam = camAt(t, W, H, L);
  const scroll = rowsAt(t) * ROW; // CSS px
  const v = (rowsPerSecond(t) * ROW) / fps; // CSS px a frame
  // the opening: every row types the line together (the one in the close frame with its cursor), then the tester's
  const openText = typedOf(LINE, t, T.rowType);
  const rowText = t < T.rowType[1] ? openText : testerText(t, endText);
  const openFamily = openHand > 0 && OPEN[openHand - 1] ? `of-${openHand}` : undefined;
  const first = Math.max(0, Math.floor(scroll / ROW));
  const last = Math.ceil((scroll + VIEW.h - LIST_TOP) / ROW);
  const rows = useMemo(() => { const r: number[] = []; for (let i = first; i <= last; i++) r.push(i); return r; }, [first, last]);
  const [handle] = useState(() => delayRender('fonts'));
  useLayoutEffect(() => {
    const h = delayRender(`rows ${first}-${last}`);
    Promise.all([loadUi(), ...rows.map(loadFont), ...(openFamily ? [loadOpen(openHand)] : [])]).then(() => document.fonts.ready).then(() => { continueRender(h); continueRender(handle); });
  }, [first, last]); // eslint-disable-line react-hooks/exhaustive-deps
  // the opening row: a blinking cursor, then the line typed in; the cursor stays a moment, then goes
  const opening = t < T.scroll[0];
  const openCaret = t < T.rowType[0] ? blinkOn(t, 0) : t < T.rowType[1] ? true : t < T.rowType[1] + 0.4 && blinkOn(t, T.rowType[1]);
  // motion blur: along the scroll, about an eighth of a frame's travel (a hint of speed, the writing still there)
  const blur = Math.min(12, 0.13 * v);
  const p = pointerAt(t, L);
  const winShow = clamp((t - T.pull[0] - 0.3) / 0.6, 0, 1);
  const testerCaret = t >= T.click && (t < T.type[1] ? t >= T.type[0] || blinkOn(t, T.click) : blinkOn(t, T.type[1]));
  return (
    <AbsoluteFill style={{ background: C.desk, overflow: 'hidden', width: W, height: H }}>
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <filter id="vblur" x="0" y="-20%" width="100%" height="140%"><feGaussianBlur stdDeviation={`0 ${blur.toFixed(2)}`} /></filter>
      </svg>
      <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${W / 2 - cam.x * cam.z}px, ${H / 2 - cam.y * cam.z}px) scale(${cam.z})` }}>
        {/* the browser window: its title bar and address, a shadow on the desk (as the camera pulls back) */}
        <div style={{ position: 'absolute', left: 0, top: -TITLE, width: VIEW.w, height: VIEW.h + TITLE, borderRadius: 10, boxShadow: `0 0 0 1px rgba(30, 39, 51, ${0.14 * winShow})`, background: C.chrome, overflow: 'hidden' }}>
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
                ? <Row key={i} i={i} L={L} top={i * ROW - scroll} text={openText} caret={!!openCaret} wide={t < T.ease[1]} family={openFamily} />
                : <Row key={i} i={i} L={L} top={i * ROW - scroll} text={rowText} family={i === CLOSE_ROW ? openFamily : undefined} />))}
            </div>
          </div>
          <Img src={staticFile(L.top)} style={{ position: 'absolute', left: 0, top: 0, width: VIEW.w, height: LIST_TOP }} />
          {/* the tester's words, drawn over the picture's own so they can be cleared and typed */}
          <div style={{ position: 'absolute', left: INPUT.x + 1, top: INPUT.y + 1, width: INPUT.width - 40, height: INPUT.height - 2, background: C.slip, display: 'flex', alignItems: 'center', paddingLeft: 7, fontFamily: '"RR Schibsted", system-ui, sans-serif', fontSize: 13, color: C.ink, whiteSpace: 'pre' }}>
            {testerText(t, endText)}
            {testerCaret ? <span style={{ display: 'inline-block', width: 1, height: 16, background: C.ink, marginLeft: 1 }} /> : null}
          </div>
        </div>
        {p.show > 0 && <Pointer {...p} />}
      </div>
    </AbsoluteFill>
  );
};

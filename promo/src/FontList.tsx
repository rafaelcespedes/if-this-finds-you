// The fonts video: the Fonts page's list (app/src/fonts/new/Row.tsx, fonts-new.css, measured on the live site at
// 1024 px wide), every row set in its hand's real font (scripts/list-fonts.ts builds them with the engine's buildFont,
// as the page's worker does), scrolling. Laid out in the page's own CSS pixels at 1024 wide and scaled to the frame.
import { useLayoutEffect, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { z } from 'zod';
import data from './data/list-fonts.json';

export const fontListSchema = z.object({
  /** the page's width in CSS px (the frame shows it scaled up) */
  pageWidth: z.number().default(1024),
});
export type FontListProps = z.infer<typeof fontListSchema>;

const HANDS = (data as any).hands as { n: number; file: string; name: string; words: string; seed: string }[];
const LINE = (data as any).line as string;

// the page, measured (CSS px)
const ROW = 94, MARGIN = 40, WHO = 240, GAP = 32, ACTIONS = 106;
const C = { room: '#e6e4de', ink: '#1e2733', muted: '#575146', rule: 'rgba(30, 39, 51, 0.12)' };

/** where the list is scrolled to, in CSS px from its top (placeholder until the timing is set) */
export function scrollAt(frame: number, fps: number) {
  const t = frame / fps;
  return 60 * t + 30 * Math.pow(2, Math.max(0, t - 2) * 1.2);
}

const loaded = new Map<number, Promise<void>>();
function loadFont(i: number) {
  let p = loaded.get(i);
  if (!p) {
    const h = HANDS[i];
    p = new FontFace(`lf-${i}`, `url(${staticFile(`list-fonts/${h.file}`)}) format('opentype')`).load().then((f) => { document.fonts.add(f); });
    loaded.set(i, p);
  }
  return p;
}
const ui = new Map<string, Promise<void>>();
function loadUi() {
  const files = [
    ['RR Newsreader', 'newsreader-latin-roman.woff2', '200 800'],
    ['RR Schibsted', 'schibsted-grotesk-latin.woff2', '400 900'],
  ];
  return Promise.all(files.map(([fam, file, w]) => {
    let p = ui.get(file);
    if (!p) { p = new FontFace(fam, `url(${staticFile(`fonts/${file}`)}) format('woff2')`, { weight: w }).load().then((f) => { document.fonts.add(f); }); ui.set(file, p); }
    return p;
  }));
}

// lucide's Heart, PenLine and Download (the page's icons), 24-unit boxes drawn at 16 px
const Icon: React.FC<{ d: string[] }> = ({ d }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {d.map((p, i) => <path key={i} d={p} />)}
  </svg>
);
const HEART = ['M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5'];
const PEN = ['M13 21h8', 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'];
const DOWN = ['M12 15V3', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5'];

const Row: React.FC<{ i: number; top: number }> = ({ i, top }) => {
  const h = HANDS[i % HANDS.length];
  return (
    <div style={{ position: 'absolute', left: MARGIN, right: MARGIN, top, height: ROW, borderBottom: `1px solid ${C.rule}`, boxSizing: 'border-box' }}>
      <div style={{ position: 'absolute', left: 0, top: 24.45, width: WHO }}>
        <div style={{ fontFamily: '"RR Newsreader", Georgia, serif', fontSize: 18, fontWeight: 500, lineHeight: '22.5px', color: C.ink, whiteSpace: 'nowrap' }}>{h.name}</div>
        <div style={{ fontFamily: '"RR Schibsted", system-ui, sans-serif', fontSize: 14, lineHeight: '19.6px', color: C.muted, whiteSpace: 'nowrap' }}>{h.words}</div>
      </div>
      <div style={{ position: 'absolute', left: WHO + GAP, right: ACTIONS + GAP, top: 18, height: 56.8, overflow: 'hidden', WebkitMaskImage: 'linear-gradient(90deg, #000 calc(100% - 80px), transparent)' }}>
        <div style={{ fontFamily: `lf-${i % HANDS.length}`, fontSize: 40, lineHeight: '56.8px', color: C.ink, whiteSpace: 'nowrap' }}>{LINE}</div>
      </div>
      <div style={{ position: 'absolute', right: -2, top: 28.5, display: 'flex' }}>
        {[HEART, PEN, DOWN].map((d, k) => <div key={k} style={{ width: 36, height: 36, display: 'grid', placeItems: 'center' }}><Icon d={d} /></div>)}
      </div>
    </div>
  );
};

export const FontList: React.FC<FontListProps> = ({ pageWidth }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const zoom = width / pageWidth;
  const pageH = height / zoom;
  const y = scrollAt(frame, fps);
  const first = Math.max(0, Math.floor(y / ROW) - 1);
  const last = Math.ceil((y + pageH) / ROW) + 1;
  const rows: number[] = [];
  for (let i = first; i <= last; i++) rows.push(i);
  const [handle] = useState(() => delayRender('fonts'));
  useLayoutEffect(() => {
    const h = delayRender(`rows ${first}-${last}`);
    Promise.all([loadUi(), ...rows.map((i) => loadFont(i % HANDS.length))]).then(() => { continueRender(h); continueRender(handle); });
  }, [first, last]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AbsoluteFill style={{ background: C.room }}>
      <div style={{ width: pageWidth, height: pageH, transform: `scale(${zoom})`, transformOrigin: '0 0', position: 'relative', overflow: 'hidden' }}>
        {rows.map((i) => <Row key={i} i={i} top={i * ROW - y} />)}
      </div>
    </AbsoluteFill>
  );
};

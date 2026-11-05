// The candidates for the fonts video's opening line: each of Rafael's favourite hands (src/data/open-fonts.json,
// fonts from scripts/list-fonts.ts) writing the pangram, numbered, with the writer and seed, on the room's colour.
import { useLayoutEffect, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, staticFile } from 'remotion';
import openFonts from './data/open-fonts.json';

const OPEN = openFonts as { n: number; no: number; file: string; name: string; seed: string; words: string }[];
const LINE = 'The quick brown fox jumps over the lazy dog';

export const OpenOptions: React.FC = () => {
  const [h] = useState(() => delayRender('open fonts'));
  useLayoutEffect(() => {
    Promise.all([
      new FontFace('RR Schibsted', `url(${staticFile('fonts/schibsted-grotesk-latin.woff2')}) format('woff2')`, { weight: '400 900' }).load(),
      ...OPEN.map((o) => new FontFace(`of-${o.n}`, `url(${staticFile(`open-fonts/${o.file}`)}) format('opentype')`).load()),
    ]).then((fs) => { fs.forEach((f) => document.fonts.add(f)); continueRender(h); });
  }, [h]);
  return (
    <AbsoluteFill style={{ background: '#e6e4de', padding: '40px 48px' }}>
      {OPEN.map((o) => (
        <div key={o.n} style={{ display: 'flex', alignItems: 'center', height: 138, borderBottom: '1px solid rgba(30,39,51,0.12)' }}>
          <div style={{ width: 230, fontFamily: '"RR Schibsted", sans-serif', color: '#575146', fontSize: 17, lineHeight: 1.4 }}>
            <div style={{ fontSize: 30, fontWeight: 600, color: '#9b3b2a' }}>{o.n}</div>
            <div style={{ color: '#1e2733' }}>{o.name}</div>
            <div>{o.words}</div>
          </div>
          <div style={{ fontFamily: `of-${o.n}`, fontSize: 64, color: '#1e2733', whiteSpace: 'nowrap', overflow: 'hidden' }}>{LINE}</div>
        </div>
      ))}
    </AbsoluteFill>
  );
};

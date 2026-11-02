// layout.js — text -> positioned glyph instances on a page. Pure data, no DOM.
//
// Every occurrence of a letter is its own instance (sub-seed = position + char), so no two are alike.
// Coordinates: font units (UPM 1000). x grows right, y grows DOWN (page space); `y` is the baseline.
// Glyph contours themselves are y-up, so a renderer draws contour point q at (x + q.x, y - q.y).

import { rng } from './core.js';
import { makeGlyph, has, UPM } from './hand.js';
import { getStyle } from './glyphs.js';

export const MISS_ADVANCE = 560;

// opts: { maxWidth (font units), lineHeight (font units, default 1.6 em), firstBaseline (default 0.95 em) }
// Returns { items, height, lines, misses }
//   items: { kind: 'glyph', ch, g, x, y, charIndex, inkIndex, line }
//        | { kind: 'miss',  ch, x, y, charIndex, line }      (a character this hand can't write yet)
export function layout(p, text, opts = {}) {
  const maxU = opts.maxWidth || 12000;
  const lineH = opts.lineHeight || 1.6 * UPM;
  const N = p.noise;
  const messy = 1 - p.neatness;
  const connected = !!(getStyle(p.style) && getStyle(p.style).connected);
  const spaceG = makeGlyph(p, ' ', null);
  const spaceAdv = spaceG.advance * p.wordSpace;  // = hand.space
  let charIndex = 0;
  let lineNo = 0;
  const items = [];
  const misses = [];
  let y = opts.firstBaseline == null ? 0.95 * UPM : opts.firstBaseline;
  for (const para of String(text).split('\n')) {
    const words = para.split(/ +/);
    let x = 0;
    let first = true;
    const wordRng = rng('words:' + p.seed + ':' + lineNo);
    for (const word of words) {
      // build instances for this word
      const glyphs = [];
      let wx = 0;
      const chars = [...word];
      chars.forEach((ch, wi) => {
        if (!has(p, ch)) {
          // never fall back silently: the renderer shows a placeholder, and we log the miss
          misses.push(ch);
          glyphs.push({ miss: ch, dx: wx, charIndex });
          wx += MISS_ADVANCE;
          charIndex++;
          return;
        }
        const ctx = { prev: chars[wi - 1] || null, next: chars[wi + 1] || null, index: wi, wordStart: wi === 0, wordEnd: wi === chars.length - 1 };
        const g = makeGlyph(p, ch, { seed: 'live:' + charIndex + ':' + ch, amount: 1 }, ctx);
        const jitter = connected ? 0 : rng('sp:' + p.seed + ':' + charIndex).gauss() * 9 * messy;
        glyphs.push({ g, ch, dx: wx, charIndex });
        wx += g.advance + jitter;
        charIndex++;
      });
      const gap = first ? 0 : spaceAdv * (1 + wordRng.gauss() * 0.12 * (0.5 + messy));
      if (!first && x + gap + wx > maxU) { x = 0; y += lineH; lineNo++; } else x += gap;
      const wordLift = wordRng.gauss() * 7 * (0.3 + messy);
      for (const it of glyphs) {
        const gx = x + it.dx;
        if (it.miss) {
          items.push({ kind: 'miss', ch: it.miss, x: gx, y, charIndex: it.charIndex, line: lineNo });
          continue;
        }
        // baseline wanders slowly along the line
        const wob = p.drift * (12 + 34 * messy) * N.n1(gx / 1700 + lineNo * 13.37) + wordLift;
        // inkIndex: ink density is sampled per word position (see pen.strokeOpacity)
        items.push({ kind: 'glyph', ch: it.ch, g: it.g, x: gx, y: y - wob, charIndex: it.charIndex, inkIndex: charIndex, line: lineNo });
      }
      x += wx;
      charIndex++; // the space
      first = false;
    }
    y += lineH; lineNo++;
  }
  return { items, height: y - lineH + 0.45 * UPM, lines: lineNo, misses, lineHeight: lineH };
}

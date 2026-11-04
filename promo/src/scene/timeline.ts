// The video's clock: everything sits on a beat grid, in whole frames, worked out from the settings alone.
// Nothing here draws; the scene asks "which section, which hand, which form of the letter" for a frame number.
//
// The grid: beat n starts at frame round(offset·fps + n · 60/bpm · fps), placed from a running total so a tempo
// whose beat isn't a whole number of frames never drifts. At the default 112.5 BPM a beat is exactly 16 frames at
// 30 fps (32 at 60) and a bar of four beats 2.13 s.
//
// The flip: one hand a beat for a while, then a smooth speed-up (the cut rate doubles every few beats, from one a
// beat to one a frame), a moment at full speed, then a dead stop on a bar's first beat. Each cut is snapped to the
// finest power-of-two division of the beat that is no longer than its gap (eighths, sixteenths…), so even the
// speed-up stays on the music.

export interface LetterBeat {
  ch: string;
  /** beats this letter is highlighted and changing form */
  beats: number;
}

export interface Settings {
  bpm: number;
  fps: number;
  size: number;
  /** where beat 1 of the music falls, seconds after the first frame */
  offset: number;
  /** 1. the title, already written, before the first cut (beats) */
  titleBeats: number;
  /** 2. the flip: beats at one hand a beat */
  slowBeats: number;
  /** beats over which the rate climbs from one hand a beat to one a frame */
  rampBeats: number;
  /** beats at one hand a frame before the stop */
  peakBeats: number;
  /** at the end of the full-speed stretch, this many beats where each word takes its own hand */
  perWordBeats: number;
  /** a brake into the landing: gaps as fractions of a beat (empty = a dead stop) */
  brake: number[];
  /** how long the hand it lands on holds before the camera pulls back (beats) */
  landBeats: number;
  /** 3. the pull back into the canvas of hands (beats) */
  zoomBeats: number;
  /** 4. the letter: written out live (beats), then each highlighted letter changes form */
  letterWriteBeats: number;
  letters: LetterBeat[];
  /** a highlighted letter changes form every this many beats */
  swapEvery: number;
  /** 5. the end card (beats) */
  endBeats: number;
}

export const DEFAULTS: Settings = {
  bpm: 112.5,
  fps: 30,
  size: 1080,
  offset: 0,
  titleBeats: 4,
  slowBeats: 4,
  rampBeats: 10,
  peakBeats: 2,
  perWordBeats: 0,
  brake: [],
  landBeats: 2,
  zoomBeats: 10,
  letterWriteBeats: 4,
  letters: [
    { ch: 'e', beats: 6 },
    { ch: 'a', beats: 3 },
    { ch: 'r', beats: 3 },
  ],
  swapEvery: 0.5,
  endBeats: 8,
};

export type SectionId = 'title' | 'flip' | 'land' | 'zoom' | 'letter' | 'end';

export interface Section {
  id: SectionId;
  label: string;
  /** first frame, inclusive */
  from: number;
  /** last frame, exclusive */
  to: number;
}

export interface Cut {
  frame: number;
  /** the hand on screen from this frame: an index into the hand list (0 = the title's hand) */
  hand: number;
  /** each word in its own hand from this frame: the first word's hand, the others follow on */
  perWord: boolean;
  /** frames until the next cut */
  gap: number;
  /** hands shown so far, this cut's included */
  count: number;
}

export interface LetterSpan {
  ch: string;
  from: number;
  to: number;
  /** frames where the highlighted letters change form */
  swaps: number[];
}

export interface Plan {
  s: Settings;
  /** frames per beat (fractional when the tempo isn't a whole number of frames) */
  fpb: number;
  /** frame where beat n starts (n may be fractional) */
  beatFrame: (n: number) => number;
  frames: number;
  seconds: number;
  sections: Section[];
  cuts: Cut[];
  /** hands shown by the time it lands, the title's and the landing hand included */
  handsShown: number;
  /** the hand it lands on (index into the hand list) */
  landHand: number;
  /** how many hands the list needs */
  handsNeeded: number;
  letter: { from: number; writeTo: number; to: number; spans: LetterSpan[] };
  sectionAt(frame: number): Section;
  cutAt(frame: number): Cut;
}

export const WORDS = 4; // "If this finds you"

export function plan(s: Settings = DEFAULTS): Plan {
  const fpb = (60 / s.bpm) * s.fps;
  const off = Math.round(s.offset * s.fps);
  const beatFrame = (n: number) => off + Math.round(n * fpb);
  const sections: Section[] = [];
  let beat = 0;
  const add = (id: SectionId, label: string, beats: number) => {
    const from = sections.length ? beatFrame(beat) : 0;
    beat += beats;
    sections.push({ id, label, from, to: beatFrame(beat) });
  };

  // ---- the flip ----
  const cuts: Cut[] = [{ frame: 0, hand: 0, perWord: false, gap: 0, count: 1 }];
  let next = 1; // the next unused hand
  let count = 1;
  const cut = (frame: number, perWord = false) => {
    if (frame <= cuts[cuts.length - 1].frame) return;
    cuts.push({ frame, hand: next, perWord, gap: 0, count: (count += perWord ? WORDS : 1) });
    next += perWord ? WORDS : 1;
  };
  add('title', 'Title', s.titleBeats);
  const flipStart = beat;
  // one a beat
  for (let i = 0; i < s.slowBeats; i++) cut(beatFrame(flipStart + i));
  // the speed-up: rate r(x) = 2^(a·x) hands a beat, x beats into the ramp, reaching one a frame at the end. The n-th
  // cut falls where the hands so far, ∫ r, reach n; each is snapped to the beat division that fits its gap
  const rampStart = flipStart + s.slowBeats;
  const top = Math.max(1, fpb); // one a frame, in hands a beat
  const a = Math.log2(top) / Math.max(1e-6, s.rampBeats);
  if (s.rampBeats > 0 && a > 0) {
    for (let n = 0; ; n++) {
      const x = Math.log2(1 + n * a * Math.LN2) / a;
      if (x >= s.rampBeats) break;
      const gap = 1 / 2 ** (a * x);
      const grid = Math.max(1 / top, 2 ** Math.floor(Math.log2(gap)));
      cut(beatFrame(rampStart + Math.round(x / grid) * grid));
    }
  }
  // full speed: a new hand every frame (the last few beats one hand per word, when asked)
  const peakStart = rampStart + s.rampBeats;
  const perWordFrom = peakStart + s.peakBeats - s.perWordBeats;
  for (let b = 0; b < s.peakBeats; b++) {
    const f0 = beatFrame(peakStart + b), f1 = beatFrame(peakStart + b + 1);
    for (let f = f0; f < f1; f++) cut(f, peakStart + b >= perWordFrom);
  }
  // a brake, if any, ending on the next beat; then the hand it lands on, on that beat
  let endBeat = peakStart + s.peakBeats;
  if (s.brake.length) {
    let acc = 0;
    for (const g of s.brake) { cut(beatFrame(endBeat) + Math.round(acc * fpb)); acc += g; }
    endBeat += Math.max(1, Math.round(acc));
  }
  const landFrame = beatFrame(endBeat);
  const landHand = next;
  cut(landFrame);
  for (let i = 0; i < cuts.length; i++) cuts[i].gap = (cuts[i + 1]?.frame ?? Infinity) - cuts[i].frame;
  add('flip', 'Flip', endBeat - flipStart);
  add('land', 'Stop', s.landBeats);
  add('zoom', 'All the hands', s.zoomBeats);

  // ---- the letter: written in live, then each highlighted letter changes form on the grid ----
  const letterFrom = beatFrame(beat);
  const writeTo = beatFrame(beat + s.letterWriteBeats);
  let lb = beat + s.letterWriteBeats;
  const spans = s.letters.map((L) => {
    const from = beatFrame(lb);
    const swaps: number[] = [];
    for (let x = 0; x < L.beats - 1e-9; x += s.swapEvery) swaps.push(beatFrame(lb + x));
    lb += L.beats;
    return { ch: L.ch, from, to: beatFrame(lb), swaps };
  });
  add('letter', 'The letter', lb - beat);
  add('end', 'End card', s.endBeats);

  const frames = sections[sections.length - 1].to;
  return {
    s, fpb, beatFrame, frames, seconds: frames / s.fps, sections, cuts,
    handsShown: cuts[cuts.length - 1].count, landHand, handsNeeded: landHand + 1,
    letter: { from: letterFrom, writeTo, to: spans.length ? spans[spans.length - 1].to : writeTo, spans },
    sectionAt(frame: number) {
      for (const sec of sections) if (frame < sec.to) return sec;
      return sections[sections.length - 1];
    },
    cutAt(frame: number) {
      let lo = 0, hi = cuts.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cuts[m].frame <= frame) lo = m; else hi = m - 1; }
      return cuts[lo];
    },
  };
}

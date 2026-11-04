// The video's clock: everything sits on a beat grid, in whole frames, worked out from the settings alone.
// Nothing here draws; the scene asks "which section, which hand, which form of the letter" for a frame number.
//
// The grid: beat n starts at frame round(offset·fps + n · 60/bpm · fps), rounded per beat from a running total so a
// tempo whose beat isn't a whole number of frames never drifts. At the default 112.5 BPM a beat is exactly 16
// frames at 30 fps (32 at 60), a bar of four beats 2.13 s, and every halving of the gap between cuts (8, 4, 2, 1
// frames) lands on a frame.

export interface FlipStep {
  /** how many beats this step lasts */
  beats: number;
  /** cuts per beat: 1, 2, 4… or 0 for a new hand every frame */
  perBeat: number;
}

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
  /** 2. the flip: the gap between cuts halves step by step */
  steps: FlipStep[];
  /** at the end of the every-frame stretch, this many beats where each word takes its own hand */
  perWordBeats: number;
  /** the brake into the landing: gaps as fractions of a beat (they add up to one beat) */
  brake: number[];
  /** how long the hand it lands on holds (beats) */
  landBeats: number;
  /** 3. the letter: written out live (beats), then each highlighted letter changes form */
  letterWriteBeats: number;
  letters: LetterBeat[];
  /** a highlighted letter changes form every this many beats */
  swapEvery: number;
  /** 4. all the letters on the table, the camera pulling back (beats) */
  canvasBeats: number;
  /** 5. the end card (beats) */
  endBeats: number;
}

export const DEFAULTS: Settings = {
  bpm: 112.5,
  fps: 30,
  size: 1080,
  offset: 0,
  titleBeats: 4,
  steps: [
    { beats: 4, perBeat: 1 },
    { beats: 2, perBeat: 2 },
    { beats: 1, perBeat: 4 },
    { beats: 1, perBeat: 8 },
    { beats: 1, perBeat: 16 },
    { beats: 6, perBeat: 0 },
  ],
  perWordBeats: 3,
  brake: [1 / 16, 3 / 16, 1 / 4, 1 / 2],
  landBeats: 4,
  letterWriteBeats: 4,
  letters: [
    { ch: 'e', beats: 4 },
    { ch: 'a', beats: 2 },
    { ch: 'r', beats: 2 },
  ],
  swapEvery: 0.5,
  canvasBeats: 8,
  endBeats: 8,
};

export type SectionId = 'title' | 'flip' | 'land' | 'letter' | 'canvas' | 'end';

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
  /** frame where beat n starts */
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

  // ---- the flip: cuts on the grid ----
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
  let b = beat;
  const stepsBeats = s.steps.reduce((a, st) => a + st.beats, 0);
  const perWordFrom = flipStart + stepsBeats - s.perWordBeats;
  for (const st of s.steps) {
    for (let i = 0; i < st.beats; i++, b++) {
      const f0 = beatFrame(b), f1 = beatFrame(b + 1);
      if (st.perBeat > 0) {
        for (let k = 0; k < st.perBeat; k++) cut(f0 + Math.round(((f1 - f0) * k) / st.perBeat));
      } else {
        for (let f = f0; f < f1; f++) cut(f, b >= perWordFrom);
      }
    }
  }
  // the brake: a few slowing cuts, ending on the next beat, where the landing hand appears and stays
  const landFrame = beatFrame(b + 1);
  let acc = 0;
  for (const g of s.brake) { cut(beatFrame(b) + Math.round(acc * fpb)); acc += g; }
  const landHand = next;
  cut(landFrame);
  for (let i = 0; i < cuts.length; i++) cuts[i].gap = (cuts[i + 1]?.frame ?? Infinity) - cuts[i].frame;
  beat = flipStart;
  add('flip', 'Flip', b + 1 - flipStart);
  add('land', 'Landing', s.landBeats);

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
  add('canvas', 'All the letters', s.canvasBeats);
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

// The archivist's pencilled note ("Cairo, 1798"), written by the handwriting engine in one fixed, neat hand with a
// pencil, so it reads as a person's note rather than a system font. Registered with the mark printer by the page
// (lib/paper/marks.ts stays free of the engine, so it can run in a worker; there it falls back to a font).
import { layout, makeHand, renderSVG, withOverrides, type Hand } from '@engine';
import type { NoteWriting } from './marks';

/** em in px the note is written at (path coordinates are px at this em) */
const EM = 100;
let hand: Hand | null = null;
const written = new Map<string, NoteWriting>();

export function writeNote(text: string): NoteWriting | null {
  const kept = written.get(text);
  if (kept) return kept;
  try {
    // one archivist for every letter: an upright, careful print with a pencil
    hand ??= withOverrides(makeHand('archivist-ledger-7', 'print'), { pen: 'pencil', neatness: 0.95, slant: 0 });
    const page = layout(hand, text, { maxWidth: 1e6, lineHeight: 1000, firstBaseline: 800 });
    const svg = renderSVG(hand, { items: page.items, height: 1200 }, { ink: '#000', emPx: EM, width: 1e4 });
    const paths = [...svg.matchAll(/<path[^>]* d="([^"]+)"/g)].map((m) => m[1]);
    let x0 = Infinity, x1 = -Infinity;
    for (const it of page.items as unknown as { x: number; box?: number[] }[]) {
      if (!it.box) continue;
      x0 = Math.min(x0, it.box[0]);
      x1 = Math.max(x1, it.box[2]);
    }
    const note: NoteWriting = {
      paths,
      // font units (1000 an em) to px at EM
      left: (x0 * EM) / 1000,
      width: ((x1 - x0) * EM) / 1000,
      baseline: (800 * EM) / 1000,
      em: EM,
      xHeight: ((hand.xHeight as number) || 0.5) * 0.7,
    };
    written.set(text, note);
    if (written.size > 200) written.delete(written.keys().next().value!);
    return note;
  } catch {
    return null;
  }
}

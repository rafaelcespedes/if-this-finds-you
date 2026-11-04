// The moment someone starts writing: the click (or tap) on the letter that puts the pen on the paper, before the
// first key. One signal for whoever wants to answer it (the Reading Room cracks its writing materials open here).
//   onWriteStart((w) => ...)   w.reply: a found letter is on the page, so the first key starts a reply on a fresh sheet
// Returns the unsubscribe. App.tsx calls writeStarted() when the editor takes focus from a pointer.
export interface WriteStart {
  /** a found letter is on the page: typing starts the visitor's reply on a fresh sheet */
  reply: boolean;
  /** 'mouse' | 'pen' | 'touch' (or 'keyboard' when the letter was reached with Tab) */
  pointer: string;
}

const subs = new Set<(w: WriteStart) => void>();

export function onWriteStart(fn: (w: WriteStart) => void) {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export function writeStarted(w: WriteStart) {
  for (const fn of subs) fn(w);
}

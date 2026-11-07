// The first words on a blank note: a small badge in the sheet's top corner, the way the letter desk says "Start
// typing" (App.tsx). On a computer the pen is already on the paper, so it says to type; on a phone, until the keyboard
// is up, to tap. It fades in (200 ms) and goes with the first letter, at once (a key response). Its words are the
// paper's own label for screen readers, so the badge is hidden from them.
import { PenLine, Pointer } from 'lucide-react';

export function StartHint({ show, tap }: { show: boolean; tap: boolean }) {
  if (!show) return null;
  return (
    <div className="wr-start" aria-hidden>
      {tap ? <><Pointer aria-hidden /> Tap to write</> : <><PenLine aria-hidden /> Type to write</>}
    </div>
  );
}

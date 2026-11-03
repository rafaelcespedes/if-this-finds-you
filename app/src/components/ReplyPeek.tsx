// A reply keeps the found letter one tap away: "In reply to Kamma Rahbek, 1813", and under it, on request, the
// letter itself, a smaller sheet in the hand and on the paper it was found in. Written on demand, here.
import { useMemo, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { makeHand } from '@engine';
import { SheetView } from '@/components/SheetView';
import { LIVE, liveLayout, sheetSVG } from '@/lib/live';
import { getPaper } from '@/lib/papers';
import { sampleById, sampleCredit } from '@/lib/samples';
import type { NoteState } from '@/lib/state';
import { cn } from '@/lib/utils';

interface Props {
  replyTo: NonNullable<NoteState['replyTo']>;
  pxPerMm: number;
  size: number;
  lineSpacing: number;
  ink: string;
  onDismiss: () => void;
}

export function ReplyPeek({ replyTo, pxPerMm, size, lineSpacing, ink, onDismiss }: Props) {
  const [open, setOpen] = useState(false);
  const letter = sampleById(replyTo.id);
  const paper = getPaper(replyTo.paper);
  const svg = useMemo(() => {
    if (!open || !letter || !LIVE) return null;
    const live = liveLayout(makeHand(replyTo.seed, replyTo.style), letter.text, paper, size, lineSpacing, false);
    return sheetSVG(live, 0, 'currentColor', '');
  }, [open, letter, replyTo.seed, replyTo.style, paper, size, lineSpacing]);
  if (!letter) return null;
  const scale = 0.62;
  return (
    <div className="mx-auto mt-2 grid justify-items-center gap-3" style={{ width: paper.w * pxPerMm * scale + 48 }}>
      <div className="flex w-full items-center justify-center gap-1 text-[12.5px] text-muted-foreground">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors duration-150 hover-device:hover:text-foreground pointer-coarse:py-3"
        >
          In reply to {letter.author}, {letter.year}
          <ChevronDown aria-hidden className={cn('size-3.5 transition-transform duration-200 ease-out', open && 'rotate-180')} />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Not a reply"
          title="Not a reply"
          className="grid size-7 place-items-center rounded-md text-faint transition-colors duration-150 hover-device:hover:text-foreground pointer-coarse:size-11"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      {open && (
        <figure className="grid justify-items-center gap-2 [transform:rotate(-0.6deg)]">
          {svg ? (
            <SheetView paper={paper} pxPerMm={pxPerMm * scale} svg={svg} ink={ink} index={0} count={1} />
          ) : (
            <blockquote className="max-w-[44ch] text-[14px] leading-relaxed whitespace-pre-line">{letter.text}</blockquote>
          )}
          <figcaption className="text-[12px] text-muted-foreground">
            {sampleCredit(letter)}{letter.title ? ` · ${letter.title}` : ''}
          </figcaption>
        </figure>
      )}
    </div>
  );
}

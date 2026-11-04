// The Reading Room's letter dock on phones (and wherever the spread doesn't fit): a request slip, one hairline-ruled
// line of words along the bottom edge. "‹ No. 0004 · 4 of 127 › · Bring another · ⋯ · Write a reply", the reply in
// archival red. Its "more" is the site's overlay system (a menu on desktop, a sheet on phones). Styled by the look
// (reading-room.css: .rr-dock and its parts). Moved here from themes/reading-room/ReadingLetter.tsx, which the
// letter page no longer uses (ReadingSpread.tsx took its place).
import { ChevronLeft, ChevronRight, Download, Ellipsis, FileText, Link2, PenLine, Shuffle } from 'lucide-react';
import { ActionSheet } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import { callNo } from '@/themes/reading-room/catalogue';
import { useMarks } from '@/themes/reading-room/useCatalogue';
import type { DockActions } from './LetterParts';

function useKeyboardLift() {
  const vv = useVisualViewport();
  return Math.max(0, window.innerHeight - (vv.top + vv.height));
}

export function SlipDock(a: DockActions & { id?: string }) {
  const narrow = useMediaQuery('(max-width: 520px)');
  const lift = useKeyboardLift();
  const no = useMarks(a.id)?.no;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(12px+env(safe-area-inset-bottom,0px))] z-30 flex justify-center px-3" style={lift ? { transform: `translateY(${-lift}px)` } : undefined}>
      <div role="toolbar" aria-label="The letter" className="rr-dock pointer-events-auto">
        {a.total > 1 && (
          <>
            <button type="button" className="rr-icon hit-44" onClick={a.onPrev} aria-label={a.prev ? `Previous letter: ${a.prev.title}` : 'Previous letter'}><ChevronLeft aria-hidden /></button>
            <span className="rr-dock-no">
              {no != null && <><span className="rr-sc">No.</span>&nbsp;{callNo(no)}</>}
              {!narrow && <span className="rr-dock-of"><span aria-hidden> · </span>{a.at + 1} of {a.total}</span>}
            </span>
            <button type="button" className="rr-icon hit-44" onClick={a.onNext} aria-label={a.next ? `Next letter: ${a.next.title}` : 'Next letter'}><ChevronRight aria-hidden /></button>
            <span aria-hidden className="rr-dock-rule" />
          </>
        )}
        <button type="button" className="rr-dock-word hit-44" onClick={a.onRandom}>{narrow ? 'Another' : 'Bring another'}</button>
        <ActionSheet
          title="More"
          side="top"
          trigger={<button type="button" className="rr-icon hit-44" aria-label="More"><Ellipsis aria-hidden /></button>}
          entries={[
            { id: 'text', label: 'Read as text', icon: <FileText />, onSelect: a.onText },
            { id: 'image', label: 'Download image', icon: <Download />, onSelect: a.onImage, disabled: !a.imageReady },
            { id: 'hand', label: 'Change writer', icon: <Shuffle />, onSelect: a.onNewHand },
            { id: 'share', label: 'Copy link', icon: <Link2 />, onSelect: a.onShare },
          ]}
        />
        <span aria-hidden className="rr-dock-rule" />
        <a href={a.reply} className="rr-dock-reply hit-44"><PenLine aria-hidden /> {narrow ? 'Reply' : 'Write a reply'}</a>
      </div>
    </div>
  );
}

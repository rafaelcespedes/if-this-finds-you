// The pile of earlier sheets, at the bottom of the desk. A new sheet pushes the one you were writing on down into it;
// a sheet from the pile comes back up to the desk (and the one there goes down in its place); a sheet can be thrown
// away. At rest only the top sheet's head shows, the others as edges behind it; pointing at the pile (or tapping
// it) lifts the sheets apart so each one's first line can be read. While you write, it tucks itself away.
import { memo, useEffect, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import { SheetView } from '@/components/SheetView';
import { getPaper } from '@/lib/papers';
import { sheetSvg, sheetWords, type Sheet } from './sheets';

/** sheets shown at rest (edges behind the top one) and lifted apart */
const REST = 3;
const OPEN = 6;

/** a slight, steady turn per sheet (paper never lies square), from its id */
const turnOf = (id: string) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((((h >>> 0) % 1000) / 1000) * 2 - 1) * 1.6;
};

interface Props {
  sheets: Sheet[];
  /** card width in px */
  width: number;
  /** someone is writing: the pile steps back */
  tucked: boolean;
  /** the keyboard is up on a phone: out of the way entirely */
  hidden: boolean;
  onBring: (id: string) => void;
  onThrow: (id: string) => void;
}

export function SheetPile({ sheets, width, tucked, hidden, onBring, onThrow }: Props) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  // a pile that empties closes
  useEffect(() => { if (!sheets.length) setOpen(false); }, [sheets.length]);
  if (!sheets.length) return null;
  const shown = sheets.slice(0, open ? OPEN : REST);
  const more = sheets.length - shown.length;
  const throwAway = (id: string) => {
    setLeaving(id);
    window.setTimeout(() => { setLeaving(null); onThrow(id); }, 200);
  };
  return (
    <>
      {/* on a phone the lifted pile closes with a tap anywhere else */}
      {open && <div className="write-pile-scrim" aria-hidden onClick={() => setOpen(false)} />}
      <nav
        className="write-pile"
        aria-label={`Earlier sheets (${sheets.length})`}
        data-open={open || undefined}
        data-tucked={(tucked && !open) || undefined}
        data-hidden={hidden || undefined}
        style={{ '--card-w': `${width}px` } as CSSProperties}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(true); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(false); }}
        // a key brings the focus here: lifted apart (a tap focuses too, but the tap itself decides, below)
        onFocus={(e) => { if ((e.target as HTMLElement).matches(':focus-visible')) setOpen(true); }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}
        onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); (document.activeElement as HTMLElement | null)?.blur(); } }}
      >
        {shown.map((s, i) => (
          <PileCard
            key={s.id}
            sheet={s}
            i={i}
            width={width}
            open={open}
            leaving={leaving === s.id}
            onBring={() => (open ? onBring(s.id) : setOpen(true))}
            onThrow={() => throwAway(s.id)}
          />
        ))}
        {open && more > 0 && <span className="write-pile-more" style={{ '--i': shown.length } as CSSProperties}>{more} more below</span>}
        {!open && sheets.length > 1 && <span className="write-pile-count" aria-hidden>{sheets.length}</span>}
      </nav>
    </>
  );
}

const PileCard = memo(function PileCard({ sheet, i, width, open, leaving, onBring, onThrow }: {
  sheet: Sheet; i: number; width: number; open: boolean; leaving: boolean; onBring: () => void; onThrow: () => void;
}) {
  const paper = getPaper(sheet.look.paper);
  const pxPerMm = width / paper.w;
  // only sheets whose heads show are written out: at rest the top one, lifted every one
  const drawn = i === 0 || open ? sheetSvg(sheet) : null;
  const words = sheetWords(sheet);
  return (
    <div
      className="write-pile-card"
      data-leaving={leaving || undefined}
      style={{ '--i': i, '--r': `${turnOf(sheet.id)}deg`, viewTransitionName: i < REST ? `sheet-${sheet.id}` : undefined } as CSSProperties}
    >
      <button
        type="button"
        className="write-pile-sheet"
        onClick={onBring}
        tabIndex={open || i === 0 ? 0 : -1}
        aria-label={open ? `Back to the desk: ${words || 'a blank sheet'}` : 'Earlier sheets'}
      >
        <SheetView paper={paper} pxPerMm={pxPerMm} svg={drawn?.svg ?? null} ink={drawn?.ink ?? 'currentColor'} index={0} count={1} />
      </button>
      {open && (
        <button type="button" className="write-pile-throw" onClick={onThrow} aria-label={`Throw away: ${words || 'a blank sheet'}`}>
          <X aria-hidden />
        </button>
      )}
    </div>
  );
});


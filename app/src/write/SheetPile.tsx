// The pile of earlier sheets, at the bottom of the desk (research-sheet-stack.md). New sheet sends the one on the
// desk down into it; a sheet from the pile comes back up (the one there goes down in its place); a sheet can be
// thrown away, with Undo.
//   at rest   the top sheet's head above the desk's edge, two more as edges behind it, each turned a little; no
//             writing shows (it couldn't be read at this size without covering the desk's own)
//   pointed   (a mouse over it) the top sheet rises a little and the edges part: a preview, nothing opens by itself
//   open      (a click, a tap, Enter) the sheets stand in a column, newest at the bottom, each showing its head at a
//             size that reads: who wrote it, when, and its first lines. Click one to bring it back; × or Delete to
//             throw it away; Esc, a click outside or Close to put them back
// Every sheet that shows is named by its id (view-transition-name), so opening, closing and sheets travelling to
// and from the desk are the sheets themselves moving (moveSheets).
import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import { SheetView } from '@/components/SheetView';
import { getPaper } from '@/lib/papers';
import { writerName } from '@/lib/hands';
import { sheetSvg, sheetWords, type Sheet } from './sheets';

/** edges shown at rest */
const REST = 3;
/** px per mm: the pile at rest, and open (where handwriting reads) */
const REST_PX = 1.5;
const OPEN_PX = 2.4;

/** a slight, steady turn per sheet (paper never lies square), from its id */
const turnOf = (id: string, max: number) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((((h >>> 0) % 1000) / 1000) * 2 - 1) * max;
};
/** "Today", a weekday this week, else "3 Nov" */
function whenOf(at: number) {
  const d = new Date(at);
  const days = (Date.now() - at) / 864e5;
  if (days < 1 && d.getDate() === new Date().getDate()) return 'Today';
  if (days < 6) return d.toLocaleDateString('en-GB', { weekday: 'long' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

interface Props {
  sheets: Sheet[];
  open: boolean;
  /** change open/closed (the caller moves the sheets: moveSheets) */
  setOpen: (open: boolean) => void;
  /** the room there is (px): the pile never runs wider */
  room: number;
  /** someone is writing: the pile steps back to its edges */
  tucked: boolean;
  /** the keyboard is up on a phone: out of the way entirely */
  hidden: boolean;
  onBring: (id: string) => void;
  onThrow: (id: string) => void;
}

export function SheetPile({ sheets, open, setOpen, room, tucked, hidden, onBring, onThrow }: Props) {
  const [leaving, setLeaving] = useState<string | null>(null);
  const pileBtn = useRef<HTMLButtonElement>(null);
  const column = useRef<HTMLDivElement>(null);
  // open: the newest sheet (at the bottom, by the pile) is in view and takes the focus
  useEffect(() => {
    if (!open) return;
    const el = column.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    el.querySelector<HTMLButtonElement>('[data-newest] .write-pile-sheet')?.focus({ preventScroll: true });
  }, [open]);
  if (!sheets.length) return null;
  const close = (focusPile = true) => {
    setOpen(false);
    if (focusPile) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.write-pile-rest')?.focus({ preventScroll: true }));
  };
  const throwAway = (id: string) => {
    setLeaving(id);
    window.setTimeout(() => { setLeaving(null); onThrow(id); }, 200);
  };
  const top = sheets[0];

  if (!open) {
    const restW = Math.min(room * 0.62, getPaper(top.look.paper).w * REST_PX);
    return (
      <div className="write-pile" data-tucked={tucked || undefined} data-hidden={hidden || undefined} style={{ '--card-w': `${restW}px` } as CSSProperties}>
        {sheets.length >= 4 && <span className="write-pile-label" aria-hidden>{sheets.length} sheets</span>}
        <button
          ref={pileBtn}
          type="button"
          className="write-pile-rest"
          aria-expanded={false}
          aria-label={`Earlier sheets: ${sheets.length}`}
          onClick={() => setOpen(true)}
        >
          {sheets.slice(0, REST).map((s, i) => {
            const paper = getPaper(s.look.paper);
            return (
              <span
                key={s.id}
                className="write-pile-card"
                style={{ '--i': i, '--r': `${turnOf(s.id, i === 0 ? 0.6 : 1.5)}deg`, viewTransitionName: `sheet-${s.id}` } as CSSProperties}
              >
                <SheetView paper={paper} pxPerMm={restW / paper.w} svg={null} ink="currentColor" index={0} count={1} />
              </span>
            );
          })}
        </button>
      </div>
    );
  }

  const openW = Math.min(room, getPaper(top.look.paper).w * OPEN_PX);
  return (
    <>
      <div className="write-pile-scrim" aria-hidden onClick={() => close(false)} />
      <div
        className="write-pile-open"
        role="dialog"
        aria-label={`Earlier sheets: ${sheets.length}`}
        style={{ '--card-w': `${openW}px` } as CSSProperties}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
          e.preventDefault();
          const btns = [...(column.current?.querySelectorAll<HTMLButtonElement>('.write-pile-sheet') ?? [])];
          const at = btns.indexOf(document.activeElement as HTMLButtonElement);
          btns[Math.max(0, Math.min(btns.length - 1, at + (e.key === 'ArrowUp' ? -1 : 1)))]?.focus();
        }}
      >
        <div ref={column} className="write-pile-column">
          {/* oldest first, so the newest sits at the bottom, by the pile */}
          {sheets.slice().reverse().map((s, k, all) => (
            <PileSheet
              key={s.id}
              sheet={s}
              width={openW}
              newest={k === all.length - 1}
              leaving={leaving === s.id}
              onBring={() => onBring(s.id)}
              onThrow={() => throwAway(s.id)}
            />
          ))}
        </div>
        <button type="button" className="write-pile-close" onClick={() => close()}>Close</button>
      </div>
    </>
  );
}

const PileSheet = memo(function PileSheet({ sheet, width, newest, leaving, onBring, onThrow }: {
  sheet: Sheet; width: number; newest: boolean; leaving: boolean; onBring: () => void; onThrow: () => void;
}) {
  const paper = getPaper(sheet.look.paper);
  // written out once it's near the view (a long pile doesn't write every sheet at once)
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(newest);
  useEffect(() => {
    if (near || !host.current) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: '240px' });
    io.observe(host.current);
    return () => io.disconnect();
  }, [near]);
  const drawn = near ? sheetSvg(sheet) : null;
  const words = sheetWords(sheet);
  const who = `${writerName(sheet.look.seed)} · ${whenOf(sheet.at)}`;
  return (
    <div ref={host} className="write-pile-band" data-newest={newest || undefined} data-leaving={leaving || undefined} style={{ viewTransitionName: `sheet-${sheet.id}` } as CSSProperties}>
      <button
        type="button"
        className="write-pile-sheet"
        onClick={onBring}
        onKeyDown={(e) => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onThrow(); } }}
        aria-label={`${who}: ${words || 'a blank sheet'}. Bring it back to the desk`}
      >
        <SheetView paper={paper} pxPerMm={width / paper.w} svg={drawn?.svg ?? null} ink={drawn?.ink ?? 'currentColor'} index={0} count={1} />
        <span className="write-pile-who" aria-hidden>{who}</span>
      </button>
      <button type="button" className="write-pile-throw" onClick={onThrow} aria-label={`Throw away: ${words || 'a blank sheet'}`}>
        <X aria-hidden />
      </button>
    </div>
  );
});

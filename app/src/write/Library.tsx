// The library: every note, newest first, grouped as Notes groups them (Pinned, Today, Yesterday, Previous 7 days, then
// by month). Each row shows the note's real first sheet, in its own hand, its first line as the title, and when. A
// sidebar on a computer, its own screen on a phone. Thrown-away notes wait 30 days at the bottom.
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Pin, PinOff, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { SheetView } from '@/components/SheetView';
import { getPaper } from '@/lib/papers';
import { writerName } from '@/lib/hands';
import { tip } from './controls';
import { THROWN_DAYS, groupNotes, noteSvg, noteText, snippetOf, titleOf, whenOf, type Note } from './notes';

interface Props {
  /** at the head of the list, before Search: the way home */
  lead?: React.ReactNode;
  notes: Note[];
  current: string;
  onOpen: (id: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onThrow: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  /** a phone: the library is a screen of its own, with a back to the note */
  screen?: boolean;
  /** the note just put away (New note): its row glows for a moment, so you see where it went */
  arrived?: string | null;
}

export function Library({ notes, current, onOpen, onPin, onThrow, onRestore, onDelete, screen, arrived, lead }: Props) {
  const [q, setQ] = useState('');
  // a computer: Search is a button at the head's right; pressed, the field opens across the head (Rafael, 7 Nov). A
  // phone keeps the field, the full width
  const [searching, setSearching] = useState(false);
  const field = !!screen || searching || !!q;
  const [bin, setBin] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const live = useMemo(() => notes.filter((n) => !n.thrown), [notes]);
  const thrown = useMemo(() => notes.filter((n) => n.thrown).sort((a, b) => (b.thrown ?? 0) - (a.thrown ?? 0)), [notes]);
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase();
    const pool = bin ? thrown : live;
    if (!words) return pool;
    return pool.filter((n) => (noteText(n) + ' ' + writerName(n.look.seed)).toLowerCase().includes(words));
  }, [q, bin, live, thrown]);
  const groups = useMemo(() => (bin ? [{ id: 'bin', label: `Kept ${THROWN_DAYS} days, then gone`, notes: shown }] : groupNotes(shown)), [bin, shown]);
  // throwing a note away from the bin's own list ends it there
  useEffect(() => { if (bin && !thrown.length) setBin(false); }, [bin, thrown.length]);

  return (
    <nav className="wr-library" data-screen={screen || undefined} aria-label="Notes">
      <div className="wr-lib-head">
        {lead}
        {bin ? (
          <button type="button" className="wr-lib-back" onClick={() => setBin(false)}>
            <X aria-hidden /> Thrown away
          </button>
        ) : field ? (
          <label className="wr-search" data-opened={!screen || undefined}>
            <Search aria-hidden />
            <input
              ref={input}
              type="search"
              placeholder="Search"
              value={q}
              autoFocus={!screen && searching}
              onChange={(e) => setQ(e.target.value)}
              onBlur={() => { if (!q) setSearching(false); }}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return;
                e.stopPropagation();
                if (q) setQ(''); else { setSearching(false); }
              }}
              aria-label="Search notes"
            />
            {/* our own clear button (the browser's is a blue ×): it keeps the field, and the field its focus */}
            {q && (
              <button
                type="button"
                className="wr-search-clear"
                aria-label="Clear the search"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => { setQ(''); input.current?.focus(); }}
              >
                <X aria-hidden />
              </button>
            )}
          </label>
        ) : (
          <button type="button" className="wr-icon wr-search-btn" onClick={() => setSearching(true)} aria-label="Search notes" {...tip('Search')}>
            <Search aria-hidden />
          </button>
        )}
      </div>
      <div className="wr-lib-list">
        {groups.map((g) => (
          <section key={g.id} className="wr-lib-group" aria-label={g.label}>
            <h2>{g.label}</h2>
            <ul>
              {g.notes.map((n) => (
                <Row
                  key={n.id}
                  note={n}
                  open={n.id === current}
                  screen={!!screen}
                  arrived={n.id === arrived}
                  binned={bin}
                  onOpen={() => onOpen(n.id)}
                  onPin={() => onPin(n.id, !n.pinned)}
                  onThrow={() => onThrow(n.id)}
                  onRestore={() => onRestore(n.id)}
                  onDelete={() => onDelete(n.id)}
                />
              ))}
            </ul>
          </section>
        ))}
        {!shown.length && <p className="wr-lib-empty">{q ? 'No notes say that.' : bin ? 'Nothing thrown away.' : 'No notes yet.'}</p>}
      </div>
      {!bin && thrown.length > 0 && (
        <button type="button" className="wr-lib-bin" onClick={() => setBin(true)}>
          <Trash2 aria-hidden /> Thrown away <span>{thrown.length}</span>
        </button>
      )}
    </nav>
  );
}

const Row = memo(function Row({ note, open, screen, arrived, binned, onOpen, onPin, onThrow, onRestore, onDelete }: {
  note: Note; open: boolean; screen: boolean; arrived: boolean; binned: boolean; onOpen: () => void; onPin: () => void; onThrow: () => void; onRestore: () => void; onDelete: () => void;
}) {
  const title = titleOf(note) || 'New note';
  const snippet = snippetOf(note);
  return (
    <li className="wr-row" data-open={open || undefined} data-arrived={arrived || undefined}>
      <button
        type="button"
        className="wr-row-main"
        onClick={binned ? undefined : onOpen}
        aria-current={open ? 'page' : undefined}
        disabled={binned}
      >
        {/* (a phone: the open letter's sheet isn't on the page while its list is, so its row's picture takes the
            sheet's name, and Back shrinks the sheet into it) */}
        <Thumb note={note} named={!open || screen} phone={screen} />
        <span className="wr-row-text">
          <span className="wr-row-title">{title}</span>
          <span className="wr-row-meta">
            <time>{whenOf(note.at)}</time>
            <span className="wr-row-snippet">{snippet || writerName(note.look.seed)}</span>
          </span>
        </span>
      </button>
      <span className="wr-row-actions">
        {binned ? (
          <>
            <button type="button" onClick={onRestore} aria-label={`Put back: ${title}`} {...tip('Put back')}><RotateCcw aria-hidden /></button>
            <button type="button" onClick={onDelete} aria-label={`Delete for good: ${title}`} {...tip('Delete for good')}><X aria-hidden /></button>
          </>
        ) : (
          <>
            <button type="button" onClick={onPin} aria-label={note.pinned ? `Unpin: ${title}` : `Pin: ${title}`} {...tip(note.pinned ? 'Unpin' : 'Pin')}>
              {note.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
            </button>
            <button type="button" onClick={onThrow} aria-label={`Throw away: ${title}`} {...tip('Throw away')}><Trash2 aria-hidden /></button>
          </>
        )}
      </span>
    </li>
  );
});

/**
 * The note's first sheet, small, written out once it's near the view. It's the sheet itself, with its own edge and
 * shadow, in no box of its own: fitted into a slot of the same width on every row (so the titles line up), centred
 * across it, a tall pad or a wide card as it is (Rafael, 8 Nov: a phone's picture sat flush left in a bigger box)
 */
const THUMB = { w: 40, h: 54 };
const THUMB_PHONE = { w: 48, h: 64 };
// (the open note's sheet is on the desk under the same name; a name can only be on the page once)
const Thumb = memo(function Thumb({ note, named, phone }: { note: Note; named: boolean; phone: boolean }) {
  const host = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near || !host.current) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(host.current);
    return () => io.disconnect();
  }, [near]);
  // written in an idle moment, so a long library never holds up the page. The open note's picture waits until it's
  // put away (writing it again on every key costs a frame on a full sheet: the sheet itself is on the desk anyway)
  const [drawn, setDrawn] = useState<{ svg: string; ink: string } | null>(null);
  const noteRef = useRef(note);
  noteRef.current = note;
  const has = !!drawn;
  const version = named ? `${note.ink?.length ?? 0}|${note.text?.length ?? 0}|${note.look.seed}|${note.look.paper}|${note.look.ink}` : has ? 'open' : 'first';
  useEffect(() => {
    if (!near) return;
    let off = false;
    const run = () => { if (!off) setDrawn(noteSvg(noteRef.current)); };
    const id = typeof requestIdleCallback === 'function' ? requestIdleCallback(run, { timeout: 1200 }) : window.setTimeout(run, 60);
    return () => { off = true; if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id as number); else clearTimeout(id as number); };
  }, [near, version]);
  const paper = getPaper(note.look.paper);
  const box = phone ? THUMB_PHONE : THUMB;
  return (
    <span className="wr-thumb-slot" style={{ '--thumb-w': `${box.w}px` } as CSSProperties} aria-hidden>
      <span ref={host} className="wr-thumb" style={{ viewTransitionName: named ? `sheet-${note.id}` : undefined }}>
        <SheetView paper={paper} pxPerMm={Math.min(box.w / paper.w, box.h / paper.h)} svg={drawn?.svg ?? null} ink={drawn?.ink ?? 'currentColor'} index={0} count={1} />
      </span>
    </span>
  );
});

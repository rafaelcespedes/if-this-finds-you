// The letter page in the Reading Room, as a book spread (the layout study, proposal 3). On the left, the plate: the
// whole sheet fitted to the window's height, staying put while the right page scrolls, with which sheet and whose hand
// under it. On the right, a page that reads like a recto: why the letter survives and where (red small capitals), the
// title, who wrote to whom, six facts on two ruled rows ("Full record +" holds the rest), the letter as text from the
// start, closing as a printed letter does (the signature set right, the place and date under it), the notes, how to
// cite it, the next letter named, and what you can do with it. Small red numbers open their note in place; every note
// is listed again at the end. On phones: the title first, then the sheet edge to edge, then the record (the slip dock
// stays in the thumb zone). On desktop there is no dock: "‹ No. 0004 · 4 of 127 ›" is the running head's middle.
// House rules: one grid, hairlines never boxes, notes beside facts.
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { copyText } from '@/lib/actions';
import { APP_NAME } from '@/lib/brand';
import { cn } from '@/lib/utils';
import { callNo } from '@/themes/reading-room/catalogue';
import { useMarks } from '@/themes/reading-room/useCatalogue';
import { LetterMarks } from '@/themes/reading-room/SheetMarks';
import { capFirst, circumstanceLabel, languageName, lostInTransit, shortAuthor, shortRecipient } from './data';
import { HandMenu } from './LetterParts';
import type { ArchiveLetter } from './model';
import { letterHash } from './route';

/** The spread is for screens this wide and up, in em (so larger text in the browser's settings asks for a wider
 * screen); narrower, the page is one column. library.css uses the same width. */
export const SPREAD_QUERY = '(min-width: 64em)';

/**
 * A letter's text and its close: the last line set apart when it reads as a signature (short, a name or a few words,
 * not a sentence that runs on), as a printed letter sets it.
 */
export function closingOf(text: string): { paras: string[]; signature: string | null } {
  const paras = text.trim().split(/\n{2,}/);
  const last = paras[paras.length - 1];
  const lines = last.split('\n');
  const sig = lines[lines.length - 1].trim();
  const words = sig.split(/\s+/).length;
  const named = sig.length <= 40 && words <= 6 && !/[?!;:,]$/.test(sig) && (!/\.$/.test(sig) || words <= 4 || /\b\p{Lu}\.$/u.test(sig));
  if (!named || (paras.length === 1 && lines.length === 1)) return { paras, signature: null };
  const rest = lines.slice(0, -1).join('\n').trim();
  return { paras: [...paras.slice(0, -1), ...(rest ? [rest] : [])], signature: sig };
}

/** When, as the record gives it: the curator's date ("August 1798") or the year. */
const whenOf = (l: ArchiveLetter) => l.found?.dateNote ?? (l.year != null ? String(l.year) : '');

export interface Turn {
  at: number;
  total: number;
  prev: ArchiveLetter | null;
  next: ArchiveLetter | null;
  onPrev: () => void;
  onNext: () => void;
}

interface Props {
  letter: ArchiveLetter;
  /** the hand's writer, and its seed (with the letter, it seeds where the printed marks land) */
  name: string;
  hand: string;
  /** the sheets, as the letter page builds them (write-on, tap to finish, swipe to turn) */
  sheet: ReactNode;
  /** the plate's column (the page measures it to size the sheet) */
  colRef: RefObject<HTMLDivElement | null>;
  titleRef: RefObject<HTMLHeadingElement | null>;
  pxPerMm: number;
  paper: { w: number; h: number };
  /** how many sheets the letter takes in this hand */
  sheets: number;
  /** the plate holds one sheet at a time (desktop, a window tall enough): its height */
  frameH: number | null;
  gap: number;
  keep: boolean;
  onKeep: (v: boolean) => void;
  onNewHand: () => void;
  onReplay: () => void;
  canReplay: boolean;
  onShare: () => void;
  onImage: () => void;
  imageReady: boolean;
  onRandom: () => void;
  reply: string;
  turn: Turn;
}

export function ReadingSpread(p: Props) {
  const { letter: l } = p;
  const no = useMarks(l.id)?.no;
  const nextNo = useMarks(p.turn.next?.id)?.no;
  const id = useId();
  const lost = lostInTransit(l);
  const why = circumstanceLabel(l);
  const where = l.place ?? '';
  const when = whenOf(l);
  // as a label (the kicker, the dateline) a place starts with a capital; in the citation it stays as recorded
  const placeDateRaw = [where, when].filter(Boolean).join(', ');
  const placeDate = capFirst(placeDateRaw);
  const writerLine = l.recipient ? `${shortAuthor(l)} to ${l.recipient.split(/;\s*/)[0]}` : shortAuthor(l);
  const { paras, signature } = closingOf(l.text);
  const f = l.found;

  // the notes, numbered in the order they're keyed: the story (why it survives), the hand, the source and rights
  const notes: { key: string; body: ReactNode }[] = [];
  if (f?.story) notes.push({ key: 'story', body: f.story });
  // a writer known by a signature in quotes, or only described, is "the writer" here ("‘M. L. H.’’s" reads badly)
  const author = shortAuthor(l);
  const whose = /^[‘'"“]/.test(author) || /^unknown/i.test(l.author ?? '') ? 'the writer’s own' : `${author}’s`;
  notes.push({ key: 'hand', body: <>The words are {whose}. The handwriting is {p.name}’s, a writer who never existed.</> });
  const rights = f?.rights?.us && f?.rights?.eu ? 'Public domain in the US and the EU' : f?.rights?.us ? 'Public domain in the US' : f?.rights?.eu ? 'Public domain in the EU' : f?.source?.licence;
  if (f?.source) notes.push({ key: 'source', body: <>{f.source.url ? <a href={f.source.url} target="_blank" rel="noreferrer" className="sp-link">{f.source.name}</a> : f.source.name}.{rights ? ` ${rights}.` : ''}</> });
  const n = (key: string) => notes.findIndex((x) => x.key === key) + 1;
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  useEffect(() => { setOpenNote(null); setRecordOpen(false); }, [l.id]);
  const ref = (key: string) => {
    const i = n(key);
    if (!i) return null;
    const open = openNote === key;
    return (
      // aria-controls only names the note while it's on the page (it's rendered open only)
      <button type="button" className="sp-ref" aria-expanded={open} aria-controls={open ? `${id}-n-${key}` : undefined} onClick={() => setOpenNote(open ? null : key)}>
        <span className="sr-only">Note </span>{i}
      </button>
    );
  };
  const inline = (key: string) => openNote === key && (
    <p id={`${id}-n-${key}`} className="sp-note-open"><span className="sp-note-no" aria-hidden>{n(key)}</span>{notes[n(key) - 1].body}</p>
  );

  const citation = `${APP_NAME}, ${no != null ? `No. ${callNo(no)}` : l.title ?? 'a letter'}: ${writerLine}${placeDateRaw ? `, ${placeDateRaw}` : ''}.`;
  const cite = async () => {
    const ok = await copyText(citation);
    if (ok) toast.success('Citation copied', { id: 'cite' });
    else toast.error('Couldn’t copy the citation', { id: 'cite', description: citation });
  };

  const handMenu = (
    <HandMenu
      name={p.name} keep={p.keep} onKeep={p.onKeep} onNewHand={p.onNewHand} onReplay={p.onReplay} canReplay={p.canReplay} align="start"
      trigger={
        <button type="button" className="sp-hand group" aria-label={`In ${p.name}’s hand: change writer`}>
          {p.name}
          <ChevronDown aria-hidden className="sp-hand-chev" />
        </button>
      }
    />
  );

  const head = (
    <header className="sp-head">
      <p className={cn('sp-kicker', lost && 'is-lost')}>
        {why}{placeDate && <span> · {placeDate}</span>}{ref('story')}
      </p>
      {inline('story')}
      <h1 ref={p.titleRef} tabIndex={-1} className="sp-title outline-none">{l.title ?? 'A letter'}</h1>
      <p className="sp-writer">{writerLine}</p>
    </header>
  );

  return (
    <main className="sp">
      {head}
      <Plate {...p} />
      <div className="sp-body">
        <dl className="sp-facts">
          <Fact term="From">{shortAuthor(l)}</Fact>
          <Fact term="To">{shortRecipient(l).split(/,\s+/)[0] || '—'}</Fact>
          <Fact term="When">{when || 'Undated'}</Fact>
          <Fact term="Where">{where || 'Not recorded'}</Fact>
          <Fact term="Language">{languageName(l.lang)}</Fact>
          <Fact term="Hand"><span className="inline-flex items-baseline">{handMenu}{ref('hand')}</span></Fact>
        </dl>
        {inline('hand')}
        <div className="sp-record">
          <div className="sp-record-bar">
            <button type="button" aria-expanded={recordOpen} aria-controls={recordOpen ? `${id}-record` : undefined} onClick={() => setRecordOpen((o) => !o)} className="sp-record-open">
              Full record <span aria-hidden>{recordOpen ? '−' : '+'}</span>
            </button>
            <span className="sp-quiet">
              {/* Share is the actions' row's, once on the page */}
              <button type="button" onClick={cite}>Cite</button><span aria-hidden> · </span>
              <button type="button" onClick={p.onImage} disabled={!p.imageReady}>Download image</button>
            </span>
          </div>
          {recordOpen && (
            <dl id={`${id}-record`} className="sp-rows">
              <Row term="Why it survives"><span className={cn(lost && 'sp-red')}>{why}</span></Row>
              {l.recipient && l.recipient !== shortRecipient(l) && <Row term="To, in full">{l.recipient}</Row>}
              {f?.heritage && <Row term="The writer">{f.heritage}</Row>}
              {f?.translator && <Row term="Translated by">{f.translator.url ? <a href={f.translator.url} target="_blank" rel="noreferrer" className="sp-link">{f.translator.name}</a> : f.translator.name}</Row>}
              {f?.source && <Row term="Source">{f.source.url ? <a href={f.source.url} target="_blank" rel="noreferrer" className="sp-link">{f.source.name}</a> : f.source.name}</Row>}
              {rights && <Row term="Rights">{rights}{ref('source')}</Row>}
              {f?.rights?.basis && <Row term="How we know">{f.rights.basis}</Row>}
            </dl>
          )}
          {inline('source')}
        </div>

        <section className="sp-text" aria-labelledby={`${id}-text`}>
          <h2 id={`${id}-text`} className="sp-label">The letter</h2>
          <div lang={l.lang} className="sp-reading">
            {paras.map((para, i) => <p key={i}>{para}</p>)}
            {signature && <p className="sp-signature">{signature}</p>}
          </div>
          {placeDate && <p className="sp-dateline">{placeDate}</p>}
        </section>

        <section className="sp-notes" aria-labelledby={`${id}-notes`}>
          <h2 id={`${id}-notes`} className="sp-label">Notes</h2>
          <ol>
            {notes.map((x, i) => <li key={x.key}><span className="sp-note-no" aria-hidden>{i + 1}</span><span>{x.body}</span></li>)}
          </ol>
        </section>

        <section className="sp-cite" aria-labelledby={`${id}-cite`}>
          <h2 id={`${id}-cite`} className="sp-label">Cite this letter</h2>
          <p>{citation}</p>
        </section>

        {p.turn.next && (
          <section className="sp-next" aria-labelledby={`${id}-next`}>
            <h2 id={`${id}-next`} className="sp-label">Next in the collection</h2>
            <a href={letterHash(p.turn.next.id)} onClick={(e) => { e.preventDefault(); p.turn.onNext(); }} className="sp-next-link">
              {nextNo != null && <span className="sp-no">No. {callNo(nextNo)}</span>}
              <span className="sp-next-title">{p.turn.next.title ?? 'A letter'} <span aria-hidden>→</span></span>
              <span className="sp-next-meta">
                {capFirst([p.turn.next.place, p.turn.next.year != null ? String(p.turn.next.year) : '', shortRecipient(p.turn.next) ? `to ${shortRecipient(p.turn.next)}` : ''].filter(Boolean).join(' · '))}
              </span>
            </a>
          </section>
        )}

        <div className="sp-actions" role="group" aria-label="What you can do with this letter">
          <a href={p.reply} className="sp-reply"><PenLine aria-hidden /> Write a reply</a>
          <button type="button" onClick={p.onRandom}>Bring another</button>
          <button type="button" onClick={p.onNewHand}>Change writer</button>
          <button type="button" onClick={p.onShare}>Share</button>
        </div>
      </div>
    </main>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="sp-fact">
      <dt className="sp-label">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}
function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="sp-row">
      <dt className="sp-label">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * "‹ No. 0004 · 4 of 127 ›": the number is the navigation. For the running head's middle (SiteHeader's `centre`,
 * which phones don't show: there the slip dock carries it). The header styles the words; the number takes the look's
 * colour through data-site-number.
 */
export function LetterCounter({ id, turn: t }: { id: string; turn: Turn }) {
  const no = useMarks(id)?.no;
  if (t.total < 2) return null;
  return (
    <span className="letter-counter">
      <button type="button" onClick={t.onPrev} aria-label={t.prev ? `Previous letter: ${t.prev.title ?? 'a letter'}` : 'Previous letter'}><ChevronLeft aria-hidden /></button>
      <span>
        {no != null && <span data-site-number>No. {callNo(no)}</span>}
        <span className="letter-counter-of"><span aria-hidden> · </span><span className="sr-only">, </span>{t.at + 1} of {t.total}</span>
      </span>
      <button type="button" onClick={t.onNext} aria-label={t.next ? `Next letter: ${t.next.title ?? 'a letter'}` : 'Next letter'}><ChevronRight aria-hidden /></button>
    </span>
  );
}

/**
 * The plate: the sheet on the room. On desktop it stays put beside the page and holds one sheet at a time, fitted to
 * the window (a letter of several sheets scrolls inside it, and "Sheet 1 · 2" turns them); on phones the sheets
 * stack, edge to edge. Under it, which sheet and whose hand.
 */
function Plate(p: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);
  const step = p.paper.h * p.pxPerMm + p.gap;
  useEffect(() => { setShown(0); frame.current?.scrollTo({ top: 0 }); }, [p.letter.id, p.hand]);
  const go = (i: number) => {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    frame.current?.scrollTo({ top: i * step, behavior: reduce ? 'auto' : 'smooth' });
  };
  const many = p.sheets > 1;
  return (
    <figure className="sp-plate">
      <div ref={p.colRef} className="min-w-0">
        <div
          ref={frame}
          className={cn('sp-frame', p.frameH != null && many && 'is-paged')}
          style={p.frameH != null ? { height: p.frameH } : undefined}
          onScroll={many ? (e) => setShown(Math.round(e.currentTarget.scrollTop / Math.max(1, step))) : undefined}
        >
          <div className="relative mx-auto" style={{ width: p.paper.w * p.pxPerMm || undefined }}>
            <LetterMarks id={p.letter.id} hand={p.hand}>{p.sheet}</LetterMarks>
          </div>
        </div>
      </div>
      <figcaption className="sp-caption" style={{ width: p.paper.w * p.pxPerMm || undefined }}>
        <span className="sp-label">
          {many && p.frameH != null ? (
            <span role="group" aria-label="Sheets">
              Sheet{' '}
              {Array.from({ length: p.sheets }, (_, i) => (
                <span key={i}>
                  {i > 0 && <span aria-hidden> · </span>}
                  <button type="button" aria-pressed={shown === i} onClick={() => go(i)} className={cn('sp-sheet-no', shown === i && 'is-on')}>{i + 1}</button>
                </span>
              ))}
            </span>
          ) : (
            `${p.sheets === 1 ? 'One sheet' : `${p.sheets} sheets`}`
          )}
        </span>
        <span className="sp-credit">Hand: {p.name}, a fictional writer</span>
      </figcaption>
    </figure>
  );
}

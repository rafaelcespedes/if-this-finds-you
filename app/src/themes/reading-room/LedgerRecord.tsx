// The Reading Room's record as a ledger (Proposal 1 of the layout study, Rafael's pick, 3 Nov): no card and no box,
// only ruled rows on the room. The number and Share, the title, then the facts that place a letter (from, to, where,
// when, why it survives, the hand, the rights). A note opens in place, under its row, when you press its small red
// number, so no note ever falls below the fold. "Full record" folds away the rest (language, translator, the printed
// source, how we know it's free, a line to cite it), and one line of physical description follows, as archives write
// it. Used by the tool's desk and, on phones, under the sheet. The library's letter page has its own reading column.
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { callNo, type CardRecord } from './catalogue';

interface Props {
  record: CardRecord;
  /** the hand row's value (the writer's signature, or a menu) */
  hand: ReactNode;
  /** under it, the way into what's known about the hand (phones: "About this hand ›") */
  handAction?: ReactNode;
  handName: string;
  /** beside the number: Share */
  actions?: ReactNode;
  /** the head's last line, under the title (the desk: Bring another) */
  headAction?: ReactNode;
  /** "laid paper · dip pen · blue-black ink" */
  physical?: string;
  className?: string;
}

type NoteKey = 'story' | 'hand' | 'source';

export function LedgerRecord({ record: r, hand, handAction, handName, actions, headAction, physical, className }: Props) {
  const id = useId();
  const [open, setOpen] = useState<NoteKey | null>(null);
  const [full, setFull] = useState(false);
  // on the desk the title keeps to two lines (reading-room.css). A longer one is cut here, at a word, with an
  // ellipsis, measured on an unseen copy (so no third line is laid out to peek through); the whole of it is then in
  // its tooltip and heads the Full record
  const titleRef = useRef<HTMLHeadingElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [cut, setCut] = useState<string | null>(null);
  useLayoutEffect(() => {
    const el = titleRef.current, m = measureRef.current;
    if (!el || !m) return;
    const fit = () => {
      const cs = getComputedStyle(el);
      if (cs.getPropertyValue('-webkit-line-clamp') !== '2') return setCut(null); // only the desk keeps to two lines
      const room = 2.5 * (parseFloat(cs.lineHeight) || 24);
      m.style.width = `${el.clientWidth}px`;
      const fits = (t: string) => { m.textContent = t; return m.offsetHeight <= room; };
      if (fits(r.title)) return setCut(null);
      const words = r.title.split(' ');
      let lo = 1, hi = words.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (fits(words.slice(0, mid).join(' ') + '…')) lo = mid; else hi = mid - 1; }
      setCut(words.slice(0, lo).join(' ').replace(/[\s,;:(“‘"']+$/, '') + '…');
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    // the book face arriving rewraps the title without changing its box: measure again
    document.fonts?.addEventListener('loadingdone', fit);
    return () => { ro.disconnect(); document.fonts?.removeEventListener('loadingdone', fit); };
  }, [r.title]);
  // notes numbered in the order their rows come
  const order: NoteKey[] = [...(r.story ? ['story' as const] : []), 'hand', ...(r.source ? ['source' as const] : [])];
  const noteBody: Record<NoteKey, ReactNode> = {
    story: r.story,
    hand: <>The words are the original writer’s. The handwriting is {handName}’s, a writer who never existed.</>,
    source: r.source ? <>{r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="rr-link">{r.source.name}</a> : r.source.name}.</> : null,
  };
  const mark = (key: NoteKey, what: string) => {
    const n = order.indexOf(key) + 1;
    if (!n) return null;
    return (
      <button
        type="button"
        className="rr-ref rr-ref-button"
        aria-expanded={open === key}
        aria-controls={`${id}-${key}`}
        aria-label={`Note ${n}: ${what}`}
        onClick={() => setOpen((o) => (o === key ? null : key))}
      >
        {n}
      </button>
    );
  };
  const note = (key: NoteKey) =>
    open === key ? <p id={`${id}-${key}`} className="rr-row-note">{noteBody[key]}</p> : <span id={`${id}-${key}`} hidden />;

  const rows: { term: string; value: ReactNode; after?: ReactNode }[] = [
    { term: 'From', value: <>{r.from}{r.heritage && <span className="rr-sub">{r.heritage}</span>}</> },
  ];
  if (r.to) rows.push({ term: 'To', value: r.to });
  if (r.where) rows.push({ term: 'Where', value: r.where });
  if (r.year != null) rows.push({ term: 'When', value: <>{r.year}{r.dateNote && <span className="rr-sub">{r.dateNote}</span>}</> });
  rows.push({ term: 'Status', value: <><span className={cn(r.lost && 'rr-red')}>{r.status}</span>{r.story && mark('story', 'how it survives')}</>, after: r.story ? note('story') : null });
  rows.push({ term: 'Hand', value: <><span className="inline-flex max-w-full items-center">{hand}{mark('hand', 'about the hand')}</span>{handAction}</>, after: note('hand') });
  if (r.rights) rows.push({ term: 'Rights', value: <>{r.rights}{r.source && mark('source', 'the printed source')}</>, after: r.source ? note('source') : null });

  const cite = citation(r);
  return (
    <section aria-labelledby={`${id}-t`} className={cn('rr-ledger-record', className)}>
      <div className="rr-ledger-head">
        <p className="rr-card-no">
          {r.no != null ? <><span className="rr-sc">No.</span> {callNo(r.no)}<span className="sr-only">, in the collection</span></> : <span className="rr-sc">In the collection</span>}
        </p>
        {actions && <div className="rr-card-actions">{actions}</div>}
      </div>
      <h2 ref={titleRef} id={`${id}-t`} title={cut ? r.title : undefined} aria-label={cut ? r.title : undefined} className="rr-card-title text-balance">{cut ?? r.title}</h2>
      <span ref={measureRef} aria-hidden className="rr-card-title rr-title-measure text-balance" />
      {headAction}
      <dl className="rr-facts">
        {rows.map((row) => (
          <div key={row.term} className="rr-fact">
            <dt className="rr-sc">{row.term}</dt>
            <dd>{row.value}{row.after}</dd>
          </div>
        ))}
      </dl>
      <div className="rr-full">
        <button type="button" className="rr-full-head" aria-expanded={full} aria-controls={`${id}-full`} onClick={() => setFull((f) => !f)}>
          <span className="rr-sc">Full record</span>
          <span aria-hidden className="rr-full-sign">{full ? '−' : '+'}</span>
        </button>
        {physical && <p className="rr-physical">{physical}</p>}
        <div id={`${id}-full`} hidden={!full}>
          <dl className="rr-facts">
            {cut && <div className="rr-fact"><dt className="rr-sc">Title</dt><dd>{r.title}</dd></div>}
            <div className="rr-fact"><dt className="rr-sc">Language</dt><dd>{r.language}</dd></div>
            {r.translator && (
              <div className="rr-fact"><dt className="rr-sc">Translated by</dt><dd>{r.translator.url ? <a href={r.translator.url} target="_blank" rel="noreferrer" className="rr-link">{r.translator.name}</a> : r.translator.name}</dd></div>
            )}
            {r.source && (
              <div className="rr-fact"><dt className="rr-sc">Source</dt><dd>{r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="rr-link">{r.source.name}</a> : r.source.name}</dd></div>
            )}
            {r.rightsBasis && <div className="rr-fact"><dt className="rr-sc">How we know</dt><dd className="rr-small">{r.rightsBasis}</dd></div>}
            <div className="rr-fact"><dt className="rr-sc">Cite</dt><dd className="rr-small rr-cite">{cite}</dd></div>
          </dl>
        </div>
      </div>
    </section>
  );
}

/** "C. Fabregue to his brother, Cairo, 1798. If This Finds You, No. 0004. https://…/letters#/letter/fabregue-1798" */
function citation(r: CardRecord) {
  const who = r.to ? `${r.from} to ${r.to}` : r.from;
  const where = [r.where, r.year].filter((x) => x != null && x !== '').join(', ');
  const url = typeof location !== 'undefined' ? new URL(`${import.meta.env.BASE_URL}letters#/letter/${encodeURIComponent(r.id)}`, location.origin).toString() : '';
  return `${who}${where ? `, ${where}` : ''}. If This Finds You${r.no != null ? `, No. ${callNo(r.no)}` : ''}. ${url}`;
}

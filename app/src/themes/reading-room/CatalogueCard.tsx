// The Reading Room's catalogue card: a letter arrives with it. Its number in archival red, the title, then the facts in
// small capitals on hairline rows (from, to, where, when, language, why it survives, the hand, the rights), and margin
// notes keyed by small red numbers: the true story, the fictional hand, the printed source and how we know it's free.
// Beside the sheet on wide screens; a slip under it on phones (`slip`).
// Note marks are plain superscripts, never #anchors: both pages keep their own state in the URL hash.
import { useId, useState, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import { callNo, type CardRecord } from './catalogue';

interface Props {
  record: CardRecord;
  /** the hand row's value (the writer's name, or their signature, or a menu) */
  hand: ReactNode;
  handName: string;
  /** top right: share, and the like */
  actions?: ReactNode;
  /** the letter page's title is the page's h1, and takes focus when a letter opens */
  titleAs?: 'h1' | 'h2';
  titleRef?: RefObject<HTMLHeadingElement | null>;
  slip?: boolean;
  className?: string;
  children?: ReactNode;
}

export function CatalogueCard({ record: r, hand, handName, actions, titleAs = 'h2', titleRef, slip, className, children }: Props) {
  const id = useId();
  const [basisOpen, setBasisOpen] = useState(false);
  const Title = titleAs;
  // margin notes, numbered in the order they're keyed on the card
  const notes: { key: string; body: ReactNode }[] = [];
  const note = (key: string, body: ReactNode) => {
    notes.push({ key, body });
    return <sup aria-hidden className="rr-ref">{notes.length}</sup>;
  };
  const statusRef = r.story ? note('story', r.story) : null;
  const handRef = note('hand', <>The words are the original writer’s. The handwriting is {handName}’s, a fictional writer; every hand here is drawn fresh.</>);
  const sourceRef = r.source
    ? note('source', (
        <>
          {r.source.url ? <a href={r.source.url} target="_blank" rel="noreferrer" className="rr-link">{r.source.name}</a> : r.source.name}.
          {r.rightsBasis && (
            <>
              {' '}
              <button type="button" aria-expanded={basisOpen} onClick={() => setBasisOpen((o) => !o)} className="rr-link rr-link--quiet">{basisOpen ? 'Less' : 'How we know it’s free to use'}</button>
              {basisOpen && <span className="mt-1 block">{r.rightsBasis}</span>}
            </>
          )}
        </>
      ))
    : null;

  const rows: [string, ReactNode][] = [
    ['From', <>{r.from}{r.heritage && <span className="rr-sub">{r.heritage}</span>}</>],
  ];
  if (r.to) rows.push(['To', r.to]);
  if (r.where) rows.push(['Where', r.where]);
  if (r.year != null) rows.push(['When', <><span className="rr-figures">{r.year}</span>{r.dateNote && <span className="rr-sub">{r.dateNote}</span>}</>]);
  rows.push(['Language', r.language]);
  if (r.translator) rows.push(['Translated by', r.translator.url ? <a href={r.translator.url} target="_blank" rel="noreferrer" className="rr-link">{r.translator.name}</a> : r.translator.name]);
  rows.push(['Status', <><span className={cn(r.lost && 'rr-red')}>{r.status}</span>{statusRef}</>]);
  rows.push(['Hand', <span className="inline-flex max-w-full items-center">{hand}{handRef}</span>]);
  if (r.rights) rows.push(['Rights', <>{r.rights}{sourceRef}</>]);

  return (
    <section aria-labelledby={`${id}-t`} className={cn('rr-card', slip && 'rr-card--slip', className)}>
      <div className="rr-card-head">
        <p className="rr-card-no">
          {r.no != null ? <><span className="rr-sc">No.</span> <span className="rr-figures">{callNo(r.no)}</span><span className="sr-only">, in the collection</span></> : <span className="rr-sc">In the collection</span>}
        </p>
        {actions && <div className="rr-card-actions">{actions}</div>}
      </div>
      <Title id={`${id}-t`} ref={titleRef} tabIndex={titleRef ? -1 : undefined} className="rr-card-title text-balance outline-none">{r.title}</Title>
      <dl className="rr-facts">
        {rows.map(([term, value]) => (
          <div key={term} className="rr-fact">
            <dt className="rr-sc">{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="rr-notes">
        <h3 className="sr-only">Notes</h3>
        <ol>
          {notes.map((n) => <li key={n.key}>{n.body}</li>)}
        </ol>
      </div>
      {children}
    </section>
  );
}

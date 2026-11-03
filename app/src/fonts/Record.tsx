// A hand opened in place to its own record, as a foundry's specimen page does (layout study, Proposal 4): the
// fictional writer, how they were taught, pen, paper, licence and script; then folded rows for the sources and
// credits of every letter, every character in the font, and the live hand (the engine's own writing on the hand's
// paper) with a plain note on how the font differs from it (principle 7); then the actions, one in red. Ruled rows,
// never boxes. Every control is a shared one.
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Download, Heart, LoaderCircle, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MoreButton } from '@/components/ui/group';
import { cn } from '@/lib/utils';
import type { FontEntry, HandRecord } from './protocol';
import type { LiveImage } from './store';
import { fonts } from './store';

interface Props {
  entry: FontEntry;
  id: string;
  /** the font family the row is set in (with every character once "Every character" is open) */
  family: string | null;
  /** the font now has every character the record lists */
  allLoaded: boolean;
  /** "Every character" opened (its characters, to set the font with) or closed ('') */
  onShowAll: (chars: string) => void;
  /** the live-hand fold opened or closed (the row asks for the live writing while it's open) */
  onLive: (open: boolean) => void;
  /** the live writing, once made (exactly the CSS size it was made for) */
  live: (LiveImage & { alt: string }) | null;
  liveHeight: number;
  toolHref: string;
  saved: boolean;
  onSave: () => void;
  onDownload: () => void;
  building: boolean;
}

function Fold({ label, summary, children, open, onToggle }: { label: string; summary?: string; children: ReactNode; open: boolean; onToggle: () => void }) {
  const id = useId();
  return (
    <section data-row className="record-fold border-t border-border/70">
      <MoreButton open={open} controls={id} flush summary={summary} onClick={onToggle}>{label}</MoreButton>
      {open && <div id={id} className="pb-4">{children}</div>}
    </section>
  );
}

export function HandRecordView(p: Props) {
  const [record, setRecord] = useState<HandRecord | null>(null);
  const [fold, setFold] = useState<'' | 'sources' | 'chars' | 'live'>('');
  useEffect(() => { let live = true; fonts.record(p.entry).then((r) => live && setRecord(r)); return () => { live = false; }; }, [p.entry.id]);
  const toggle = (f: typeof fold) => {
    const next = fold === f ? '' : f;
    setFold(next);
    p.onShowAll(next === 'chars' && record ? record.chars : '');
    p.onLive(next === 'live');
  };
  // "Schooled in: X. Later habits: Y (19%)." → the school, where and when a traced tradition was taught, and the later habits
  const taught = (() => {
    if (!record) return { school: '', place: '', later: '' };
    const m = record.taught.match(/^Schooled in:\s*(.*?)\.(?:\s*(Later habits:.*))?$/);
    const everyday = p.entry.style === 'print' || p.entry.style === 'script';
    const school = m?.[1] || record.tradition.name;
    const place = everyday ? '' : [record.tradition.region, record.tradition.era].filter(Boolean).join(' · ');
    return { school, place: place ? `${place}.` : '', later: m?.[2] ?? '' };
  })();
  const rows: [string, ReactNode][] = record ? [
    ['Writer', <>{p.entry.name}, a fictional writer</>],
    ['Taught', <>{taught.school}{(taught.place || taught.later) && <span className="record-sub">{[taught.place, taught.later].filter(Boolean).join(' ')}</span>}</>],
    ['Pen', record.pen],
    ['Paper', record.paper],
    ['Licence', <a className="ed-link" href="https://openfontlicense.org" target="_blank" rel="noreferrer">SIL Open Font License 1.1</a>],
    ['Script', 'Latin, with European accents'],
  ] : [];
  return (
    <div id={p.id} className="font-record" role="region" aria-label={`${p.entry.name}’s record`}>
      {!record ? (
        <p className="record-wait">Opening the record…</p>
      ) : (
        <>
          <dl className="record-rows">
            {rows.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          <p className="record-about">{record.about}</p>
          <div className="record-folds">
            <Fold label="Sources and credits" summary={`${record.sources.length} ${record.sources.length === 1 ? 'source' : 'sources'}`} open={fold === 'sources'} onToggle={() => toggle('sources')}>
              <ol className="record-sources">
                {record.sources.map((s) => (
                  <li key={s.name}>
                    <span className="record-source-name">{s.name}</span>
                    <span className="record-sub">{s.credit}{s.url && <> <a className="ed-link" href={s.url} target="_blank" rel="noreferrer">Source</a></>}</span>
                  </li>
                ))}
              </ol>
            </Fold>
            <Fold label="Every character" summary={`${[...record.chars].length} in the font`} open={fold === 'chars'} onToggle={() => toggle('chars')}>
              {p.allLoaded && p.family ? (
                <p className="record-charset" style={{ fontFamily: `"${p.family}"` }} lang="und">{[...record.chars].join(' ')}</p>
              ) : (
                <p className="record-wait"><LoaderCircle aria-hidden className="mr-1.5 inline size-4 animate-spin align-[-3px]" />Setting every character in this font, a moment…</p>
              )}
            </Fold>
            <Fold label="The live hand" summary="on the page" open={fold === 'live'} onToggle={() => toggle('live')}>
              <div className="record-live" style={{ height: p.liveHeight, background: p.entry.tint }}>
                {p.live ? (
                  <img src={p.live.url} alt={p.live.alt} decoding="async" draggable={false} width={p.live.width} height={p.live.height}
                    className={cn('font-specimen-img', p.live.fresh && 'specimen-in')} style={{ width: p.live.width, height: p.live.height }} />
                ) : (
                  <p className="record-wait"><LoaderCircle aria-hidden className="mr-1.5 inline size-4 animate-spin align-[-3px]" />Writing it out, a moment…</p>
                )}
              </div>
              <p className="record-note">
                On the page, {p.entry.name} never writes a letter the same way twice. A font can only keep a few versions of each letter and swaps between them as you type, so it repeats a little more than the live hand. The letter shapes, joins and spacing are the same hand.
              </p>
            </Fold>
          </div>
          <div className="record-actions">
            <Button onClick={p.onDownload} disabled={p.building} className="dock-primary">
              {p.building ? <LoaderCircle aria-hidden className="animate-spin" /> : <Download aria-hidden />}
              {p.building ? 'Making the font…' : 'Download the font'}
            </Button>
            <Button asChild variant="outline">
              <a href={p.toolHref}><PenLine aria-hidden /> Write with it</a>
            </Button>
            <Button variant="ghost" aria-pressed={p.saved} onClick={p.onSave} className={cn(p.saved && 'text-foreground')}>
              <Heart aria-hidden className={cn(p.saved && 'fill-current')} /> {p.saved ? 'Kept' : 'Keep'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

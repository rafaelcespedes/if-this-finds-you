// All letters as a list, in the Reading Room (the layout study, proposal 2): the same letters as a finding aid, one
// ruled row each (number, title, who wrote to whom, place, year), by century, or by place or writer. It is also the
// keyboard and screen-reader view of the table ("Show the letters as a list"). The dock's filters apply as they do on
// the table; the order is kept for the tab, never put in links.
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { callNo, marksOf } from '@/themes/reading-room/catalogue';
import { useMarks } from '@/themes/reading-room/useCatalogue';
import { capFirst, circumstanceLabel, eraOf, ERAS, fromTo, lostInTransit, opening, shortAuthor } from './data';
import type { ArchiveLetter } from './model';
import { letterHash } from './route';

type Sort = 'year' | 'place' | 'writer';
const SORTS: Sort[] = ['year', 'place', 'writer'];
const SORT_NAME: Record<Sort, string> = { year: 'Year', place: 'Place', writer: 'Writer' };
const SORT_KEY = 'seedhand:list-sort';

function readSort(): Sort {
  try {
    const kept = sessionStorage.getItem(SORT_KEY);
    if (kept === 'place' || kept === 'writer') return kept;
  } catch { /* storage off: by year */ }
  return 'year';
}

/** The place as recorded, without its bracketed asides ("Béxar (San Antonio), Mexican Texas" → "Béxar, Mexican Texas"). */
const placeOf = (l: ArchiveLetter) => (l.place ?? '').replace(/\s*\([^)]*\)/g, '').trim();

/**
 * Writers by surname, as a finding aid files them ("Martha Snetter" under S; initials aren't surnames; a quoted
 * signature as signed, "‘Mary de A.’" under M). A writer the record doesn't name ("an 8-year-old boy") files under
 * "Unnamed writers", at the end.
 */
function writerKey(l: ArchiveLetter) {
  const a = shortAuthor(l);
  if (/^unknown/i.test(l.author ?? '') && !/^[‘'"“]/.test(a)) return '';
  const name = a.replace(/^[‘'"“]|[’'"”]$/g, '');
  // a signature in quotes is how the writer signed (first names, mostly): filed as written
  if (name !== a) return name.toLocaleLowerCase('en');
  const words = name.split(/\s+/).filter((w) => !/^\p{Lu}\.?$/u.test(w) && !/^\(.*\)$/.test(w));
  const last = words[words.length - 1] ?? name;
  return (words.length > 1 && /^\p{Lu}/u.test(last) ? `${last} ${name}` : name).toLocaleLowerCase('en');
}

const initial = (s: string) => s.trim().charAt(0).toLocaleUpperCase('en') || '…';

interface Group {
  id: string;
  label: string;
  letters: ArchiveLetter[];
}

function groupsOf(letters: ArchiveLetter[], sort: Sort): Group[] {
  if (sort === 'year') {
    const byYear = [...letters].sort((a, b) => (a.year ?? 1e4) - (b.year ?? 1e4) || (a.title ?? '').localeCompare(b.title ?? ''));
    const groups = ERAS.map((e) => ({ id: e.id, label: e.label, letters: byYear.filter((l) => eraOf(l)?.id === e.id) }));
    const undated = byYear.filter((l) => !eraOf(l));
    return [...groups, { id: 'undated', label: 'Undated', letters: undated }].filter((g) => g.letters.length);
  }
  const key = sort === 'place' ? (l: ArchiveLetter) => placeOf(l).toLocaleLowerCase('en') : writerKey;
  const sorted = [...letters].sort((a, b) => {
    const ka = key(a), kb = key(b);
    if (!ka !== !kb) return ka ? -1 : 1; // no place given: last
    return ka.localeCompare(kb, 'en') || (a.year ?? 0) - (b.year ?? 0);
  });
  const out: Group[] = [];
  for (const l of sorted) {
    const k = key(l);
    const label = k ? initial(k) : sort === 'place' ? 'No place given' : 'Unnamed writers';
    const last = out[out.length - 1];
    if (last?.label === label) last.letters.push(l);
    else out.push({ id: `${sort}-${label}`, label, letters: [l] });
  }
  return out;
}

export function FindingList({ letters, onOpen }: { letters: ArchiveLetter[]; onOpen: () => void }) {
  const [sort, setSort] = useState<Sort>(readSort);
  const choose = (s: Sort) => {
    try { sessionStorage.setItem(SORT_KEY, s); } catch { /* fine */ }
    setSort(s);
  };
  // the numbers come with the catalogue (loaded once; the rows re-render when it's in)
  useMarks(null);
  const groups = useMemo(() => groupsOf(letters, sort), [letters, sort]);

  return (
    <div className="fa">
      <div className="fa-sort" role="group" aria-label="Sort the letters">
        <span aria-hidden>Sort by</span>
        {SORTS.map((s, i) => (
          <span key={s} className="contents">
            {i > 0 && <span aria-hidden className="fa-sep">·</span>}
            <button type="button" aria-pressed={sort === s} onClick={() => choose(s)} className={cn('fa-sort-by', sort === s && 'is-on')}>
              <span className="sr-only">Sort by </span>{SORT_NAME[s]}
            </button>
          </span>
        ))}
      </div>
      {groups.map((g) => (
        <section key={g.id} className="fa-group" aria-labelledby={`fa-${g.id}`}>
          <h2 id={`fa-${g.id}`} className="fa-head"><span>{g.label}</span></h2>
          <ol role="list" className="fa-rows">
            {g.letters.map((l) => <Row key={l.id} letter={l} onOpen={onOpen} />)}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Row({ letter: l, onOpen }: { letter: ArchiveLetter; onOpen: () => void }) {
  const no = marksOf(l.id)?.no;
  const lost = lostInTransit(l);
  const place = placeOf(l);
  return (
    <li>
      <a href={letterHash(l.id)} onClick={onOpen} className="fa-row">
        <span className="fa-no">{no != null && <>No. {callNo(no)}</>}</span>
        <span className="fa-title">{l.title ?? opening(l.text, 60)}</span>
        <span className="fa-writer">{fromTo(l)}</span>
        <span className="fa-place">
          {capFirst(place)}
          {lost && <>{place ? ' · ' : ''}<span className="fa-status">{circumstanceLabel(l)}</span></>}
        </span>
        <span className="fa-year">{l.year ?? ''}</span>
      </a>
    </li>
  );
}

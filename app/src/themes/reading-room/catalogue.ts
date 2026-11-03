// The Reading Room (?look=reading-room): what a letter's catalogue card says, and its permanent number.
//
// The number is the letter's place in content/sample-texts.json, counting every entry (switched off or not), so it is
// an accession number: the order letters came into the collection. Fabregue, Cairo 1798, is No. 0004. Numbers stay put
// as long as new letters are added at the end of the file; switching a letter off never renumbers the others.
//
// Everything on the card comes from the curator's fields; nothing is invented here. Loaded with the collection (the
// tool already has it in its main chunk; the library loads it on demand), so this never makes a page wait.
//
// One source for the number and the place: the card, the sheet's marks and anything that prints them (marksOf) read
// from here. No React and no DOM, so a worker (the library's card painter) can use it too; the hooks are in
// useCatalogue.ts.
import { shortAuthor } from '@/lib/names';

interface Raw {
  id: string;
  kind?: string;
  lang?: string;
  title?: string;
  author?: string;
  recipient?: string;
  year?: number;
  origin?: string;
  story?: string;
  place?: string | null;
  dateNote?: string;
  source?: { name: string; url?: string; licence?: string };
  rights?: { us?: boolean; eu?: boolean; basis?: string };
  translator?: { name: string; url?: string };
  writer?: { heritage?: string } | null;
}

/** What the card shows, already in the card's words. */
export interface CardRecord {
  id: string;
  /** the permanent number (unknown for a moment while the collection loads) */
  no?: number;
  title: string;
  from: string;
  /** where the writer came from, when the source says */
  heritage?: string;
  to?: string;
  where?: string;
  year?: number;
  dateNote?: string;
  language: string;
  /** the curator's reason it survives ("Intercepted"), and the true story behind it */
  status: string;
  story?: string;
  /** undelivered or intercepted: the card says it in red */
  lost: boolean;
  source?: { name: string; url?: string };
  rights?: string;
  rightsBasis?: string;
  translator?: { name: string; url?: string };
}

let loading: Promise<Map<string, CardRecord>> | null = null;
let ready: Map<string, CardRecord> | null = null;

export function loadCatalogue() {
  loading ??= import('../../../../content/sample-texts.json').then((m) => {
    const raw = ((m as { default?: unknown }).default ?? m) as Raw[];
    ready = new Map(raw.map((r, i) => [r.id, toRecord(r, i + 1)]));
    return ready;
  });
  return loading;
}

/** The collection is in (getRecord and marksOf answer from now on). */
export const catalogueReady = () => ready != null;

/** The card for a letter id (undefined until the collection is in, or for a letter that isn't in it). */
export const getRecord = (id: string | null | undefined): CardRecord | undefined => (id && ready ? ready.get(id) : undefined);

/** What is printed on a letter's sheet: its number ("No. 0004") and its postmark (the place, short, and the year). */
export interface LetterMarks {
  id: string;
  no: number;
  /** "No. 0004" */
  number: string;
  /** the postmark's place, short enough for a ring ("Cairo"); empty when the source gives none */
  place: string;
  /** the place as the curator wrote it */
  placeFull?: string;
  year?: number;
}

/** The marks for a letter id, once the collection is in (await loadCatalogue() first where it may not be). */
export function marksOf(id: string | null | undefined): LetterMarks | undefined {
  const r = getRecord(id);
  if (!r || r.no == null) return undefined;
  return { id: r.id, no: r.no, number: `No. ${callNo(r.no)}`, place: postmarkPlace(r.where), placeFull: r.where, year: r.year };
}

/** No. 0004 */
export const callNo = (n: number) => String(n).padStart(4, '0');

const STATUS: Record<string, string> = {
  undelivered: 'Never delivered',
  seized: 'Intercepted',
  emigrant: 'Emigrant letter',
  family: 'Family letter',
  everyday: 'Everyday letter',
  notable: 'Letter',
};

const languages = (() => {
  try { return new Intl.DisplayNames(['en'], { type: 'language' }); } catch { return null; }
})();
function languageName(tag: string) {
  const base = (tag || 'en').split('-')[0].toLowerCase();
  try { return languages?.of(base) ?? base; } catch { return base; }
}

function toRecord(r: Raw, no: number): CardRecord {
  const c = r.origin || 'everyday';
  let status = STATUS[c] ?? 'Letter';
  if (r.kind === 'note') status = status.replace(/letter$/i, 'note');
  const rights = r.rights;
  const rightsLine = rights?.us && rights?.eu ? 'Public domain in the US and the EU' : rights?.us ? 'Public domain in the US' : rights?.eu ? 'Public domain in the EU' : r.source?.licence;
  return {
    id: r.id,
    no,
    title: r.title ?? 'A letter',
    from: shortAuthor(r.author ?? '') || 'Unknown',
    heritage: r.writer?.heritage,
    to: (r.recipient ?? '').trim().split(/;\s*/)[0] || undefined,
    where: r.place ?? undefined,
    year: r.year,
    dateNote: r.dateNote,
    language: languageName(r.lang ?? 'en'),
    status,
    story: r.story,
    lost: c === 'undelivered' || c === 'seized',
    source: r.source ? { name: r.source.name, url: r.source.url } : undefined,
    rights: rightsLine,
    rightsBasis: rights?.basis,
    translator: r.translator,
  };
}

/** "CAIRO" for the postmark: the place's first part, short enough for a ring (a long place keeps its first words). */
export function postmarkPlace(place: string | undefined) {
  if (!place) return '';
  const first = place.split(/[,(;]/)[0].trim();
  return first.length > 22 ? first.split(/\s+/).slice(0, 2).join(' ') : first;
}

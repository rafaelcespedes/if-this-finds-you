// The collection, loaded on demand (its own chunk), turned into the archive's letter model, plus the words the
// index shows for each letter. Everything shown comes from the curator's fields; nothing here invents a fact.
import type { ArchiveLetter, Circumstance, Found } from './model';
import type { Filters } from './route';

interface Raw {
  id: string;
  text: string;
  kind: string;
  lang: string;
  title?: string;
  author?: string;
  recipient?: string;
  year?: number;
  origin?: string;
  story?: string;
  place?: string | null;
  dateNote?: string;
  source?: Found['source'];
  rights?: Found['rights'];
  translator?: Found['translator'];
  writer?: { heritage?: string } | null;
  olderHandsOnly?: boolean;
  traditions?: string[];
  tags?: string[];
  enabled?: boolean;
}

let loading: Promise<ArchiveLetter[]> | null = null;

/** Every enabled letter, oldest first within the order the curator gave (loaded once). */
export function loadLetters(): Promise<ArchiveLetter[]> {
  loading ??= import('../../../content/sample-texts.json').then((m) => {
    const raw = ((m as { default?: unknown }).default ?? m) as Raw[];
    return raw.filter((r) => r.enabled !== false && r.text).map(fromRaw);
  });
  return loading;
}

function fromRaw(r: Raw): ArchiveLetter {
  const letter: ArchiveLetter = {
    id: r.id,
    origin: 'found',
    text: r.text,
    kind: r.kind === 'note' ? 'note' : 'letter',
    lang: r.lang || 'en',
    title: r.title,
    author: r.author,
    recipient: r.recipient,
    year: r.year,
    place: r.place ?? undefined,
    found: {
      circumstance: (r.origin || 'everyday') as Circumstance,
      story: r.story,
      dateNote: r.dateNote,
      source: r.source,
      rights: r.rights,
      translator: r.translator,
      heritage: r.writer?.heritage,
    },
    olderHandsOnly: r.olderHandsOnly,
    traditions: r.traditions,
    tags: r.tags,
    haystack: '',
  };
  letter.haystack = fold([r.text, r.title, r.author, r.recipient, r.place, r.year, languageName(letter.lang), circumstanceLabel(letter)].filter(Boolean).join(' \n '));
  return letter;
}

/** Lower case, accents folded: "Crítica" and "critica" find each other. */
export const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// ---------- eras ----------
export interface Era {
  id: string;
  label: string;
  from: number;
  to: number;
}
export const ERAS: Era[] = [
  { id: 'before-1600', label: 'Before 1600', from: -Infinity, to: 1599 },
  { id: '1600s', label: '1600s', from: 1600, to: 1699 },
  { id: '1700s', label: '1700s', from: 1700, to: 1799 },
  { id: '1800s', label: '1800s', from: 1800, to: 1899 },
  { id: '1900s', label: '1900s', from: 1900, to: 1999 },
  { id: 'now', label: 'Since 2000', from: 2000, to: Infinity },
];
export const eraOf = (l: ArchiveLetter) => (l.year == null ? undefined : ERAS.find((e) => l.year! >= e.from && l.year! <= e.to));

// ---------- languages ----------
const names = (() => {
  try { return new Intl.DisplayNames(['en'], { type: 'language' }); } catch { return null; }
})();
/** The base language: "es-AR" → "es". Filters group by it. */
export const baseLang = (lang: string) => (lang || 'en').split('-')[0].toLowerCase();
export function languageName(lang: string) {
  const base = baseLang(lang);
  try { return names?.of(base) ?? base; } catch { return base; }
}

// ---------- the words under a letter ----------
const CIRCUMSTANCE: Record<string, string> = {
  undelivered: 'Never delivered',
  seized: 'Intercepted',
  emigrant: 'Emigrant letter',
  family: 'Family letter',
  everyday: 'Everyday letter',
  notable: 'Letter',
};
/** The curator's reason the letter survives, in a few words ("Never delivered", "Emigrant letter"). */
export function circumstanceLabel(l: ArchiveLetter) {
  if (l.origin === 'written') return 'Written here';
  const c = l.found?.circumstance ?? 'everyday';
  const label = CIRCUMSTANCE[c] ?? 'Letter';
  return l.kind === 'note' ? label.replace(/letter$/i, 'note') : label;
}
/** Undelivered and intercepted letters: the reason is the story, so the index says it. */
export const lostInTransit = (l: ArchiveLetter) => l.found?.circumstance === 'undelivered' || l.found?.circumstance === 'seized';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const quote = (s: string) => `‘${s}’`;

/**
 * The writer, short: "Rosebell Burke (Rosabella Burke)" → "Rosebell Burke"; "Unknown (signed 'Grace C.')" →
 * "‘Grace C.’"; "Unknown (a schoolboy; name not printed)" → "A schoolboy"; "M. P. (Margery Paston)" → "Margery Paston".
 */
export function shortAuthor(l: ArchiveLetter) {
  if (l.origin === 'written') return l.credit?.anonymous || !l.credit?.name ? 'Anonymous' : l.credit.name;
  const a = (l.author ?? '').trim();
  if (!a) return 'Unknown writer';
  const m = a.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (!m) return a;
  const [, head, inner] = m;
  const clauses = inner.split(/;\s*/);
  const named = (c: string) => c.match(/^(?:signed|printed as|gives (?:her|his) name only as|headed)\s+['‘](.+?)['’]$/i)?.[1];
  if (/^unknown$/i.test(head)) {
    for (const c of clauses) {
      const n = named(c);
      if (n) return quote(n);
    }
    const first = clauses[0].replace(/^unsigned:?\s*/i, '');
    if (/^unsigned/i.test(clauses[0]) && clauses[1]) return cap(clauses[1]);
    return first && !/^['‘]/.test(first) ? cap(first) : 'Unsigned';
  }
  // initials only: the full name in the brackets says more
  if (/^(\p{Lu}\.\s*)+$/u.test(head)) return clauses[0].split(',')[0];
  return head;
}

/** To whom, short: the first clause ("Stephen F. Austin ('Sor. D. …'); 'Don Santiago' is …" → "Stephen F. Austin ('Sor. D. …')"). */
export function shortRecipient(l: ArchiveLetter) {
  const r = (l.recipient ?? '').trim();
  return r ? r.split(/;\s*/)[0] : '';
}

/** "Kamma Rahbek to her brother" (the one-line origin under a letter). */
export function fromTo(l: ArchiveLetter) {
  const to = shortRecipient(l);
  return to ? `${shortAuthor(l)} to ${to}` : shortAuthor(l);
}

/** "Copenhagen, 1813, in Danish": where, when, and the language when it isn't English. */
export function whereWhen(l: ArchiveLetter) {
  const bits: string[] = [];
  if (l.place) bits.push(l.place);
  if (l.year != null) bits.push(String(l.year));
  const lang = baseLang(l.lang) === 'en' ? '' : `in ${languageName(l.lang)}`;
  if (lang) bits.push(lang);
  return bits.join(', ');
}

/** Opening words for a card and its accessible name: whole words, about `n` characters. */
export function opening(text: string, n: number) {
  if (text.length <= n) return text;
  const cut = text.slice(0, n).replace(/\s+\S*$/, '');
  return cut + '…';
}

/** The letters a set of filters shows, in the collection's order (the index, and the letter page's Previous/Next). */
export function filterLetters(letters: ArchiveLetter[], f: Filters) {
  const words = fold(f.q).split(/\s+/).filter(Boolean);
  return letters.filter((l) =>
    (!f.era || eraOf(l)?.id === f.era) &&
    (!f.lang || baseLang(l.lang) === f.lang) &&
    (!f.kind || l.kind === f.kind) &&
    words.every((w) => l.haystack.includes(w)));
}

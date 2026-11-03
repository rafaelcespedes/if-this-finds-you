// Writers' names, short, as people read them. No data here (lib/samples.ts loads the letters), so the archive's
// first page can import it without pulling in every letter.
const quote = (s: string) => `‘${s}’`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The writer, short (as the archive shows them): "Rosebell Burke (Rosabella Burke)" → "Rosebell Burke";
 * "Unknown (signed 'Your mother')" → "‘Your mother’"; "Unknown (unsigned; an 8-year-old boy)" → "An 8-year-old boy".
 */
export function shortAuthor(author: string) {
  const a = (author ?? '').trim();
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

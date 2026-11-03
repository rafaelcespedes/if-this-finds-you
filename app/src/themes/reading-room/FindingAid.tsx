// The Reading Room's All letters heading reads like the top of a finding aid: what the collection holds, in one ruled
// line of small capitals and old-style figures ("127 letters · 1395 to 1914 · 17 languages"). Counted from the letters
// themselves, so it stays true as the collection grows.
import { useMemo } from 'react';
import type { ArchiveLetter } from '@/archive/model';

export function FindingAid({ letters }: { letters: ArchiveLetter[] }) {
  const facts = useMemo(() => {
    if (!letters.length) return null;
    const years = letters.map((l) => l.year).filter((y): y is number => y != null);
    const langs = new Set(letters.map((l) => (l.lang || 'en').split('-')[0].toLowerCase()));
    return { n: letters.length, from: Math.min(...years), to: Math.max(...years), langs: langs.size };
  }, [letters]);
  if (!facts) return null;
  return (
    <p className="rr-aid">
      {facts.n} letters <span aria-hidden>·</span> {facts.from} to {facts.to} <span aria-hidden>·</span> {facts.langs} languages
    </p>
  );
}

// Where this hand's letters come from. Every skeleton variant carries a source (engine/glyphs.js), and
// some sources ask for their credit to travel with the data (Hershey). We list the sources the current
// hand actually draws with, so credits stay right as traced copybooks and new traditions arrive.
import { choose, type Hand } from '@engine';

export interface Source {
  name: string;
  credit: string;
  url?: string;
}

const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&?!.,;:\'"-()';

export function handSources(p: Hand): Source[] {
  const seen = new Map<string, Source>();
  for (const ch of CHARS) {
    const v = choose(p, ch, undefined) as { source?: Source } | undefined;
    const s = v?.source;
    if (s && !seen.has(s.name)) seen.set(s.name, s);
  }
  return [...seen.values()];
}

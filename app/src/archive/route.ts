// Where you are in the archive lives in the URL hash, so every view can be shared and Back works:
//   #/                                  the index (all letters)
//   #/?q=mother&era=1800s&lang=fr&kind=note
//   #/letter/<id>                       a letter in its own hand
//   #/letter/<id>?hand=<seed>~<style>   in a chosen hand (Shuffle, New hand); &keep=1 keeps it for the next letter
//   #/letter/<id>?hand=of:<id2>&keep=1  in another letter's own hand (kept from that letter)

export interface Filters {
  q: string;
  era: string;
  lang: string;
  kind: '' | 'letter' | 'note';
}
export const NO_FILTERS: Filters = { q: '', era: '', lang: '', kind: '' };

export type Route =
  | { page: 'index'; filters: Filters }
  | { page: 'letter'; id: string; hand: string | null; keep: boolean };

/** A link cut mid-escape (`#/letter/%E0%A4%A`) is no letter: its id stays as typed, and the page says it isn't here. */
function decodeId(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const q = new URLSearchParams(query);
  const m = path.match(/^letter\/([^/]+)$/);
  if (m) return { page: 'letter', id: decodeId(m[1]), hand: q.get('hand'), keep: q.get('keep') === '1' };
  const kind = q.get('kind');
  return {
    page: 'index',
    filters: {
      q: (q.get('q') ?? '').slice(0, 120),
      era: q.get('era') ?? '',
      lang: q.get('lang') ?? '',
      kind: kind === 'letter' || kind === 'note' ? kind : '',
    },
  };
}

export function indexHash(f: Filters) {
  const q = new URLSearchParams();
  if (f.q) q.set('q', f.q);
  if (f.era) q.set('era', f.era);
  if (f.lang) q.set('lang', f.lang);
  if (f.kind) q.set('kind', f.kind);
  const s = q.toString();
  return s ? `#/?${s}` : '#/';
}

export function letterHash(id: string, hand?: string | null, keep?: boolean) {
  const q = new URLSearchParams();
  if (hand) q.set('hand', hand);
  if (hand && keep) q.set('keep', '1');
  const s = q.toString();
  return `#/letter/${encodeURIComponent(id)}${s ? `?${s}` : ''}`;
}

// ---------- a random hand, without loading the engine: a word seed (as the tool makes) and Print or Joined ----------
const ADJ = ['quiet', 'amber', 'salt', 'misty', 'cedar', 'honey', 'copper', 'olive', 'linen', 'ember', 'fern', 'maple', 'still', 'early', 'silver', 'gentle', 'brisk', 'dusky', 'pale', 'winter', 'tidal', 'mossy', 'clover', 'slate'];
const NOUN = ['heron', 'river', 'harbor', 'sparrow', 'meadow', 'lantern', 'pebble', 'orchard', 'thistle', 'willow', 'garden', 'quill', 'moth', 'birch', 'kettle', 'finch', 'lark', 'hazel', 'ferry', 'attic', 'parcel', 'inkwell', 'wren', 'harvest'];
const rand = (n: number) => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % n;
};
export function randomHand() {
  return `${ADJ[rand(ADJ.length)]}-${NOUN[rand(NOUN.length)]}-${rand(90) + 10}~${rand(2) ? 'script' : 'print'}`;
}
export const randomIndex = (n: number) => rand(n);

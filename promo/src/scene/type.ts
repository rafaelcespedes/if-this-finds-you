// The video's own type (everything that isn't handwriting): the counter, the writer's name and its descriptor, the
// letter's credit. Set by role, as the site sets its type (app/src/themes/reading-room.css: a face, a weight, caps,
// tracking per role), so a pairing swaps by these values alone.
//   site:     the live site's pairing, Newsreader (the book face) + Schibsted Grotesk (the sans): labels and numbers
//             in the sans, sentence case, 500; names in the book face at 480, tracked in slightly
//   junicode: the Reading Room's earlier type (drafts 1–5): Junicode, small capitals
import { staticFile } from 'remotion';

export type Pairing = 'site' | 'junicode';
type Face = 'book' | 'ui';
export interface Role { face: Face; weight: number; italic?: boolean; caps?: boolean; tracking: number }
export type RoleName = 'label' | 'number' | 'name' | 'meta' | 'credit';

interface TypeSet {
  families: Record<Face, string>;
  files: { family: string; file: string; weight: string; style: 'normal' | 'italic' }[];
  roles: Record<RoleName, Role>;
}

export const TYPESETS: Record<Pairing, TypeSet> = {
  site: {
    families: {
      book: '"Promo Newsreader", "Iowan Old Style", Georgia, serif',
      ui: '"Promo Schibsted", "Helvetica Neue", Arial, sans-serif',
    },
    files: [
      { family: 'Promo Newsreader', file: 'newsreader-latin-roman.woff2', weight: '200 800', style: 'normal' },
      { family: 'Promo Newsreader', file: 'newsreader-latin-italic.woff2', weight: '200 800', style: 'italic' },
      { family: 'Promo Schibsted', file: 'schibsted-grotesk-latin.woff2', weight: '400 900', style: 'normal' },
      { family: 'Promo Schibsted', file: 'schibsted-grotesk-latin-italic.woff2', weight: '400 900', style: 'italic' },
    ],
    roles: {
      label: { face: 'ui', weight: 500, tracking: 0.01 },
      number: { face: 'ui', weight: 500, tracking: 0 },
      name: { face: 'book', weight: 480, tracking: -0.015 },
      meta: { face: 'ui', weight: 400, tracking: 0.01 },
      credit: { face: 'ui', weight: 500, tracking: 0.01 },
    },
  },
  junicode: {
    families: { book: '"RR Junicode", Junicode, Georgia, serif', ui: '"RR Junicode", Junicode, Georgia, serif' },
    files: [
      { family: 'RR Junicode', file: 'junicode-latin-roman.woff2', weight: '400 600', style: 'normal' },
      { family: 'RR Junicode', file: 'junicode-latin-italic.woff2', weight: '400 600', style: 'italic' },
    ],
    roles: {
      label: { face: 'ui', weight: 400, caps: true, tracking: 0.06 },
      number: { face: 'ui', weight: 400, tracking: 0 },
      name: { face: 'book', weight: 400, italic: true, tracking: 0 },
      meta: { face: 'ui', weight: 400, caps: true, tracking: 0.06 },
      credit: { face: 'ui', weight: 400, caps: true, tracking: 0.07 },
    },
  },
};

let current: Pairing = 'site';
export const setPairing = (p: Pairing) => { current = TYPESETS[p] ? p : 'site'; };
export const pairing = () => current;

/** A role's settings for text(): the family to name, and its weight, italics, caps and tracking. */
export function role(name: RoleName) {
  const T = TYPESETS[current];
  const r = T.roles[name];
  return { family: T.families[r.face], weight: r.weight, italic: !!r.italic, caps: !!r.caps, tracking: r.tracking };
}
/** The CSS font shorthand for a role at a size. */
export function fontOf(name: RoleName, size: number) {
  const r = role(name);
  return `${r.italic ? 'italic ' : ''}${r.weight} ${size}px ${r.family}`;
}

const loaded = new Map<Pairing, Promise<void>>();
/** Load a pairing's files (public/fonts, with their OFL licences) before any frame is drawn. */
export function loadPairing(p: Pairing) {
  let job = loaded.get(p);
  if (!job) {
    job = Promise.all(TYPESETS[p].files.map((f) =>
      new FontFace(f.family, `url(${staticFile(`fonts/${f.file}`)}) format('woff2')`, { weight: f.weight, style: f.style })
        .load().then((ff) => { document.fonts.add(ff); }))).then(() => undefined);
    loaded.set(p, job);
  }
  return job;
}

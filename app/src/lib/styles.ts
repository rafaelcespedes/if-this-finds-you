// Styles as the UI shows them: a Print / Joined family switch, then the schools (traditions) inside the
// family. The engine says which family each style belongs to (getStyle(name).family) and where it comes
// from (getStyle(name).tradition), so new styles show up here without UI changes.
import { getStyle, styleNames } from '@engine';

export interface StyleFamily {
  id: string;
  label: string;
  styles: string[];
}

const FAMILY_LABEL: Record<string, string> = { print: 'Print', script: 'Joined' };

interface StyleMeta {
  label?: string;
  family?: string;
  tradition?: { name?: string; region?: string; era?: string };
}
const meta = (name: string) => getStyle(name) as unknown as StyleMeta | undefined;

export const familyOf = (style: string) => meta(style)?.family ?? style;

/** Families in the engine's order, each with its styles (the everyday one first). */
export function styleFamilies(): StyleFamily[] {
  const out = new Map<string, StyleFamily>();
  for (const s of styleNames()) {
    const f = familyOf(s);
    if (!out.has(f)) out.set(f, { id: f, label: FAMILY_LABEL[f] ?? cap(f), styles: [] });
    out.get(f)!.styles.push(s);
  }
  for (const f of out.values()) f.styles.sort((a, b) => Number(b === f.id) - Number(a === f.id));
  return [...out.values()];
}

/** The everyday style of a family: the one named like it, else its first. */
export function baseStyle(family: string) {
  const f = styleFamilies().find((x) => x.id === family);
  return f?.styles.includes(family) ? family : (f?.styles[0] ?? family);
}

/** What a school card says: a short name, and where and when the hand was taught. */
export function styleCard(name: string) {
  const s = meta(name);
  if (!s || name === s.family) return { title: 'Everyday', sub: 'Modern' };
  const title = (s.label ?? cap(name)).replace(/\s+\d{3,4}(?:\s*[–-]\s*\d{2,4})?$/, '');
  const t = s.tradition;
  const sub = [t?.region, t?.era].filter(Boolean).join(' · ');
  return { title, sub: sub || s.label || '' };
}

/** A readable name for a style, for menus and screen readers ("Joined: German school, Germany · 1915–1941"). */
export function styleName(name: string) {
  const fam = FAMILY_LABEL[familyOf(name)] ?? cap(familyOf(name));
  const c = styleCard(name);
  // a school named like its family ("Print") is just the family, never "Print: Print"
  return c.title === 'Everyday' || c.title.toLowerCase() === fam.toLowerCase() ? fam : `${fam}: ${c.title}`;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

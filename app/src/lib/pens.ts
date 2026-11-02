// Pens (docs/research/controls-and-feel.md §4.1): Ballpoint, Gel, Fountain, Dip pen, Italic nib, Felt tip,
// Pencil. Keys match the engine's PENS (pens & ink session). 'auto' is the writer's own pen, derived from the
// seed. Pens the engine doesn't have are left out (except in preview).
import { ENGINE_PENS, hasPen, PREVIEW } from './engine-features';

export interface PenChoice {
  id: string;
  name: string;
}

const ALL_PENS: PenChoice[] = [
  { id: 'auto', name: 'Their own' },
  { id: 'ballpoint', name: 'Ballpoint' },
  { id: 'gel', name: 'Gel' },
  { id: 'fountain', name: 'Fountain' },
  { id: 'pointed', name: 'Dip pen' },
  { id: 'italic', name: 'Italic nib' },
  { id: 'felt', name: 'Felt tip' },
  { id: 'pencil', name: 'Pencil' },
];
const ORIGINAL = new Set(['auto', 'ballpoint', 'gel', 'fountain', 'felt', 'pencil']);

export const PEN_CHOICES: PenChoice[] = ALL_PENS.filter((p) => p.id === 'auto' || hasPen(p.id) || (PREVIEW && ORIGINAL.has(p.id)));

/** The pen picker shows when the engine has these pens (or in preview). */
export const PENS_LIVE = PEN_CHOICES.slice(1).some((p) => hasPen(p.id));
export const PENS_SHOWN = PENS_LIVE || PREVIEW;
export const penName = (id: string) => PEN_CHOICES.find((p) => p.id === id)?.name ?? ENGINE_PENS[id]?.label ?? id;

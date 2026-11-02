// Pens (docs/research/controls-and-feel.md §4.1): Ballpoint, Gel, Fountain, Felt tip, Pencil. Keys match
// the engine's PENS (pens & ink session). 'auto' is the writer's own pen, derived from the seed.
import { ENGINE_PENS, hasPen, PREVIEW } from './engine-features';

export interface PenChoice {
  id: string;
  name: string;
}

export const PEN_CHOICES: PenChoice[] = [
  { id: 'auto', name: 'Their own' },
  { id: 'ballpoint', name: 'Ballpoint' },
  { id: 'gel', name: 'Gel' },
  { id: 'fountain', name: 'Fountain' },
  { id: 'felt', name: 'Felt tip' },
  { id: 'pencil', name: 'Pencil' },
];

/** The pen picker shows when the engine has these pens (or in preview). */
export const PENS_LIVE = PEN_CHOICES.slice(1).some((p) => hasPen(p.id));
export const PENS_SHOWN = PENS_LIVE || PREVIEW;
export const penName = (id: string) => PEN_CHOICES.find((p) => p.id === id)?.name ?? ENGINE_PENS[id]?.label ?? id;

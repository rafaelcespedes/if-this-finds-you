// Occasions (docs/research/controls-and-feel.md §4.3): the same writer in a different situation.
// An occasion moves How (and suggests With what), never Who. Its deltas scale with Amount (0–150%).
import type { PaperId } from './papers';

export interface Occasion {
  id: string;
  name: string;
  /** offsets added at Amount 100%, in each control's own units */
  deltas: Record<string, number>;
  /** writing size change at 100% (+0.15 = 15% larger) */
  size: number;
  /** set once when the occasion is chosen */
  pen?: string;
  paper?: PaperId;
}

export const OCCASIONS: Occasion[] = [
  { id: 'thank-you', name: 'Thank-you card', deltas: { neatness: 0.25, hurry: -0.3, lineWander: -0.3 }, size: 0.05, pen: 'gel', paper: 'laid' },
  { id: 'shopping', name: 'Shopping list', deltas: { neatness: -0.25, hurry: 0.4, pressure: 0.1, lineWander: 0.8, marginDiscipline: 0.3 }, size: 0.15, pen: 'felt', paper: 'squared' },
  { id: 'love', name: 'Love letter', deltas: { neatness: 0.1, hurry: -0.15, pressure: 0.15, inkVariation: 0.3 }, size: 0, pen: 'fountain', paper: 'laid' },
  { id: 'lecture', name: 'Lecture notes', deltas: { neatness: -0.15, hurry: 0.5, fatigue: 1, marginDiscipline: 0.4 }, size: -0.2, pen: 'ballpoint', paper: 'college' },
  { id: 'postcard', name: 'Postcard', deltas: { hurry: 0.1, wordSpace: -0.12 }, size: -0.15, pen: 'ballpoint', paper: 'postcard' },
];

export const getOccasion = (id: string | null) => (id ? OCCASIONS.find((o) => o.id === id) ?? null : null);

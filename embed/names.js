// The writer's name for a seed, exactly as the site names it (app/src/lib/hands.ts writerName): the first name is
// fixed by the seed, the surname by the seed's words, so similar hands read as one family. Copied here so the embed
// needs nothing but the engine; keep the two lists in step if they change.
import { rng } from '../engine/index.js';

const FIRST = [
  'Ada', 'Ottilie', 'Bastien', 'Mirela', 'Ines', 'Tomasz', 'Hugo', 'Wren', 'Linnea', 'Matteo', 'Noor', 'Elif',
  'Anouk', 'Søren', 'Clara', 'Teodor', 'Yara', 'Emil', 'Margit', 'Rosa', 'Felix', 'Ilse', 'Niamh', 'Arlo',
  'Leonie', 'Pilar', 'Henrik', 'Saoirse', 'Jules', 'Mira', 'Oskar', 'Beatrix', 'Amara', 'Kenji', 'Lucia',
  'Viggo', 'Dorothea', 'Idris', 'Hana', 'Magnus', 'Esme', 'Aurelio', 'Signe', 'Thea', 'Casimir', 'Odile',
];
const LAST = [
  'Marsh', 'Lindqvist', 'Moreau', 'Hale', 'Okafor', 'Brandt', 'Castell', 'Novak', 'Ferrante', 'Ashby', 'Halloran',
  'Varga', 'Quint', 'Rowe', 'Sandoval', 'Thorne', 'Weller', 'Bellamy', 'Carver', 'Dunmore', 'Eskildsen', 'Fairley',
  'Gallo', 'Hartmann', 'Ivers', 'Juhl', 'Kessler', 'Lowell', 'Mendes', 'Nyberg', 'Orsini', 'Pryor', 'Sorel',
  'Tamura', 'Ulrich', 'Vance', 'Whitlock', 'Ybarra', 'Zielinski', 'Achterberg', 'Belmonte', 'Kowal', 'Rautio',
];

const seedFamily = (seed) => seed.trim().toLowerCase().replace(/-?\d+$/, '') || seed.trim().toLowerCase();

export function writerName(seed) {
  const first = rng('writer:' + seed.trim().toLowerCase()).pick(FIRST);
  const last = rng('family:' + seedFamily(seed)).pick(LAST);
  return `${first} ${last}`;
}

// Ink families. Keys match the engine's INKS (pens & ink session), so once that lands the engine models
// each family itself (base colour plus per-stroke variation, pooling, edges). Until then the app writes
// in the family's base colour.
import { ENGINE_INKS, MODELLED_INK } from './engine-features';

export interface InkFamily {
  id: string;
  name: string;
  /** base colour, as it looks dry on warm paper */
  color: string;
  /** only offered with this pen */
  pen?: string;
}

// rgb values follow the engine swatches (engine/pen.js INKS on the pens branch)
const BASE: InkFamily[] = [
  { id: 'blue-black', name: 'Blue-black', color: '#233250' },
  { id: 'royal-blue', name: 'Royal blue', color: '#2d52b4' },
  { id: 'ballpoint-blue', name: 'Ballpoint blue', color: '#263084' },
  { id: 'black', name: 'Black', color: '#26262e' },
  { id: 'sepia', name: 'Sepia', color: '#624228' },
  { id: 'iron-gall', name: 'Iron gall', color: '#2a2e42' },
  { id: 'red', name: 'Red', color: '#b0242a' },
  { id: 'green', name: 'Green', color: '#1e6846' },
  { id: 'graphite', name: 'Graphite', color: '#525258', pen: 'pencil' },
];

const hex = (rgb: [number, number, number]) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

export const INK_FAMILIES: InkFamily[] = BASE.map((f) => {
  const e = ENGINE_INKS?.[f.id];
  return e ? { ...f, name: e.label.replace(/\s*\(.*\)$/, ''), color: hex(e.rgb) } : f;
});

/** 'auto' = the pen's own ink. Only meaningful once the engine has pens with inks. */
export const AUTO_INK = 'auto';
export const DEFAULT_INK = MODELLED_INK ? AUTO_INK : 'blue-black';

export const getInk = (id: string) => INK_FAMILIES.find((i) => i.id === id) ?? INK_FAMILIES[0];
/** A colour for UI and for the flat-ink renderer. */
export const inkColor = (id: string) => getInk(id === AUTO_INK ? 'blue-black' : id).color;
export const inkName = (id: string) => (id === AUTO_INK ? 'The pen’s own' : getInk(id).name);

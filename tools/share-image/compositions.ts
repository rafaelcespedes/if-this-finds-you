// Where each letter lies in each picture. A sheet is a letter from the collection (content/sample-texts.json id),
// its centre (x, y, in px of the final picture) and its turn (degrees). Bottom of the pile first.
// All sheets share one scale (px per mm), so a postcard is smaller than a sheet of A4, as on a real desk.

export interface Placed {
  id: string;
  x: number;
  y: number;
  rot: number;
  /** a sheet's shadow, 0 (flat) to 1 (the default lift) */
  lift?: number;
  /** a sheet drawn larger than the others (avoid: the pile is one scale) */
  scale?: number;
}

export interface Composition {
  width: number;
  height: number;
  /** px per mm in the final picture */
  pxPerMm: number;
  ground?: string;
  /** the Ruler's twelve columns, faint, behind the pile */
  grid?: boolean;
  /** shadow strength for every sheet, 0..1 */
  lift?: number;
  wordmark?: { x: number; y: number; h: number; color?: string; alpha?: number } | null;
  /** the site's running head over the pile: a band of the room (h px), its rule, a line of sans on the right */
  head?: { h: number; rule?: boolean; tagline?: { text: string; size: number; y: number } };
  sheets: Placed[];
}

/** Candidates, side by side (?c=contact), to choose from. */
export const CONTACT = [
  'post-office-pen-friend', 'dickinson-1861', 'stewart-1914-home', 'wheatley-1779', 'critica-1924-julia',
  'fabregue-1798', 'mazzei-1395', 'macinghi-strozzi-1450', 'snetter-1834', 'goya-1786', 'sor-juana-1691',
  'migrant-1917-chicago-sister', 'aibonito-1929', 'santa-1908-drum', 'christmas-card-mother', 'seguin-1824-hoes',
  'tagore-1914', 'reyes-1917-alfonsito', 'liselotte-1659', 'maria-celeste-1623', 'avellaneda-1845', 'pochet-1706',
  'julie-ampere-1802', 'hoen-1814',
];

const HEAD = { h: 76, rule: true, tagline: { text: 'Real letters, written out by hand', size: 15, y: 47 } };
const MARK = { x: 40, y: 27, h: 26 };

export const COMPOSITIONS: Record<string, Composition> = {
  // A. A tight pile: eight letters dropped on the table one after another, the room round them
  pile: {
    width: 1200, height: 630, pxPerMm: 1.78, grid: true, head: HEAD, wordmark: MARK,
    sheets: [
      { id: 'macinghi-strozzi-1450', x: 392, y: 405, rot: -19 },
      { id: 'goya-1786', x: 418, y: 318, rot: -9 },
      { id: 'aibonito-1929', x: 800, y: 318, rot: 12 },
      { id: 'santa-1908-drum', x: 722, y: 368, rot: -7 },
      { id: 'critica-1924-julia', x: 528, y: 336, rot: -5 },
      { id: 'avellaneda-1845', x: 812, y: 418, rot: 8 },
      { id: 'snetter-1834', x: 466, y: 376, rot: -11 },
      { id: 'stewart-1914-home', x: 626, y: 352, rot: 2 },
    ],
  },
  // B. A scattered fan: the letters spread across the table, edges running off the picture
  fan: {
    width: 1200, height: 630, pxPerMm: 1.9, grid: true, head: HEAD, wordmark: MARK,
    sheets: [
      { id: 'macinghi-strozzi-1450', x: 100, y: 380, rot: -17 },
      { id: 'sor-juana-1691', x: 1105, y: 390, rot: 15 },
      { id: 'goya-1786', x: 250, y: 410, rot: -10 },
      { id: 'aibonito-1929', x: 960, y: 350, rot: 9 },
      { id: 'santa-1908-drum', x: 410, y: 370, rot: -6 },
      { id: 'critica-1924-julia', x: 800, y: 400, rot: 5 },
      { id: 'avellaneda-1845', x: 905, y: 520, rot: 8 },
      { id: 'snetter-1834', x: 505, y: 420, rot: -3 },
      { id: 'stewart-1914-home', x: 640, y: 385, rot: -1 },
    ],
  },
  // C. Close up: the top letter near enough to read its first lines, the others under it past the edges
  close: {
    width: 1200, height: 630, pxPerMm: 2.9, grid: true, head: HEAD, wordmark: MARK,
    sheets: [
      { id: 'aibonito-1929', x: 1000, y: 330, rot: 9 },
      { id: 'critica-1924-julia', x: 240, y: 470, rot: -9 },
      { id: 'santa-1908-drum', x: 920, y: 520, rot: -5 },
      { id: 'avellaneda-1845', x: 330, y: 640, rot: 7 },
      { id: 'stewart-1914-home', x: 615, y: 470, rot: 1.5 },
    ],
  },
};

// Real inks, approximated as they look dry on warm paper.
export interface Ink {
  id: string;
  name: string;
  color: string;
}

export const INKS: Ink[] = [
  { id: 'blue-black', name: 'Blue-black', color: '#1c2233' },
  { id: 'royal', name: 'Royal blue', color: '#24439b' },
  { id: 'black', name: 'Black', color: '#17171b' },
  { id: 'sepia', name: 'Sepia', color: '#5c3d26' },
  { id: 'red', name: 'Red pen', color: '#a8282c' },
  { id: 'green', name: 'Green', color: '#2c5d3f' },
];

export const DEFAULT_INK = 'blue-black';
export const getInk = (id: string) => INKS.find((i) => i.id === id) ?? INKS[0];

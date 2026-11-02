// sources/hershey.js — the two founding styles, from the public-domain Hershey stroke fonts.
// Hershey font data: created by Dr. A. V. Hershey at the U.S. National Bureau of Standards (1967);
// .jhf format by James Hurt, Cognition, Inc. Use terms: sources/data/hershey-fonts.notes.txt
// (free for any use, commercial or otherwise; this credit must travel with the data).

import HERSHEY from './hershey-data.js';
import { defineStyle, register } from '../glyphs.js';

const CREDIT = 'Dr. A. V. Hershey, U.S. National Bureau of Standards (1967); .jhf format by James Hurt';

defineStyle('print', {
  label: 'Print',
  family: 'print',
  tradition: { name: 'Hershey Simplex Roman', region: 'United States', era: '1967', legibility: 'modern' },
  connected: false,
  metrics: { base: 9, cap: -12, xHeight: -5, descender: 16, descRatio: 0.33 },
});
defineStyle('script', {
  label: 'Script',
  family: 'script',
  tradition: { name: 'Hershey Simplex Script', region: 'United States', era: '1967', legibility: 'modern' },
  connected: true, // lowercase letters join: entry/exit points are pinned so joins still meet
  metrics: { base: 9, cap: -12, xHeight: 0, descender: 21, descRatio: 0.45 },
});

const SOURCES = {
  print: { name: 'Hershey Simplex Roman', credit: CREDIT },
  script: { name: 'Hershey Simplex Script', credit: CREDIT },
};

for (const style of ['print', 'script']) {
  for (const [ch, g] of Object.entries(HERSHEY[style])) {
    register(style, ch, { id: 'hershey', source: SOURCES[style], l: g.l, r: g.r, s: g.s });
  }
}

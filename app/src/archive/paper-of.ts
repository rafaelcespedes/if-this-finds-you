// A letter's paper, from the letter alone (its period, language and circumstances): no engine, so the index can lay
// letters out at their paper's real size before any card is written. look.ts gives the hand the same paper.
import { getPaper, isPaperId } from '@/lib/papers';
import type { ArchiveLetter } from './model';

type PaperInput = Pick<ArchiveLetter, 'id' | 'lang' | 'year' | 'look' | 'recipient'> & { found?: { circumstance: string } };

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const pick = <T,>(list: T[], key: string) => list[hash(key) % list.length];

/**
 * The letter paper of the letter's time and place, from the tool's stationery: handmade and laid sheets before
 * 1800, laid and small British pads in the 1800s (pale blue laid for Dutch letters), pads and airmail in the 20th
 * century (airmail for letters that crossed a sea), and a torn-out school page for children's letters to Santa
 * Claus or the Three Kings. null after 1950: the engine's sampler chooses. Only papers the tool has.
 */
export function periodPaper(l: PaperInput): string | null {
  const y = l.year ?? 2000;
  const lang = l.lang.toLowerCase();
  const key = 'paper:' + l.id;
  const toKings = /santa claus|reyes magos|three kings|rois mages/i.test(l.recipient ?? '');
  const abroad = l.found?.circumstance === 'emigrant' || l.found?.circumstance === 'seized';
  let options: string[];
  if (toKings && y >= 1880) options = [lang === 'en-us' ? 'notebook-loose' : lang.startsWith('fr') ? 'notebook-fr' : lang.startsWith('en') ? 'notebook-uk' : 'notebook'];
  else if (y < 1700) options = ['laid-cotton', 'laid-cotton', 'laid'];
  else if (y < 1800) options = ['laid', 'laid', 'laid-cotton'];
  else if (y < 1880) options = lang.startsWith('nl') ? ['laid-blue'] : ['laid', 'laid', 'laid-blue', 'pad-uk'];
  else if (y < 1920) options = lang.startsWith('de') ? ['pad-a4'] : ['pad-uk', 'pad', 'laid', 'laid-blue'];
  else if (y < 1950) options = abroad ? ['airmail', 'airmail-white'] : lang.startsWith('de') ? ['pad-a4', 'airmail'] : ['pad', 'pad-uk', 'airmail'];
  else return null;
  const ok = options.filter((id) => isPaperId(id));
  return ok.length ? pick(ok, key) : null;
}


/** The sheet a letter's own hand is written on, in mm: its look's paper, or its period's. */
export function paperSize(l: PaperInput) {
  const p = getPaper(l.look?.paper ?? periodPaper(l) ?? '');
  return { w: p.w, h: p.h };
}

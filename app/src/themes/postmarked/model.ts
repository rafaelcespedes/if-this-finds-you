// Concept C, "Postmarked" (?look=postmarked): every letter is post that took a very long time to arrive.
// What the look writes on its envelopes, postmarks and routes, taken only from the curator's fields
// (content/sample-texts.json). Nothing here invents a fact: a missing place says so.
import { shortAuthor } from '@/lib/names';

/** The few fields the look reads, whether from the tool's sample letter or the library's letter. */
export interface Post {
  id: string;
  place?: string | null;
  year?: number;
  author?: string;
  recipient?: string;
  /** the curator's reason it survives: 'seized', 'undelivered', 'family'… */
  circumstance?: string;
}

/** The town on the postmark: "Buenos Aires (Villa Urquiza)" → "BUENOS AIRES"; "New Hartford, Iowa" stays. */
export function postTown(place?: string | null) {
  const p = (place ?? '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
  if (!p) return '';
  const short = p.length <= 20 ? p : p.split(/,\s*/)[0];
  return (short.length <= 22 ? short : short.slice(0, 21) + '…').toUpperCase();
}

/** A red cancellation, only where the provenance says so. */
export function cancellationOf(circumstance?: string) {
  if (circumstance === 'seized') return 'Intercepted';
  if (circumstance === 'undelivered') return 'Undelivered';
  return null;
}

/** To whom, as the address: the first clause of the curator's recipient ("his brother, Citizen Fabregue, …"). */
export function addressee(recipient?: string) {
  return (recipient ?? '').trim().split(/;\s*/)[0];
}
export const sender = (author?: string) => shortAuthor(author ?? '');

/** A postmark a touch askew, the same every time for a letter (−9° to +9°). */
export function tiltFor(id: string, range = 18) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (((h >>> 0) % 1000) / 1000 - 0.5) * range;
}

/** The year this letter found you (the postmark's lower arc). */
export const FOUND_YEAR = new Date().getFullYear();

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The library's letter model. Today every letter is found (content/sample-texts.json). Letters written here and
// sent in aren't planned, but the shape leaves room for them (PHASE2.md), so the index, filters and letter page
// would never need to ask where a letter came from except to show it.

/** Found: a real letter from an archive or a printed source. Written: written here and sent in (not planned now). */
export type LetterOrigin = 'found' | 'written';

/**
 * The look a letter is written out in: who writes (seed + style), with what, on what, how big, and the hand's
 * slider values. A submitted letter stores the look it was written in; a found letter gets one from its id.
 */
export interface Look {
  seed: string;
  style: string;
  pen: string;
  tip: string;
  ink: string;
  /** a tool paper id (lib/papers.ts getPaper resolves older ids, so stored looks keep working) */
  paper: string;
  /** writing size relative to the paper's comfortable size (the tool's Size) */
  size: number;
  /** absolute engine values for the hand's traits (neatness, slant, ...), as the engine's sampler chose them */
  params: Record<string, number>;
}

/** Why a found letter survives: the curator's word for it (content/sample-texts.json `origin`). */
export type Circumstance = 'undelivered' | 'seized' | 'emigrant' | 'family' | 'everyday' | 'notable' | (string & {});

export interface Source {
  name: string;
  url?: string;
  licence?: string;
  licenceUrl?: string;
}

/** What is known about a found letter. Every field is the curator's, never invented here. */
export interface Found {
  circumstance: Circumstance;
  /** the true story of how the letter survived */
  story?: string;
  /** when the date is uncertain, how it is known */
  dateNote?: string;
  source?: Source;
  rights?: { us?: boolean; eu?: boolean; basis?: string; anonymous?: boolean };
  translator?: { name: string; url?: string };
  /** where the writer came from, when the source says */
  heritage?: string;
}

export interface ArchiveLetter {
  id: string;
  origin: LetterOrigin;
  text: string;
  kind: 'letter' | 'note';
  /** BCP 47 code of the letter's own language */
  lang: string;
  title?: string;
  author?: string;
  recipient?: string;
  year?: number;
  place?: string;
  /** found letters: what is known about them */
  found?: Found;
  /** written letters: how the writer chose to be credited */
  credit?: { name?: string; anonymous: boolean };
  /** written letters: the licence the writer gave it */
  license?: string;
  /** written letters: ISO date */
  createdAt?: string;
  /** written letters: the look it was written in. Found letters: none (derived from the id) */
  look?: Look;
  /** older spellings: written out only in hands taught before 1700 */
  olderHandsOnly?: boolean;
  /** the letter traditions it suits (content/sample-texts.json `traditions`) */
  traditions?: string[];
  tags?: string[];
  /** lower-case text, author and place, for search */
  haystack: string;
}

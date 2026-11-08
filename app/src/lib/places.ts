// The site's places, in the words and order every header uses (docs/NAVIGATION.md). Change them here only.
// The desk (Write a letter) is home: the wordmark is its link, not a place in the list (Rafael, 8 Nov: "Write a
// letter" beside "Notes" read as two ways to write). 'write' stays a Place, so the desk marks where you are.
import { FONTS_URL } from '@/fonts/links';

// Each place at its clean address, the canonical one (no .html): the live site (Vercel, cleanUrls) answers it at
// once, where the .html name cost a 308 redirect on every click; Vite's dev and preview servers resolve it too.
/** The writing tool (index.html) and the library (letters.html), side by side in the build. */
export const TOOL_URL = import.meta.env.BASE_URL;
export const ARCHIVE_URL = `${import.meta.env.BASE_URL}letters`;
export { FONTS_URL };
/** Notes (notes.html): your own notes in a hand, kept on this device; an app of its own, with no site header. */
export const NOTES_URL = `${import.meta.env.BASE_URL}notes`;
/** About (about.html): what this is, where the letters and hands come from, credits. */
export const ABOUT_URL = `${import.meta.env.BASE_URL}about`;

export type Place = 'write' | 'letters' | 'fonts' | 'notes' | 'about';
export const PLACES: readonly { id: Place; label: string; href: string }[] = [
  { id: 'letters', label: 'All letters', href: ARCHIVE_URL },
  { id: 'fonts', label: 'Fonts', href: FONTS_URL },
  // (Rafael, 8 Nov: the notes app, linked from every page; it links back through its own IF mark)
  { id: 'notes', label: 'Notes', href: NOTES_URL },
  { id: 'about', label: 'About', href: ABOUT_URL },
];

/** The tool, opening one of your kept letters (My letters, picked on another page). */
export const keptHref = (savedAt: number) => `${TOOL_URL}?kept=${savedAt}`;

// The site's four places, in the words and order every header uses (docs/NAVIGATION.md). Change them here only.
import { FONTS_URL } from '@/fonts/links';

/** The writing tool (index.html) and the library (letters.html), side by side in the build. */
export const TOOL_URL = import.meta.env.BASE_URL;
export const ARCHIVE_URL = `${import.meta.env.BASE_URL}letters.html`;
export { FONTS_URL };
/** About (about.html): what this is, where the letters and hands come from, credits. */
export const ABOUT_URL = `${import.meta.env.BASE_URL}about.html`;

export type Place = 'write' | 'letters' | 'fonts' | 'about';
export const PLACES: readonly { id: Place; label: string; href: string }[] = [
  { id: 'write', label: 'Write a letter', href: TOOL_URL },
  { id: 'letters', label: 'All letters', href: ARCHIVE_URL },
  { id: 'fonts', label: 'Fonts', href: FONTS_URL },
  { id: 'about', label: 'About', href: ABOUT_URL },
];

/** The tool, opening one of your kept letters (My letters, picked on another page). */
export const keptHref = (savedAt: number) => `${TOOL_URL}?kept=${savedAt}`;

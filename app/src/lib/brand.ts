// The product's name, as people see it. "Seedhand" stays in code and in storage keys (renaming those would
// lose people's saved drafts and settings).
export const APP_NAME = 'If This Finds You';

/** Engine credits name the project by its code name; people see the product's name. */
export const branded = (s: string) => s.replace(/\bSeedhand\b/g, APP_NAME);

// ---------- the logo, two candidates side by side: ?logo=5 or ?logo=32 (the default) ----------
// Read once at load and kept for the tab (so the library pages keep it too); never put into share links
// (shareUrl clears the query).
export type LogoId = '32' | '5';
function readLogo(): LogoId {
  try {
    const asked = new URLSearchParams(location.search).get('logo');
    if (asked === '5' || asked === '32') { sessionStorage.setItem('seedhand:logo', asked); return asked; }
    const kept = sessionStorage.getItem('seedhand:logo');
    if (kept === '5' || kept === '32') return kept;
  } catch { /* storage off: the default */ }
  return '32';
}
export const LOGO: LogoId = typeof location !== 'undefined' ? readLogo() : '32';
const base = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/');
/** The wordmark (currentColor SVG) and favicon for the logo in use. */
// the header is 22-26 px tall: #32's one-line cut (the stacked mark needs 56 px or more, brand/wordmark/README.md)
export const logoSrc = LOGO === '5' ? `${base}brand/wordmark-5.svg` : `${base}brand/wordmark-small.svg`;
/** Heights that give both logos the same letter size (#5 is a single heavier line, so a touch shorter). */
export const logoHeight = LOGO === '5' ? 'h-[19px] lg:h-[22px]' : 'h-[22px] lg:h-[26px]';
export const faviconSrc = LOGO === '5' ? `${base}brand/favicon-5.svg` : null;
/** The library link, keeping a logo that isn't the default. */
export const withLogo = (href: string) => (LOGO === '32' ? href : `${href}${href.includes('?') ? '&' : '?'}logo=${LOGO}`);

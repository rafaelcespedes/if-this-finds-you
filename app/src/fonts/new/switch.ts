// The Fonts page is the redesign (Rafael, 3 Nov: "I like this new fonts page a lot better"); ?fonts=old shows the
// earlier page for now, ?fonts=new comes back to this one. ?theme=dark (or the page's sun/moon) gives it the night
// reading room; light is the default. Both are read once at load and kept for the tab, like ?look=, so moving between
// pages keeps them; neither goes into share links. fonts.html runs the same reading before anything paints, so a dark
// page never flashes light.

export type FontsTheme = 'light' | 'dark';

function read(param: string, key: string, values: string[], fallback: string) {
  try {
    const asked = new URLSearchParams(location.search).get(param);
    if (asked && values.includes(asked)) { sessionStorage.setItem(key, asked); return asked; }
    const kept = sessionStorage.getItem(key);
    if (kept && values.includes(kept)) return kept;
  } catch { /* storage off: the default */ }
  return fallback;
}

/** The redesigned page (the default), or the earlier one (?fonts=old). */
export const FONTS_NEW = typeof location === 'undefined' || read('fonts', 'seedhand:fonts', ['new', 'old'], 'new') === 'new';

/** The room's colours by day or by night (the new page only). */
export const initialTheme = (): FontsTheme => (read('theme', 'seedhand:fonts-theme', ['light', 'dark'], 'light') as FontsTheme);

const DESK: Record<FontsTheme, string> = { light: '#e6e4de', dark: '#14171c' };

/** Puts the page's switches on <html>: data-fonts="new" scopes the new page's styles, data-theme its night colours. */
export function applyFontsSwitch(theme: FontsTheme = initialTheme()) {
  const html = document.documentElement;
  if (!FONTS_NEW) { delete html.dataset.fonts; delete html.dataset.theme; return; }
  html.dataset.fonts = 'new';
  if (theme === 'dark') html.dataset.theme = 'dark';
  else delete html.dataset.theme;
  html.style.colorScheme = theme;
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', DESK[theme]);
}

/** Light or dark, from the page's own control: kept for the tab and in the address, so the link shows the same. */
export function setTheme(theme: FontsTheme) {
  try { sessionStorage.setItem('seedhand:fonts-theme', theme); } catch { /* storage off */ }
  const q = new URLSearchParams(location.search);
  if (theme === 'dark') q.set('theme', 'dark'); else q.delete('theme');
  const s = q.toString();
  history.replaceState(history.state, '', (s ? `?${s}` : location.pathname) + location.hash);
  applyFontsSwitch(theme);
}

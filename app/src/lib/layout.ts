// ---------- the layout: an editorial frame around the Reading Room (an exploration, Nov 2026) ----------
// ?layout=editorial-1 (or e1, 1) and ?layout=editorial-2 (e2, 2) lay the Reading Room's pages out on a visible
// editorial grid: crisp hairline rules, column lines, rulers, running heads and folios, and a display type scale.
// ?layout=off (0, none, reading-room) goes back. Read once at load and kept for the tab, like the look (lib/look.ts);
// never put into share links.
// Only the frame changes: html[data-layout] is read by themes/editorial.css, which styles the shared components through
// the Reading Room's own classes, data hooks and --rr-* type tokens. Without the Reading Room it does nothing.
// The Fonts page doesn't call applyLayout (it has its own redesign).

export type LayoutId = 'none' | 'editorial-1' | 'editorial-2';
const ALIASES: Record<string, LayoutId> = {
  'editorial-1': 'editorial-1', e1: 'editorial-1', '1': 'editorial-1', broadsheet: 'editorial-1',
  'editorial-2': 'editorial-2', e2: 'editorial-2', '2': 'editorial-2', margin: 'editorial-2',
  off: 'none', none: 'none', '0': 'none', 'reading-room': 'none', default: 'none',
};
const KEY = 'seedhand:layout';

function readLayout(): LayoutId {
  try {
    const asked = new URLSearchParams(location.search).get('layout');
    const id = asked ? ALIASES[asked.toLowerCase()] : undefined;
    if (id) {
      if (id === 'none') sessionStorage.removeItem(KEY);
      else sessionStorage.setItem(KEY, id);
      return id;
    }
    const kept = sessionStorage.getItem(KEY);
    if (kept === 'editorial-1' || kept === 'editorial-2') return kept;
  } catch { /* storage off: no layout */ }
  return 'none';
}
export const LAYOUT: LayoutId = typeof location !== 'undefined' ? readLayout() : 'none';
/** An editorial layout is on (its rules are crisp: lib/rules.ts keeps the hand-drawn ones off unless ?rules=hand). */
export const EDITORIAL = LAYOUT !== 'none';

export type LayoutPage = 'desk' | 'letters' | 'about';

/**
 * Call once in each page's entry, after applyLook(). Only on top of the Reading Room. Sets html[data-layout] and
 * html[data-layout-page], and lays the grid itself over the page: twelve columns (four on a phone, eight on a tablet)
 * with their index numbers, behind everything and out of reach (themes/editorial.css draws it per layout).
 */
export function applyLayout(page: LayoutPage) {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (!(EDITORIAL && html.dataset.look === 'reading-room')) {
    delete html.dataset.layout;
    delete html.dataset.layoutPage;
    return;
  }
  html.dataset.layout = LAYOUT;
  html.dataset.layoutPage = page;
  if (document.querySelector('.ed-grid')) return;
  // two layers with the same twelve columns: the lines behind the page, and the ruler in the running head's band
  for (const name of ['ed-grid', 'ed-ruler']) {
    const layer = document.createElement('div');
    layer.className = name;
    layer.setAttribute('aria-hidden', 'true');
    for (let i = 1; i <= 12; i++) {
      const col = document.createElement('i');
      const n = document.createElement('b');
      n.textContent = String(i).padStart(2, '0');
      col.append(n);
      layer.append(col);
    }
    document.body.prepend(layer);
  }
}

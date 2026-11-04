// ---------- the layout: an editorial frame around the Reading Room (an exploration, Nov 2026) ----------
//   ?layout=editorial-1 (e1, 1, broadsheet): Broadsheet, a newspaper's frame on a visible grid (crisp ruled columns,
//     a thick-and-thin rule under the running head, big figures).
//   ?layout=editorial-2 (e2, 2, register): Register, the new Fonts page's balance on every page (Rafael, 4 Nov: "that's
//     the type of balance that we should try to maintain everywhere"): a strict modern frame, three sizes of voice far
//     apart, the handwriting the only big thing, soft rules, one red action.
//   ?layout=editorial-3 (e3, 3, ruler): Ruler, a measured asymmetric page (numbered columns, a baseline ruler, a rail).
// ?layout=off (0, none, reading-room) goes back. Read once at load and kept for the tab, like the look (lib/look.ts);
// never put into share links.
// Only the frame changes: html[data-layout] is read by themes/editorial.css, which styles the shared components through
// the Reading Room's own classes, data hooks and --rr-* type tokens. Without the Reading Room it does nothing.
// The Fonts page doesn't call applyLayout (it has its own redesign).
// The stylesheet comes with this module, which every page already loads (lib/look.ts → lib/rules.ts), so it rides in
// the pages' shared stylesheet rather than adding a request of its own. Its selectors carry one more type than the
// Reading Room's (html:root[data-layout] against html[data-look]), so their order in that sheet doesn't matter.
import '@/themes/editorial.css';

export type LayoutId = 'none' | 'editorial-1' | 'editorial-2' | 'editorial-3';
const ALIASES: Record<string, LayoutId> = {
  'editorial-1': 'editorial-1', e1: 'editorial-1', '1': 'editorial-1', broadsheet: 'editorial-1',
  'editorial-2': 'editorial-2', e2: 'editorial-2', '2': 'editorial-2', register: 'editorial-2',
  'editorial-3': 'editorial-3', e3: 'editorial-3', '3': 'editorial-3', ruler: 'editorial-3',
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
    if (kept === 'editorial-1' || kept === 'editorial-2' || kept === 'editorial-3') return kept;
  } catch { /* storage off: no layout */ }
  return 'none';
}
export const LAYOUT: LayoutId = typeof location !== 'undefined' ? readLayout() : 'none';
/** An editorial layout is on. */
export const EDITORIAL = LAYOUT !== 'none';
/** A layout whose rules are crisp and whose grid is drawn (Broadsheet, Ruler): lib/rules.ts keeps the hand-drawn rules
 * off there unless ?rules=hand. Register keeps them, as the Fonts page does. */
export const CRISP = LAYOUT === 'editorial-1' || LAYOUT === 'editorial-3';

export type LayoutPage = 'desk' | 'letters' | 'about';

/**
 * Call once in each page's entry, after applyLook(). Only on top of the Reading Room. Sets html[data-layout] and
 * html[data-layout-page], and (Broadsheet, Ruler) lays the grid itself over the page: twelve columns (four on a phone, eight on a tablet)
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
  if (!CRISP || document.querySelector('.ed-grid')) return;
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

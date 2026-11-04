// ---------- the layout: the Ruler, an editorial frame around the Reading Room (Rafael picked it, 4 Nov 2026) ----------
// The Reading Room's pages sit on a measured, asymmetric grid: one rule divides a margin rail (the record, the groups'
// names, the sections' numbers) from the page, the running head's rule carries a tick at each column, a few light
// ticks measure the baseline down the left margin, and titles are big. The grid is meant to be felt more than shown
// (Rafael: "I don't think we need to emphasize the ruler so much"); his detailed edits are to come.
//   no ?layout          the Ruler (the default)
//   ?layout=off         the Reading Room without it (0, none, reading-room), an escape hatch for now
//   ?layout=register    Register, the earlier study of the Fonts page's balance (editorial-2), kept to compare
// Read once at load and kept for the tab, like the look (lib/look.ts); never put into share links.
// Only the frame changes: html[data-layout] is read by themes/editorial.css, which styles the shared components through
// the Reading Room's own classes, data hooks and --rr-* type tokens. Without the Reading Room it does nothing.
// The page shells (index.html, letters.html, about.html, fonts.html) set the same attribute before anything paints,
// so the desk's first frame already has the rail on the left.
// The stylesheet comes with this module, which every page already loads (lib/look.ts → lib/rules.ts), so it rides in
// the pages' shared stylesheet rather than adding a request of its own. Its selectors carry one more type than the
// Reading Room's (html:root[data-layout] against html[data-look]), so their order in that sheet doesn't matter.
import '@/themes/editorial.css';

export type LayoutId = 'none' | 'ruler' | 'register';
export const DEFAULT_LAYOUT: LayoutId = 'ruler';
const ALIASES: Record<string, LayoutId> = {
  ruler: 'ruler', 'editorial-3': 'ruler', e3: 'ruler', '3': 'ruler', default: DEFAULT_LAYOUT,
  // the retired Broadsheet's addresses land on the default
  'editorial-1': DEFAULT_LAYOUT, e1: DEFAULT_LAYOUT, '1': DEFAULT_LAYOUT, broadsheet: DEFAULT_LAYOUT,
  register: 'register', 'editorial-2': 'register', e2: 'register', '2': 'register',
  off: 'none', none: 'none', '0': 'none', 'reading-room': 'none',
};
const KEY = 'seedhand:layout';

function readLayout(): LayoutId {
  try {
    const asked = new URLSearchParams(location.search).get('layout');
    const id = asked ? ALIASES[asked.toLowerCase()] : undefined;
    if (id) {
      if (id === DEFAULT_LAYOUT) sessionStorage.removeItem(KEY);
      else sessionStorage.setItem(KEY, id);
      return id;
    }
    const kept = sessionStorage.getItem(KEY);
    if (kept === 'none' || kept === 'register') return kept;
  } catch { /* storage off: the default */ }
  return DEFAULT_LAYOUT;
}
export const LAYOUT: LayoutId = typeof location !== 'undefined' ? readLayout() : DEFAULT_LAYOUT;
/** An editorial layout is on. */
export const EDITORIAL = LAYOUT !== 'none';
/** The Ruler: its rules are crisp and its grid is drawn, so lib/rules.ts keeps the hand-drawn rules off unless
 * ?rules=hand. Register keeps them, as the Fonts page does. */
export const CRISP = LAYOUT === 'ruler';

export type LayoutPage = 'desk' | 'letters' | 'about' | 'fonts';

/**
 * Call once in each page's entry, after applyLook(). Only on top of the Reading Room. Sets html[data-layout] and
 * html[data-layout-page] (desk | letters | about | fonts), and for the Ruler lays its two quiet layers over the page:
 * the baseline's ticks behind it, the column ticks in the running head's band (themes/editorial.css draws them).
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
  // two layers with the same twelve columns (four on a phone, eight on a tablet): the baseline behind the page, the
  // column ticks in the running head's band
  for (const name of ['ed-grid', 'ed-ruler']) {
    const layer = document.createElement('div');
    layer.className = name;
    layer.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 12; i++) layer.append(document.createElement('i'));
    document.body.prepend(layer);
  }
}

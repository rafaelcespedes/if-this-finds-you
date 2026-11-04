// ---------- the layout: the Ruler, an editorial frame around the Reading Room (Rafael picked it, 4 Nov 2026) ----------
// The Reading Room's pages sit on a measured, asymmetric grid: one rule divides a margin rail (the record, the groups'
// names, the sections' numbers) from the page, a faint line in each gutter between the twelve columns shows behind it, and titles are big.
// No ticks and no column numbers (Rafael: "kill the tickers and the numbers on every page and just leave the grid").
//   no ?layout          the Ruler (the default)
//   ?layout=off         the Reading Room without it (0, none, reading-room), an escape hatch for now
// Read once at load and kept for the tab, like the look (lib/look.ts); never put into share links.
// Only the frame changes: html[data-layout] is read by themes/editorial.css, which styles the shared components through
// the Reading Room's own classes, data hooks and --rr-* type tokens. Without the Reading Room it does nothing.
// The page shells (index.html, letters.html, about.html, fonts.html) set the same attribute before anything paints,
// so the desk's first frame already has the rail on the left.
// The stylesheet comes with this module, which every page already loads (lib/look.ts → lib/rules.ts), so it rides in
// the pages' shared stylesheet rather than adding a request of its own. Its selectors carry one more type than the
// Reading Room's (html:root[data-layout] against html[data-look]), so their order in that sheet doesn't matter.
import '@/themes/editorial.css';

export type LayoutId = 'none' | 'ruler';
export const DEFAULT_LAYOUT: LayoutId = 'ruler';
const ALIASES: Record<string, LayoutId> = {
  ruler: 'ruler', 'editorial-3': 'ruler', e3: 'ruler', '3': 'ruler', default: DEFAULT_LAYOUT,
  // the retired studies' addresses (Broadsheet, Register) land on the default
  'editorial-1': DEFAULT_LAYOUT, e1: DEFAULT_LAYOUT, '1': DEFAULT_LAYOUT, broadsheet: DEFAULT_LAYOUT,
  'editorial-2': DEFAULT_LAYOUT, e2: DEFAULT_LAYOUT, '2': DEFAULT_LAYOUT, register: DEFAULT_LAYOUT,
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
    if (kept === 'none') return kept;
  } catch { /* storage off: the default */ }
  return DEFAULT_LAYOUT;
}
export const LAYOUT: LayoutId = typeof location !== 'undefined' ? readLayout() : DEFAULT_LAYOUT;
/** An editorial layout is on. */
export const EDITORIAL = LAYOUT !== 'none';
/** The Ruler: its rules are crisp and its grid is drawn, so lib/rules.ts keeps the hand-drawn rules off unless
 * ?rules=hand. */
export const CRISP = LAYOUT === 'ruler';

export type LayoutPage = 'desk' | 'letters' | 'about' | 'fonts';

/**
 * Call once in each page's entry, after applyLook(). Only on top of the Reading Room. Sets html[data-layout] and
 * html[data-layout-page] (desk | letters | about | fonts), and for the Ruler lays its grid behind the page (twelve
 * columns, a line in each gutter; themes/editorial.css draws them, and leaves them off on the Fonts page and the table).
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
  // the grid: twelve columns (four on a phone, eight on a tablet) behind the page
  const grid = document.createElement('div');
  grid.className = 'ed-grid';
  grid.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 12; i++) grid.append(document.createElement('i'));
  document.body.prepend(grid);
}

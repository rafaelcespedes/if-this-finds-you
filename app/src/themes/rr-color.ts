// Reading Room colour pass (Nov 2026): set 1 (Ruled) is the Reading Room's own (reading-room.css); ?rrcolor=2 or 3 shows another set and
// ?rrcolor=0 the colours before the pass (rr-color.css, scoped to html[data-look="reading-room"][data-rrcolor="N"]).
// Kept for the tab like ?look, never put into share links. Temporary: the chosen set moves into reading-room.css.
import './rr-color.css';

export function applyRrColor() {
  if (typeof document === 'undefined') return;
  let pick: string | null = null;
  try {
    const asked = new URLSearchParams(location.search).get('rrcolor');
    if (asked != null && /^[0-3]$/.test(asked)) sessionStorage.setItem('seedhand:rrcolor', asked);
    pick = sessionStorage.getItem('seedhand:rrcolor');
  } catch {
    /* storage off: today's colours */
  }
  if (pick && pick !== '1') document.documentElement.dataset.rrcolor = pick;
  else delete document.documentElement.dataset.rrcolor;
}

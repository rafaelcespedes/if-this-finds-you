// Palette research prototype (ownable UI, Nov 2026): ?theme=1…4 dresses the UI in one of four colour directions
// (themes.css). ?theme=0 is today's look. Kept for the tab like ?toolbar, never in share links. Temporary.
export function applyThemeLab() {
  let pick: string | null = null;
  try {
    const asked = new URLSearchParams(location.search).get('theme');
    if (asked && /^[0-4]$/.test(asked)) sessionStorage.setItem('seedhand:theme', asked);
    pick = sessionStorage.getItem('seedhand:theme');
  } catch {
    /* private window: no theme kept */
  }
  if (pick && pick !== '0') document.documentElement.dataset.theme = pick;
}

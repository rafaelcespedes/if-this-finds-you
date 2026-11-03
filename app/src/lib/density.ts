// How dense the controls are: 'compact' (a step tighter, the default) or 'current' (today's sizing), to compare.
// ?density=current or ?density=compact, read once at load and kept for the tab, like the logo; never in share links.
export type Density = 'compact' | 'current';
function readDensity(): Density {
  try {
    const asked = new URLSearchParams(location.search).get('density');
    if (asked === 'compact' || asked === 'current') { sessionStorage.setItem('seedhand:density', asked); return asked; }
    const kept = sessionStorage.getItem('seedhand:density');
    if (kept === 'compact' || kept === 'current') return kept;
  } catch { /* storage off: the default */ }
  return 'compact';
}
export const DENSITY: Density = typeof location !== 'undefined' ? readDensity() : 'compact';
if (typeof document !== 'undefined') document.documentElement.dataset.density = DENSITY;

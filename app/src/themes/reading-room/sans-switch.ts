// TEMPORARY comparison (Rafael, 3 Nov): which face sits beside Junicode for the controls. ?rrsans=1…6 picks an option,
// ?rrsans=0 is today's Ysabeau Office; the choice is kept for the tab like ?look. Each option only overrides the type
// roles' face variables (sans-options.css), so removing this file and its import lines removes the comparison.
import './sans-options.css';

function read(): number {
  try {
    const q = new URLSearchParams(location.search).get('rrsans');
    if (q != null && /^[0-6]$/.test(q)) { sessionStorage.setItem('seedhand:rrsans', q); return +q; }
    const kept = sessionStorage.getItem('seedhand:rrsans');
    return kept && /^[0-6]$/.test(kept) ? +kept : 0;
  } catch { return 0; }
}

/** Call once in each page's entry, after applyLook(). */
export function applySansOption() {
  if (typeof document === 'undefined') return;
  const n = read();
  if (n) document.documentElement.dataset.rrsans = String(n);
  else delete document.documentElement.dataset.rrsans;
}

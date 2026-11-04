// TEMPORARY comparison (Rafael, 4 Nov: "let's add some tension on the modern side"): which serif + sans pairing
// replaces Junicode 2 + Source Sans 3 in the Reading Room. ?type=1…6 picks a pairing, ?type=0 is today's; the choice
// is kept for the tab like ?look. Each pairing only overrides the type roles' face and size variables
// (type-options.css), so removing this file and its one import line per page removes the comparison.
// Importing this module applies the choice (it sets html[data-rrtype] before the page renders).
import './type-options.css';

const KEY = 'seedhand:rrtype';
const VALID = /^[0-6]$/;

function read(): number {
  try {
    const q = new URLSearchParams(location.search).get('type');
    if (q != null && VALID.test(q)) { sessionStorage.setItem(KEY, q); return +q; }
    const kept = sessionStorage.getItem(KEY);
    return kept && VALID.test(kept) ? +kept : 0;
  } catch { return 0; }
}

if (typeof document !== 'undefined') {
  const n = read();
  if (n) document.documentElement.dataset.rrtype = String(n);
  else delete document.documentElement.dataset.rrtype;
}

// ---------- the look: today's design by default; two concepts to compare (?look=reading-room, ?look=postmarked) ----------
// Read once at load and kept for the tab (so the library and fonts pages keep it too); never put into share links.
// Each look lives in its own stylesheet under src/themes/, scoped to html[data-look="…"], so the default never changes.
export type LookId = 'default' | 'reading-room' | 'postmarked';
const ALIASES: Record<string, LookId> = {
  default: 'default', current: 'default', today: 'default',
  'reading-room': 'reading-room', reading: 'reading-room', a: 'reading-room',
  postmarked: 'postmarked', postmark: 'postmarked', c: 'postmarked',
};
function readLook(): LookId {
  try {
    const asked = new URLSearchParams(location.search).get('look');
    const id = asked ? ALIASES[asked.toLowerCase()] : undefined;
    if (id) { sessionStorage.setItem('seedhand:look', id); return id; }
    const kept = sessionStorage.getItem('seedhand:look') as LookId | null;
    if (kept && kept in { default: 1, 'reading-room': 1, postmarked: 1 }) return kept;
  } catch { /* storage off: the default */ }
  return 'default';
}
export const LOOK: LookId = typeof location !== 'undefined' ? readLook() : 'default';
/** Call once in each page's entry, before render. */
export function applyLook() {
  if (typeof document !== 'undefined' && LOOK !== 'default') document.documentElement.dataset.look = LOOK;
}

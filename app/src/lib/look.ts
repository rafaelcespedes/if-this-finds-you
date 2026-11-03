// ---------- the look: the Reading Room by default; the earlier design and Postmarked to compare ----------
// ?look=classic shows the earlier design, ?look=postmarked the paused Postmarked concept. Read once at load and kept
// for the tab (so the library and fonts pages keep it too); never put into share links.
// Each look lives in its own stylesheet under src/themes/, scoped to html[data-look="…"]; "classic" sets no data-look,
// so it is exactly the earlier default.
export type LookId = 'classic' | 'reading-room' | 'postmarked';
/** The look everyone gets (Rafael, 2026-11-03). */
export const DEFAULT_LOOK: LookId = 'reading-room';
const ALIASES: Record<string, LookId> = {
  classic: 'classic', original: 'classic', before: 'classic', today: 'classic', current: 'classic',
  default: DEFAULT_LOOK,
  'reading-room': 'reading-room', reading: 'reading-room', a: 'reading-room',
  postmarked: 'postmarked', postmark: 'postmarked', c: 'postmarked',
};
const KNOWN: Record<string, LookId> = { classic: 'classic', 'reading-room': 'reading-room', postmarked: 'postmarked', default: DEFAULT_LOOK };
function readLook(): LookId {
  try {
    const asked = new URLSearchParams(location.search).get('look');
    const id = asked ? ALIASES[asked.toLowerCase()] : undefined;
    if (id) { sessionStorage.setItem('seedhand:look', id); return id; }
    const kept = sessionStorage.getItem('seedhand:look');
    if (kept && KNOWN[kept]) return KNOWN[kept];
  } catch { /* storage off: the default */ }
  return DEFAULT_LOOK;
}
export const LOOK: LookId = typeof location !== 'undefined' ? readLook() : DEFAULT_LOOK;
/** Call once in each page's entry, before render. */
export function applyLook() {
  if (typeof document !== 'undefined' && LOOK !== 'classic') document.documentElement.dataset.look = LOOK;
}

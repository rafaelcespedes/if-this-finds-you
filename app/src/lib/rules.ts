// ---------- the rules: crisp hairlines, or drawn by hand (an experiment, Rafael 3 Nov) ----------
// ?rules=hand draws every divider in the Reading Room with the engine's dip pen; ?rules=crisp goes back. Read once at
// load and kept for the tab, like the look (lib/look.ts); never put into share links. Crisp is the default.
export type RulesId = 'crisp' | 'hand';
function readRules(): RulesId {
  try {
    const asked = new URLSearchParams(location.search).get('rules')?.toLowerCase();
    if (asked === 'hand' || asked === 'crisp') { sessionStorage.setItem('seedhand:rules', asked); return asked; }
    return sessionStorage.getItem('seedhand:rules') === 'hand' ? 'hand' : 'crisp';
  } catch { return 'crisp'; }
}
export const RULES: RulesId = typeof location !== 'undefined' ? readRules() : 'crisp';

/** Called by applyLook: in the Reading Room, hand rules load their drawings and start replacing the hairlines. */
export function applyRules(look: string) {
  if (typeof document === 'undefined' || RULES !== 'hand' || look !== 'reading-room') return;
  document.documentElement.dataset.rules = 'hand';
  void import('@/themes/reading-room/rules/hand-rules').then((m) => m.startHandRules());
}

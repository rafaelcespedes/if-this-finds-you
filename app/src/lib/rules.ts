// ---------- the rules: drawn by hand, or plain hairlines ----------
// In the Reading Room every divider is drawn with the engine's dip pen (Rafael, 4 Nov: "I like the hand-drawn
// dividers. Let's use them."). ?rules=plain (or crisp) keeps the plain hairlines, as an escape; ?rules=hand goes back.
// Read once at load and kept for the tab, like the look (lib/look.ts); never put into share links.
import { startHandRules } from '@/themes/reading-room/rules/hand-rules';
// the editorial layouts with a drawn grid (Broadsheet, Ruler) want crisp rules: the hand-drawn ones stay off there unless ?rules=hand
import { CRISP } from './layout';

export type RulesId = 'plain' | 'hand';
function readRules(): RulesId {
  try {
    const asked = new URLSearchParams(location.search).get('rules')?.toLowerCase();
    if (asked === 'hand') { sessionStorage.removeItem('seedhand:rules'); return 'hand'; }
    if (asked === 'plain' || asked === 'crisp') { sessionStorage.setItem('seedhand:rules', 'plain'); return 'plain'; }
    const kept = sessionStorage.getItem('seedhand:rules');
    if (CRISP && asked !== 'hand') return 'plain'; // Broadsheet's and Ruler's crisp hairlines
    return kept === 'plain' || kept === 'crisp' ? 'plain' : 'hand';
  } catch { return 'hand'; }
}
export const RULES: RulesId = typeof location !== 'undefined' ? readRules() : 'hand';

/** Called by applyLook, before the page renders: in the Reading Room the hand rules start watching, so the first
 * paint already has them (the drawings are a few kB, loaded with the page). */
export function applyRules(look: string) {
  if (typeof document === 'undefined' || RULES !== 'hand' || look !== 'reading-room') return;
  document.documentElement.dataset.rules = 'hand';
  startHandRules();
}

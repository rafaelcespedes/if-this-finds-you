// Holding Backspace at a crossed-out word (the writing page, /write): the writer crosses it out harder, one level
// every AGAIN_EVERY ms (a heavier strike, a scribble, then inked out), and stops there; a fresh press after that
// deletes as usual. A computer's keyboard says when a key is held (keydown's `repeat`). A phone's doesn't: iOS sends
// no repeat flag, and Android sends its deletions as unnamed keys (key "Unidentified", keyCode 229) and ignores
// preventDefault on them. So on a touch keyboard the hold is read from how fast the deletions arrive. No React here:
// the page hands this its keydowns, its beforeinput deletions and its edits (WriteApp.tsx), and does what it says.
//
// What the phones send when Backspace is held (docs/research/input-quirks.md; checked 2026-11):
// - Android (AOSP LatinIME, which Gboard grew from: config_key_repeat_start_timeout 400, config_key_repeat_interval
//   50, DELETE_ACCELERATE_AT 20): the first repeat 400 ms after the press, then one every 50 ms; after 20, two at a
//   time, and Gboard goes on to whole words, still as deleteContentBackward (w3c/editing#495). Chrome sends each one
//   as keydown 229, then selects what it deletes and fires a beforeinput it doesn't let the page cancel
//   (InputMethodController::DeleteSurroundingText), then the input.
// - iOS: about 0.5 s, then one every 0.1 s, then whole words after about 3 s (KeyboardKit's copy of the system
//   keyboard; owners' reports agree on "a few seconds"). The words arrive as beforeinput deleteWordBackward with no
//   keydown (WebKit WKContentView _deleteByWord / deleteInDirection:toGranularity:).
// - People: about 5 to 7 taps a second at their very fastest (150-200 ms apart); deleting by hand, slower.
// Times are the page's own clock when each event is handled (as the computer's held key always was).

/** a held Backspace on a struck word: one more pass this often, about as long as the hand takes to draw one (a
 * faster key would run ahead of the pen and leave it scribbling seconds after the key is let go) */
export const AGAIN_EVERY = 700;
/** deletions closer together than this are a key held down (phones repeat every 50-100 ms; nobody taps this fast) */
export const REPEAT_GAP = 150;
/** once a hold is under way, a gap this long still belongs to it (a busy page handles an event or two late) */
export const KEEP_GAP = 300;
/** whole words (iOS after a few seconds) may come slower: a word deletion this soon after the last is held */
export const WORD_GAP = 700;
/** The wait before a held key starts repeating (Android 400 ms, iOS about 500), or a hold the page fell behind on:
 * a deletion this long after a press, or after a held run, may still be the key held down. That's only known when
 * the next one comes, so at the word the last press went over, it waits CONFIRM_MS: another deletion by then makes
 * it a hold (one level per AGAIN_EVERY, as on a computer); none, and it was a tap, and the word is gone over a moment
 * late. It never deletes there (it might eat the word before); anywhere else it counts as a press of its own. */
export const FIRST_MIN = 250;
export const FIRST_MAX = 900;
export const CONFIRM_MS = 200;
/** a keydown and the beforeinput it causes are handled in the same moment */
const PAIR_MS = 40;
/** the browser's own deletion after a beforeinput it wouldn't cancel (Android): dropped if it comes this soon */
const DROP_MS = 250;

/** how a deletion stands in time: one of a `held` key's repeats, `maybe` still held, or a `fresh` press */
export type Beat = 'fresh' | 'maybe' | 'held';

/** Deletion timing to "held" or not: a run of deletions closer together than a person taps is a held key. */
export class HoldTimer {
  private last = -Infinity;
  private beat: Beat | null = null;
  /** a deletion at `t` ms; `word`: a whole word at a time */
  note(t: number, word = false): Beat {
    const gap = t - this.last;
    const was = this.beat;
    this.last = t;
    if (gap < REPEAT_GAP || (word && gap < WORD_GAP) || (was !== 'fresh' && was != null && gap < KEEP_GAP)) return (this.beat = 'held');
    if (((was === 'fresh' && gap >= FIRST_MIN) || was === 'held') && gap < FIRST_MAX) return (this.beat = 'maybe');
    return (this.beat = 'fresh');
  }
  reset() { this.last = -Infinity; this.beat = null; }
}

/** what the page does with a deletion: let it delete, swallow it, or swallow it and show the pass just made */
export type HoldAct = 'pass' | 'swallow' | 'again';
/** the writer going over the struck word at the caret (InkSession.again): null when there's none there */
export type AgainFn = (at: number) => { level: number; max: boolean } | null;
/** the textarea's selection, or null when the event isn't the letter's */
export type Sel = readonly [number, number] | null;
export interface KeyLike { key: string; keyCode?: number; repeat: boolean; metaKey: boolean; ctrlKey: boolean; altKey: boolean; isComposing: boolean }
export interface InputLike { inputType: string; isComposing?: boolean }

const DELETES = new Set(['deleteContentBackward', 'deleteContentForward', 'deleteWordBackward', 'deleteWordForward']);
const isDeleteKey = (k: string) => k === 'Backspace' || k === 'Delete';
/** a phone keyboard's key that doesn't say which it is (Android: 229 for every key but Enter) */
const unnamed = (e: KeyLike) => e.key === 'Unidentified' || e.key === 'Process' || e.keyCode === 229;

/**
 * Backspace (or Delete) at a crossed-out word, pressed or held, from any keyboard. `key` takes keydowns, `input`
 * beforeinput (read on touch keyboards only), `dropped` the edits that reach the page; each says what to do.
 */
export class BackspaceHold {
  /** a touch keyboard (a coarse pointer): read the hold from timing. Off, only keydown's `repeat` counts, as before */
  touch = false;
  private clock: () => number;
  private timer = new HoldTimer();
  /** a held key is going over a struck word */
  private againHeld = false;
  private lastAgain = -Infinity;
  /** the last delete keydown's outcome, until the beforeinput it causes arrives (then it's the same deletion) */
  private keyAct: HoldAct | null = null;
  private keyAt = -Infinity;
  /** the caret at the last keydown (Android selects what it deletes after its keydown 229, before beforeinput) */
  private keySel: Sel = null;
  private dropAt = -Infinity;
  private dropCaret = 0;
  /** where the last pass was made, and a tap still being waited on there (CONFIRM_MS) */
  private againCaret = -1;
  private waiting: (() => void) | null = null;
  private schedule: (fn: () => void, ms: number) => () => void;
  /** a tap waited on turned out a tap: the word was gone over just now (the page shows it) */
  private late: () => void;
  constructor(o: { late?: () => void; clock?: () => number; schedule?: (fn: () => void, ms: number) => () => void } = {}) {
    this.late = o.late ?? (() => {});
    this.clock = o.clock ?? (() => performance.now());
    this.schedule = o.schedule ?? ((fn, ms) => { const id = setTimeout(fn, ms); return () => clearTimeout(id); });
  }

  /** a keydown (Backspace, Delete, or anything else) */
  key(e: KeyLike, sel: Sel, again: AgainFn): HoldAct {
    const now = this.clock();
    this.keySel = sel;
    this.keyAt = now;
    this.keyAct = null;
    if (!isDeleteKey(e.key)) {
      // any other key ends a hold; a phone's unnamed key says nothing (its deletion follows as a beforeinput)
      if (!(this.touch && unnamed(e))) this.end();
      return 'pass';
    }
    this.keyAct = 'pass';
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || !sel) return 'pass';
    this.unwait();
    const beat = this.touch ? this.timer.note(now) : 'fresh';
    return (this.keyAct = this.press(now, sel, e.repeat || beat === 'held', beat === 'maybe', again));
  }

  /** a key let go: on a computer, the hold is over. (A phone's keyup says nothing; its hold ends with a pause.) */
  keyUp(e: KeyLike) {
    if (!this.touch && isDeleteKey(e.key)) this.againHeld = false;
  }

  /** a beforeinput: on a touch keyboard, a deletion that came with no named keydown is read here */
  input(e: InputLike, sel: Sel, again: AgainFn): HoldAct {
    if (!this.touch) return 'pass';
    const now = this.clock();
    const paired = this.keyAct != null && now - this.keyAt < PAIR_MS;
    const keyAct = this.keyAct;
    this.keyAct = null;
    this.dropAt = -Infinity;
    if (!DELETES.has(e.inputType)) {
      // typing, a paste, a line break: whatever was held isn't any more
      if (!paired) this.end();
      return 'pass';
    }
    // the deletion a Backspace keydown just made: decided there
    if (paired) return keyAct === 'pass' ? 'pass' : this.dropping('swallow', this.keySel);
    if (e.isComposing) return 'pass';
    // Android selects what it's about to delete between its keydown 229 and this: the caret is where that keydown found it
    const k = this.keySel;
    const ime = !!(sel && k && now - this.keyAt < PAIR_MS && k[0] === k[1] && sel[1] === k[1] && sel[0] < sel[1]);
    const at = ime ? k : sel;
    this.unwait();
    const beat = this.timer.note(now, /Word/.test(e.inputType));
    if (!at) return 'pass';
    return this.dropping(this.press(now, at, beat === 'held', beat === 'maybe', again), at);
  }

  /**
   * An edit reached the page. When it's the deletion of a beforeinput this swallowed and the browser carried out
   * anyway (Android), the page drops it and puts the caret back here; otherwise null.
   */
  dropped(e: { ins: string; del: number }): number | null {
    const due = this.clock() - this.dropAt < DROP_MS;
    this.dropAt = -Infinity;
    return due && !e.ins && e.del > 0 ? this.dropCaret : null;
  }

  /** whatever was held isn't any more */
  private end() {
    this.unwait();
    this.againHeld = false;
    this.timer.reset();
  }
  /** another deletion came: a tap waited on was the key held down after all */
  private unwait() {
    this.waiting?.();
    this.waiting = null;
  }

  private dropping(act: HoldAct, sel: Sel): HoldAct {
    if (act !== 'pass' && sel) { this.dropAt = this.clock(); this.dropCaret = sel[0]; }
    return act;
  }

  /** one deletion at the caret: `repeat`, the key held down; `maybe`, perhaps still held */
  private press(now: number, sel: readonly [number, number], repeat: boolean, maybe: boolean, again: AgainFn): HoldAct {
    const [a, b] = sel;
    if (a !== b) return 'pass';
    if (repeat && this.againHeld && now - this.lastAgain < AGAIN_EVERY) return 'swallow';
    // the word the last press went over: perhaps that key's first repeat, perhaps another tap. Wait and see
    if (maybe && this.againHeld && a === this.againCaret) {
      this.waiting = this.schedule(() => {
        this.waiting = null;
        const r = again(a);
        if (r && !r.max) { this.lastAgain = this.clock(); this.late(); }
      }, CONFIRM_MS);
      return 'swallow';
    }
    const r = again(a);
    if (!r) { this.againHeld = false; return 'pass'; }
    // inked out already: a fresh press deletes as usual; held (or perhaps still held), it stays there
    if (r.max && !repeat && !maybe) { this.againHeld = false; return 'pass'; }
    if (r.max) return 'swallow';
    this.againHeld = true;
    this.lastAgain = now;
    this.againCaret = a;
    return 'again';
  }
}

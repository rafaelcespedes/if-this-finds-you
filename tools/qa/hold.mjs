#!/usr/bin/env node
// tools/qa/hold.mjs — holding Backspace at a crossed-out word (app/src/write/hold.ts): a held key climbs one level
// every AGAIN_EVERY ms and never deletes the word before, read from keydown's repeat on a computer and from how fast
// the deletions come on a phone (iOS: Backspace keydowns with no repeat flag, or none at all, then whole words;
// Android: unnamed keydowns, a beforeinput it won't cancel, the deletion anyway). Taps still climb a level each,
// a fresh press after inked out still deletes, and ordinary deleting still deletes.
//   node tools/qa/hold.mjs
import { AGAIN_EVERY, BackspaceHold, CONFIRM_MS, HoldTimer } from '../../app/src/write/hold.ts';

let failed = 0;
const check = (ok, name, detail = '') => {
  if (!ok) { failed++; process.exitCode = 1; }
  console.log(ok ? '✓' : '✗', name, detail ? '| ' + detail : '');
};

// ---------- the timing alone ----------
{
  const beats = (times, word = () => false) => { const h = new HoldTimer(); return times.map((t, i) => h.note(t, word(t, i))[0]).join(''); };
  // f fresh, m maybe (the first repeat, or a tap), h held
  const ios = [0, 500, 600, 700, 800, 900];
  check(beats(ios) === 'fmhhhh', 'iOS cadence: a press, the first repeat at 0.5 s, then every 0.1 s', beats(ios));
  const android = [0, 400, 450, 500, 550, 552, 600];
  check(beats(android) === 'fmhhhhh', 'Android cadence: 400 ms, then every 50 ms (two at a time later)', beats(android));
  const taps = [0, 350, 700, 1050, 1400];
  check(beats(taps) === 'fmfmf', 'taps 350 ms apart are never held', beats(taps));
  const quick = [0, 200, 400, 600];
  check(beats(quick) === 'ffff', 'quick taps 200 ms apart are presses of their own', beats(quick));
  const words = [0, 500, 600, 700, 3000, 3400, 3800, 4200];
  check(beats([0, 500, 600, 700, 800, 1300, 1700, 2100], (t) => t > 1000) === 'fmhhhhhh', 'iOS whole words, slower, stay held');
  check(beats(words) === 'fmhhfmfm', 'a pause of 2 s ends a hold: after it, presses again', beats(words));
  const busy = [0, 500, 600, 700, 1300, 1310, 1400];
  check(beats(busy) === 'fmhhmhh', 'a page busy for 0.6 s in a hold: maybe, then held again', beats(busy));
}

// ---------- the page: a struck word at the caret, and the words before it ----------
// again() as InkSession has it: the struck word at offset A climbs to level 4 (inked out), then says max. A deletion
// the page lets through at A eats the word before (the caret moves left); anywhere else it's ordinary deleting.
const A = 11;
function page({ touch, level = 1, struck = true }) {
  // a clock and timers the test moves on by hand
  let now = 0;
  const timers = [];
  const schedule = (fn, ms) => { const tm = { at: now + ms, fn }; timers.push(tm); return () => { tm.fn = null; }; };
  const set = (t) => {
    for (;;) {
      const due = timers.filter((tm) => tm.fn && tm.at <= t).sort((x, y) => x.at - y.at)[0];
      if (!due) break;
      now = due.at;
      const fn = due.fn;
      due.fn = null;
      fn();
    }
    now = t;
  };
  const hold = new BackspaceHold({ clock: () => now, schedule, late: () => s.late++ });
  hold.touch = touch;
  const s = { hold, caret: A, level, climbs: [], late: 0, ate: 0, deleted: 0, dropped: 0, set };
  s.again = (at) => {
    if (!struck || at !== A) return null;
    if (s.level >= 4) return { level: 4, max: true };
    s.level++;
    s.climbs.push(now);
    return { level: s.level, max: false };
  };
  s.del = () => { if (s.caret === A && struck) s.ate++; s.deleted++; s.caret--; };
  return s;
}
const key = (key, o = {}) => ({ key, keyCode: key === 'Backspace' ? 8 : key === 'Unidentified' ? 229 : 0, repeat: false, metaKey: false, ctrlKey: false, altKey: false, isComposing: false, ...o });
const sel = (s) => [s.caret, s.caret];

/** a computer: keydowns, repeat after the first */
function desktop(s, times) {
  for (const [i, t] of times.entries()) {
    s.set(t);
    const act = s.hold.key(key('Backspace', { repeat: i > 0 }), sel(s), s.again);
    if (act === 'pass') s.del();
  }
  s.hold.keyUp(key('Backspace'));
  s.set(times[times.length - 1] + 1000);
}
/** iOS: a Backspace keydown (no repeat flag) for each letter, its beforeinput only when not cancelled; whole words
 * (deleteWordBackward) with no keydown at all. `keys: false`: no keydowns either */
function ios(s, times, { keys = true, wordsFrom = Infinity } = {}) {
  for (const t of times) {
    s.set(t);
    const word = t >= wordsFrom;
    if (keys && !word && s.hold.key(key('Backspace'), sel(s), s.again) !== 'pass') continue;
    s.set(t + 0.3);
    const act = s.hold.input({ inputType: word ? 'deleteWordBackward' : 'deleteContentBackward' }, sel(s), s.again);
    if (act === 'pass') s.del(); // (Safari honours a cancelled beforeinput)
  }
  s.set(times[times.length - 1] + 1000);
}
/** Android: keydown 229 at the caret, the deletion selected, a beforeinput it won't cancel, the deletion anyway */
function android(s, times) {
  for (const t of times) {
    s.set(t);
    s.hold.key(key('Unidentified'), sel(s), s.again);
    s.set(t + 1);
    const act = s.hold.input({ inputType: 'deleteContentBackward' }, [s.caret - 1, s.caret], s.again);
    s.set(t + 2);
    const back = s.hold.dropped({ ins: '', del: 1 });
    if (back == null) { s.del(); if (act !== 'pass') check(false, 'a swallowed deletion is dropped'); } else { s.dropped++; if (back !== s.caret) check(false, 'the caret goes back where it was', `${back} != ${s.caret}`); }
  }
  s.set(times[times.length - 1] + 1000);
}
const run = (from, to, every) => { const r = []; for (let t = from; t < to; t += every) r.push(t); return r; };
// what each keyboard sends while Backspace is held for `ms`
const desktopHold = (ms) => [0, ...run(500, ms, 33)];
const iosHold = (ms) => [0, ...run(500, ms, 100)];
const androidHold = (ms) => { const r = [0]; let n = 0; for (let t = 400; t < ms; t += 50) { r.push(t); if (++n > 20) r.push(t + 3); } return r; };
const climbs = (s) => s.climbs.map((t) => Math.round(t)).join(',');
/** a held key climbs a level about every AGAIN_EVERY (the first press at once), and eats nothing */
const climbsLikeAHold = (s) => s.climbs.length === 3 && s.climbs[0] < 5 && s.climbs.slice(1).every((t, i) => t - s.climbs[i] >= AGAIN_EVERY && t - s.climbs[i] < AGAIN_EVERY + 120) && s.ate === 0 && s.level === 4;

for (const [name, play] of [
  ['computer', (s, ms) => desktop(s, desktopHold(ms))],
  ['iPhone (keydowns)', (s, ms) => ios(s, iosHold(ms), { wordsFrom: 3000 })],
  ['iPhone (no keydowns)', (s, ms) => ios(s, iosHold(ms), { keys: false, wordsFrom: 3000 })],
  ['Android', (s, ms) => android(s, androidHold(ms))],
]) {
  const touch = name !== 'computer';
  {
    const s = page({ touch });
    play(s, 5000);
    check(climbsLikeAHold(s), `${name}: held 5 s on a struck word, it climbs to inked out and stays`, `climbs at ${climbs(s)} ms, level ${s.level}, words before eaten ${s.ate}${s.dropped ? `, ${s.dropped} deletions dropped` : ''}`);
    // let go, then a fresh press, as today: deletes
    const t0 = 5000 + 1500;
    if (name === 'computer') desktop(s, [t0]); else if (name === 'Android') android(s, [t0]); else ios(s, [t0], { keys: name === 'iPhone (keydowns)' });
    check(s.ate === 1, `${name}: a fresh press after the hold deletes as usual`, `eaten ${s.ate}`);
  }
  {
    // the word was at level 3: the first press inks it out, and the first repeat mustn't delete
    const s = page({ touch, level: 3 });
    play(s, 2500);
    check(s.level === 4 && s.ate === 0 && s.climbs.length === 1, `${name}: held from level 3, inked out at once, nothing eaten`, `level ${s.level}, eaten ${s.ate}`);
  }
  {
    // ordinary deleting of fresh text: every deletion goes through
    const s = page({ touch, struck: false });
    const ms = 2500;
    play(s, ms);
    const sent = name === 'computer' ? desktopHold(ms).length : name === 'Android' ? androidHold(ms).length : iosHold(ms).length;
    check(s.deleted === sent && s.dropped === 0, `${name}: holding Backspace on fresh text deletes every time`, `${s.deleted} of ${sent}`);
  }
}

// iOS's whole words coming slower (every 0.4 s), and a page too busy to keep up for 0.6 s: still held, nothing eaten
{
  const s = page({ touch: true });
  ios(s, [...iosHold(3000), ...run(3000, 5000, 400)], { wordsFrom: 3000 });
  check(s.level === 4 && s.ate === 0, 'iPhone: whole words every 0.4 s, still held', `eaten ${s.ate}`);
  const b = page({ touch: true });
  android(b, [...androidHold(1600), ...run(2200, 3500, 50)]);
  check(b.level === 4 && b.ate === 0, 'Android: the page falls 0.6 s behind at inked out, still held', `eaten ${b.ate}`);
}

// taps, one at a time, on a phone: a level each, as on a computer
for (const [name, tap] of [['iPhone', (s, t) => ios(s, [t])], ['Android', (s, t) => android(s, [t])]]) {
  const s = page({ touch: true });
  for (const t of [0, 350, 700]) tap(s, t);
  check(s.level === 4 && s.climbs.length === 3 && s.late === 1 && s.ate === 0, `${name}: three taps 350 ms apart, three levels (the second waits ${CONFIRM_MS} ms to see it isn't held)`, `level ${s.level}, climbs at ${climbs(s)} ms`);
  const q = page({ touch: true });
  for (const t of [0, 200]) tap(q, t);
  check(q.level === 3, `${name}: a quick double tap, two levels`, `level ${q.level}`);
  // inked out by a tap, then tapping on: one tap may be swallowed (it could be the hold's first repeat), then it deletes
  const r = page({ touch: true, level: 3 });
  for (const t of [0, 400, 800]) tap(r, t);
  check(r.level === 4 && r.ate === 1, `${name}: tapping on after inked out deletes by the second tap`, `eaten ${r.ate}`);
  // typing between ends a hold
  const w = page({ touch: true, level: 4 });
  w.set(0); w.hold.input({ inputType: 'deleteContentBackward' }, sel(w), w.again);
  w.set(100); w.hold.input({ inputType: 'insertText' }, sel(w), w.again);
  w.set(150); const act = w.hold.input({ inputType: 'deleteContentBackward' }, sel(w), w.again);
  check(act === 'pass', `${name}: after typing, a press at an inked-out word deletes`, act);
}

// a computer is as it was: fast taps climb each, the beforeinput isn't read, a press at inked out deletes
{
  const s = page({ touch: false });
  desktop(s, [0]); desktop(s, [80]);
  check(s.level === 3, 'computer: two presses 80 ms apart, two levels (only a held key repeats)', `level ${s.level}`);
  s.set(200);
  check(s.hold.input({ inputType: 'deleteContentBackward' }, sel(s), s.again) === 'pass' && s.level === 3, 'computer: beforeinput is left alone');
  const m = page({ touch: false, level: 4 });
  desktop(m, [0]);
  check(m.ate === 1, 'computer: a press at an inked-out word deletes');
  const sel2 = page({ touch: true });
  sel2.set(0);
  check(sel2.hold.key(key('Backspace'), [3, 9], sel2.again) === 'pass' && sel2.level === 1, 'a selection is struck through, never crossed out again');
}

if (failed) console.log(`${failed} failed`);

// ink-every.ts: every interaction of the writing page (/write), as a script, for the walkthrough video
// (src/InkEvery.tsx). Two scenes: a letter (the corrections, the formatting, undo, stet, a P.S.), then a new note
// (titles, headings, lists, a checklist). Each is typed through the site's own InkSession on the video's clock
// (src/ink-live.ts) and recorded. Writes src/data/ink-every-1.json and ink-every-2.json.
//   node scripts/node-ts.mjs scripts/ink-every.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs';
import { LiveRun, restoreClock, type Act, type Where } from '../src/ink-live';

function script() {
  const acts: Act[] = [];
  let clock = 0.6;
  let x = 0x2545f491;
  const rnd = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; };
  const at = () => clock;
  return {
    acts, at, rnd,
    /** a person typing: `cps` keys a second, uneven, a beat longer after spaces and punctuation */
    type(text: string, cps = 8, spread = 0.8) {
      for (const ch of text) {
        acts.push({ t: clock, key: ch === '\n' ? 'Enter' : ch });
        clock += (1 / cps) * (1 - spread / 2 + spread * rnd()) * (/[\s,.]/.test(ch) ? 1.4 : 1);
      }
    },
    press(key: string, gap = 0.18) { acts.push({ t: clock, key }); clock += gap; },
    wait(s: number) { clock += s; },
    click(w: Where, gap = 0.35) { acts.push({ t: clock, key: 'click', at: w }); clock += gap; },
    select(from: Where, to: Where, gap = 0.8) { acts.push({ t: clock, key: 'select', at: from, to }); clock += gap; },
    hold(dur: number) { acts.push({ t: clock, key: 'hold', dur }); clock += dur + 0.2; },
    tick(word: string) { acts.push({ t: clock, key: 'tick', at: { before: word } }); clock += 0.4; },
    beat(note: string) { acts.push({ t: clock, key: 'note', note }); },
  };
}

// ---------- scene 1: a letter ----------
function letter() {
  const S = script();
  const { type, press, wait, click, select, hold, beat } = S;
  beat('ahead');
  type('Dear Mara,\nThe gardne');
  wait(0.1);
  // 1. a typo the pen hasn't reached: gone cleanly
  beat('clean');
  press('Backspace', 0.14); press('Backspace', 0.25);
  type('en is quite');
  // 2. once it's ink, Backspace crosses it out
  wait(2.4);
  beat('strike');
  for (let i = 0; i < 5; i++) press('Backspace', i < 4 ? 0.11 : 0.4);
  type('so green. I miss you.');
  wait(2.0);
  // 3. again on the crossed-out word: harder; held: a scribble, then inked out
  beat('again');
  click({ before: 'so green' }, 0.5);
  press('Backspace', 1.9);
  beat('hold');
  hold(1.6);
  wait(0.6);
  // 4. select a word and type: struck, the new one above
  beat('replace');
  select({ before: 'green' }, { after: 'green' });
  type('wild', 7);
  wait(2.2);
  // 5. the caret between two words: a caret in the line, the word above
  beat('insert');
  click({ before: 'miss' }, 0.5);
  type('really ', 7);
  wait(2.2);
  // 6. select the last words written and type: struck, and the pen carries on after them
  beat('carry');
  click('end', 0.3);
  select({ before: 'you.' }, 'end');
  type('you two.', 7);
  wait(2.4);
  // 7. ⌘B with nothing selected: what's typed next is pressed harder
  beat('weight');
  press('Enter', 0.3);
  press('Meta+b', 0.35);
  type('Come on Sunday', 7);
  press('Meta+b', 0.3);
  // 8. ⌘I: what's typed next leans in (with a slip: "sceds")
  beat('lean');
  press('Meta+i', 0.3);
  type(' with all the sceds.', 7);
  press('Meta+i', 0.3);
  wait(2.6);
  // 9. a letter retyped goes over the old one, when it covers it (c → e)
  beat('over');
  select({ inWord: 'sceds', at: 1 }, { inWord: 'sceds', at: 2 }, 0.7);
  type('e', 4);
  wait(2.2);
  // 10. ⌘U: underlined by hand; twice: a double underline
  beat('underline');
  select({ before: 'really' }, { after: 'miss' });
  press('Meta+u', 1.8);
  beat('double');
  select({ before: 'really' }, { after: 'miss' });
  press('Meta+u', 1.8);
  // 11. ⌘B on words: gone over again
  beat('retrace');
  select({ before: 'Mara' }, { after: 'Mara' });
  press('Meta+b', 1.8);
  // 12. ⇧⌘E: the highlighter, under the ink
  beat('highlight');
  select({ before: 'Sunday' }, { after: 'Sunday' });
  press('Shift+Meta+e', 2.0);
  // 13. the hand keeps your tempo: a fast burst is hastier, slow typing tidier
  click('end', 0.3);
  press('Enter', 0.3);
  beat('fast');
  type('I can hardly wait', 17, 0.3);
  wait(1.6);
  beat('slow');
  type(' to see you all.', 3.2, 0.25);
  wait(2.4);
  // 14. fresh ink is wet: ⌘Z lifts it
  press('Enter', 0.3);
  beat('wet');
  type('Yours,', 7);
  wait(1.4);
  beat('undo');
  press('Meta+z', 1.6);
  // 15. once it's dry, plain writing stays
  type('Love,', 7);
  wait(1.0);
  beat('drying');
  wait(6.9);
  beat('dry');
  press('Meta+z', 2.4);
  // 16. cross it out, let it dry, ⌘Z: stet, and the word stands
  beat('strike2');
  for (let i = 0; i < 5; i++) press('Backspace', i < 4 ? 0.11 : 0.4);
  wait(1.2);
  wait(6.4);
  beat('stet');
  press('Meta+z', 3.0);
  // 17. ⌘↩: a P.S.
  beat('ps');
  click('end', 0.3);
  press('Meta+Enter', 0.5);
  type('P.S. Bring the twine.', 7);
  wait(5.6); // the pen finishes, then the whole letter
  return S;
}

// ---------- scene 2: a new note: titles, headings, lists, a checklist ----------
function note() {
  const S = script();
  const { type, press, wait, tick, beat } = S;
  S.wait(-0.2);
  beat('note');
  press('Alt+Meta+n', 2.2);
  beat('title');
  type('# Sunday\n', 7);
  wait(1.2);
  beat('bullet');
  type('- seeds\ntwine\n', 7);
  wait(0.6);
  beat('endlist');
  press('Enter', 1.2);
  beat('heading');
  type('## Then\n', 7);
  wait(0.8);
  beat('number');
  type('1. dig\nplant\n', 7);
  wait(0.4);
  press('Enter', 1.0);
  beat('check');
  type('[] water them\nrest', 7);
  wait(2.4);
  beat('tick');
  tick('water');
  wait(4.8); // the tick, then the whole note
  return S;
}

import * as E from '@engine';
// the person typing, one for the page (as on the site), whose own pace is this script's: about 8 keys a second
const typist = (E as any).newTypist(130);
const out: any[] = [];
for (const [name, make] of [['1', letter], ['2', note]] as const) {
  const S = make();
  const END = S.at();
  const run = new LiveRun(process.env.INK_SALT || undefined, 0, typist);
  run.run(S.acts, END);
  const res = run.result(END);
  fs.writeFileSync(`src/data/ink-every-${name}.json`, JSON.stringify(res));
  restoreClock();
  out.push(res);
  console.log(`scene ${name}: ${END.toFixed(1)} s, ${res.events.length} events, ${res.states.length} states, ${Object.keys(res.strokes).length} items drawn`);
  console.log('  text:', JSON.stringify(res.text));
  console.log('  logical:', JSON.stringify(res.logical));
  console.log('  log:', run.s.doc.log.map((e: any) => e.t + (e.why ? '/' + e.why : '') + (e.kind ? '/' + e.kind : '') + (e.text ? ':' + JSON.stringify(e.text) : '') + (e.as ? ':' + e.as : '')).join(' | '));
  console.log('  toasts', JSON.stringify(res.toasts), 'lifts', JSON.stringify(res.lifts));
}

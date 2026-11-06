// ink-session.ts: the typing in the ink demo, as a script: every keystroke with a person's timing, run through the
// site's own Ink mode on the video's clock (src/ink-run.ts) and recorded for the video: every keystroke, every
// state of the ink log, the time each event went down, and the pen's view at every frame.
// Writes src/data/ink-session.json. The video replays the log in the browser (replay is deterministic).
//   node scripts/node-ts.mjs scripts/ink-session.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs';
import { InkRun, type Act } from '../src/ink-run';

// ---------- the script: what's typed, when ----------
const acts: Act[] = [];
let clock = 0.5; // a beat on the empty sheet first
let x = 0x2545f491;
const rnd = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; };
/** a person typing: about 8 keys a second, uneven, a beat longer after spaces and punctuation */
function type(text: string, cps = 8) {
  for (const ch of text) {
    acts.push({ t: clock, key: ch });
    clock += (1 / cps) * (0.6 + 0.8 * rnd()) * (/[\s,.]/.test(ch) ? 1.4 : 1);
  }
}
const press = (key: string, gap = 0.16) => { acts.push({ t: clock, key }); clock += gap; };
const wait = (s: number) => { clock += s; };
/** a click into the text: `at` places the cursor ('before:word', 'at:word' or 'end'); `look` is the word the pointer goes to */
const click = (at: number | 'end' | string, note?: string, look?: string) => { acts.push({ t: clock, key: 'click', at, note, look }); clock += 0.35; };
/** Delete held on a crossed-out word: a pass every 280 ms, harder each time */
const holdDelete = (passes: number) => { acts.push({ t: clock, key: 'BackspaceHold', hold: passes }); clock += passes * 0.28 + 0.4; };
/** a drag across words (the pointer), leaving them selected for a command */
const select = (from: string, to: string) => { acts.push({ t: clock, key: 'select', at: from, to }); clock += 0.75; };
const beat = (note: string) => acts.push({ t: clock, key: 'note', note });

beat('start');
type('Dear Mara,');
press('Enter', 0.3);
// 1. a typo the pen hasn't reached: gone cleanly
beat('clean');
type('The gardne', 9);
wait(0.08);
press('Backspace', 0.12); press('Backspace', 0.2);
type('en is quite');
// 2. a beat later, the same Backspace on ink: crossed out, and the pen writes on
beat('strike');
wait(1.9); // the pen writes "quite"
press('Backspace', 0.1); press('Backspace', 0.1); press('Backspace', 0.1); press('Backspace', 0.1); press('Backspace', 0.3);
type('so green. I miss you.');
wait(1.6);
// 3. back to the crossed-out word: Delete held, crossed out harder, scribbled, inked out
beat('again');
click('at:so green', 'again', 'quite');
wait(0.2);
holdDelete(3);
wait(0.9);
// 4. select and retype: the old word struck, the new one written above it
beat('replace');
select('green', 'green');
type('wild', 7);
wait(2.0);
// 5. a word added above the line, with a caret
beat('insert');
click('before:miss', 'insert');
type('really ', 7);
wait(1.9);
// 6. underlined by hand (⌘U), then a word gone over again (⌘B)
beat('underline');
select('miss', 'you');
press('Meta+u', 0.4);
wait(1.6);
beat('retrace');
select('Mara', 'Mara');
press('Meta+b', 0.4);
wait(1.6);
// 7. undo lifts wet ink
beat('undo');
click('end');
press('Enter', 0.3);
type('Love,');
wait(1.1); // written, still wet
press('Meta+z', 0.6);
// 8. a slip at the pen: "lovc", the c already in ink, written over with an e
beat('over');
type('All my lovc');
wait(1.3); // the pen writes "lovc"
press('Backspace', 0.3);
type('e');
wait(1.3); // the pen considers, then writes the e over the c
type(',');
// 9. undo on dry ink: it stays
beat('dry');
wait(3.6);
press('Meta+z', 0.4);
wait(2.0);
const END = clock;

// ---------- the session ----------
const run = new InkRun(process.env.INK_SALT || undefined);
run.run(acts, END);
const out = run.result(END);
fs.writeFileSync('src/data/ink-session.json', JSON.stringify(out));
const sheet = run.sheet;
console.log('seconds', END.toFixed(2), 'frames', out.frames.length, 'events', out.events.length, 'states', out.states.length);
console.log('log:', sheet.doc.log.map((e: any) => e.t + (e.text ? ':' + JSON.stringify(e.text) : '')).join(' | '));
console.log('text:', JSON.stringify(out.text));
console.log('toasts', JSON.stringify(out.toasts), 'lifts', JSON.stringify(out.lifts));
console.log('marks', sheet.page.items.filter((i: any) => i.kind === 'mark').map((i: any) => i.mark).join(', '));
console.log('item ids sample', sheet.page.items.slice(0, 3).map((i: any) => i.id).join(','), 'selections', JSON.stringify(out.selections));

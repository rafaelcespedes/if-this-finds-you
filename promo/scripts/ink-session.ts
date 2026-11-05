// ink-session.ts: the typing in the ink demo, run through the site's own Ink mode (engine/sheet.js: plan, penStep,
// apply, dropLast; the same calls as app/src/lib/ink.ts InkSession) with a person's timing, and recorded for the
// video: every keystroke, every state of the ink log (event ids, so an undo that lifts events is replayed right),
// the time each event went down, and the pen's view (what's typed but not yet written) at every frame.
// Writes src/data/ink-session.json. The video replays the log in the browser (replay is deterministic).
//   node scripts/node-ts.mjs scripts/ink-session.ts
import fs from 'node:fs';
import * as E from '@engine';
import { inkOpts } from '@/lib/ink';
import { getPaper } from '@/lib/papers';
import { HAND, PAPER, MEASURE, SALT, PEN_SPEED } from '../src/scene/ink-demo-setup';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as any;
const FPS = 30;

// ---------- the script: what's typed, when ----------
type Act = { t: number; key: string; at?: 'end' | number; note?: string };
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
const click = (at: number | 'end', note?: string) => { acts.push({ t: clock, key: 'click', at, note }); clock += 0.35; };
const beat = (note: string) => acts.push({ t: clock, key: 'note', note });

beat('start');
// 1. one letter written over another: "Mora", the o already in ink, written over with an a
beat('over');
type('Dear Mo');
wait(1.3); // the pen writes "Mo"
press('Backspace', 0.3);
type('a');
wait(1.3); // the pen considers, then writes the a over the o
type('ra,');
press('Enter', 0.3);
// 2. a typo the pen hasn't reached: gone cleanly
beat('clean');
type('The gardne', 9);
wait(0.08);
press('Backspace', 0.12); press('Backspace', 0.2);
type('en is quite');
// 3. Backspace on ink: the pen crosses it out and writes the word again
beat('strike');
wait(1.9); // the pen writes "quite"
press('Backspace', 0.1); press('Backspace', 0.1); press('Backspace', 0.1); press('Backspace', 0.1); press('Backspace', 0.3);
type('so green. I miss you.');
wait(1.4);
// 4. a word added above the line, with a caret
beat('insert');
click('before:miss', 'insert');
type('really ', 7);
wait(1.9);
// 5. undo lifts wet ink only
beat('undo');
click('end');
press('Enter', 0.3);
type('Love,');
wait(1.1); // written, still wet
press('Meta+z', 0.6);
beat('dry');
type('All my love,');
wait(3.8); // written, and dry
press('Meta+z', 0.4);
wait(1.8);
const END = clock;

// ---------- the session ----------
const p = engine.withOverrides(engine.makeHand(HAND.seed, { style: HAND.style }, { neatOnly: true }), { ...HAND.params, pen: HAND.pen, tip: HAND.tip, ink: HAND.ink });
const paper = getPaper(PAPER);
const narrow = { ...paper, text: { ...paper.text, right: paper.text.left + (paper.text.right - paper.text.left) * MEASURE } };
const { layout } = inkOpts(p, narrow as any, 1, 1);
const salt = process.env.INK_SALT || SALT;
const doc = engine.newInkDoc({ seed: HAND.seed, style: HAND.style, salt });
let sheet = engine.replay(p, doc, layout);
let view = engine.newView();
const events: any[] = []; // every event ever applied, by id
const evTime: number[] = [];
let ids: number[] = []; // the log as event ids
let lastKey = -10, lastInk = -10;
let cursor: number | null = null; // a mid-text insertion point (textarea index), or null at the end
const states: { t: number; ids: number[] }[] = [{ t: 0, ids: [] }];
const toasts: { t: number; title: string; body: string }[] = [];
const lifts: { t: number; n: number }[] = [];
const notes: { t: number; note: string }[] = [];
const clicks: { t: number; index: number }[] = [];
const keys: { t: number; key: string }[] = [];
const frames: any[] = [];

const applyEvents = (t: number, evs: any[]) => {
  if (!evs.length) return;
  engine.apply(sheet, evs);
  for (const e of evs) { ids = ids.concat(events.length); events.push(e); evTime.push(t); }
  states.push({ t, ids });
  lastInk = t;
};
function edit(t: number, e: { at: number; del: number; ins: string; kind: string }) {
  const r = engine.plan(sheet, view, e);
  view = r.view;
  applyEvents(t, r.events);
  lastKey = t;
}
function act(a: Act) {
  const t = a.t;
  if (a.key === 'note') { notes.push({ t, note: a.note! }); return; }
  keys.push({ t, key: a.key });
  const text = engine.viewText(sheet, view);
  if (a.key === 'click') {
    if (a.at === 'end') cursor = null;
    else if (typeof a.at === 'string') { const word = a.at.split(':')[1]; cursor = text.indexOf(word); }
    clicks.push({ t, index: cursor ?? text.length });
    return;
  }
  if (a.key === 'Meta+z') {
    // the site's undo (InkSession.undo): only the newest ink, within 3 s; typing the pen hasn't reached first
    const wet = t - lastInk <= 3 && !view.tail;
    if (!wet) { toasts.push({ t, title: 'The ink is dry', body: 'Cross it out, or start a fresh sheet.' }); return; }
    // lift the last word (and the line it started), as the app's undo history asks
    const want = text.replace(/[^\s]+\s*$/, '');
    let n = 0;
    while (engine.viewText(sheet, view).length > want.length && sheet.doc.log.length) {
      sheet = engine.dropLast(sheet); ids = ids.slice(0, -1); n++;
    }
    states.push({ t, ids });
    lifts.push({ t, n });
    return;
  }
  const at = cursor ?? text.length;
  if (a.key === 'Backspace') { edit(t, { at: at - 1, del: 1, ins: '', kind: 'delete' }); if (cursor != null) cursor--; return; }
  const ins = a.key === 'Enter' ? '\n' : a.key;
  edit(t, { at, del: 0, ins, kind: 'type' });
  if (cursor != null) cursor += ins.length;
}

const DT = 0.01;
let ai = 0;
for (let t = 0, f = 0; t <= END + 1e-9; t += DT) {
  while (ai < acts.length && acts[ai].t <= t + 1e-9) act(acts[ai++]);
  const r = engine.penStep(sheet, view, { dt: DT * 1000, idle: (t - lastKey) * 1000, forgiving: true, speed: PEN_SPEED });
  view = r.view;
  applyEvents(t, r.events);
  if (t + 1e-9 >= f / FPS) {
    frames.push({ s: states.length - 1, v: { tail: view.tail, mid: view.mid, pending: view.pending, budget: view.budget }, wet: lastInk, cur: cursor });
    f++;
  }
}
const out = {
  fps: FPS, seconds: END, hand: HAND, paper: PAPER, measure: MEASURE, salt,
  events, evTime, states, frames, keys, clicks, toasts, lifts, notes,
  text: engine.viewText(sheet, view), logical: engine.logicalText(sheet.doc),
};
fs.writeFileSync('src/data/ink-session.json', JSON.stringify(out));
console.log('seconds', END.toFixed(2), 'frames', frames.length, 'events', events.length, 'states', states.length);
console.log('log:', sheet.doc.log.map((e: any) => e.t + (e.text ? ':' + JSON.stringify(e.text) : '')).join(' | '));
console.log('text:', JSON.stringify(out.text));
console.log('toasts', JSON.stringify(toasts), 'lifts', JSON.stringify(lifts));
console.log('marks', sheet.page.items.filter((i: any) => i.kind === 'mark').map((i: any) => i.mark).join(', '));

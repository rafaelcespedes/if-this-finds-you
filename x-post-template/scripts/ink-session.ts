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
import { HAND, PAPER, MEASURE, SALT, PEN_SPEED } from '../src/setup';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as any;
const FPS = 30;

// ---------- the script: what's typed, when ----------
type Act = { t: number; key: string; at?: 'end' | number | string; note?: string; to?: string; hold?: number; look?: string };
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
/** Delete held on a crossed-out word: a pass every 280 ms (the writing page's AGAIN_EVERY), harder each time */
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
const clicks: { t: number; index: number; kind?: string; look?: string }[] = [];
const selections: { t: number; from: number; to: number; until: number; words?: string[] }[] = [];
let selection: { from: number; to: number } | null = null;
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
const pendingAgain: { t: number; at: number }[] = [];
function flush(t: number) {
  const r = engine.penStep(sheet, view, { final: true });
  view = r.view;
  applyEvents(t, r.events);
}
function act(a: Act) {
  const t = a.t;
  if (a.key === 'note') { notes.push({ t, note: a.note! }); return; }
  keys.push({ t, key: a.key });
  const text = engine.viewText(sheet, view);
  if (a.key === 'click') {
    selection = null;
    if (a.at === 'end') cursor = null;
    else if (typeof a.at === 'string') { const word = a.at.split(':')[1]; cursor = text.indexOf(word); }
    clicks.push({ t, index: cursor ?? text.length, kind: typeof a.at === 'string' ? a.at.split(':')[0] : 'end', look: a.look ?? (typeof a.at === 'string' ? a.at.split(':')[1] : undefined) });
    return;
  }
  if (a.key === 'select') {
    // a drag from the first word's start to the second word's end
    const from = text.indexOf(a.at as string), to = text.indexOf(a.to!, from) + a.to!.length;
    selection = { from, to };
    selections.push({ t, from, to, until: Infinity, words: [a.at as string, a.to!] } as any);
    return;
  }
  if (a.key === 'BackspaceHold') {
    // the writing page: Delete at a crossed-out word goes over it again, a pass every 280 ms while held
    for (let n = 0; n < (a.hold || 1); n++) {
      const tn = t + n * 0.28;
      pendingAgain.push({ t: tn, at: cursor ?? text.length });
    }
    return;
  }
  if (a.key === 'Meta+u' || a.key === 'Meta+b') {
    // InkSession.mark: everything typed written first, then the mark on the selected words
    flush(t);
    if (selection) {
      const runs = engine.inkIdsIn(sheet, view, selection.from, selection.to) as [number, number][];
      applyEvents(t, runs.map(([x0, x1]) => (a.key === 'Meta+u' ? { t: 'underline', from: x0, to: x1 } : { t: 'pen', kind: 'retrace', from: x0, to: x1 })));
      const sel = selections[selections.length - 1]; if (sel) sel.until = t + 0.25;
      selection = null;
    }
    lastKey = t;
    return;
  }
  if (a.key === 'Meta+Enter') {
    // InkSession.postScript: what's typed written, then the pen moves below for a P.S.
    flush(t);
    applyEvents(t, engine.postScript(sheet));
    cursor = null;
    lastKey = t;
    return;
  }
  if (a.key === 'Meta+z') {
    // the site's undo (InkSession.undo): only the newest ink, within 3 s; typing the pen hasn't reached first
    const wet = t - lastInk <= 3 && !view.tail;
    if (!wet) { toasts.push({ t, title: 'The ink is dry', body: 'Cross it out instead.' }); return; }
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
  if (selection && a.key.length === 1) {
    // select + type: the planner strikes the selection and writes the new word above it, smaller
    const sel = selections[selections.length - 1]; if (sel) sel.until = t;
    edit(t, { at: selection.from, del: selection.to - selection.from, ins: a.key, kind: 'type' });
    cursor = selection.from + 1;
    selection = null;
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
  while (pendingAgain.length && pendingAgain[0].t <= t + 1e-9) {
    const g = pendingAgain.shift()!;
    const r = engine.again(sheet, view, g.at);
    if (r && r.events.length) { view = r.view; applyEvents(t, r.events); }
    lastKey = t;
  }
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
  events, evTime, states, frames, keys, clicks, selections, toasts, lifts, notes,
  text: engine.viewText(sheet, view), logical: engine.logicalText(sheet.doc),
};
fs.writeFileSync('src/data/ink-session.json', JSON.stringify(out));
console.log('seconds', END.toFixed(2), 'frames', frames.length, 'events', events.length, 'states', states.length);
console.log('log:', sheet.doc.log.map((e: any) => e.t + (e.text ? ':' + JSON.stringify(e.text) : '')).join(' | '));
console.log('text:', JSON.stringify(out.text));
console.log('toasts', JSON.stringify(toasts), 'lifts', JSON.stringify(lifts));
console.log('marks', sheet.page.items.filter((i: any) => i.kind === 'mark').map((i: any) => i.mark).join(', '));
console.log('item ids sample', sheet.page.items.slice(0, 3).map((i: any) => i.id).join(','), 'selections', JSON.stringify(selections));

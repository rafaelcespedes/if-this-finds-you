// desk-script.mjs: what happens in the desk video, on its clock (seconds): keys, clicks, drags, and the captions.
// scripts/desk-capture.mjs plays it into the real writing page. `before` are notes typed first, unfilmed, so the
// notes list has something in it (dated `shift` hours from the video's 9:41).

function script() {
  const acts = [];
  let clock = 0.3;
  let x = 0x2545f491;
  const rnd = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; };
  const S = {
    acts,
    at: () => clock,
    /** a person typing: `cps` keys a second, uneven, a beat longer after spaces and punctuation */
    type(text, cps = 8, spread = 0.8) {
      for (const ch of text) {
        if (ch === '\n') acts.push({ t: clock, key: 'press', combo: 'Enter' });
        else acts.push({ t: clock, key: 'type', ch });
        clock += (1 / cps) * (1 - spread / 2 + spread * rnd()) * (/[\s,.]/.test(ch) ? 1.4 : 1);
      }
      return S;
    },
    press(combo, gap = 0.18) { acts.push({ t: clock, key: 'press', combo }); clock += gap; return S; },
    hold(combo, dur) { acts.push({ t: clock, key: 'hold', combo, dur }); clock += dur + 0.2; return S; },
    wait(s) { clock += s; return S; },
    move(to, dur = 0.6) { acts.push({ t: clock, key: 'move', to, dur }); clock += dur; return S; },
    click(at, gap = 0.3, count = 1) { acts.push({ t: clock, key: 'click', at, count }); clock += gap; return S; },
    drag(from, to, dur = 0.5) { acts.push({ t: clock, key: 'drag', from, to, dur }); clock += dur + 0.15; return S; },
    note(note, keys) { acts.push({ t: clock, key: 'note', note, keys }); return S; },
    hide() { acts.push({ t: clock, key: 'hide' }); return S; },
    /** where the camera looks from here: 'caret', 'pointer', 'all', or rects by name (unioned); zoom, or fit */
    cam(focus, zoom, ease = 0.9) { acts.push({ t: clock, key: 'cam', focus, zoom, ease }); return S; },
  };
  return S;
}

// the writer: the Dear Mara video's (Hana Hartmann, everyday joined, a fountain pen in royal blue), on the pad
const LOOK = { seed: 'soft-thistle-38', style: 'script', pen: 'fountain', penSize: 'medium', ink: 'royal-blue', paper: 'pad', size: 1.28, offsets: {} };
const DATE0 = new Date(2026, 10, 8, 9, 41, 0).getTime();
const START = -40; // hours: the first note was started on Friday afternoon

function before() {
  const a = script().type('Seeds to buy\n- sweet peas\nmarigolds\nbasil, the big leaf one', 8).wait(12);
  const b = script().press('Alt+Meta+n', 1).type('Ines,\nThank you for the jam. It was gone by Tuesday.', 8).wait(12);
  return [{ acts: a.acts, end: a.at() }, { shift: 23, acts: b.acts, end: b.at() }, { shift: 17, acts: script().press('Alt+Meta+n', 1.5).acts, end: 2 }];
}

function desk() {
  const S = script();
  S.cam('caret', 2.6, 0);
  S.note('Type, and a hand writes it out');
  S.type('Dear Mara,\nThe garden is quite');
  S.wait(1.9);
  S.note('Take a word back: it’s crossed out', ['⌫']);
  S.cam('caret', 3.1, 0.7);
  for (let i = 0; i < 5; i++) S.press('Backspace', i < 4 ? 0.1 : 0.35);
  S.type('so green.');
  S.wait(1.4);
  S.note('Change a word: the new one goes above');
  S.cam('caret', 2.6, 0.8);
  S.move({ text: 'green' }, 0.7);
  S.click({ text: 'green' }, 0.45, 2);
  S.type('wild', 7);
  S.wait(1.2);
  S.cam('all', 1, 1.0);
  S.note('A notes app, written by hand');
  S.move({ sel: '.wr-row', n: 1, fx: 0.55 }, 0.9);
  S.move({ sel: '.wr-row', n: 2, fx: 0.6 }, 0.7);
  S.wait(0.5);
  S.move({ end: true }, 0.7);
  S.click({ end: true }, 0.25);
  S.hide();
  S.cam('caret', 2.6, 1.0);
  S.type(' I miss you terribly', 8.5);
  S.wait(2.0);
  S.note('Cross it out, then hold Backspace: scribbled out', ['⌫ held']);
  for (let i = 0; i < 8; i++) S.press('Backspace', i < 7 ? 0.07 : 2.2);
  S.cam('caret', 2.8, 1.0);
  S.hold('Backspace', 2.5);
  S.wait(0.6);
  S.type('.', 6);
  S.wait(0.8);
  S.note('Underline, by hand');
  S.cam(['bar', 'write'], null, 1.0);
  S.drag({ text: 'miss', start: true }, { text: 'you', stop: true }, 0.55);
  S.move({ sel: 'button[aria-label="Underline"]' }, 0.7);
  S.click({ sel: 'button[aria-label="Underline"]' }, 1.6);
  S.cam('caret', 2.4, 0.9);
  S.move({ end: true }, 0.6);
  S.click({ end: true }, 0.3);
  S.hide();
  S.note('Lists and checklists, in the writer’s own way');
  S.type('\nBring:\n[] seeds\ntwine', 9);
  S.wait(2.4);
  S.note('Click a box: the pen ticks it');
  S.cam('caret', 2.5, 0.8);
  S.move({ text: 'seeds', start: true, dx: -26 }, 0.7);
  S.click({ text: 'seeds', start: true, dx: -26 }, 2.0);
  // the writer is the font menu
  S.cam(['writer', 'write'], null, 1.0);
  S.note('Pick another writer: your words, in their hand');
  S.move({ sel: '.wr-writer-chip' }, 0.8);
  S.click({ sel: '.wr-writer-chip' }, 0.9);
  S.cam(['hands', 'write'], null, 0.8);
  const ROW = (name) => ({ sel: `button.wr-hand[title="Write it as ${name}"]`, fx: 0.3 });
  S.move(ROW('Tomasz Rautio'), 0.6);
  S.click(ROW('Tomasz Rautio'), 1.4);
  S.move(ROW('Anouk Lowell'), 0.45);
  S.click(ROW('Anouk Lowell'), 1.4);
  S.move(ROW('Matteo Carver'), 0.45);
  S.click(ROW('Matteo Carver'), 1.7);
  S.press('Escape', 0.2);
  S.cam('all', 1, 1.1);
  S.note('If This Finds You · ifthisfindsyou.app/write');
  S.move({ x: 1120, y: 620 }, 0.8);
  S.hide();
  S.wait(3.0);
  return S;
}

const S = desk();
export const scene = {
  width: 1440, height: 900, rand: 7,
  startShift: START,
  pending: { id: 'desk-1', look: LOOK, ink: null, created: DATE0 + START * 3600e3, at: DATE0 + START * 3600e3 },
  before: before(),
  acts: S.acts, end: S.at(),
};

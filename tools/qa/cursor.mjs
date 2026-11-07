#!/usr/bin/env node
// tools/qa/cursor.mjs — the caret and the writing agree (the cursor redesign Rafael approved on 7 Nov 2026). For three
// hands, in the planner (engine/sheet.js, editing.js) and in the writing page's session (app/src/lib/ink.ts, through
// Vite, when app/node_modules is installed):
//   1. typing right after an insertion carries it on above the line: no split mark, no second insertion on top of it
//   2. mid-text, typing right after a word crossed out replaces it, written above it (a substitution); a struck word
//      that starts a line gets it on that line; at the very end of the writing the pen carries on after it
//   3. after a strike the caret stays right after the struck word: while the pen hovers over letters Backspaced at the
//      pen head, when the strike lands, and after an inkout, when the next press goes on to the word before
//   4. Backspace over a written space goes on to the word before: every press shows (no crossing-out of a space alone,
//      and none of a struck space crossed out harder)
//   5. words typed between two others show as thought letters where they'll be written (the same place as their ink),
//      and the caret goes up there with them
//   6. Left and Right stop on each side of a struck word (a struck line can be reached), typing before it inserts there;
//      a click on words written above the line goes into them, a click on the line stays on it
//   7. a list item's bullet, box or number shows (faint) before its words are written; a P.S. shows where its ink goes
//   - nothing already on the paper moves, and each session's log replays to the same page, byte for byte
//   - old logs (tools/qa/data/cursor-old-logs.json, made by the engine before these changes) replay to the same pages
//   node tools/qa/cursor.mjs [--update]   (--update: the old logs' pages measured again: only when the engine's drawing
//                                          changes on purpose; say why in the commit)
import { loadEngine, resolveRoot, QA_DIR } from './lib/engine.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const E = await loadEngine(resolveRoot());
const update = process.argv.includes('--update');
const OPTS = { maxWidth: 12400, lineHeight: 1600 };
const SVG = { width: 900, emPx: 58 };
const HANDS = [['maple-river-42', 'print'], ['quiet-heron-17', 'script'], ['tawny-atlas-52', 'adult-fr-2023']];
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
let fails = 0;
const fail = (m) => { fails++; console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

// ---------- the planner ----------
const snap = (it) => `${it.x.toFixed(3)},${it.y.toFixed(3)},${it.g && it.g.contours[0] ? it.g.contours[0][0].map((v) => v.toFixed(2)).join(',') : ''}`;
function session(seed, style, salt, opts = OPTS) {
  const p = E.makeHand(seed, style);
  const st = E.replay(p, E.newInkDoc({ seed, style, salt }), opts);
  const S = { p, st, view: E.newView(), seen: new Map(), xh: E.pageMetrics(p).xh, where: `${seed}/${style}` };
  // every event applied: nothing already on the paper moves
  const put = (events) => {
    E.apply(st, events);
    for (const it of st.page.items) {
      if (!it.key) continue;
      const s = snap(it), was = S.seen.get(it.key);
      if (was == null) S.seen.set(it.key, s);
      else if (was !== s) { fail(`${S.where}: ${it.key} '${it.ch}' moved`); S.seen.set(it.key, s); }
    }
  };
  S.text = () => E.viewText(st, S.view);
  S.ed = (at, del, ins = '', extra = {}) => { const r = E.plan(st, S.view, Object.assign({ at, del, ins, kind: ins ? 'type' : 'delete' }, extra)); S.view = r.view; put(r.events); return r.events; };
  S.type = (t, at, extra) => { for (const ch of t) { S.ed(at == null ? S.text().length : at, 0, ch, extra); extra = undefined; if (at != null) at++; } };
  S.pen = () => { const n = st.doc.log.length; const r = E.penStep(st, S.view, { final: true }); S.view = r.view; put(r.events); return st.doc.log.slice(n); };
  S.again = (at, side) => { const r = E.again(st, S.view, at, side ? { side } : undefined); if (r && r.events.length) { S.view = r.view; put(r.events); } return r; };
  // a Backspace press as the writing page makes it (hold.ts): at a struck word, crossed out harder; otherwise (or inked
  // out already) the letter before the caret, and over a written space on to the word before it (InkSession.edit)
  S.bs = (at = S.text().length, side) => {
    const r = E.again(st, S.view, at, side ? { side } : undefined);
    if (r && r.events.length) { S.view = r.view; put(r.events); return at; }
    let e = { at: at - 1, del: 1, ins: '', kind: 'delete' };
    const w = E.backOverSpace ? E.backOverSpace(st, S.view, e) : null;
    if (w) e = Object.assign(e, w.edit);
    S.ed(e.at, e.del, '');
    return w ? w.caret : at - 1;
  };
  S.replays = () => {
    const doc = E.decodeDoc(E.encodeDoc(st.doc));
    return E.renderSVG(p, E.replay(E.makeHand(seed, style), doc, opts).page, SVG) === E.renderSVG(p, st.page, SVG) && E.logicalText(doc) === S.text();
  };
  return S;
}
const glyphsOf = (S, pred) => S.st.page.items.filter((it) => it.kind === 'glyph' && it.g && it.g.strokes.length && pred(it));
const span = (items) => ({ x0: Math.min(...items.map((it) => it.box[0])), x1: Math.max(...items.map((it) => it.box[2])), y: items.reduce((a, it) => a + it.y, 0) / items.length });
const LONG = 'The old harbour at dawn was quiet and grey, the boats were tied up along the wall and nobody moved at all';

for (const [seed, style] of HANDS) {
  const bad = [];
  // 1. typing right after an insertion carries it on, above the line
  {
    const S = session(seed, style, 'c1');
    S.type('The old harbour at dawn'); S.pen();
    const at = S.text().indexOf(' harbour') + 1;
    S.type('little', at); S.pen();
    const n0 = S.st.doc.log.length, little = glyphsOf(S, (it) => it.role === 'insert');
    S.type(' new', at + 6); S.pen();
    const evs = S.st.doc.log.slice(n0);
    const nw = glyphsOf(S, (it) => it.role === 'insert' && it.ev >= n0);
    if (evs.some((e) => e.t === 'mark') || !evs.every((e) => e.t === 'insert')) bad.push('1: typing after the insertion made ' + evs.map((e) => e.t + (e.kind ? ':' + e.kind : '')).join(' '));
    if (S.text() !== 'The old little newharbour at dawn') bad.push('1: text ' + JSON.stringify(S.text()));
    const a = span(little), b = nw.length ? span(nw) : null;
    if (!b || b.x0 < a.x1 - 0.1 * S.xh || Math.abs(b.y - a.y) > 0.6 * S.xh) bad.push(`1: " new" isn't written on after "little" (${b ? b.x0.toFixed(0) : '-'} vs ${a.x1.toFixed(0)})`);
    if (!S.replays()) bad.push('1: replay differs');
  }
  // 1b. typing inside an insertion already written (the caret can be put there now: a click on it): never on top of it,
  // a tier up, above it (insert.up, a new field: logs without it draw as before)
  for (const [name, off] of [['inside', 3], ['at its start', 0]]) {
    const S = session(seed, style, 'c1u');
    S.type('First line of the letter is here and it runs on.\nThe old harbour at dawn was quiet'); S.pen();
    const at = S.text().indexOf(' harbour') + 1;
    S.type('little', at); S.pen();
    const one = glyphsOf(S, (it) => it.role === 'insert'), n0 = S.st.doc.log.length;
    S.type('XY', at + off); const evs = S.pen();
    const two = glyphsOf(S, (it) => it.role === 'insert' && it.ev >= n0);
    // (cramped between the line above and the insertion, a tail may touch a tall letter under it: never a letter's body)
    const hit = (a, b) => { const cx = (a.box[0] + a.box[2]) / 2, cy = (a.box[1] + a.box[3]) / 2; return cx > b.box[0] && cx < b.box[2] && cy > b.box[1] && cy < b.box[3]; };
    const want = 'little'.slice(0, off) + 'XY' + 'little'.slice(off);
    if (!evs.some((e) => e.t === 'insert' && e.up) || !S.text().includes('old ' + want + 'harbour')) bad.push(`1b: typing ${name} an insertion: ${JSON.stringify(evs)} ${JSON.stringify(S.text())}`);
    if (two.length !== 2 || two.some((a) => one.some((b) => hit(a, b))) || !(span(two).y < span(one).y - 0.5 * S.xh)) bad.push(`1b: typing ${name} an insertion wrote on top of it`);
    if (!S.replays()) bad.push('1b: replay differs');
  }
  // 2. typing right after a word crossed out, mid-text: written above it, in its place
  {
    const S = session(seed, style, 'c2');
    S.type('The old harbour at dawn'); S.pen();
    const at = S.text().indexOf('harbour');
    S.ed(at, 7, '');
    const struck = glyphsOf(S, (it) => it.role === 'struck');
    S.type('port', at); const evs = S.pen();
    const ins = evs.find((e) => e.t === 'insert');
    const ids = struck.map((it) => it.id);
    if (!ins || !ins.over || ins.over[0] !== Math.min(...ids) || ins.over[1] !== Math.max(...ids)) bad.push('2: not a substitution over the struck word: ' + JSON.stringify(ins));
    const w = glyphsOf(S, (it) => it.role === 'insert'), a = span(struck), b = span(w), base = a.y;
    if ((b.x0 + b.x1) / 2 < a.x0 || (b.x0 + b.x1) / 2 > a.x1 || !(b.y < base - 0.8 * S.xh)) bad.push(`2: the replacement isn't above the struck word (${b.x0.toFixed(0)}–${b.x1.toFixed(0)} over ${a.x0.toFixed(0)}–${a.x1.toFixed(0)})`);
    if (S.text() !== 'The old port at dawn') bad.push('2: text ' + JSON.stringify(S.text()));
    if (!S.replays()) bad.push('2: replay differs');
  }
  {
    // the struck word starts a line: the replacement goes above it, on that line, not at the end of the line before
    const S = session(seed, style, 'c2w');
    S.type(LONG); S.pen();
    const first = glyphsOf(S, (it) => it.line === 1 && it.role !== 'insert').sort((a, b) => a.x - b.x)[0];
    const t = S.text();
    let a = first.at, b = a; while (b < t.length && /\p{L}/u.test(t[b])) b++;
    S.ed(a, b - a, '');
    S.type('XYZ', a); S.pen();
    const w = glyphsOf(S, (it) => it.role === 'insert');
    if (!w.length || w.some((it) => it.line !== 1)) bad.push('2: a struck word starting a line got its replacement on line ' + (w[0] && w[0].line));
  }
  {
    // at the very end: the pen carries on after the struck word
    const S = session(seed, style, 'c2e');
    S.type('The old harbour'); S.pen();
    for (let k = 0; k < 7; k++) S.bs();
    S.pen();
    S.type('port'); const evs = S.pen();
    if (evs.some((e) => e.t === 'insert') || !evs.some((e) => e.t === 'write' && e.text === 'port')) bad.push('2: at the end, typing after a struck word: ' + JSON.stringify(evs));
  }
  // 3. (the planner's part) after an inkout at the pen head, the next press goes on to the word before; the press after
  // that crosses that word out harder, not the inked-out one
  {
    const S = session(seed, style, 'c3');
    S.type('The old harbour'); S.pen();
    for (let k = 0; k < 7; k++) S.bs();
    S.pen();
    for (let k = 0; k < 3; k++) S.bs();
    const lv = S.st.reader.byId.get(8).lv;
    S.bs();
    const pend = (S.view.pending && S.view.pending.ids) || [];
    if (lv !== 4 || !pend.includes(6)) bad.push(`3: after the inkout (level ${lv}) the next press should take "d" of "old": pending ${JSON.stringify(pend)}`);
    S.pen();
    const r = S.again(S.text().length);
    if (!r || !r.events.length || r.events.some((e) => e.from > 7 || e.to < 6)) bad.push('3: the press after should cross "old" out harder: ' + JSON.stringify(r && r.events));
  }
  // 4. Backspace over a written space: on to the word before; every press shows
  {
    const S = session(seed, style, 'c4');
    S.type('Hello we '); S.pen();
    const shows = [];
    for (let k = 0; k < 3; k++) {
      const n = S.st.doc.log.length;
      S.bs(); S.pen();
      const evs = S.st.doc.log.slice(n).filter((e) => e.t === 'strike');
      const inked = evs.some((e) => { for (let id = e.from; id <= e.to; id++) if (/\S/.test(S.st.reader.byId.get(id).ch)) return true; return false; });
      shows.push(inked);
      if (evs.some((e) => { for (let id = e.from; id <= e.to; id++) if (/\S/.test(S.st.reader.byId.get(id).ch)) return false; return true; })) bad.push('4: a crossing-out of nothing but a space');
    }
    if (!shows.every(Boolean)) bad.push('4: a press that shows nothing: ' + JSON.stringify(shows));
    // mid-text: the space stays, the letter before it is struck, the caret right after it
    const M = session(seed, style, 'c4m');
    M.type('The old harbour at dawn'); M.pen();
    const caret = M.bs(8);
    if (caret !== 6 || M.text() !== 'The ol harbour at dawn' || !M.st.reader.byId.get(6).struck) bad.push(`4: mid-text over a space: ${JSON.stringify(M.text())}, caret ${caret}`);
    // a struck space alone (an old log) has nothing to cross out harder: the press goes on
    const O = session(seed, style, 'c4o');
    O.type('Hello we '); O.pen();
    E.apply(O.st, [{ t: 'strike', from: 8, to: 8, how: 'line', why: 'deleted' }]);
    if (E.again(O.st, O.view, O.text().length)) bad.push('4: again() went over a struck space');
  }
  // 5. the thought letters of an insertion being typed: where its ink goes
  for (const [name, setup] of [
    ['an insertion', (S) => { const at = S.text().indexOf(' harbour') + 1; S.type('little ', at); }],
    ['a replacement', (S) => { const at = S.text().indexOf('harbour'); S.ed(at, 7, ''); S.type('port', at); }],
    ['carrying one on', (S) => { const at = S.text().indexOf(' harbour') + 1; S.type('little', at); S.pen(); S.type(' new', at + 6); }],
  ]) {
    const S = session(seed, style, 'c5');
    S.type('The old harbour at dawn'); S.pen();
    setup(S);
    const d = E.draftInsert ? E.draftInsert(S.st, S.view) : null;
    const n0 = S.st.page.items.length;
    S.pen();
    const ink = S.st.page.items.slice(n0).filter((it) => it.kind === 'glyph');
    const at = (list) => list.map((it) => `${it.ch}@${it.x.toFixed(1)},${it.y.toFixed(1)}`).join(' ');
    if (!d || at(d.items) !== at(ink)) bad.push(`5: ${name}: the thought letters aren't where the ink went`);
  }
  // 6. a stop on each side of a struck word; typing before it inserts before it; a click on an insertion goes into it
  {
    const S = session(seed, style, 'c6');
    S.type('The old harbour at dawn'); S.pen();
    S.ed(8, 7, '');
    const ss = S.st.page.struckStops || [];
    const h = glyphsOf(S, (it) => it.role === 'struck').sort((a, b) => a.x - b.x)[0];
    if (ss.length !== 1 || ss[0].o !== 8 || Math.abs(ss[0].x - h.x) > 0.6 * S.xh) bad.push('6: the stop before the struck word: ' + JSON.stringify(ss));
    S.type('grey', 8, { side: 'before' }); const evs = S.pen();
    const ins = evs.find((e) => e.t === 'insert');
    if (!ins || ins.over || ins.after !== 7) bad.push('6: typing before a struck word: ' + JSON.stringify(evs));
    // a click on the insertion's letters, and on the line under it
    const T = session(seed, style, 'c6h');
    T.type('First line of the letter is here and it runs on.\nThe old harbour at dawn was quiet'); T.pen();
    const at = T.text().indexOf(' harbour') + 1;
    T.type('little ', at); T.pen();
    const geo = E.geometry(T.p, T.st.page);
    const inside = glyphsOf(T, (it) => it.role === 'insert').map((it) => geo.hitTest((it.box[0] + it.box[2]) / 2, it.y - 0.4 * T.xh).offset);
    if (inside.some((o) => o < at || o > at + 7)) bad.push('6: a click on the insertion landed at ' + JSON.stringify(inside));
    const hh = glyphsOf(T, (it) => it.id === 'First line of the letter is here and it runs on.\nThe old '.length)[0];
    const below = geo.hitTest((hh.box[0] + hh.box[2]) / 2, hh.y - 0.5 * T.xh).offset;
    if (below > at && below < at + 7) bad.push('6: a click on the line under the insertion went into it');
  }
  // 7. a list item's marker before its words; it's where the ink goes
  for (const as of ['bullet', 'check', 'number']) {
    const S = session(seed, style, 'c7');
    S.type('Shopping'); S.pen();
    E.apply(S.st, [{ t: 'break' }, { t: 'line', as }]);
    const markers = () => (E.draftMarkers ? E.draftMarkers(S.st, S.view, []) : []);
    const d = markers();
    const n0 = S.st.page.items.length;
    S.type('Milk'); S.pen();
    const ink = S.st.page.items.slice(n0).filter((it) => it.role === 'marker');
    const at = (list) => list.map((it) => `${it.kind}${it.mark || it.ch}@${it.x.toFixed(1)},${it.y.toFixed(1)}`).join(' ');
    if (!d.length || at(d) !== at(ink)) bad.push(`7: the ${as} isn't shown before the item's words, where it's drawn`);
    if (markers().length) bad.push(`7: the ${as} still pending once it's drawn`);
  }
  if (bad.length) { for (const b of bad) fail(`${seed}/${style}: ${b}`); }
  else ok(`${seed}/${style}: insertions carried on; struck words replaced in place; on to the word before after an inkout and over spaces; thought letters above the line where their ink goes; a stop each side of a struck word; clicks into insertions; list markers ahead of their words`);
}

// ---------- the writing page's session (app/src/lib/ink.ts), through Vite, when app/ is installed ----------
{
  const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../app');
  const vite = path.join(app, 'node_modules/vite/dist/node/index.js');
  if (!fs.existsSync(vite)) console.log('  · the session checks need app/node_modules (npm ci in app/): skipped');
  else {
    const { createServer } = await import(pathToFileURL(vite).href);
    const server = await createServer({ root: app, configFile: path.join(app, 'vite.config.ts'), server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
    try {
      const I = await server.ssrLoadModule('/src/lib/ink.ts');
      const A = await server.ssrLoadModule('@engine');
      const { getPaper } = await server.ssrLoadModule('/src/lib/papers.ts');
      const paper = getPaper('plain');
      for (const [seed, style] of HANDS) {
        const bad = [];
        try {
        const mk = (salt) => {
          const p = A.makeHand(seed, style);
          const s = new I.InkSession(p, I.newInkDoc(seed, style, salt), I.inkOpts(p, paper, 1, 1).layout, false, null);
          const S = { p, s, caret: 0, xh: A.pageMetrics(p).xh };
          S.type = (t, at) => { for (const ch of t) { const o = at == null ? s.text().length : at; s.edit({ at: o, del: 0, ins: ch, kind: 'type', t: 0, source: 'paper' }); if (at != null) at++; } S.caret = at == null ? s.text().length : at; };
          S.live = () => I.inkLive(p, s.page, paper, 1, 1, s.draft());
          S.geo = () => I.inkGeometry(S.live(), p, s);
          S.x = (o, side) => S.geo().caret(o, side).x;
          // a press as the page makes it (hold.ts, then the textarea's own deletion through InkSession.edit)
          S.bs = (side) => {
            const r = s.again(S.caret, side);
            if (r && !r.max) return;
            const c = s.edit({ at: S.caret - 1, del: 1, ins: '', kind: 'delete', t: 0, source: 'paper', input: 'deleteContentBackward' }, { caret: true });
            S.caret = c == null ? S.caret - 1 : c;
          };
          return S;
        };
        // 3. the caret after a strike, at the pen head: it never jumps forward over the word, or back over a blot
        {
          const S = mk('s3'), s = S.s;
          S.type('The old harbour'); s.flush();
          const end = S.x(S.caret), xs = [];
          for (let k = 0; k < 7; k++) { S.bs(); xs.push(S.x(S.caret)); }
          s.flush(); xs.push(S.x(S.caret));
          for (let k = 0; k < 3; k++) { S.bs(); xs.push(S.x(S.caret)); }
          S.bs(); xs.push(S.x(S.caret)); // the inked-out word's neighbour: "d" (and the space) pending
          s.flush(); xs.push(S.x(S.caret));
          if (xs.some((x) => Math.abs(x - end) > 1)) bad.push('3: the caret moved off the pen head: ' + xs.map((x) => Math.round(x - end)).join(' '));
          if (s.text() !== 'The ol') bad.push('3: text ' + JSON.stringify(s.text()));
          // mid-text: right after the struck word, where its replacement goes
          const M = mk('s3m'), m = M.s;
          M.type('The old harbour at dawn'); m.flush();
          m.edit({ at: 8, del: 7, ins: '', kind: 'delete', t: 0, source: 'paper' });
          const struck = (m.page.items).filter((it) => it.role === 'struck' && it.kind === 'glyph');
          const right = Math.max(...struck.map((it) => it.box[2]));
          if (Math.abs(M.x(8) - right) > 0.8 * M.xh) bad.push(`3: mid-text the caret isn't right after the struck word (${Math.round(M.x(8))} vs ${Math.round(right)})`);
        }
        // 4. Backspace over a written space, dry: every press shows; mid-text the caret is put right after the struck letter
        {
          const S = mk('s4'), s = S.s;
          S.type('Hello we '); s.flush();
          const said = [];
          for (let k = 0; k < 3; k++) { const n = s.doc.log.length; S.bs(); s.flush(); said.push(s.doc.log.slice(n).some((e) => e.t === 'strike' && /\S/.test(s.sheet.reader.byId.get(e.to).ch + s.sheet.reader.byId.get(e.from).ch))); }
          if (!said.every(Boolean)) bad.push('4: a press that showed nothing: ' + JSON.stringify(said));
          const M = mk('s4m'), m = M.s;
          M.type('The old harbour at dawn'); m.flush();
          M.caret = 8; M.bs();
          if (M.caret !== 6 || m.text() !== 'The ol harbour at dawn') bad.push(`4: mid-text: ${JSON.stringify(m.text())} caret ${M.caret}`);
        }
        // 1, 2, 5. typing between two words: grey above the line where it'll be written, the caret after it; carried on
        {
          const S = mk('s5'), s = S.s;
          S.type('The old harbour at dawn'); s.flush();
          const at = s.text().indexOf(' harbour') + 1;
          S.type('little', at);
          const d = s.draft();
          const thoughts = I.inkExtras(S.live(), { draft: d, signed: false, writerName: '' }).thoughts;
          if (!d || !d.ins || d.ins.items.length !== 6 || !thoughts || thoughts.flat().length !== 1) bad.push('5: the insertion being typed has no thought letters');
          const c = S.geo().caret(at + 6), base = s.page.items.find((it) => it.id === 8).y;
          const last = d && d.ins ? d.ins.items[d.ins.items.length - 1] : null;
          if (!c || !(c.y < base - 0.8 * S.xh) || !last || c.x < last.x) bad.push('5: the caret isn\'t after the insertion\'s thought letters, above the line');
          s.flush();
          S.type(' new', at + 6); s.flush();
          if (s.text() !== 'The old little newharbour at dawn' || s.doc.log.some((e) => e.t === 'mark')) bad.push('1: ' + JSON.stringify(s.text()));
          // 2: after a struck word, mid-text
          const R = mk('s2'), r = R.s;
          R.type('The old harbour at dawn'); r.flush();
          r.edit({ at: 8, del: 7, ins: '', kind: 'delete', t: 0, source: 'paper' });
          R.type('port', 8); r.flush();
          const sub = r.doc.log.find((e) => e.t === 'insert');
          if (!sub || !sub.over || r.text() !== 'The old port at dawn') bad.push('2: ' + JSON.stringify(sub));
        }
        // 6. Left/Right across struck words (InkSession's geometry.step), a struck line reachable; a click on an insertion
        {
          const S = mk('s6'), s = S.s;
          S.type('First line\nsecond line words\nthird and more'); s.flush();
          const a = s.text().indexOf('second'), b = s.text().indexOf('third');
          s.edit({ at: a, del: b - a, ins: '', kind: 'delete', t: 0, source: 'paper' });
          const w = s.text().indexOf('and');
          s.edit({ at: w, del: 3, ins: '', kind: 'delete', t: 0, source: 'paper' });
          const stops = [];
          let o = s.text().length, side = 'after';
          for (let k = 0; k < 60 && o >= 0; k++) {
            const g = S.geo(), c = g.caret(o, side);
            stops.push({ o, side, x: c.x, line: c.line });
            const st = g.step ? g.step(o, -1, side) : null;
            if (st) { o = st.o; side = st.side; } else { o--; side = 'after'; }
          }
          const struckLine = (s.page.items).find((it) => it.id === 11).line;
          if (!stops.some((x) => x.line === struckLine)) bad.push('6: the struck line can\'t be reached by arrow');
          const and = stops.filter((x) => x.o === w);
          if (and.length !== 2 || !(and[1].x < and[0].x - 0.5 * S.xh)) bad.push('6: no stop on each side of the struck word: ' + JSON.stringify(and));
          // and back to the right: before it, then after it
          const g = S.geo(), r1 = g.step ? g.step(w - 1, 1, 'after') : null, r2 = r1 && g.step(r1.o, 1, r1.side);
          if (!r1 || r1.o !== w || r1.side !== 'before' || !r2 || r2.side !== 'after') bad.push('6: Right doesn\'t stop before the struck word, then after it');
          const T = mk('s6h'), t = T.s;
          T.type('First line of the letter is here and it runs on.\nThe old harbour at dawn was quiet'); t.flush();
          const at = t.text().indexOf(' harbour') + 1;
          T.type('little ', at); t.flush();
          const live = T.live(), geo = I.inkGeometry(live, T.p, t);
          const shift = live.sheets[0].shiftU;
          const hits = t.page.items.filter((it) => it.role === 'insert' && it.kind === 'glyph').map((it) => geo.hit(0, (it.box[0] + it.box[2]) / 2, it.y - 0.4 * T.xh - shift));
          if (hits.some((h) => h < at || h > at + 7)) bad.push('6: a click on the insertion went to ' + JSON.stringify(hits));
        }
        // 7. the pending marks: a list item with nothing written yet, and a P.S.
        {
          const S = mk('s7'), s = S.s;
          S.type('Shopping\n'); s.flush();
          S.type('- ');
          const d = s.draft();
          if (!d || !d.marker || !d.marker.items.length || !I.inkExtras(S.live(), { draft: d, signed: false, writerName: '' }).thoughts.flat().length) bad.push('7: no bullet shown for an empty list item');
          const P = mk('s7p'), q = P.s;
          P.type('Hello there, this is a note.'); q.flush();
          P.type('\n\nP.S. Bring maps');
          const dp = q.draft(), n0 = q.page.items.length;
          const pos = (list) => list.filter((it) => it.kind === 'glyph').map((it) => `${it.ch}@${it.x.toFixed(1)},${it.y.toFixed(1)}`).join(' ');
          const drafted = pos(dp.items);
          q.flush();
          if (drafted !== pos(q.page.items.slice(n0))) bad.push('7: the P.S. isn\'t shown where its ink goes');
        }
        } catch (err) { bad.push('threw ' + String(err && err.stack).split('\n').slice(0, 2).join(' | ')); }
        if (bad.length) { for (const b of bad) fail(`session ${seed}/${style}: ${b}`); }
        else ok(`session ${seed}/${style}: the caret stays at the pen head through a strike and an inkout; every ⌫ over a space shows; an insertion's thought letters with the caret after them; a stop each side of struck words and lines; clicks into insertions; a pending bullet; the P.S. where its ink goes`);
      }
    } finally { await server.close(); }
  }
}

// ---------- old logs: the same pages ----------
{
  const file = path.join(QA_DIR, 'data', 'cursor-old-logs.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let same = 0;
  for (const l of data.logs) {
    const doc = E.decodeDoc(l.doc);
    if (E.encodeDoc(doc) !== l.doc) fail(`old log ${l.seed} (${l.name}): the compact form changed`);
    if (E.logicalText(doc) !== l.text) fail(`old log ${l.seed} (${l.name}): the letter says ${JSON.stringify(E.logicalText(doc))}`);
    const p = E.makeHand(l.seed, l.style);
    const h = sha(E.renderSVG(p, E.replay(p, doc, l.opts).page, SVG));
    if (update) l.svg = h;
    else if (h !== l.svg) fail(`old log ${l.seed} (${l.name}): replays to a different page`);
    else same++;
  }
  if (update) { fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n'); console.log(`  old logs: ${data.logs.length} pages measured again`); }
  else console.log(`  old logs: ${same}/${data.logs.length} replay to the same page as before the cursor fixes`);
}

console.log(`\n${fails ? `FAIL: ${fails} problems` : 'PASS'}`);
process.exit(fails ? 1 : 0);

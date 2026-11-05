// inklog.js — the ink log: an append-only list of what the pen did (writing-experience.md §4).
// The log is the source of truth for Ink mode (sheet.js) and for the writer's journey (corrections.js).
// What the letter *says* is derived from it, never stored.
//
// Events. Glyph ids count every character ever written, in the order it was written, spaces and
// paragraph breaks included (a break is the character '\n'). Ids are never reused or renumbered.
//   write  { text, cont?, rest? }           written at the pen head (no '\n'); each character takes the next id.
//                                            cont: the next write runs straight on (no pause; one word).
//                                            rest: a piece that stopped mid-word: the rest of that word as typed
//                                            so far (layout measures the whole word for the line end)
//   break  { }                              Enter at the pen head: a new paragraph; takes an id ('\n')
//   strike { from, to, how?, why?, blot?, lv? }  ids inclusive. how: line | double | wave | loops | scribble, and
//                                            for why 'again' (crossed out again, lv 2–4) blackout | inkout
//   over   { at, ch, blot? }                a new letter drawn on top of glyph `at`
//   insert { after, text, over? }           text added above the line, right after glyph `after` (-1 = the
//                                            very start); its characters take new ids. over: [from, to] = a
//                                            substitution written above that struck run (TEI <subst>)
//   mark   { after, kind }                  'split' (a / in a word: a space, takes an id), 'para' (//: a
//                                            paragraph break, takes an id), 'join' (the whitespace after
//                                            `after` no longer counts)
//   underline { from, to }                  emphasis
//   pen    { kind, from?, to? }             'dry' (those glyphs came out faint), 'retrace' (gone over again),
//                                            'restart' (fresh ink)
//   move   { to: 'ps', size? }              the pen goes below the text for a P.S.
//   sheet  { why, copy? }                   'next' (the page is full: the text continues), 'fresh' (start
//                                            over: the old sheet becomes a draft), 'fair' (a fair copy: a fresh
//                                            sheet; the copy's own write events follow: `copy` of them)
//   session { }                             reopened later (v2)
//
// Reading order (§4.3): writes append, an insert splices directly after its anchor, so continued typing
// after the last inserted character grows the same insertion. Struck glyphs drop out of the text; an
// over replaces its glyph's character (the newest wins); sheet fresh/fair starts a new text.

// ---------- reading the log ----------
// A reader applies events one by one and keeps the text in reading order. sheet.js keeps one live.
export function createReader() {
  const R = {
    recs: [],          // current text, reading order: { id, ch, struck?, how?, over?, ins?, under?, joined?, faint? }
    byId: new Map(),   // id -> rec (all sheets)
    nextId: 0,
    events: 0,         // events applied
    drafts: [],        // texts of sheets set aside by 'fresh' / 'fair'
    counts: { struck: 0, scribbled: 0, over: 0, inserted: 0, underlined: 0, split: 0, para: 0 },
    apply(e) { applyEvent(R, e); R.events++; return R; },
    clone() {
      const C = createReader();
      const map = new Map();
      for (const [id, r] of R.byId) { const c = Object.assign({}, r); map.set(r, c); C.byId.set(id, c); }
      C.recs = R.recs.map((r) => map.get(r) || Object.assign({}, r));
      C.nextId = R.nextId; C.events = R.events; C.drafts = R.drafts.slice(); C.counts = Object.assign({}, R.counts);
      return C;
    },
  };
  return R;
}

function add(R, ch, extra) {
  const r = Object.assign({ id: R.nextId++, ch }, extra);
  R.byId.set(r.id, r);
  return r;
}
const indexOfId = (R, id) => { const r = R.byId.get(id); return r ? R.recs.indexOf(r) : -1; };

function applyEvent(R, e) {
  switch (e && e.t) {
    case 'write': for (const ch of e.text || '') R.recs.push(add(R, ch)); break;
    case 'break': R.recs.push(add(R, '\n')); break;
    case 'strike': {
      if (e.why === 'again') { // crossed out again (sheet.js again()): the same words, harder; nothing new is struck
        for (let i = e.from; i <= e.to; i++) { const r = R.byId.get(i); if (r && r.struck) { r.struck = e.how || r.struck; r.lv = Math.max(r.lv || 1, e.lv || 2); } }
        break;
      }
      for (let i = e.from; i <= e.to; i++) { const r = R.byId.get(i); if (r && !r.struck) { r.struck = e.how || 'line'; r.why = e.why; } }
      R.counts[e.how === 'scribble' ? 'scribbled' : 'struck']++;
      break;
    }
    case 'over': { const r = R.byId.get(e.at); if (r) { if (r.was == null) r.was = r.ch; r.over = e.ch; R.counts.over++; } break; }
    case 'insert': {
      const k = e.after < 0 ? -1 : indexOfId(R, e.after);
      const recs = Array.from(e.text || '', (ch) => add(R, ch, { ins: true, sub: !!e.over }));
      R.recs.splice(k < 0 && e.after >= 0 ? R.recs.length : k + 1, 0, ...recs);
      R.counts.inserted++;
      break;
    }
    case 'mark': {
      const k = e.after < 0 ? -1 : indexOfId(R, e.after);
      if (e.kind === 'split' || e.kind === 'para') {
        R.recs.splice(k + 1, 0, add(R, e.kind === 'split' ? ' ' : '\n', { mark: e.kind }));
        R.counts[e.kind]++;
      } else if (e.kind === 'join') {
        for (let i = k + 1; i < R.recs.length; i++) {
          const r = R.recs[i];
          if (r.struck || r.joined) continue;
          if (!/\s/.test(r.ch)) break;
          r.joined = true;
        }
      }
      break;
    }
    case 'underline': for (let i = e.from; i <= e.to; i++) { const r = R.byId.get(i); if (r) r.under = true; } R.counts.underlined++; break;
    case 'pen': if (e.kind === 'dry') for (let i = e.from; i <= e.to; i++) { const r = R.byId.get(i); if (r) r.faint = true; } break;
    case 'sheet':
      if (e.why === 'fresh' || e.why === 'fair') { // a new text: the old one is a draft, its corrections with it
        R.drafts.push(textOf(R.recs)); R.recs = [];
        for (const k in R.counts) R.counts[k] = 0;
      }
      break;
    default: break; // move, session, unknown: no effect on the text
  }
}

const live = (r) => !r.struck && !r.joined;
const textOf = (recs) => recs.filter(live).map((r) => r.over || r.ch).join('');

// ---------- what the letter says ----------
// Accepts an event list, a doc ({ log }) or a reader.
// accepts a reader, a sheet state ({ reader }), a doc ({ log }) or an event list
const asReader = (x) => (x && x.recs && x.byId ? x : x && x.reader ? x.reader : (() => { const R = createReader(); for (const e of (x && x.log) || x || []) R.apply(e); return R; })());
export function logicalText(x) { return textOf(asReader(x).recs); }

// The diplomatic transcription: "Dear [struck: Jon] John, it was a [inserted: very] good day", letters
// written over as [a→o], for screen readers ("Read corrections") and "Copy with corrections".
export function transcription(x) {
  const R = asReader(x);
  const recs = R.recs;
  const kindOf = (q) => (q.joined ? 'joined' : q.struck ? (q.struck === 'inkout' ? 'inked out' : q.struck === 'scribble' || q.struck === 'blackout' ? 'scribbled out' : 'struck') : q.ins ? 'inserted' : q.under ? 'underlined' : null);
  let out = '';
  for (let i = 0; i < recs.length;) {
    const r = recs[i], kind = kindOf(r);
    if (!kind) { out += r.over ? `[${r.was}→${r.over}]` : r.ch; i++; continue; }
    let j = i, s = '';
    while (j < recs.length && kindOf(recs[j]) === kind && recs[j].ch !== '\n') { s += recs[j].over || recs[j].ch; j++; }
    if (j === i) { out += kind === 'joined' ? '' : r.ch; i++; continue; } // a struck paragraph break: the paragraphs join
    // a struck or inserted run carries its own space: keep it outside the brackets
    const lead = s.match(/^ */)[0], trail = s.slice(lead.length).match(/ *$/)[0], core = s.trim();
    out += kind === 'joined' ? '' : core ? lead + `[${kind}: ${core}]` + trail : (kind === 'struck' || kind === 'scribbled out' || kind === 'inked out' ? '' : s);
    i = j;
  }
  return out;
}

// "2 words crossed out, 1 letter written over, 1 word added above the line"
export function summary(x) {
  const c = asReader(x).counts;
  const say = (n, one, many) => (n ? `${n} ${n === 1 ? one : many}` : '');
  return [say(c.struck, 'word crossed out', 'words crossed out'), say(c.scribbled, 'word scribbled out', 'words scribbled out'),
    say(c.over, 'letter written over', 'letters written over'), say(c.inserted, 'word added above the line', 'words added above the line'),
    say(c.underlined, 'underline', 'underlines')].filter(Boolean).join(', ');
}

// ---------- compact form and share links (§4.6) ----------
// Each event becomes a short array: ["w","Dear Ada,"] ["b"] ["x",12,15,"line","misspelt"] ["o",40,"G"]
// ["i",52,"very "] ["m",9,"split"] ["u",3,7] ["p","dry",3,9] ["v","ps"] ["s","fresh"] ["n"]. Trailing
// empty fields are dropped; anything unknown is kept as its object.
const ENC = {
  write: (e) => ['w', e.text, e.cont ? 1 : 0, e.rest], break: () => ['b'],
  strike: (e) => ['x', e.from, e.to, e.how, e.why, e.blot ? 1 : 0, e.lv],
  over: (e) => ['o', e.at, e.ch, e.blot ? 1 : 0],
  insert: (e) => ['i', e.after, e.text, e.over ? e.over[0] : null, e.over ? e.over[1] : null],
  mark: (e) => ['m', e.after, e.kind], underline: (e) => ['u', e.from, e.to],
  pen: (e) => ['p', e.kind, e.from, e.to], move: (e) => ['v', e.to, e.size], sheet: (e) => ['s', e.why, e.copy], session: () => ['n'],
};
const DEC = {
  w: (a) => clean({ t: 'write', text: a[1], cont: a[2] ? true : undefined, rest: a[3] }), b: () => ({ t: 'break' }),
  x: (a) => clean({ t: 'strike', from: a[1], to: a[2], how: a[3], why: a[4], blot: a[5] ? true : undefined, lv: a[6] || undefined }),
  o: (a) => clean({ t: 'over', at: a[1], ch: a[2], blot: a[3] ? true : undefined }),
  i: (a) => clean({ t: 'insert', after: a[1], text: a[2], over: a[3] != null ? [a[3], a[4]] : undefined }),
  m: (a) => ({ t: 'mark', after: a[1], kind: a[2] }), u: (a) => ({ t: 'underline', from: a[1], to: a[2] }),
  p: (a) => clean({ t: 'pen', kind: a[1], from: a[2], to: a[3] }), v: (a) => clean({ t: 'move', to: a[1], size: a[2] }),
  s: (a) => clean({ t: 'sheet', why: a[1], copy: a[2] }), n: () => ({ t: 'session' }),
};
function clean(o) { for (const k in o) if (o[k] === undefined || o[k] === null) delete o[k]; return o; }
const trim = (a) => { while (a.length > 1 && (a[a.length - 1] == null || a[a.length - 1] === 0 || a[a.length - 1] === '')) a.pop(); return a; };
export const encodeEvent = (e) => (ENC[e.t] ? trim(ENC[e.t](e)) : e);
export const decodeEvent = (a) => (Array.isArray(a) && DEC[a[0]] ? DEC[a[0]](a) : a);

// a doc as a compact JSON string, and back
export function encodeDoc(doc) {
  const h = doc.hand || {};
  return JSON.stringify({ v: doc.v || 1, ev: doc.ev, s: doc.salt, h: [h.seed, h.style, h.o], p: doc.paper, m: doc.mode, l: (doc.log || []).map(encodeEvent) });
}
export function decodeDoc(str) {
  const o = typeof str === 'string' ? JSON.parse(str) : str;
  const [seed, style, ov] = o.h || [];
  return clean({ v: o.v || 1, ev: o.ev, salt: o.s, hand: clean({ seed, style, o: ov }), paper: o.p, mode: o.m, log: (o.l || []).map(decodeEvent) });
}

// `#ink=` share links: deflate-raw + base64url ('1.'), or plain base64url ('0.') where the platform has
// no CompressionStream. Async because CompressionStream is. The hash never reaches a server.
const b64u = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; };
async function pipe(bytes, Stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw')));
  return new Uint8Array(await res.arrayBuffer());
}
export async function encodeInkLink(doc) {
  const raw = new TextEncoder().encode(encodeDoc(doc));
  if (typeof CompressionStream !== 'function') return '0.' + b64u(raw);
  return '1.' + b64u(await pipe(raw, CompressionStream));
}
export async function decodeInkLink(str) {
  const s = String(str || '').replace(/^#?(ink=)?/, '');
  const dot = s.indexOf('.');
  const kind = s.slice(0, dot), bytes = unb64u(s.slice(dot + 1));
  const raw = kind === '1' ? await pipe(bytes, DecompressionStream) : bytes;
  return decodeDoc(new TextDecoder().decode(raw));
}

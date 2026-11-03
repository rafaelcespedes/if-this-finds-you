// lab/app.js — the engine lab: a plain test bench for the handwriting engine.
// Controls are generated from the engine's PARAMS, so new engine features show up here automatically.
// (The polished product UI lives in app/; this page is for building and checking the engine.)
import * as E from '../engine/index.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const EM_PX = +q.get('size') || 58; // preview size: 1 em in px (?size=120 for close-ups)
const LINE = 1.6;                   // line height in em

const DEFAULT_TEXT = 'Dear Ada,\nthe little letters never quite match, and that is the point.\nSee you at 7:30 - bring the old maps & a good pen!\nThe quick brown fox jumps over the lazy dog. 0123456789';

const WORDS_A = ['maple', 'quiet', 'amber', 'salt', 'river', 'paper', 'velvet', 'cedar', 'misty', 'lunar', 'honey', 'wild', 'copper', 'olive', 'north', 'ink', 'soft', 'linen', 'ember', 'fern'];
const WORDS_B = ['river', 'harbor', 'sparrow', 'meadow', 'lantern', 'pebble', 'orchard', 'comet', 'thistle', 'willow', 'canyon', 'heron', 'garden', 'atlas', 'quill', 'moth', 'tide', 'birch', 'kettle', 'fable'];
const randomSeed = () => {
  const a = WORDS_A[Math.floor(Math.random() * WORDS_A.length)];
  let b = WORDS_B[Math.floor(Math.random() * WORDS_B.length)];
  if (b === a) b = WORDS_B[(WORDS_B.indexOf(b) + 1) % WORDS_B.length];
  return `${a}-${b}-${Math.floor(Math.random() * 90 + 10)}`;
};

const state = { seed: 'maple-river-42', style: 'print', mode: 'live', paper: 'plain', calt: true, overrides: {}, hand: null, fontCache: null, fontFaceN: 0, player: null, page: null };
const FORMAT = {
  pct: (v) => Math.round(v * 100) + '%',
  deg: (v) => (v > 0 ? '+' : '') + (+v).toFixed(1) + '°',
  int: (v) => String(Math.round(v)),
};
const fmt = (d, v) => (FORMAT[d.format] || ((x) => (+x).toFixed(2)))(v);

// ---------- hand + params ----------
const params = () => E.withOverrides(state.hand, state.overrides);
// Neat only is a preference, not part of a hand: it survives New hand and the reset button
const keepNeat = () => (state.overrides.neatOnly ? { neatOnly: state.overrides.neatOnly } : {});
function setHand(seed, resetControls) {
  state.seed = seed;
  state.hand = E.makeHand(seed, state.style);
  if (resetControls) state.overrides = keepNeat();
  syncControls();
  invalidateFont();
  writeHash();
  render();
}

// ---------- controls generated from E.PARAMS ----------
function buildControls() {
  const host = $('controls');
  host.innerHTML = '';
  const groups = new Map();
  for (const d of E.PARAMS) {
    if (!groups.has(d.group)) {
      const g = document.createElement('div');
      g.className = 'group';
      g.innerHTML = `<div class="label">${d.group}</div>`;
      host.appendChild(g); groups.set(d.group, g);
    }
    const wrap = document.createElement('div');
    if (d.type === 'select') {
      wrap.className = 'slider';
      wrap.innerHTML = `<label for="c-${d.key}">${d.label}</label><span></span><select id="c-${d.key}"></select>`;
      const sel = wrap.querySelector('select');
      for (const o of d.options()) sel.add(new Option(o.label, o.value));
      sel.addEventListener('change', () => { state.overrides[d.key] = sel.value; if (d.key === 'neatOnly') writeHash(); invalidateFont(); render(); });
    } else {
      wrap.className = 'slider';
      wrap.innerHTML = `<label for="c-${d.key}">${d.label}</label><output id="o-${d.key}"></output>` +
        `<input id="c-${d.key}" type="range" min="${d.min}" max="${d.max}" step="${d.step}">`;
      const inp = wrap.querySelector('input');
      inp.addEventListener('input', () => {
        state.overrides[d.key] = parseFloat(inp.value);
        $('o-' + d.key).textContent = fmt(d, state.overrides[d.key]);
        invalidateFont(); render();
      });
    }
    groups.get(d.group).appendChild(wrap);
  }
  const reset = document.createElement('button');
  reset.className = 'linkbtn'; reset.textContent = 'Back to this seed’s natural hand';
  reset.addEventListener('click', () => { state.overrides = keepNeat(); syncControls(); invalidateFont(); render(); });
  host.appendChild(reset);
}
function syncControls() {
  const p = params();
  for (const d of E.PARAMS) {
    const el = $('c-' + d.key); if (!el) continue;
    const v = p[d.key] ?? (typeof d.default === 'function' ? d.default(p) : d.natural ? d.natural(p) : d.default);
    el.value = v;
    if (d.type !== 'select') $('o-' + d.key).textContent = fmt(d, v);
  }
}
function buildStyleSwitch() {
  const root = $('style');
  root.innerHTML = E.styleNames().map((n) => `<button data-v="${n}">${E.getStyle(n).label || n}</button>`).join('');
}

// ---------- missing characters: logged so we learn what people actually type ----------
const missLog = new Map();
function noteMisses(list) {
  for (const ch of list) {
    const n = missLog.get(ch) || 0;
    if (!n) console.info(`[seedhand] missing glyph U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} "${ch}"`);
    missLog.set(ch, n + 1);
  }
}

// ---------- live view ----------
function renderLive() {
  const host = $('live');
  const W = Math.max(280, host.clientWidth || 800);
  if (ink.renderer !== 'svg') return renderLiveInk(host, W);
  const p = params();
  const ruled = state.paper === 'ruled';
  // plain paper: the hand's own line spacing; ruled: notebook rules a little roomier than the hand needs
  const paper = ruled ? { ruled, lineHeight: Math.max(1.2 * E.UPM, 1.05 * E.pageMetrics(p).pitch), firstBaseline: 1.1 * E.UPM } : {};
  const page = labLayout(p, $('text').value, Object.assign({ maxWidth: W / (EM_PX / E.UPM) }, paper));
  noteMisses(page.misses);
  stopWriting();
  host.innerHTML = E.renderSVG(p, page, { width: W, emPx: EM_PX, strokeIds: true, rules: ruled });
  state.page = page;
}

// ---------- write it: the stroke-by-stroke animation ----------
function stopWriting() {
  if (state.player) state.player.destroy();
  state.player = null;
  $('write').textContent = 'Write it';
}
function writeIt() {
  const svg = ink.renderer === 'svg' ? $('live').querySelector('svg') : null;
  if (!state.page || (ink.renderer === 'svg' && !svg)) return;
  if (state.player && state.player.playing) { state.player.pause(); $('write').textContent = 'Resume'; return; }
  if (!state.player) {
    const onEnd = () => { $('write').textContent = 'Write it again'; };
    if (svg) state.player = E.playSVG(svg, state.page, { emPx: EM_PX, rate: +$('speed').value, onEnd });
    else {
      // canvas: the same timeline, drawn through renderCanvas's reveal(item, stroke) -> 0..1
      const { p, page, paneW, EM_PX: em } = ink.last;
      const tl = E.timeline(page);
      const idx = new Map(page.items.map((it, i) => [it, i]));
      const evOf = new Map(tl.events.map((e, n) => [e.item + ':' + e.stroke, n]));
      const paper = { preset: ink.paper, color: ink.paper === 'cream' ? undefined : LAB_PAPER };
      state.player = E.createPlayer(tl, (t) => {
        const f = E.frameAt(tl, t);
        const reveal = (it, si) => {
          const n = evOf.get(idx.get(it) + ':' + si);
          return n == null ? 1 : n < f.done ? 1 : f.active && n === f.done ? f.frac : 0;
        };
        E.renderCanvas(ink.canvas, p, page, { width: paneW, emPx: em, paper, reveal });
      }, { rate: +$('speed').value, onEnd });
    }
    state.player.replay();
  } else state.player.play();
  $('write').textContent = state.player.playing ? 'Pause' : 'Write it again';
}

// ---------- ink renderers: SVG (vector / export) vs canvas (live ink density), side by side ----------
const ink = { renderer: q.get('renderer') || 'canvas', paper: q.get('paper') || 'plain', canvas: null, stats: null, layoutMs: 0 };
const LAB_PAPER = [255, 253, 248]; // matches .paper so the canvas edge disappears
function buildInkControls() {
  const style = document.createElement('style');
  style.textContent = `#live canvas { display: block; }
    .cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .cmp h4 { margin: 0 0 6px; font: 600 11px/1 ui-sans-serif, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
    .cmp svg { display: block; width: 100%; height: auto; overflow: visible; }`;
  document.head.appendChild(style);
  const g = document.createElement('div');
  g.className = 'group';
  g.innerHTML = `<div class="label">Renderer</div>
    <div class="seg" id="renderer"><button data-v="svg">SVG</button><button data-v="canvas">Canvas</button><button data-v="both">Both</button></div>
    <div class="slider"><label for="paperSel">Paper</label><span></span><select id="paperSel">${
      Object.entries(E.PAPERS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></div>`;
  $('controls').after(g);
  const sync = () => g.querySelectorAll('#renderer button').forEach((b) => b.classList.toggle('on', b.dataset.v === ink.renderer));
  g.querySelector('#renderer').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    ink.renderer = b.dataset.v; sync(); render();
  });
  const sel = g.querySelector('#paperSel');
  sel.value = ink.paper;
  sel.addEventListener('change', () => { ink.paper = sel.value; render(); });
  sync();
}
// Size (x-height in mm) zooms the writing; the pen keeps its physical width (engine: penWidthUnits)
FORMAT.mm = (v) => (+v).toFixed(1) + ' mm';
const liveEmPx = (p) => EM_PX * (+p.size > 0 ? p.size / E.handSize(p) : 1);
function renderLiveInk(host, W) {
  const p = params();
  const EM_PX = liveEmPx(p);
  const both = ink.renderer === 'both';
  const paneW = both ? Math.floor((W - 16) / 2) : W;
  const t0 = performance.now();
  const ruled = state.paper === 'ruled';
  const paperOpts = ruled ? { ruled, lineHeight: Math.max(1.2 * E.UPM, 1.05 * E.pageMetrics(p).pitch), firstBaseline: 1.1 * E.UPM } : {};
  const page = labLayout(p, $('text').value, Object.assign({ maxWidth: paneW / (EM_PX / E.UPM) }, paperOpts));
  ink.layoutMs = performance.now() - t0;
  noteMisses(page.misses);
  stopWriting();
  state.page = page; ink.last = { p, page, paneW, EM_PX };
  if (!ink.canvas) ink.canvas = document.createElement('canvas');
  const paper = { preset: ink.paper, color: ink.paper === 'cream' ? undefined : LAB_PAPER };
  if (both) {
    if (!host.querySelector('.cmp')) host.innerHTML = '<div class="cmp"><div><h4>SVG · export</h4><div class="svgpane"></div></div><div><h4>Canvas · live ink</h4><div class="cvpane"></div></div></div>';
    host.querySelector('.svgpane').innerHTML = E.renderSVG(p, page, { width: paneW, emPx: EM_PX });
    const cv = host.querySelector('.cvpane');
    if (ink.canvas.parentNode !== cv) cv.appendChild(ink.canvas);
  } else if (ink.canvas.parentNode !== host || host.children.length !== 1) { host.innerHTML = ''; host.appendChild(ink.canvas); }
  ink.stats = E.renderCanvas(ink.canvas, p, page, { width: paneW, emPx: EM_PX, paper });
  const s = ink.stats;
  $('tag').textContent = `${both ? 'SVG | CANVAS' : 'CANVAS'} · ${s.pen} · ${s.ink} · layout ${ink.layoutMs.toFixed(0)} ms · ink ${s.ms.toFixed(1)} ms` +
    (s.fallback ? ' (2D fallback)' : ` · ${s.layers} layers`);
}
// QA: a magnified sheet of pens × seeds over the page (click to close). 1 device px = `zoom` CSS px.
function penSheet({ text = 'minimum Hello, quick', pens = Object.keys(E.PENS).filter((k) => k !== 'auto' && k !== 'classic'),
  seeds = ['maple-river-42', 'quiet-heron-17', 'amber-comet-63'], style = state.style, emPx = 64, cellW = 420, zoom = 1, ink, paper = 'plain', overrides = {} } = {}) {
  let o = document.getElementById('pensheet');
  if (o) o.remove();
  o = document.createElement('div');
  o.id = 'pensheet';
  o.style.cssText = 'position:fixed;inset:0;z-index:99;overflow:auto;background:#e9e6df;padding:8px;display:grid;gap:6px;' +
    `grid-template-columns:90px repeat(${seeds.length}, ${cellW * zoom}px);font:11px ui-sans-serif,sans-serif;color:#555`;
  o.addEventListener('click', () => o.remove());
  o.innerHTML = '<div></div>' + seeds.map((sd) => `<div>${sd}</div>`).join('');
  for (const pen of pens) {
    o.insertAdjacentHTML('beforeend', `<div style="align-self:center">${pen}</div>`);
    for (const sd of seeds) {
      const p = E.withOverrides(E.makeHand(sd, style), Object.assign({ pen }, ink ? { ink } : {}, overrides));
      const page = E.layout(p, text, { maxWidth: cellW / (emPx / E.UPM), lineHeight: LINE * E.UPM });
      const cv = document.createElement('canvas');
      E.renderCanvas(cv, p, page, { width: cellW, emPx, dpr: 2, paper: { preset: paper, color: LAB_PAPER }, style: false });
      cv.style.width = cellW * zoom + 'px'; cv.style.height = (cv.height / 2) * zoom + 'px'; cv.style.imageRendering = 'pixelated';
      o.appendChild(cv);
    }
  }
  document.body.appendChild(o);
}
// QA: time layout and the canvas renderer on a ~600-character paragraph (warm runs)
function benchInk({ chars = 600, runs = 12, width = 760, emPx = EM_PX } = {}) {
  const base = 'The quick brown fox jumps over the lazy dog. Dear Ada, the little letters never quite match, and that is the point. See you at 7:30 - bring the old maps & a good pen! ';
  let text = ''; while (text.length < chars) text += base; text = text.slice(0, chars);
  const p = params();
  const cv = document.createElement('canvas');
  const page = E.layout(p, text, { maxWidth: width / (emPx / E.UPM), lineHeight: LINE * E.UPM });
  const read = () => cv.getContext('2d').getImageData(0, 0, 1, 1); // forces the GPU work to finish
  for (let i = 0; i < 3; i++) { E.renderCanvas(cv, p, page, { width, emPx }); read(); }
  const lay = [], geo = [], tot = [], sync = [];
  for (let i = 0; i < runs; i++) {
    let t = performance.now(); E.layout(p, text, { maxWidth: width / (emPx / E.UPM), lineHeight: LINE * E.UPM }); lay.push(performance.now() - t);
    t = performance.now(); const s = E.renderCanvas(cv, p, page, { width, emPx }); tot.push(performance.now() - t); geo.push(s.geometryMs);
    read(); sync.push(performance.now() - t);
  }
  const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
  let t = performance.now(); for (let i = 0; i < 4; i++) E.renderSVG(p, page, { width, emPx }); const svg = (performance.now() - t) / 4;
  return { chars: text.length, emPx, dpr: devicePixelRatio, canvasPx: [cv.width, cv.height], pen: E.getPen(p).key,
    layoutMs: +med(lay).toFixed(1), canvasMs: +med(tot).toFixed(1), geometryMs: +med(geo).toFixed(1), canvasSyncedMs: +med(sync).toFixed(1), svgMs: +svg.toFixed(1) };
}
// FNV-1a over the canvas pixels: same seed + same text must give the same hash, render after render
function hashCanvas(cv) {
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let h = 0x811c9dc5;
  for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ---------- the journey: the writer's own mistakes and corrections (engine/corrections.js) ----------
// "Show journey" writes the text as a draft: slips written over, words struck and rewritten, a word
// added above the line. The Mistakes slider (Journey group, from E.PARAMS) sets how many.
const journey = { on: q.get('journey') === '1', last: null };
function buildJourneyControls() {
  let g = [...document.querySelectorAll('#controls .group')].find((el) => el.firstChild && el.firstChild.textContent === 'Journey');
  if (!g) { g = document.createElement('div'); g.className = 'group'; g.innerHTML = '<div class="label">Journey</div>'; $('controls').appendChild(g); }
  const row = document.createElement('label');
  row.className = 'check';
  row.innerHTML = '<input type="checkbox" id="journeyOn"> Show journey (the draft, with its corrections)';
  g.insertBefore(row, g.children[1]);
  const info = document.createElement('p');
  info.className = 'hint'; info.id = 'journeyInfo';
  g.appendChild(info);
  const box = $('journeyOn');
  box.checked = journey.on;
  box.addEventListener('change', () => { journey.on = box.checked; render(); });
}
// the page the live view draws: the plain fair copy, or this writer's draft
function labLayout(p, text, opts) {
  const info = $('journeyInfo');
  if (!journey.on) { journey.last = null; if (info) info.textContent = 'Off: a clean fair copy.'; return E.layout(p, text, opts); }
  const j = E.writeWithJourney(p, text, opts);
  journey.last = j;
  if (info) info.textContent = (j.summary || 'No corrections this time.') + (j.ok ? '' : ' (log does not replay!)');
  console.info('[seedhand] journey: ' + j.transcript);
  return j.page;
}
// QA: one letter written by many writers, each with their own little journey (click to close)
function journeySheet({ text = $('text').value, seeds = ['quiet-heron-17', 'maple-river-42', 'amber-comet-63', 'salt-meadow-21', 'velvet-fable-88', 'north-moth-22',
  'ink-atlas-78', 'olive-tide-33', 'ember-lantern-91', 'linen-river-14', 'copper-willow-55', 'fern-quill-30'], styles = ['script', 'print'], cols = 3, emPx = 30, cellW = 460, amount, overrides = {} } = {}) {
  let o = document.getElementById('journeysheet');
  if (o) o.remove();
  o = document.createElement('div');
  o.id = 'journeysheet';
  o.style.cssText = 'position:fixed;inset:0;z-index:99;overflow:auto;background:#e9e6df;padding:10px;display:grid;gap:10px;' +
    `grid-template-columns:repeat(${cols}, ${cellW}px);font:11px/1.35 ui-sans-serif,sans-serif;color:#555;align-items:start`;
  o.addEventListener('click', () => o.remove());
  seeds.forEach((sd, i) => {
    const style = styles[i % styles.length];
    const p = E.withOverrides(E.makeHand(sd, style), overrides);
    const j = E.writeWithJourney(p, text, { maxWidth: (cellW - 24) / (emPx / E.UPM), lineHeight: LINE * E.UPM, firstBaseline: 0.95 * E.UPM }, { amount });
    const cell = document.createElement('div');
    cell.style.cssText = 'background:#fffdf8;border-radius:4px;padding:10px 12px';
    const cv = document.createElement('canvas');
    E.renderCanvas(cv, p, j.page, { width: cellW - 24, emPx, dpr: 2, paper: { preset: 'plain', color: LAB_PAPER }, style: false });
    cv.style.width = (cellW - 24) + 'px'; cv.style.height = (cv.height / 2) + 'px';
    cell.appendChild(cv);
    const cap = document.createElement('div');
    cap.textContent = `${sd} · ${style} · ${E.getPen(p).key} · mistakes ${Math.round(j.amount * 100)}% · ${j.summary || 'clean'}`;
    cell.appendChild(cap);
    o.appendChild(cell);
  });
  document.body.appendChild(o);
}

// ---------- Ink mode: typing that behaves like ink (engine/sheet.js) ----------
// Preview → Ink. The text box becomes the pen: what's already written stays written. Backspace on ink at
// the end gets crossed out (or written over) the writer's way; typing in the middle goes above the line
// with a caret; select + delete strikes; select all + delete takes a fresh sheet. The pen trails your
// typing a little (Forgiving), so quick fixes never reach the paper.
const inkm = { st: null, doc: null, view: null, sig: '', value: '', kind: 'type', timer: 0, last: 0, lastKey: 0, forgiving: true, lastEventAt: 0 };
function buildInkBench() {
  $('mode').insertAdjacentHTML('beforeend', '<button data-v="ink">Ink<small>what’s written stays</small></button>');
  const g = document.createElement('div');
  g.className = 'group hidden'; g.id = 'inkGroup';
  g.innerHTML = `<div class="label">Ink</div>
    <label class="check"><input type="checkbox" id="inkForgiving" checked> Forgiving (the pen trails a little)</label>
    <div class="row2"><button id="inkFair">Make a fair copy</button><button id="inkPS">Add a P.S.</button><button id="inkUndo">Undo (while the ink is wet)</button><button id="inkNew">Start again</button></div>
    <p class="hint" id="inkInfo"></p>`;
  $('mode').parentNode.after(g);
  $('inkForgiving').addEventListener('change', (e) => { inkm.forgiving = e.target.checked; });
  $('inkFair').addEventListener('click', () => { inkFlush(); E.apply(inkm.st, E.fairCopy(inkm.st)); inkSync(); });
  $('inkPS').addEventListener('click', () => { inkFlush(); E.apply(inkm.st, E.postScript(inkm.st)); inkSync(); $('text').focus(); });
  $('inkUndo').addEventListener('click', () => {
    if (performance.now() - inkm.lastEventAt > 3000 || !inkm.doc.log.length) { $('inkInfo').textContent = 'The ink is dry. Cross it out, or start a fresh sheet.'; return; }
    inkm.st = E.dropLast(inkm.st); inkSync();
  });
  $('inkNew').addEventListener('click', () => { inkm.doc = null; inkStart(); });
  const ta = $('text');
  ta.addEventListener('beforeinput', (e) => {
    const t = e.inputType || '';
    inkm.kind = t.startsWith('delete') ? (t === 'deleteByCut' ? 'cut' : 'delete') : t === 'insertFromPaste' ? 'paste' : t === 'insertReplacementText' ? 'replace' : t.startsWith('insertComposition') ? 'compose' : 'type';
  });
  ta.addEventListener('input', () => { if (state.mode === 'ink') inkInput(); });
}
const inkParams = () => params();
const inkOpts = () => ({ maxWidth: Math.max(280, $('live').clientWidth || 800) / (EM_PX / E.UPM), lineHeight: LINE * E.UPM, ruled: state.paper === 'ruled', firstBaseline: 0.95 * E.UPM });
// enter Ink: the text that's in the box is already written; from now on, edits are ink
function inkStart() {
  const p = inkParams();
  inkm.doc = E.newInkDoc({ seed: state.seed, style: state.style, overrides: state.overrides, salt: 'lab' });
  inkm.st = E.replay(p, inkm.doc, inkOpts());
  inkm.view = E.newView();
  const r = E.plan(inkm.st, inkm.view, { at: 0, del: 0, ins: $('text').value, kind: 'paste' });
  E.apply(inkm.st, r.events); inkm.view = r.view;
  inkFlush();
  inkm.sig = inkSig();
  inkm.value = $('text').value;
  clearInterval(inkm.timer);
  inkm.last = performance.now();
  inkm.timer = setInterval(inkTick, 120);
}
const inkSig = () => JSON.stringify([state.seed, state.style, state.overrides, state.paper, Math.round(inkOpts().maxWidth)]);
function inkFlush() { const r = E.penStep(inkm.st, inkm.view, { final: true }); E.apply(inkm.st, r.events); inkm.view = r.view; if (r.events.length) inkm.lastEventAt = performance.now(); }
function inkInput() {
  const ta = $('text'), now = ta.value, old = inkm.value;
  if (now === old) return;
  let a = 0; while (a < old.length && a < now.length && old[a] === now[a]) a++;
  let b = 0; while (b < old.length - a && b < now.length - a && old[old.length - 1 - b] === now[now.length - 1 - b]) b++;
  const edit = { at: a, del: old.length - a - b, ins: now.slice(a, now.length - b), kind: inkm.kind, t: performance.now() };
  const r = E.plan(inkm.st, inkm.view, edit);
  E.apply(inkm.st, r.events); inkm.view = r.view;
  if (r.events.length) inkm.lastEventAt = performance.now();
  inkm.lastKey = performance.now();
  inkSync(true);
}
function inkTick() {
  if (state.mode !== 'ink' || !inkm.st) return;
  const t = performance.now(), dt = t - inkm.last; inkm.last = t;
  const r = E.penStep(inkm.st, inkm.view, { dt, idle: t - inkm.lastKey, forgiving: inkm.forgiving });
  if (r.events.length) { E.apply(inkm.st, r.events); inkm.lastEventAt = t; }
  const changed = r.events.length || JSON.stringify(r.view) !== JSON.stringify(inkm.view);
  inkm.view = r.view;
  if (changed) inkSync(true);
}
// keep the text box on the engine's view of the text (logical text + what the pen hasn't reached)
function inkSync(keepCaret) {
  const ta = $('text'), want = E.viewText(inkm.st, inkm.view);
  if (ta.value !== want) {
    const s0 = ta.selectionStart, s1 = ta.selectionEnd;
    ta.value = want;
    if (keepCaret) ta.setSelectionRange(Math.min(s0, want.length), Math.min(s1, want.length));
  }
  inkm.value = want;
  render();
}
function renderInkMode() {
  $('live').classList.remove('hidden');
  $('fontView').classList.add('hidden');
  $('caltWrap').classList.add('hidden');
  $('inkGroup').classList.remove('hidden');
  if (!inkm.doc) inkStart();
  if (inkSig() !== inkm.sig) { inkm.st = E.replay(inkParams(), inkm.doc, inkOpts()); inkm.sig = inkSig(); }
  const st = inkm.st, host = $('live');
  const W = Math.max(280, host.clientWidth || 800);
  stopWriting();
  host.innerHTML = E.renderSVG(st.p, st.page, { width: W, emPx: EM_PX, strokeIds: true, rules: state.paper === 'ruled' });
  state.page = st.page;
  const v = inkm.view, waiting = v.tail.length + (v.mid ? v.mid.text.length : 0);
  $('tag').textContent = `INK · sheet ${st.page.sheet + 1} · ${inkm.doc.log.length} events · ` + (v.pending ? 'the pen hovers…' : waiting ? `${waiting} to write` : 'all written');
  $('inkInfo').textContent = (E.inkSummary(st) || 'No corrections yet.') + ' — ' + E.transcription(st).replace(/\n+/g, ' ¶ ').slice(-160);
}

// ---------- glyph sheet: the 3 samples per letter that go into the font ----------
function renderSheet() {
  const host = $('sheet');
  const W = Math.max(280, host.clientWidth || 800);
  const p = params();
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const cell = 46, sc = 32 / E.UPM, rowH = 34;
  const cols = Math.max(6, Math.floor(W / cell));
  let d = '';
  let i = 0;
  for (const ch of chars) {
    const col = i % cols, row = Math.floor(i / cols);
    for (let k = 0; k < 3; k++) {
      const g = E.makeGlyph(p, ch, { seed: 'alt' + k + ':' + ch, amount: 1, baseline: true });
      const ox = col * cell + (cell - g.advance * sc) / 2;
      const oy = row * (rowH * 3 + 22) + 26 + k * rowH;
      d += E.contoursToD(g.contours, ox, oy, sc);
    }
    i++;
  }
  const rows = Math.ceil(chars.length / cols);
  const H = rows * (rowH * 3 + 22);
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><path fill="var(--ink)" d="${d}"/></svg>`;
}

// ---------- font view: the real exported font, rendered by the browser's shaper ----------
let fontTimer = null;
function invalidateFont() { state.fontCache = null; }
function ensureFont() {
  if (state.fontCache) return state.fontCache;
  const t0 = performance.now();
  const built = E.buildFont(window.opentype, params(), { alts: 3 });
  const ms = performance.now() - t0;
  const check = E.verify(window.opentype, built.buffer);
  state.fontCache = Object.assign(built, { ms, check });
  return state.fontCache;
}
async function renderFontView() {
  const el = $('fontView');
  const f = ensureFont();
  if (!f.face) {
    const name = 'SeedhandPreview' + (++state.fontFaceN);
    const face = new FontFace(name, f.buffer.slice(0));
    await face.load();
    document.fonts.add(face);
    if (state.fontCache !== f) return; // superseded
    f.face = face; f.faceName = name;
  }
  el.style.fontFamily = `'${f.faceName}', serif`;
  el.style.fontSize = EM_PX + 'px';
  el.style.lineHeight = LINE;
  el.style.fontFeatureSettings = state.calt ? '"calt" 1' : '"calt" 0';
  el.textContent = $('text').value;
  showStatus();
}
function showStatus() {
  const f = state.fontCache;
  const s = $('status');
  if (!f) { s.innerHTML = 'Font builds on export or in Font preview.'; return; }
  const c = f.check;
  s.innerHTML =
    `${f.info.glyphs} glyphs · ${f.info.alternates} samples/letter\n` +
    `GSUB: ${c.features.join(', ')} <span class="${c.features.includes('calt') ? 'ok' : 'warn'}">${c.features.includes('calt') ? '✓' : '✗'}</span>\n` +
    `${(f.info.bytes / 1024).toFixed(0)} KB · built in ${f.ms.toFixed(0)} ms · ` +
    `<span class="${c.ok ? 'ok' : 'warn'}">${c.ok ? 're-parsed OK' : 'parse failed'}</span>`;
}

// ---------- render ----------
let raf = 0;
function render() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    if (state.mode === 'ink') { renderInkMode(); renderSheet(); return; } // Ink mode draws its own sheet
    if ($('inkGroup')) $('inkGroup').classList.add('hidden');
    const live = state.mode === 'live';
    $('live').classList.toggle('hidden', !live);
    $('fontView').classList.toggle('hidden', live);
    $('caltWrap').classList.toggle('hidden', live);
    $('tag').textContent = live ? 'LIVE · each letter drawn fresh' : (state.calt ? 'FONT · 3 samples, cycled by calt' : 'FONT · calt off (one sample per letter)');
    $('live').classList.toggle('inkview', live && ink.renderer !== 'svg');
    if (live) renderLive();
    else { clearTimeout(fontTimer); fontTimer = setTimeout(() => renderFontView().catch(err), 60); }
    renderSheet();
    showStatus();
  });
}
function err(e) { console.error(e); $('status').innerHTML = `<span class="warn">${e.message || e}</span>`; }

// ---------- export ----------
function exportFont() {
  try {
    const f = ensureFont();
    const blob = new Blob([f.buffer], { type: 'font/otf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Seedhand-${state.seed.replace(/[^A-Za-z0-9-]+/g, '-')}-${state.style}.otf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    showStatus();
  } catch (e) { err(e); }
}

// ---------- URL hash ----------
function writeHash() {
  const h = new URLSearchParams({ seed: state.seed, style: state.style });
  if (state.overrides.neatOnly === 'off') h.set('neat', 'off');
  history.replaceState(null, '', '#' + h.toString());
}
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('seed')) state.seed = h.get('seed');
  if (E.getStyle(h.get('style'))) state.style = h.get('style');
  if (h.get('neat') === 'off') state.overrides.neatOnly = 'off';
}

// ---------- wire up ----------
function seg(id, key, onChange) {
  const root = $(id);
  const sync = () => root.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === state[key]));
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state[key] = b.dataset.v; sync(); onChange();
  });
  sync();
  return sync;
}
function init() {
  readHash();
  buildStyleSwitch();
  buildControls();
  buildInkControls();
  buildJourneyControls();
  buildInkBench();
  $('text').value = DEFAULT_TEXT;
  $('seed').value = state.seed;
  const syncStyle = seg('style', 'style', () => { state.hand = E.makeHand(state.seed, state.style); syncControls(); invalidateFont(); writeHash(); render(); });
  let seedTimer;
  $('seed').addEventListener('input', () => { clearTimeout(seedTimer); seedTimer = setTimeout(() => setHand($('seed').value.trim() || 'hand', true), 120); });
  // a new hand is a new person: the sampler picks the family (print / joined) too, and keeps each pick far
  // from the last few hands shown (engine/sampler.js). Shift-click: a sibling of the current hand.
  const shown = [];
  $('reroll').addEventListener('click', (e) => {
    if (!shown.length) shown.push({ seed: state.seed, family: E.getStyle(state.style).family });
    const r = E.sampleHand({ history: shown, variety: e.shiftKey ? 'sibling' : 'stranger', entropy: randomSeed(), neatOnly: state.overrides.neatOnly !== 'off' });
    shown.push({ seed: r.seed, family: r.family }); if (shown.length > 6) shown.shift();
    $('seed').value = r.seed; state.style = r.style; syncStyle();
    setHand(r.seed, true);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r' && !/input|textarea|select/i.test(document.activeElement.tagName)) $('reroll').click();
  });
  seg('mode', 'mode', render);
  seg('paper', 'paper', render);
  $('write').addEventListener('click', writeIt);
  $('skip').addEventListener('click', () => { if (state.player) state.player.skip(); });
  $('speed').addEventListener('change', () => { if (state.player) state.player.setRate(+$('speed').value); });
  $('calt').addEventListener('change', () => { state.calt = $('calt').checked; render(); });
  $('text').addEventListener('input', render);
  $('export').addEventListener('click', exportFont);
  window.addEventListener('resize', render);
  window.addEventListener('hashchange', () => {
    readHash(); $('seed').value = state.seed; syncStyle();
    setHand(state.seed, true);
  });
  setHand(state.seed, true);
}
try { init(); } catch (e) { err(e); }
// exposed for debugging and QA
window.Seedhand = { state, params, ensureFont, missLog, engine: E, ink, hashCanvas, penSheet, benchInk, journey, journeySheet, inkm };

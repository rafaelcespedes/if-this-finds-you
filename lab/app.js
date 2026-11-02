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

const state = { seed: 'maple-river-42', style: 'print', mode: 'live', calt: true, overrides: {}, hand: null, fontCache: null, fontFaceN: 0 };
const FORMAT = {
  pct: (v) => Math.round(v * 100) + '%',
  deg: (v) => (v > 0 ? '+' : '') + (+v).toFixed(1) + '°',
  int: (v) => String(Math.round(v)),
};
const fmt = (d, v) => (FORMAT[d.format] || ((x) => (+x).toFixed(2)))(v);

// ---------- hand + params ----------
const params = () => E.withOverrides(state.hand, state.overrides);
function setHand(seed, resetControls) {
  state.seed = seed;
  state.hand = E.makeHand(seed, state.style);
  if (resetControls) state.overrides = {};
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
      sel.addEventListener('change', () => { state.overrides[d.key] = sel.value; invalidateFont(); render(); });
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
  reset.addEventListener('click', () => { state.overrides = {}; syncControls(); invalidateFont(); render(); });
  host.appendChild(reset);
}
function syncControls() {
  const p = params();
  for (const d of E.PARAMS) {
    const el = $('c-' + d.key); if (!el) continue;
    const v = p[d.key] ?? (typeof d.default === 'function' ? d.default(p) : d.default);
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
  const page = E.layout(p, $('text').value, { maxWidth: W / (EM_PX / E.UPM), lineHeight: LINE * E.UPM });
  noteMisses(page.misses);
  host.innerHTML = E.renderSVG(p, page, { width: W, emPx: EM_PX });
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
  const page = E.layout(p, $('text').value, { maxWidth: paneW / (EM_PX / E.UPM), lineHeight: LINE * E.UPM });
  ink.layoutMs = performance.now() - t0;
  noteMisses(page.misses);
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
  history.replaceState(null, '', '#' + h.toString());
}
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('seed')) state.seed = h.get('seed');
  if (E.getStyle(h.get('style'))) state.style = h.get('style');
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
  $('text').value = DEFAULT_TEXT;
  $('seed').value = state.seed;
  const syncStyle = seg('style', 'style', () => { state.hand = E.makeHand(state.seed, state.style); syncControls(); invalidateFont(); writeHash(); render(); });
  let seedTimer;
  $('seed').addEventListener('input', () => { clearTimeout(seedTimer); seedTimer = setTimeout(() => setHand($('seed').value.trim() || 'hand', true), 120); });
  // a new hand is a new person: the style (print / script / ...) is rolled too
  $('reroll').addEventListener('click', () => {
    const s = randomSeed(); $('seed').value = s;
    const names = E.styleNames(); state.style = names[Math.floor(Math.random() * names.length)]; syncStyle();
    setHand(s, true);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r' && !/input|textarea|select/i.test(document.activeElement.tagName)) $('reroll').click();
  });
  seg('mode', 'mode', render);
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
window.Seedhand = { state, params, ensureFont, missLog, engine: E, ink, hashCanvas, penSheet, benchInk };

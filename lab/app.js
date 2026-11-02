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
    el.value = p[d.key];
    if (d.type !== 'select') $('o-' + d.key).textContent = fmt(d, p[d.key]);
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
  const p = params();
  const page = E.layout(p, $('text').value, { maxWidth: W / (EM_PX / E.UPM), lineHeight: LINE * E.UPM });
  noteMisses(page.misses);
  host.innerHTML = E.renderSVG(p, page, { width: W, emPx: EM_PX });
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
    const r = E.sampleHand({ history: shown, variety: e.shiftKey ? 'sibling' : 'stranger', entropy: randomSeed() });
    shown.push({ seed: r.seed, family: r.family }); if (shown.length > 6) shown.shift();
    $('seed').value = r.seed; state.style = r.style; syncStyle();
    setHand(r.seed, true);
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
window.Seedhand = { state, params, ensureFont, missLog, engine: E };

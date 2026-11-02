/* app.js — UI for the Seedhand spike. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const UPM = 1000;
  const EM_PX = +(new URLSearchParams(location.search).get('size')) || 58; // preview size: 1 em in px (?size=120 for close-ups)
  const LINE = 1.6;               // line height in em

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

  // ---------- hand + params ----------
  function params() { return Hand.withOverrides(state.hand, state.overrides); }
  function setHand(seed, resetSliders) {
    state.seed = seed;
    state.hand = Hand.makeHand(seed, state.style);
    if (resetSliders) state.overrides = {};
    syncSliders();
    invalidateFont();
    writeHash();
    render();
  }
  const SL = {
    neatness: (v) => Math.round(v * 100) + '%',
    slant: (v) => (v > 0 ? '+' : '') + (+v).toFixed(1) + '°',
    penWidth: (v) => Math.round(v),
    pressure: (v) => Math.round(v * 100) + '%',
  };
  function syncSliders() {
    const p = params();
    for (const k of Hand.exposed) { $(k).value = p[k]; $('o-' + k).textContent = SL[k](p[k]); }
  }

  // ---------- geometry -> SVG ----------
  function contoursToD(contours, ox, oy, sc) {
    let d = '';
    for (const c of contours) {
      d += 'M' + (ox + c[0][0] * sc).toFixed(1) + ' ' + (oy - c[0][1] * sc).toFixed(1);
      for (let i = 1; i < c.length; i++) d += 'L' + (ox + c[i][0] * sc).toFixed(1) + ' ' + (oy - c[i][1] * sc).toFixed(1);
      d += 'Z';
    }
    return d;
  }

  // ---------- missing characters: logged so we learn what people actually type ----------
  const missLog = new Map();
  function noteMiss(ch) {
    const n = missLog.get(ch) || 0;
    if (!n) console.info(`[seedhand] missing glyph U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} "${ch}"`);
    missLog.set(ch, n + 1);
  }

  // ---------- live view: every occurrence is its own instance ----------
  function renderLive() {
    const host = $('live');
    const W = Math.max(280, host.clientWidth || 800);
    const sc = EM_PX / UPM;
    const maxU = W / sc;                         // available width in font units
    const p = params();
    const N = p.noise;
    const messy = 1 - p.neatness;
    const script = p.style === 'script';
    const text = $('text').value;
    const spaceG = Hand.makeGlyph(p, ' ', null);
    const spaceAdv = spaceG.advance * p.wordSpace;  // = hand.space
    let charIndex = 0;
    let lineNo = 0;
    const paths = [];
    const misses = [];
    const lineH = LINE * UPM;
    let y = 0.95 * UPM;
    const paras = text.split('\n');
    for (const para of paras) {
      const words = para.split(/ +/);
      let x = 0;
      let first = true;
      const wordRng = Hand.rng('words:' + p.seed + ':' + lineNo);
      for (const word of words) {
        // build instances for this word
        const glyphs = [];
        let wx = 0;
        for (const ch of word) {
          if (!Hand.has(p.style, ch)) {
            // never fall back silently: a light pencil placeholder, and log the miss
            noteMiss(ch);
            glyphs.push({ miss: ch, dx: wx });
            wx += 560;
            charIndex++;
            continue;
          }
          const g = Hand.makeGlyph(p, ch, { seed: 'live:' + charIndex + ':' + ch, amount: 1 });
          const jitter = script ? 0 : Hand.rng('sp:' + p.seed + ':' + charIndex).gauss() * 9 * messy;
          glyphs.push({ g, dx: wx });
          wx += g.advance + jitter;
          charIndex++;
        }
        const gap = first ? 0 : spaceAdv * (1 + wordRng.gauss() * 0.12 * (0.5 + messy));
        if (!first && x + gap + wx > maxU) { x = 0; y += lineH; lineNo++; } else x += gap;
        const wordLift = wordRng.gauss() * 7 * (0.3 + messy);
        for (const { g, dx, miss } of glyphs) {
          const gx = x + dx;
          if (miss) {
            const esc = miss.replace(/&/g, '&amp;').replace(/</g, '&lt;');
            misses.push(`<text class="miss" x="${((gx + 280) * sc).toFixed(1)}" y="${(y * sc).toFixed(1)}" font-size="${(0.62 * EM_PX).toFixed(1)}">` +
              `<title>This hand hasn\u2019t learned \u2039${esc}\u203A yet</title>${esc}</text>`);
            continue;
          }
          // baseline wanders slowly along the line
          const wob = p.drift * (12 + 34 * messy) * N.n1(gx / 1700 + lineNo * 13.37) + wordLift;
          // one path per pen stroke, each with slightly different ink density:
          // where strokes cross or a pen lifts and lands again, ink builds up like the real thing
          g.contours.forEach((c, ci) => {
            // ink density drifts slowly along the text (pen running dry / re-inked), plus a little per stroke
            const op = Math.min(1, 0.9 + 0.05 * N.n1(charIndex * 0.23 + 50) + 0.04 * Hand.rng('ink:' + charIndex + ':' + ci).call());
            paths.push(`<path fill-opacity="${op.toFixed(2)}" d="${contoursToD([c], gx * sc, (y - wob) * sc, sc)}"/>`);
          });
        }
        x += wx;
        charIndex++; // the space
        first = false;
      }
      y += lineH; lineNo++;
    }
    const H = Math.ceil((y - lineH + 0.45 * UPM) * sc);
    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="Handwritten preview">` +
      `<defs><filter id="inkEdge" x="-2%" y="-2%" width="104%" height="104%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7"/>` +
      `<feDisplacementMap in="SourceGraphic" scale="${Math.min(1.6, 0.5 + EM_PX / 70).toFixed(2)}" xChannelSelector="R" yChannelSelector="G"/></filter></defs>` +
      `<g fill="var(--ink)" filter="url(#inkEdge)">${paths.join('')}</g>${misses.join('')}</svg>`;
  }

  // ---------- glyph sheet: the 3 samples per letter that go into the font ----------
  function renderSheet() {
    const host = $('sheet');
    const W = Math.max(280, host.clientWidth || 800);
    const p = params();
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const cell = 46, sc = 32 / UPM, rowH = 34;
    const cols = Math.max(6, Math.floor(W / cell));
    let d = '';
    let i = 0;
    for (const ch of chars) {
      const col = i % cols, row = Math.floor(i / cols);
      for (let k = 0; k < 3; k++) {
        const g = Hand.makeGlyph(p, ch, { seed: 'alt' + k + ':' + ch, amount: 1, baseline: true });
        const ox = col * cell + (cell - g.advance * sc) / 2;
        const oy = row * (rowH * 3 + 22) + 26 + k * rowH;
        d += contoursToD(g.contours, ox, oy, sc);
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
    const built = FontBuild.buildFont(opentype, params(), { alts: 3 });
    const ms = performance.now() - t0;
    const check = FontBuild.verify(opentype, built.buffer);
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
    if (h.get('style') === 'script' || h.get('style') === 'print') state.style = h.get('style');
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
  }
  function init() {
    readHash();
    $('text').value = DEFAULT_TEXT;
    $('seed').value = state.seed;
    let seedTimer;
    $('seed').addEventListener('input', () => { clearTimeout(seedTimer); seedTimer = setTimeout(() => setHand($('seed').value.trim() || 'hand', true), 120); });
    $('reroll').addEventListener('click', () => { const s = randomSeed(); $('seed').value = s; setHand(s, true); });
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'r' && !/input|textarea/i.test(document.activeElement.tagName)) $('reroll').click();
    });
    seg('style', 'style', () => { state.hand = Hand.makeHand(state.seed, state.style); invalidateFont(); writeHash(); render(); });
    seg('mode', 'mode', render);
    $('calt').addEventListener('change', () => { state.calt = $('calt').checked; render(); });
    for (const k of Hand.exposed) {
      $(k).addEventListener('input', () => {
        state.overrides[k] = parseFloat($(k).value);
        $('o-' + k).textContent = SL[k](state.overrides[k]);
        invalidateFont(); render();
      });
    }
    $('resetHand').addEventListener('click', () => { state.overrides = {}; syncSliders(); invalidateFont(); render(); });
    $('text').addEventListener('input', render);
    $('export').addEventListener('click', exportFont);
    window.addEventListener('resize', render);
    window.addEventListener('hashchange', () => {
      readHash(); $('seed').value = state.seed;
      $('style').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === state.style));
      setHand(state.seed, true);
    });
    setHand(state.seed, true);
  }
  try { init(); } catch (e) { err(e); }
  // expose for debugging/verification
  window.Seedhand = { state, params, ensureFont, missLog };
})();

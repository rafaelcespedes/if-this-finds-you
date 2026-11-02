// lab/letters.js — close-ups for building letters: raw skeletons with their guides, every variant rendered
// in one hand, and contact sheets of many hands. URL parameters mirror the header fields, so a view can be
// shared: letters.html?view=skeleton&style=script&chars=aegr
import * as E from '../engine/index.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const DEFAULT_CHARS = 'aegrstfkyz1749AEFGMQRT';
const DEFAULT_TEXT = 'The quick brown fox jumps over the lazy dog. Grace & Sam, 1974!';
const state = {
  view: q.get('view') || 'skeleton',
  style: q.get('style') || 'print',
  chars: q.get('chars') || DEFAULT_CHARS,
  seed: q.get('seed') || 'maple-river-42',
  size: +q.get('size') || 6,
  variety: q.get('variety') || 'stranger',
  text: q.get('text') || DEFAULT_TEXT,
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const tagText = (v) => [v.id, v.tags && v.tags.allograph, v.tags && v.tags.position, v.borrowedFrom && 'from ' + v.borrowedFrom]
  .filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' · ');

// ---------- skeletons in source units, with the style's guides ----------
function skeletonCell(style, ch, v) {
  const st = E.getStyle(style);
  const m = v.metrics || st.metrics;
  const k = state.size * 21 / (m.base - m.cap);           // px per source unit, same cap height for every style
  const pad = 10;
  let x0 = v.l, x1 = v.r, y0 = m.cap - (m.base - m.cap) * 0.35, y1 = m.descender + 2;
  for (const s of v.s) for (const [x, y] of s) { x0 = Math.min(x0, x - 1); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y - 1); y1 = Math.max(y1, y + 1); }
  const W = (x1 - x0) * k + 2 * pad, H = (y1 - y0) * k + 2 * pad;
  const X = (x) => ((x - x0) * k + pad).toFixed(1), Y = (y) => ((y - y0) * k + pad).toFixed(1);
  let g = '';
  for (const [y, cls] of [[m.base, 'g1'], [m.cap, 'g1'], [m.xHeight, 'g2'], [m.descender, 'g2']]) g += `<line class="${cls}" x1="0" x2="${W}" y1="${Y(y)}" y2="${Y(y)}"/>`;
  g += `<rect class="box" x="${X(v.l)}" y="${Y(m.cap)}" width="${((v.r - v.l) * k).toFixed(1)}" height="${((m.base - m.cap) * k).toFixed(1)}"/>`;
  for (const s of v.s) {
    g += `<polyline class="sk" points="${s.map(([x, y]) => X(x) + ',' + Y(y)).join(' ')}"/>`;
    for (const [x, y] of s) g += `<circle class="pt" cx="${X(x)}" cy="${Y(y)}" r="1.6"/>`;
    g += `<circle class="st" cx="${X(s[0][0])}" cy="${Y(s[0][1])}" r="3"/>`;
  }
  const src = v.source ? v.source.credit || v.source.name : '';
  return `<div class="cell" title="${esc(src)}"><h4>${esc(ch)} · ${esc(tagText(v))}</h4><svg width="${W.toFixed(0)}" height="${H.toFixed(0)}">${g}</svg></div>`;
}

// ---------- every variant rendered by one hand (canonical + two uses) ----------
function glyphCell(p, ch, v) {
  const sc = state.size * 2.2 / 100;
  const pin = E.withOverrides(p, { pins: Object.assign({}, p.pins, { [ch]: v.id }) });
  const forms = [E.makeGlyph(pin, ch, null), E.makeGlyph(pin, ch, { seed: 'lab1', amount: 1 }), E.makeGlyph(pin, ch, { seed: 'lab2', amount: 1 })];
  const asc = 1.25 * E.CAP, desc = 0.55 * E.CAP;
  let x = 8, d = '';
  for (const g of forms) { d += E.contoursToD(g.contours, x, 8 + asc * sc, sc); x += Math.max(g.advance, 300) * sc + 10; }
  const H = 16 + (asc + desc) * sc;
  return `<div class="cell"><h4>${esc(ch)} · ${esc(tagText(v))}</h4><svg width="${x.toFixed(0)}" height="${H.toFixed(0)}">` +
    `<line class="g1" x1="0" x2="${x}" y1="${(8 + asc * sc).toFixed(1)}" y2="${(8 + asc * sc).toFixed(1)}"/>` +
    `<path class="ink" d="${d}"/></svg></div>`;
}

// ---------- contact sheet: many hands writing the same text ----------
function handCell(p, label, note) {
  const host = $('out');
  const W = Math.max(300, Math.min(1100, host.clientWidth - 40));
  const emPx = state.size * 6;
  const page = E.layout(p, state.text, { maxWidth: W / (emPx / E.UPM), lineHeight: 1.6 * E.UPM });
  const svg = E.renderSVG(p, page, { width: W, emPx, ink: '#1c2233' });
  return `<div class="cell hand"><h4>${esc(label)}</h4>${svg}<small>${esc(note)}</small></div>`;
}
function describe(p) {
  const st = E.getStyle(p.style);
  const d = E.describeHabits(p, 'aegrstfkyz1479AEFGMQRT');
  const forms = Object.values(d.letters).map((x) => x.main + (x.alt ? ` (${x.alt.when}: ${x.alt.allograph})` : '')).join(', ');
  const traits = ['neatness', 'hurry', 'slant', 'xHeight', 'width', 'penWidth'].map((k) => `${k} ${(+p[k]).toFixed(2)}`).join(' · ');
  return `${st.label || p.style} · ${d.schooling} schooling${d.printsCapitals ? ' · prints capitals' : ''} · ${traits} — ${forms}`;
}

function draw() {
  const out = $('out');
  out.className = state.view === 'hands' ? 'rows' : '';
  const chars = [...state.chars];
  let html = '';
  if (state.view === 'skeleton') {
    for (const ch of chars) for (const v of E.variants(state.style, ch)) html += skeletonCell(state.style, ch, v);
  } else if (state.view === 'glyph') {
    const p = E.makeHand(state.seed, state.style);
    for (const ch of chars) for (const v of E.variants(p.style, ch)) html += glyphCell(p, ch, v);
  } else {
    // ?seeds=a,b,c compares given seeds; otherwise twelve consecutive New hand picks for this family
    // (style 'any' = the sampler also picks the family)
    const fam = state.style === 'any' ? undefined : E.getStyle(state.style).family;
    if (q.get('seeds')) {
      for (const seed of q.get('seeds').split(',')) { const p = E.makeHand(seed.trim(), fam || 'print'); html += handCell(p, `${seed} · ${p.family} · ${p.archetype}`, describe(p)); }
      out.innerHTML = html; return;
    }
    let history = [];
    for (let i = 0; i < 12; i++) {
      const r = E.sampleHand({ history, family: fam, variety: state.variety, entropy: state.seed + ':' + i });
      history = [...history, { seed: r.seed, family: r.family }].slice(-6);
      const p = E.makeHand(r.seed, r.family);
      html += handCell(p, `${r.seed} · ${r.family} · ${r.label} · ${r.distance.toFixed(2)} from the last 6`, describe(p));
    }
  }
  out.innerHTML = html || '<p>Nothing to draw.</p>';
  const u = new URLSearchParams(state);
  history.replaceState(null, '', '?' + u.toString());
}

function init() {
  $('style').innerHTML = E.styleNames().map((n) => `<option value="${n}">${n}</option>`).join('') + '<option value="any">any (hands view)</option>';
  $('variety').innerHTML = Object.entries(E.VARIETY).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  for (const k of ['view', 'style', 'chars', 'seed', 'size', 'text', 'variety']) {
    $(k).value = state[k];
    $(k).addEventListener('change', () => { state[k] = k === 'size' ? +$(k).value : $(k).value; draw(); });
  }
  $('go').addEventListener('click', draw);
  draw();
}
try { init(); } catch (e) { console.error(e); $('out').textContent = String(e.stack || e); }
window.Seedhand = { engine: E, state, draw };

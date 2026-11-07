// One line in a fictional writer's hand, written out stroke by stroke: the engine on a page of its own, to put in an
// iframe anywhere (README.md). It needs only ../engine, side by side with this folder; no build step.
//
// The address sets it up (everything is optional):
//   seed      a writer, e.g. quiet-heron-17 (none: a writer is picked the way the site's "Bring another" picks one)
//   style     a tradition: palmer, spencerian, arrighi, suetterlin, kurrent-1849, norwegian-1849, polish-1906,
//             spanish-1776, dutch-1618, quebec-print, adult-fr-2023, or the families script / print
//   pen       ballpoint, gel, fountain, pointed, italic, felt, pencil      tip   fine, medium, bold
//   ink       ballpoint-blue, royal-blue, blue-black, iron-gall, sepia, black, red, green, graphite
//   neat      0 … 1 (neatness)      hurry   0 … 1      haste   -2 … 2 (the tempo of typing: tidier … hastier)
//   text      the words (default: a line of a letter)      em   the size, px per em (default 44)
//   play      0 to show it at once instead of writing it out
//   speed     how much faster than a person it's written (1 = their own pace; by default it takes about 5 seconds)
//   ui        0 for no controls (an iframe of just the hand)
//   color     any CSS colour for the ink, in place of the pen's own (e.g. currentColor in a themed page)
// It also listens for postMessage({ type: 'itfy:set', ...the same keys }) from the page around it, and tells that page
// { type: 'itfy:hand', seed, style, name, tradition } whenever the writer changes.
import * as E from '../engine/index.js';
import { writerName } from './names.js';

const q = new URLSearchParams(location.search);
const num = (v) => (v == null || v === '' || Number.isNaN(+v) ? undefined : +v);
const opts = {
  seed: q.get('seed') || '',
  style: q.get('style') || q.get('tradition') || '',
  pen: q.get('pen') || '',
  tip: q.get('tip') || '',
  ink: q.get('ink') || '',
  neat: num(q.get('neat')),
  hurry: num(q.get('hurry')),
  haste: num(q.get('haste')) ?? 0,
  text: q.get('text') || 'Dear Ada, the light here is soft in the mornings.',
  em: num(q.get('em')) ?? 44,
  play: q.get('play') !== '0',
  speed: num(q.get('speed')),
  ui: q.get('ui') !== '0',
  color: q.get('color') || '',
};

const sheet = document.getElementById('sheet');
const ui = document.getElementById('ui');
const who = document.getElementById('who');
const styleSel = document.getElementById('style');
let look = null; // { seed, style, params, pen, tip, ink }
let player = null;

// the traditions, by their own names (the families first)
for (const name of E.styleNames()) {
  const o = document.createElement('option');
  o.value = name;
  o.textContent = E.getStyle(name).label || name;
  styleSel.append(o);
}

/** A writer: the one asked for, or one picked as the site picks ("Bring another": legible hands, a full look). */
function pick(seed, style) {
  if (seed) return { seed, style: style || 'script', params: {}, pen: '', tip: '', ink: '' };
  const s = E.sampleLook({ entropy: String(Math.random()), ...(style ? { locked: { family: E.getStyle(style)?.family } } : {}) });
  return { seed: s.seed, style: style || s.style, params: s.params || {}, pen: s.pen, tip: s.tip, ink: s.ink };
}

function hand() {
  const base = E.makeHand(look.seed, { style: look.style }, { neatOnly: true });
  const o = { ...look.params };
  const pen = opts.pen || look.pen, tip = opts.tip || look.tip, ink = opts.ink || look.ink;
  if (pen) o.pen = pen;
  if (tip) o.tip = tip;
  if (ink) o.ink = ink;
  if (opts.neat != null) o.neatness = opts.neat;
  if (opts.hurry != null) o.hurry = opts.hurry;
  return E.withOverrides(base, o);
}

function draw() {
  player?.stop?.();
  const p = hand();
  const W = Math.max(200, sheet.clientWidth);
  const em = opts.em;
  const page = E.layout(p, opts.text, { maxWidth: W / (em / E.UPM), lineHeight: 1.45 * E.UPM, haste: opts.haste });
  sheet.innerHTML = E.renderSVG(p, page, { width: W, emPx: em, strokeIds: true, ...(opts.color ? { ink: opts.color } : {}) });
  const svg = sheet.querySelector('svg');
  // a touch screen keeps the ink's rough edge off: Safari would blur it when the page is zoomed (as on the site)
  if (matchMedia('(pointer: coarse)').matches) svg.querySelectorAll('[filter^="url(#inkEdge"]').forEach((g) => g.removeAttribute('filter'));
  if (opts.play) {
    // a person takes 20-30 s over a line; a page's widget wants it in about 5 (unless ?speed= says otherwise)
    const timeline = E.timeline(page, { emPx: em });
    const rate = opts.speed ?? Math.max(1, timeline.duration / 5);
    player = E.playSVG(svg, page, { emPx: em, timeline, rate });
    player.play();
  }
  const name = writerName(look.seed);
  const tradition = E.getStyle(p.style)?.label || p.style;
  who.textContent = `${name} · ${tradition}`;
  styleSel.value = E.styleNames().includes(look.style) ? look.style : p.style;
  sheet.setAttribute('aria-label', `“${opts.text}”, handwritten by ${name}, a writer who never existed (${tradition})`);
  parent?.postMessage?.({ type: 'itfy:hand', seed: look.seed, style: p.style, name, tradition }, '*');
}

look = pick(opts.seed, opts.style);
ui.hidden = !opts.ui;
draw();

document.getElementById('another').addEventListener('click', () => { look = pick('', opts.style); draw(); });
document.getElementById('again').addEventListener('click', () => draw());
styleSel.addEventListener('change', () => { opts.style = styleSel.value; look = { ...look, style: styleSel.value, params: {} }; draw(); });
let lastW = sheet.clientWidth;
new ResizeObserver(() => { if (Math.abs(sheet.clientWidth - lastW) > 8) { lastW = sheet.clientWidth; draw(); } }).observe(sheet);

// the page around it can change it: postMessage({ type: 'itfy:set', seed, style, pen, ink, neat, hurry, haste, text })
addEventListener('message', (ev) => {
  const d = ev.data;
  if (!d || d.type !== 'itfy:set') return;
  for (const k of ['pen', 'tip', 'ink', 'text', 'color']) if (typeof d[k] === 'string') opts[k] = d[k];
  for (const k of ['neat', 'hurry', 'haste', 'em', 'speed']) if (d[k] != null) opts[k] = num(d[k]);
  if (typeof d.play === 'boolean') opts.play = d.play;
  if (d.seed || d.style) { opts.style = d.style || opts.style; look = pick(d.seed || '', opts.style); }
  draw();
});

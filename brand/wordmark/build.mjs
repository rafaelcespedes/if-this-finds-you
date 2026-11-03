// build.mjs — draw every wordmark option, save the SVGs + manifest, and write the review page.
// Usage: node brand/wordmark/build.mjs [reviewPagePath]
//   brand/wordmark/svg/NN-slug.svg        real ink (#1c2233 modelled as ink on paper)
//   brand/wordmark/svg/NN-slug-mono.svg   one colour (currentColor), for dark grounds, headers, print
//   brand/wordmark/svg/NN-slug-icon.svg   square tab icon: the first letters by the same hand, one colour
//   brand/wordmark/manifest.json          the exact hand for every option
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as E from '../../engine/index.js';
import { wordmark, handOf } from './wordmark.mjs';
import { OPTIONS, REFERENCES, FAMILIES } from './options.mjs';
import { TOP } from './top.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const svgDir = path.join(here, 'svg');
fs.rmSync(svgDir, { recursive: true, force: true });
fs.mkdirSync(svgDir, { recursive: true });
const reviewOut = process.argv[2] || path.join(here, '../../out/wm/review.html');

const INK = '#1c2233';
const pad2 = (n) => String(n).padStart(2, '0');
const vbOf = (svg) => svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);

// a square icon from a short text in the option's first hand
function iconSvg(text, hand, id) {
  const svg = wordmark([{ runs: [{ text, hand: { ...hand, salt: 'icon' } }] }], { id, ink: 'currentColor', pad: 0.06, label: text });
  const [x, y, w, h] = vbOf(svg);
  const s = Math.max(w, h) * 1.08;
  return svg.replace(/viewBox="[^"]+"/, `viewBox="${(x + w / 2 - s / 2).toFixed(1)} ${(y + h / 2 - s / 2).toFixed(1)} ${s.toFixed(1)} ${s.toFixed(1)}"`);
}

const describe = (hand) => {
  const p = handOf(hand);
  const o = { seed: hand.seed, style: hand.style };
  for (const k of ['pen', 'tip', 'slant', 'neatness', 'salt']) if (hand[k] !== undefined) o[k] = hand[k];
  o.resolved = { style: p.style, pen: E.penKey(p), slant: +p.slant.toFixed(1), neatness: +p.neatness.toFixed(2) };
  return o;
};

const manifest = {
  name: 'If This Finds You',
  generated: 'brand/wordmark/build.mjs',
  howToRedraw: "wordmark(lines) from brand/wordmark/wordmark.mjs; each hand is withOverrides(makeHand(seed, { style }), { pen, tip, slant, neatness })",
  howToMakeFont: "buildFontPackage(withOverrides(makeHand(seed, { style }), overrides), { name }) from engine/index.js",
  ink: INK,
  options: [],
};

const items = [];
let n = 0;
for (const o of OPTIONS) {
  n++;
  const id = `${pad2(n)}-${o.slug}`;
  const first = o.lines[0].runs[0];
  const ink = wordmark(o.lines, { id: `w${n}`, ink: INK, label: 'If This Finds You' });
  const mono = wordmark(o.lines, { id: `m${n}`, ink: 'currentColor', label: 'If This Finds You' });
  const iconText = o.icon || (first.text.startsWith('if') ? 'if' : 'If');
  const icon = iconSvg(iconText, first.hand, `i${n}`);
  fs.writeFileSync(path.join(svgDir, `${id}.svg`), ink);
  fs.writeFileSync(path.join(svgDir, `${id}-mono.svg`), mono);
  fs.writeFileSync(path.join(svgDir, `${id}-icon.svg`), icon);
  const hands = [];
  const seen = new Set();
  for (const l of o.lines) for (const r of l.runs) { const k = r.hand.seed + r.hand.style + (r.hand.pen || ''); if (!seen.has(k)) { seen.add(k); hands.push(describe(r.hand)); } }
  manifest.options.push({
    number: n, id, family: o.family, note: o.note,
    text: o.lines.map((l) => l.runs.map((r) => r.text).join(' ')).join(' / '),
    hands,
    layout: o.lines.map((l) => ({ indent: l.indent, leading: l.leading, runs: l.runs.map((r) => ({ text: r.text, seed: r.hand.seed, style: r.hand.style, pen: r.hand.pen, salt: r.hand.salt, size: r.size, gap: r.gap })) })),
    icon: iconText,
    files: { ink: `svg/${id}.svg`, mono: `svg/${id}-mono.svg`, icon: `svg/${id}-icon.svg` },
  });
  items.push({ n, id, o, ink, mono, icon, hands });
}
for (const r of REFERENCES) {
  n++;
  const id = `${pad2(n)}-${r.slug}`;
  let you = null;
  if (r.you) {
    you = { ink: wordmark([{ runs: [{ text: 'you', hand: r.you.hand }] }], { id: `y${n}`, ink: INK, pad: 0.04, label: 'you' }),
      mono: wordmark([{ runs: [{ text: 'you', hand: r.you.hand }] }], { id: `ym${n}`, ink: 'currentColor', pad: 0.04, label: 'you' }) };
    fs.writeFileSync(path.join(svgDir, `${id}-you.svg`), you.ink);
  }
  manifest.options.push({ number: n, id, family: 'ref', note: r.note, font: r.font, licence: r.licence, css: r.css,
    text: r.serifText ? `${r.serifText} + handwritten "you"` : 'If This Finds You',
    hands: r.you ? [describe(r.you.hand)] : [], files: r.you ? { you: `svg/${id}-you.svg` } : {} });
  items.push({ n, id, r, you });
}
fs.writeFileSync(path.join(here, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// ---------------- review page ----------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// size an inline SVG by its em (100 viewBox units = 1 em of the hand)
function sized(svg, emPx, cls) {
  const [, , w, h] = vbOf(svg);
  return svg.replace('<svg ', `<svg class="${cls}" style="width:min(100%,${(w / 100 * emPx).toFixed(1)}px)" `);
}
const iconAt = (svg, px) => svg.replace('<svg ', `<svg width="${px}" height="${px}" `);
// HTML text for references; a hybrid's "you" sits on the text baseline (its viewBox has y = 0 on the baseline)
function refMark(it, mono) {
  const r = it.r;
  if (!r.you) return `<span class="reftext" style="${r.css}">If This Finds You</span>`;
  const svg = mono ? it.you.mono : it.you.ink;
  const [, y, w, h] = vbOf(svg);
  const k = r.you.scale;
  return `<span class="reftext" style="${r.css}">${esc(r.serifText)}&nbsp;<svg${svg.slice(4, svg.indexOf('>'))} style="height:${(h / 100 * k).toFixed(3)}em;width:auto;vertical-align:${(-(y + h) / 100 * k).toFixed(3)}em">${svg.slice(svg.indexOf('>') + 1)}</span>`;
}
function refIcon(it, px) {
  return `<span class="reficon" style="${it.r.css};font-size:${(px * 0.78).toFixed(1)}px;width:${px}px;height:${px}px">If</span>`;
}

function recipe(it) {
  if (it.r) return `<b>${esc(it.r.font)}</b> · ${esc(it.r.licence)}` + (it.hands && it.r.you ? ` · “you”: ${handLine(manifest.options[it.n - 1].hands[0])}` : '');
  return it.hands.map(handLine).join('<br>');
}
function handLine(h) {
  const bits = [`seed <b>${esc(h.seed)}</b>`, `style ${esc(h.style)}`, `pen ${esc(h.resolved.pen)}`, `slant ${h.resolved.slant}°`];
  return bits.join(' · ');
}

function card(it) {
  const top = TOP.find((t) => t.n === it.n);
  const light = it.r ? refMark(it, false) : sized(it.ink, 64, 'mark');
  const dark = it.r ? refMark(it, true) : sized(it.mono, 64, 'mark');
  const head = it.r ? refMark(it, false) : sized(it.ink, 20, 'hmark');
  const headDark = it.r ? refMark(it, true) : sized(it.mono, 20, 'hmark');
  const ic = (px) => (it.r ? refIcon(it, px) : iconAt(it.icon, px));
  return `<article class="opt${top ? ' is-top' : ''}${it.r ? ' is-ref' : ''}" id="o${it.n}">
  <header class="opt-head"><span class="num">#${it.n}</span>${top ? `<span class="pick">Top ${top.rank}</span>` : ''}<p class="note">${esc(it.r ? it.r.note : it.o.note)}</p></header>
  <div class="tiles">
    <div class="tile paper">${light}</div>
    <div class="tile night">${dark}</div>
  </div>
  <div class="small">
    <div class="appbar"><span class="appbar-mark">${head}</span><span class="chips"><span class="chip">New hand</span><span class="chip solid">Share</span></span></div>
    <div class="appbar dark"><span class="appbar-mark">${headDark}</span><span class="chips"><span class="chip">New hand</span></span></div>
    <div class="tabrow">
      <div class="tab"><span class="fav">${ic(16)}</span><span class="tabtitle">If This Finds You</span><span class="x" aria-hidden="true">×</span></div>
      <div class="icons"><span class="ico ico32">${ic(32)}</span><span class="ico ico48 dk">${ic(48)}</span></div>
    </div>
  </div>
  <p class="recipe">${recipe(it)}</p>
</article>`;
}

const topBlock = TOP.map((t) => {
  const it = items[t.n - 1];
  return `<a class="topcard" href="#o${t.n}"><span class="toprank">Top ${t.rank} · #${t.n}</span><span class="topmark">${it.r ? refMark(it, false) : sized(it.ink, 48, 'mark')}</span><span class="topwhy">${esc(t.why)}</span></a>`;
}).join('');

const sections = FAMILIES.map((f) => {
  const list = items.filter((it) => (it.r ? 'ref' : it.o.family) === f.key);
  const a = list[0].n, b = list[list.length - 1].n;
  return `<section class="fam" id="${f.key}"><div class="fam-head"><h2>${esc(f.title)}</h2><span class="range">#${a}–${b}</span><p>${esc(f.blurb)}</p></div><div class="grid">${list.map(card).join('\n')}</div></section>`;
}).join('\n');

const hero = items[TOP[0].n - 1];
const html = `<title>If This Finds You wordmarks</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&family=EB+Garamond:ital,wght@0,400..600;1,400..600&family=Cormorant+Garamond:wght@500&family=Fraunces:opsz,wght,SOFT,WONK@9..144,400,100,1&family=IM+Fell+English:ital@0;1&family=Special+Elite&family=Courier+Prime&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
/* Layout: a quiet desk; every option is a sheet with its big marks on top and its small uses below. The app's own palette. */
:root {
  --desk: #eeebe4; --sheet: #f8f6f1; --text: #23211d; --muted: #6c685f; --hair: #e2ddd2; --amber: #e7b04a; --amber-ink: #8a5a10;
  --paper: #fffdf8; --ink: #1c2233; --night: #1b1d24; --moon: #ece5d6; --nightbar: #24262e;
  --ui: 'Instrument Sans', ui-sans-serif, system-ui, sans-serif; --mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --desk: #16171b; --sheet: #1e1f24; --text: #e9e5dc; --muted: #a29d93; --hair: #2e2f35; --amber-ink: #f0c26a; color-scheme: dark } }
:root[data-theme="dark"] { --desk: #16171b; --sheet: #1e1f24; --text: #e9e5dc; --muted: #a29d93; --hair: #2e2f35; --amber-ink: #f0c26a; color-scheme: dark }
body { background: var(--desk); color: var(--text); font-family: var(--ui); font-size: 15px; line-height: 1.5; }
.wrap { max-width: 1320px; margin: 0 auto; padding-block: 40px 80px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 56px; }
.intro { display: grid; gap: 20px; }
.intro .heromark { background: var(--paper); border-radius: 14px; padding: clamp(20px, 5vw, 48px); display: flex; justify-content: center; box-shadow: 0 1px 2px rgba(60,45,20,.06), 0 18px 40px -24px rgba(60,45,20,.25); }
.intro .heromark svg { width: min(100%, 760px) !important; height: auto; }
h1 { font-size: clamp(26px, 3.4vw, 36px); font-weight: 500; letter-spacing: -0.01em; margin: 0; text-wrap: balance; }
.lede { color: var(--muted); max-width: 68ch; margin: 0; }
.lede b { color: var(--text); font-weight: 600; }
nav.jump { display: flex; flex-wrap: wrap; gap: 8px; }
nav.jump a { font-size: 13px; color: var(--text); text-decoration: none; border: 1px solid var(--hair); border-radius: 999px; padding: 4px 12px; background: var(--sheet); }
nav.jump a:hover, nav.jump a:focus-visible { border-color: var(--muted); outline: none; }
.tops { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 16px; }
.topcard { display: grid; gap: 12px; align-content: start; text-decoration: none; color: inherit; background: var(--sheet); border: 1px solid var(--hair); border-radius: 12px; padding: 16px; }
.topcard:hover, .topcard:focus-visible { border-color: var(--amber); outline: none; }
.toprank { font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--amber-ink); }
.topmark { background: var(--paper); border-radius: 8px; padding: 18px 14px; display: flex; justify-content: center; align-items: center; min-height: 110px; color: var(--ink); font-size: 34px; }
.topmark svg.mark { height: auto; }
.topwhy { font-size: 14px; }
.fam { display: grid; gap: 20px; }
.fam-head { display: grid; grid-template-columns: auto 1fr; column-gap: 12px; align-items: baseline; }
.fam-head h2 { margin: 0; font-size: 22px; font-weight: 500; }
.fam-head .range { color: var(--muted); font-family: var(--mono); font-size: 12px; }
.fam-head p { grid-column: 1 / -1; margin: 4px 0 0; color: var(--muted); max-width: 70ch; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 560px), 1fr)); gap: 16px; }
.opt { background: var(--sheet); border: 1px solid var(--hair); border-radius: 12px; padding: 14px; display: grid; gap: 12px; align-content: start; min-width: 0; scroll-margin-top: 16px; }
.opt.is-top { border-color: var(--amber); box-shadow: 0 0 0 2px color-mix(in oklab, var(--amber) 35%, transparent); }
.opt-head { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.num { font-family: var(--mono); font-weight: 600; font-size: 18px; font-variant-numeric: tabular-nums; min-width: 2.6em; }
.pick { flex: none; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; background: var(--amber); color: #3b2a08; padding: 2px 8px; border-radius: 999px; }
.note { margin: 0; font-size: 14px; min-width: 0; }
.tiles { display: grid; grid-template-columns: 1fr; gap: 8px; }
.tile { border-radius: 8px; min-height: 150px; padding: 22px 18px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.tile.paper { background: var(--paper); color: var(--ink); }
.tile.night { background: var(--night); color: var(--moon); box-shadow: inset 0 0 0 1px #30323a; }
.tile svg.mark { height: auto; display: block; }
.reftext { font-size: clamp(30px, 5vw, 50px); line-height: 1.1; white-space: nowrap; color: inherit; }
.tile .reftext { max-width: 100%; }
.small { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.appbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; height: 48px; padding: 0 12px; border-radius: 8px; background: #eeebe4; color: var(--ink); border: 1px solid #e2ddd2; overflow: hidden; min-width: 0; }
.appbar.dark { background: var(--nightbar); color: var(--moon); border-color: #30323a; }
.appbar-mark { display: flex; align-items: center; min-width: 0; max-height: 40px; }
.appbar-mark svg.hmark { height: auto; max-height: 40px; display: block; }
.appbar .reftext { font-size: 16px; }
.appbar-mark { overflow: hidden; }
.chips { display: flex; gap: 6px; flex: none; }
.chip { font-size: 12px; padding: 3px 9px; border-radius: 6px; background: #e4dfd4; color: #23211d; }
.chip.solid { background: #1c2233; color: #fbfaf6; }
.appbar.dark .chip { background: #34363f; color: var(--moon); }
.tabrow { grid-column: 1 / -1; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.tab { display: flex; align-items: center; gap: 8px; width: min(100%, 240px); height: 34px; padding: 0 10px; background: #ffffff; color: #2a2a2e; border-radius: 9px 9px 0 0; border: 1px solid #ddd8cd; border-bottom: 0; box-shadow: 0 6px 0 -5px #ddd8cd; }
.fav { width: 16px; height: 16px; flex: none; color: var(--ink); display: flex; }
.tabtitle { font: 12px/1 system-ui, sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
.x { color: #9a958b; font-size: 14px; }
.icons { display: flex; gap: 8px; align-items: flex-end; }
.ico { display: flex; align-items: center; justify-content: center; background: var(--paper); color: var(--ink); border-radius: 8px; border: 1px solid #e2ddd2; }
.ico32 { width: 44px; height: 44px; }
.ico48 { width: 60px; height: 60px; border-radius: 12px; }
.ico.dk { background: var(--night); color: var(--moon); border-color: #30323a; }
.reficon { display: inline-flex; align-items: center; justify-content: center; line-height: 1; overflow: hidden; }
.recipe { margin: 0; font-family: var(--mono); font-size: 11.5px; color: var(--muted); overflow-wrap: anywhere; }
.recipe b { color: var(--text); font-weight: 600; }
footer { color: var(--muted); font-size: 13px; max-width: 75ch; display: grid; gap: 8px; }
footer code { font-family: var(--mono); font-size: 12px; }
@media (max-width: 520px) { .small { grid-template-columns: 1fr; } .tile { min-height: 110px; } }
</style>
<div class="wrap">
  <section class="intro">
    <div class="heromark">${sized(hero.ink, 110, 'mark')}</div>
    <h1>If This Finds You: ${items.length} wordmark options</h1>
    <p class="lede">Each handwritten option is a real writer from our engine, drawn as clean vector ink. Every one can be redrawn exactly and exported as a font from the seed, style and pen under it. <b>Pick by number</b> (“#7”). Each option shows the mark large on paper and on dark, then small: in the app’s top bar, as a browser-tab icon, and as larger app icons. Engine hands are #1–${OPTIONS.length}; open-licence reference typefaces are #${OPTIONS.length + 1}–${items.length}.</p>
    <nav class="jump" aria-label="Families"><a href="#top3">Top 3</a>${FAMILIES.map((f) => `<a href="#${f.key}">${esc(f.title)}</a>`).join('')}</nav>
  </section>
  <section class="fam" id="top3"><div class="fam-head"><h2>My top 3</h2><span class="range">engine hands only</span></div><div class="tops">${topBlock}</div></section>
  ${sections}
  <footer>
    <p>Ink colour is the app’s own blue-black (#1c2233). The dark and small versions use one flat colour, as a logo would. The tab icon is the first letters written by the same hand, because the full name is too long to read at 16 pixels.</p>
    <p>Files: <code>brand/wordmark/svg/</code> (ink, one-colour and icon SVG for each option) and <code>brand/wordmark/manifest.json</code> (seed, style, pen and layout for each). Redraw with <code>node brand/wordmark/build.mjs</code>.</p>
  </footer>
</div>`;
fs.mkdirSync(path.dirname(reviewOut), { recursive: true });
fs.writeFileSync(reviewOut, html);
console.log(`${items.length} options · review ${(html.length / 1e6).toFixed(2)} MB · svg dir ${(fs.readdirSync(svgDir).reduce((s, f) => s + fs.statSync(path.join(svgDir, f)).size, 0) / 1e6).toFixed(2)} MB`);

// thread.mjs: the page for choosing the launch thread's favourite hands. Every hand of src/data/specimens.json
// writing the pangram (out/specimens/, from `npm run specimens`), with what a reader needs to find it again: the
// writer the site names, the school, pen, ink and paper, the seed, and the "Write with it" link.
// Writes out/thread/ (index.html + img/), published as a private artifact from files.
//   node review/thread.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const hands = JSON.parse(fs.readFileSync(path.join(root, 'src/data/specimens.json'), 'utf8'));
const out = path.join(root, 'out/thread');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'img'), { recursive: true });
const pad = (n) => String(n).padStart(3, '0');
for (const h of hands) {
  fs.copyFileSync(path.join(root, `out/specimens/hand-${pad(h.n - 1)}.jpeg`), path.join(out, `img/hand-${pad(h.n)}.jpg`));
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const inkName = (s) => String(s || '').replace(/-/g, ' ');
const paperName = (h) => String(h.paperName || h.paper).toLowerCase();

const cards = hands.map((h) => `
<article class="card" data-n="${h.n}" data-family="${h.family}">
  <img src="img/hand-${pad(h.n)}.jpg" width="800" height="450" alt="The quick brown fox jumps over the lazy dog, written by ${esc(h.name)}" loading="lazy">
  <div class="body">
    <div class="top">
      <span class="no">No. ${pad(h.n)}</span>
      <button class="pick" type="button" aria-pressed="false" aria-label="Pick No. ${h.n}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/></svg>
      </button>
    </div>
    <h2>${esc(h.name)}</h2>
    <p class="meta">${esc(h.school)} · ${esc(h.penLabel)} · ${esc(inkName(h.ink))} ink · ${esc(paperName(h))}</p>
    <p class="seed"><span>Seed</span> <code>${esc(h.seed)}</code></p>
    <a class="open" href="${esc(h.link)}" target="_blank" rel="noopener">Write with this hand</a>
  </div>
</article>`).join('');

const data = JSON.stringify(hands.map((h) => ({ n: h.n, name: h.name, seed: h.seed, school: h.school, pen: h.penLabel, ink: inkName(h.ink), paper: paperName(h), link: h.link })));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Thread favourites: pick the hands</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,480&family=Schibsted+Grotesk:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root { --room: #e6e4de; --card: #f3eee1; --slip: #f8f5ec; --ink: #1e2733; --red: #9b3b2a; --muted: #575146; --edge: #d6ccb7; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--room); color: var(--ink); font: 400 15px/1.5 "Schibsted Grotesk", "Helvetica Neue", Arial, sans-serif; }
  header { max-width: 1320px; margin: 0 auto; padding: 40px 24px 8px; }
  h1 { font: 480 34px/1.15 Newsreader, Georgia, serif; letter-spacing: -0.015em; margin: 0 0 10px; }
  .lede { max-width: 62ch; color: var(--muted); margin: 0 0 22px; }
  .bar { position: sticky; top: 0; z-index: 2; background: color-mix(in srgb, var(--room) 92%, transparent); backdrop-filter: blur(6px); border-bottom: 1px solid var(--edge); }
  .bar-in { max-width: 1320px; margin: 0 auto; padding: 12px 24px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .chip { font-family: inherit; font-weight: 500; font-size: 13px; line-height: 1; letter-spacing: 0.01em; padding: 9px 14px; border-radius: 999px; border: 1px solid var(--edge); background: var(--slip); color: var(--ink); cursor: pointer; }
  .chip[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--slip); }
  .grow { flex: 1; }
  .count { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
  .copy { font-family: inherit; font-weight: 600; font-size: 13px; line-height: 1; padding: 10px 16px; border-radius: 999px; border: 0; background: var(--red); color: #fff; cursor: pointer; }
  .copy:disabled { opacity: 0.45; cursor: default; }
  main { max-width: 1320px; margin: 0 auto; padding: 20px 24px 80px; display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 18px; }
  .card { background: var(--card); border-radius: 10px; overflow: hidden; box-shadow: 0 0 0 1px var(--edge); transition: box-shadow 160ms ease-out; }
  .card.picked { box-shadow: 0 0 0 2px var(--red); }
  .card[hidden] { display: none; }
  .card img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; background: var(--slip); }
  .body { padding: 12px 16px 16px; }
  .top { display: flex; align-items: center; justify-content: space-between; }
  .no { font-family: inherit; font-weight: 500; font-size: 12px; line-height: 1; letter-spacing: 0.08em; text-transform: uppercase; color: var(--red); font-variant-numeric: tabular-nums; }
  .pick { width: 40px; height: 40px; margin: -8px -10px -8px 0; display: grid; place-items: center; border: 0; background: none; cursor: pointer; border-radius: 50%; }
  .pick svg { width: 22px; height: 22px; fill: none; stroke: var(--muted); stroke-width: 1.6; transition: transform 160ms ease-out; }
  .pick:active svg { transform: scale(0.9); }
  .pick[aria-pressed="true"] svg { fill: var(--red); stroke: var(--red); }
  h2 { font: 480 21px/1.2 Newsreader, Georgia, serif; letter-spacing: -0.015em; margin: 8px 0 2px; }
  .meta { margin: 0 0 8px; color: var(--muted); font-size: 13.5px; }
  .seed { margin: 0 0 10px; font-size: 13px; color: var(--muted); }
  .seed code { font: 500 13px/1 ui-monospace, "SF Mono", Menlo, monospace; color: var(--ink); background: var(--slip); padding: 3px 6px; border-radius: 4px; user-select: all; }
  .open { font-size: 13.5px; font-weight: 500; color: var(--ink); text-underline-offset: 3px; text-decoration-color: var(--edge); }
  .open:hover { text-decoration-color: var(--ink); }
  .picks { max-width: 1320px; margin: 0 auto; padding: 0 24px; }
  .picks pre { display: none; white-space: pre-wrap; background: var(--slip); border: 1px solid var(--edge); border-radius: 8px; padding: 12px 14px; font: 13px/1.55 ui-monospace, "SF Mono", Menlo, monospace; margin: 12px 0 0; user-select: all; }
  .picks pre.on { display: block; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
</head>
<body>
<header>
  <h1>Pick the hands for the thread</h1>
  <p class="lede">${hands.length} hands from the site's own sampler (the way the Fonts page draws them, neat hands only), each writing the pangram on its own paper in its own ink. Tap the heart on the ones you like, then Copy picks and paste the list back to me; I'll render the chosen ones large. Each link opens the tool writing in that exact hand.</p>
</header>
<div class="bar"><div class="bar-in">
  <button class="chip" type="button" data-show="all" aria-pressed="true">All</button>
  <button class="chip" type="button" data-show="script" aria-pressed="false">Joined</button>
  <button class="chip" type="button" data-show="print" aria-pressed="false">Print</button>
  <button class="chip" type="button" data-show="picked" aria-pressed="false">Picked</button>
  <span class="grow"></span>
  <span class="count" id="count"></span>
  <button class="copy" type="button" id="copy" disabled>Copy picks</button>
</div></div>
<div class="picks"><pre id="list"></pre></div>
<main id="grid">${cards}
</main>
<script>
const HANDS = ${data};
const byN = new Map(HANDS.map((h) => [h.n, h]));
const KEY = 'thread-picks-v1';
let picks = new Set();
try { picks = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) {}
let show = 'all';
const cards = [...document.querySelectorAll('.card')];
const list = document.getElementById('list');
const copy = document.getElementById('copy');
const pad = (n) => String(n).padStart(3, '0');
function text() {
  return [...picks].sort((a, b) => a - b).map((n) => { const h = byN.get(n); return 'No. ' + pad(n) + ': ' + h.name + ', ' + h.school + ', ' + h.pen + ' (seed ' + h.seed + ')'; }).join('\\n');
}
function render() {
  let shown = 0;
  for (const c of cards) {
    const n = +c.dataset.n, on = picks.has(n);
    c.classList.toggle('picked', on);
    c.querySelector('.pick').setAttribute('aria-pressed', String(on));
    const vis = show === 'all' || (show === 'picked' ? on : c.dataset.family === show);
    c.hidden = !vis; if (vis) shown++;
  }
  document.getElementById('count').textContent = (show === 'all' ? '' : shown + ' shown · ') + picks.size + ' picked';
  copy.disabled = picks.size === 0;
  list.textContent = text();
  list.classList.toggle('on', picks.size > 0 && show === 'picked');
  try { localStorage.setItem(KEY, JSON.stringify([...picks])); } catch (e) {}
}
document.getElementById('grid').addEventListener('click', (e) => {
  const b = e.target.closest('.pick'); if (!b) return;
  const n = +b.closest('.card').dataset.n;
  picks.has(n) ? picks.delete(n) : picks.add(n);
  render();
});
for (const chip of document.querySelectorAll('.chip')) chip.addEventListener('click', () => {
  show = chip.dataset.show;
  for (const c of document.querySelectorAll('.chip')) c.setAttribute('aria-pressed', String(c === chip));
  render();
});
copy.addEventListener('click', async () => {
  list.classList.add('on');
  try { await navigator.clipboard.writeText(text()); copy.textContent = 'Copied'; }
  catch (e) { copy.textContent = 'Select the list below'; }
  setTimeout(() => { copy.textContent = 'Copy picks'; }, 1800);
});
render();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(out, 'index.html'), html);
const files = [{ as: 'index.html', path: path.join(out, 'index.html') }, ...hands.map((h) => ({ as: `img/hand-${pad(h.n)}.jpg`, path: path.join(out, `img/hand-${pad(h.n)}.jpg`) }))];
fs.writeFileSync(path.join(root, 'out/thread-files.json'), JSON.stringify(files));
console.log('wrote', out, files.length, 'files');

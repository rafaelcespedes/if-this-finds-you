// thread-review.mjs: one page for the launch thread (drafts only, nothing is posted): the three posts with their
// options and X lengths, the video, the carousel letters to pick from (out/carousel/, `npm run carousel`), and how
// the number of hands was counted. Writes out/thread-review/, published as a private artifact from files.
//   node review/thread-review.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { xLength } from './x-count.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(root, 'out/thread-review');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'img'), { recursive: true });
const copy = JSON.parse(fs.readFileSync(path.join(here, 'thread-copy.json'), 'utf8'));
const cards = JSON.parse(fs.readFileSync(path.join(root, 'out/carousel.json'), 'utf8'));
const pad = (n) => String(n).padStart(2, '0');
// the cards as JPEG (the PNGs are the full-quality files to post)
for (const c of cards) {
  execFileSync('python3', ['-c', `from PIL import Image; Image.open(${JSON.stringify(path.join(root, `out/carousel/letter-${pad(c.n - 1)}.png`))}).convert('RGB').save(${JSON.stringify(path.join(out, `img/letter-${pad(c.n)}.jpg`))}, quality=86)`]);
}
// the final video once it's rendered, else the latest draft
const finalVideo = path.join(root, 'out/if-this-finds-you-x-1080.mp4');
fs.copyFileSync(fs.existsSync(finalVideo) ? finalVideo : path.join(root, 'out/draft-v8-540.mp4'), path.join(out, 'video.mp4'));

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const linkify = (s) => esc(s).replace(/https?:\/\/\S+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\//, '')}</a>`);
const post = (o, key, i) => {
  const n = xLength(o.text);
  return `<figure class="post">
    <figcaption><span class="opt">${esc(o.label)}</span><span class="len${n > 280 ? ' over' : ''}">${n} / 280</span></figcaption>
    <p class="body">${linkify(o.text).replace(/\n/g, '<br>')}</p>
    <button class="copy-one" type="button" data-copy="${key}-${i}">Copy</button>
  </figure>`;
};
const texts = Object.fromEntries(Object.entries(copy).flatMap(([k, arr]) => arr.map((o, i) => [`${k}-${i}`, o.text])));

const cardHtml = cards.map((c) => `
<article class="card" data-n="${c.n}">
  <button class="pick" type="button" aria-pressed="false" aria-label="Pick letter ${c.n}">
    <img src="img/letter-${pad(c.n)}.jpg" width="1080" height="1350" alt="${esc(c.alt)}" loading="lazy">
    <span class="heart" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/></svg></span>
  </button>
  <p class="cap"><b>${c.n}.</b> ${esc(c.credit)}, ${esc(c.year)} · ${esc(c.school)}</p>
</article>`).join('');
const cardData = JSON.stringify(cards.map((c) => ({ n: c.n, credit: c.credit, year: c.year, school: c.school, seed: c.seed, alt: c.alt })));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Launch thread: drafts</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,480&family=Schibsted+Grotesk:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  :root { --room: #e6e4de; --card: #f3eee1; --slip: #f8f5ec; --ink: #1e2733; --red: #9b3b2a; --muted: #575146; --edge: #d6ccb7; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--room); color: var(--ink); font: 400 16px/1.5 "Schibsted Grotesk", "Helvetica Neue", Arial, sans-serif; -webkit-text-size-adjust: 100%; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 32px 18px 80px; }
  h1 { font: 480 32px/1.15 Newsreader, Georgia, serif; letter-spacing: -0.015em; margin: 0 0 8px; }
  h2 { font: 480 25px/1.2 Newsreader, Georgia, serif; letter-spacing: -0.015em; margin: 48px 0 6px; }
  h3 { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--red); margin: 0 0 4px; }
  .lede, .note { color: var(--muted); margin: 0 0 14px; }
  .note b { color: var(--ink); font-weight: 600; }
  .post { margin: 12px 0; background: var(--slip); border: 1px solid var(--edge); border-radius: 12px; padding: 14px 16px 12px; }
  .post figcaption { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; color: var(--muted); margin-bottom: 8px; }
  .opt { font-weight: 600; color: var(--ink); }
  .len { font-variant-numeric: tabular-nums; }
  .len.over { color: var(--red); font-weight: 600; }
  .body { margin: 0 0 10px; font-size: 16.5px; line-height: 1.5; }
  .body a { color: #1d5fa8; text-decoration: none; }
  .copy-one, .copy { font-family: inherit; font-size: 13px; font-weight: 600; line-height: 1; padding: 10px 14px; border-radius: 999px; border: 1px solid var(--edge); background: var(--card); color: var(--ink); cursor: pointer; min-height: 40px; }
  .copy { background: var(--red); border-color: var(--red); color: #fff; }
  .copy:disabled { opacity: 0.45; }
  video { display: block; width: 100%; max-width: 480px; aspect-ratio: 1; border-radius: 10px; background: #000; margin: 10px 0 4px; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-top: 12px; }
  @media (min-width: 640px) { .grid { grid-template-columns: repeat(3, 1fr); } }
  .card { margin: 0; }
  .pick { position: relative; display: block; width: 100%; padding: 0; border: 0; background: none; cursor: pointer; border-radius: 8px; overflow: hidden; box-shadow: 0 0 0 1px var(--edge); transition: box-shadow 160ms ease-out; }
  .pick img { display: block; width: 100%; height: auto; }
  .heart { position: absolute; top: 8px; right: 8px; width: 38px; height: 38px; border-radius: 50%; background: rgba(248, 245, 236, 0.92); display: grid; place-items: center; }
  .heart svg { width: 20px; height: 20px; fill: none; stroke: var(--muted); stroke-width: 1.7; }
  .card.picked .pick { box-shadow: 0 0 0 3px var(--red); }
  .card.picked .heart svg { fill: var(--red); stroke: var(--red); }
  .cap { font-size: 13px; color: var(--muted); margin: 6px 2px 0; line-height: 1.35; }
  .cap b { color: var(--ink); }
  .bar { position: sticky; bottom: 12px; display: flex; gap: 10px; align-items: center; justify-content: space-between; background: var(--slip); border: 1px solid var(--edge); border-radius: 999px; padding: 6px 6px 6px 16px; margin-top: 16px; box-shadow: 0 6px 20px rgba(30, 39, 51, 0.08); }
  .bar span { font-size: 14px; font-variant-numeric: tabular-nums; }
  pre { white-space: pre-wrap; background: var(--slip); border: 1px solid var(--edge); border-radius: 8px; padding: 12px 14px; font: 13px/1.55 ui-monospace, "SF Mono", Menlo, monospace; display: none; }
  pre.on { display: block; }
  .math { background: var(--slip); border: 1px solid var(--edge); border-radius: 12px; padding: 14px 16px; }
  .math table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
  .math td { padding: 6px 0; border-bottom: 1px solid var(--edge); vertical-align: top; }
  .math td:last-child { text-align: right; padding-left: 12px; white-space: nowrap; }
  .math tr:last-child td { border-bottom: 0; font-weight: 600; }
  .math p { font-size: 14px; color: var(--muted); margin: 10px 0 0; }
  ul.qs { padding-left: 20px; margin: 8px 0; }
  ul.qs li { margin: 6px 0; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
</head>
<body>
<div class="wrap">
  <h1>Launch thread: drafts</h1>
  <p class="lede">Three posts for X, drafted in your voice. Nothing has been posted anywhere. Every draft fits in 280 characters as X counts them (a link counts as 23). Each Copy button copies one draft.</p>

  <h2>1. The hook, with the video</h2>
  <p class="note">The final video: 1080 × 1080, 30 fps, 29.9 s, with sound.</p>
  <video src="video.mp4" controls playsinline preload="metadata"></video>
  ${copy.post1.map((o, i) => post(o, 'post1', i)).join('')}

  <h2>2. Your favourites, as a carousel</h2>
  <p class="note">Eleven real letters from the collection, each in the hand the site gives it: the writer's era and school, its pen and its period paper, drawn by the engine. Tap the heart on <b>four</b>, then Copy picks and send me the list. Each image is 1080 × 1350, X's tallest. The caption on each card names the letter, the writer who copied it out, and the seed.</p>
  <section class="pickzone">
  <div class="grid" id="grid">${cardHtml}
  </div>
  <div class="bar"><span id="count">0 of 4 picked</span><button class="copy" id="copy" type="button" disabled>Copy picks</button></div>
  <pre id="list"></pre>
  </section>
  ${copy.post2.map((o, i) => post(o, 'post2', i)).join('')}

  <h3 style="margin-top:22px">How I counted the hands</h3>
  <div class="math">
    <table>
      <tr><td>Seed names the site makes: 36 first words × 34 second words × 90 numbers (10–99)</td><td>110,160</td></tr>
      <tr><td>Traditions any writer can write in (Chancery italic 1522 to Québec print today)</td><td>× 13</td></tr>
      <tr><td>Hands, before choosing a pen, ink, paper or any of the 19 sliders</td><td>1,432,080</td></tr>
    </table>
    <p>Every seed is its own writer: the engine draws every trait from the whole seed name. I checked 19,500 random seeds across all 13 traditions, and no two came out identical. The tool also takes any seed you type, and the pen, ink, paper and 19 sliders multiply the count further, so "over a million" undersells it.</p>
  </div>

  <h2>3. Pay it forward</h2>
  <p class="note">The About page lists six places to give: the Internet Archive, Project Gutenberg, the Wikimedia Foundation, the Fondation de BAnQ, Project Runeberg and the ICRC. <b>Do you want the About link in the post (A), or just "on the About page" (B)?</b> Either way, the homepage link comes last.</p>
  ${copy.post3.map((o, i) => post(o, 'post3', i)).join('')}

  <h2>What I need from you</h2>
  <ul class="qs">
    <li>Which option for posts 1, 2 and 3 (or your own words).</li>
    <li>Your four letters for the carousel.</li>
    <li>Then I render the final video and the four images at full size.</li>
  </ul>
</div>
<script>
const TEXTS = ${JSON.stringify(texts)};
const CARDS = ${cardData};
const byN = new Map(CARDS.map((c) => [c.n, c]));
const KEY = 'thread-carousel-picks-v1';
let picks = new Set();
try { picks = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) {}
const list = document.getElementById('list'), copy = document.getElementById('copy');
const text = () => [...picks].sort((a, b) => a - b).map((n) => { const c = byN.get(n); return n + '. ' + c.credit + ', ' + c.year + ' (' + c.school + ', seed ' + c.seed + ')'; }).join('\\n');
function render() {
  for (const el of document.querySelectorAll('.card')) {
    const on = picks.has(+el.dataset.n);
    el.classList.toggle('picked', on);
    el.querySelector('.pick').setAttribute('aria-pressed', String(on));
  }
  document.getElementById('count').textContent = picks.size + ' of 4 picked';
  copy.disabled = picks.size === 0;
  list.textContent = text();
  try { localStorage.setItem(KEY, JSON.stringify([...picks])); } catch (e) {}
}
document.getElementById('grid').addEventListener('click', (e) => {
  const b = e.target.closest('.pick'); if (!b) return;
  const n = +b.closest('.card').dataset.n;
  picks.has(n) ? picks.delete(n) : picks.add(n);
  render();
});
async function copyText(t, btn, label) {
  try { await navigator.clipboard.writeText(t); btn.textContent = 'Copied'; }
  catch (e) { btn.textContent = 'Copy failed: select the text'; }
  setTimeout(() => { btn.textContent = label; }, 1600);
}
copy.addEventListener('click', () => { list.classList.add('on'); copyText(text(), copy, 'Copy picks'); });
for (const b of document.querySelectorAll('.copy-one')) b.addEventListener('click', () => copyText(TEXTS[b.dataset.copy], b, 'Copy'));
render();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(out, 'index.html'), html);
const files = [
  { as: 'index.html', path: path.join(out, 'index.html') },
  { as: 'video.mp4', path: path.join(out, 'video.mp4') },
  ...cards.map((c) => ({ as: `img/letter-${pad(c.n)}.jpg`, path: path.join(out, `img/letter-${pad(c.n)}.jpg`) })),
];
fs.writeFileSync(path.join(root, 'out/thread-review-files.json'), JSON.stringify(files));
console.log('wrote', out, files.length, 'files');

// build.mjs: the private review page for the draft (storyboard, timing, tool, open questions), built from the
// same timing code the video uses, so the numbers on the page are the video's.
//   node review/build.mjs   (after rendering and extracting stills into out/v1/; writes out/review/)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { plan, DEFAULTS } from '../src/scene/timeline.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const promo = path.join(here, '..');
const outDir = path.join(promo, 'out/review');
fs.mkdirSync(outDir, { recursive: true });
const P30 = plan({ ...DEFAULTS, fps: 30 });
const P60 = plan({ ...DEFAULTS, fps: 60 });
const fps = 30;
const sec = (f) => (f / fps).toFixed(2);
const S = Object.fromEntries(P30.sections.map((s) => [s.id, s]));
const barOf = (f) => Math.floor((f / P30.fpb) / 4) + 1;
const bars = (s) => { const a = barOf(s.from), b = barOf(s.to - 1); return a === b ? `Bar ${a}` : `Bars ${a}–${b}`; };
const font = (f) => fs.readFileSync(path.join(promo, 'public/fonts', f)).toString('base64');

// ---- the flip's acceleration: hands per second over the flip, a step chart on a log scale ----
function chart(P) {
  const W = 680, H = 230, L = 56, R = 16, T = 18, B = 40;
  const f0 = S.title.to, f1 = S.land.from;
  const cuts = P.cuts.filter((c) => c.frame >= f0 && c.frame < f1);
  const x = (f) => L + ((f - f0) / (f1 - f0)) * (W - L - R);
  const ymax = Math.log2(160), ymin = Math.log2(1);
  const y = (r) => T + (1 - (Math.log2(r) - ymin) / (ymax - ymin)) * (H - T - B);
  let d = '';
  cuts.forEach((c, i) => {
    const next = cuts[i + 1]?.frame ?? f1;
    const rate = (c.perWord ? 4 : 1) * fps / Math.max(1, next - c.frame);
    d += `${i ? 'L' : 'M'}${x(c.frame).toFixed(1)},${y(rate).toFixed(1)}H${x(next).toFixed(1)}`;
  });
  let grid = '';
  for (const r of [1, 2, 4, 8, 16, 30, 60, 120]) grid += `<line x1="${L}" x2="${W - R}" y1="${y(r)}" y2="${y(r)}" class="g"/><text x="${L - 8}" y="${y(r) + 4}" text-anchor="end" class="t">${r}</text>`;
  for (let b = 0; b * P.fpb <= f1 - f0 + 0.5; b++) {
    const fx = x(f0 + b * P.fpb);
    grid += `<line x1="${fx}" x2="${fx}" y1="${H - B}" y2="${H - B + (b % 4 ? 4 : 9)}" class="a"/>`;
    if (b % 4 === 0) grid += `<text x="${fx}" y="${H - B + 22}" text-anchor="middle" class="t">bar ${barOf(f0 + b * P.fpb)}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Hands per second through the flip, doubling every step from 1.9 to 30, then 120 when each word has its own hand">
  ${grid}<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" class="a"/>
  <path d="${d}" class="line"/>
  <text x="${L}" y="12" class="t">hands a second (30 fps)</text></svg>`;
}

const img = (f, alt) => `<img src="img/f${String(f).padStart(4, '0')}.jpg" alt="${alt}" loading="lazy" width="540" height="540">`;
const board = [
  { s: S.title, frames: [0], title: 'Title', what: 'The phrase, already written, in the site’s wordmark hand (Québec school print, felt tip). Held four beats so it reads before anything moves.', term: 'Hold' },
  { s: S.flip, frames: [70, 150, 230, 290, 300], title: 'The flip', what: 'A new hand on every beat, then the gap halves: one a beat for 4 beats, two a beat for 2, then 4, 8 and 16 a beat for one beat each, then a new hand every frame for 6 beats. For the last 3 of those, each word takes its own hand. The paper, the size and the two baselines never move; only the ink changes. A “Hand no.” counter ticks with every cut, and the writer the site names for each hand shows while the cuts are slow enough to read. Ends on a brake: gaps of 1, 3, 4 and 8 frames into the downbeat.', term: 'Hard cuts (stepped), speed ramp, brake' },
  { s: S.land, frames: [330], title: 'Landing', what: `Hand no. ${String(P30.handsShown).padStart(4, '0')}: lunar-willow-41, Québec school print, fountain pen. Lands on a bar’s first beat and holds still for the bar.`, term: 'Hold' },
  { s: S.letter, frames: [400, 447, 470, 520, 560], title: 'The letter', what: 'Maybelle’s 1908 letter to Santa Claus, from the archive (undelivered), written out live in the landing hand: the engine’s own pen timing (a minute of writing) sped up about 35 times, to fit four beats. Then the rest dims and every e turns archival red; on each half beat every e takes another form (the forms this school has for e, each in a few of the hand’s own takes; no two neighbours show the same one at once). Four beats of e, then two of a, then two of r.', term: 'Rubrication (red letters), dim to focus, hard swaps' },
  { s: S.canvas, frames: [600, 690], title: 'All the letters', what: 'The camera pulls back on a log scale over four beats (ease in and out, no overshoot): Maybelle’s letter turns out to be one sheet among 63 on the Reading Room table, each a real letter from the archive in its own hand, on its own paper, with its title under it. Then a slow drift for four beats.', term: 'Continuity zoom (scale from the letter), drift' },
  { s: S.end, frames: [760, 820], title: 'End card', what: 'The title writes itself again in the wordmark hand, exactly where the video began, so the loop back to the first frame is seamless (X loops videos under a minute). “Open source”, “Thousands of handwritten fonts” and the ifthisfindsyou.app stamp arrive half a beat apart, each pressed in like a stamp (102% to 100% over five frames), then everything holds still.', term: 'Write-on, staggered stamp reveal, hold' },
];

const rows = board.map((r) => `
<article class="beat">
  <header><h3>${r.title}</h3><p class="when"><span>${bars(r.s)}</span><span>${sec(r.s.from)}–${sec(r.s.to)} s</span><span>${((r.s.to - r.s.from) / P30.fpb).toFixed(0)} beats</span></p></header>
  <div class="stills">${r.frames.map((f) => `<figure>${img(f, `${r.title}, ${sec(f)} s`)}<figcaption>${sec(f)} s</figcaption></figure>`).join('')}</div>
  <p>${r.what}</p>
  <p class="term">${r.term}</p>
</article>`).join('');

const beatTable = P30.sections.map((s) => `<tr><td>${s.label}</td><td>${bars(s)}</td><td class="n">${sec(s.from)}</td><td class="n">${sec(s.to)}</td><td class="n">${s.from}–${s.to - 1}</td><td class="n">${P60.sections.find((x) => x.id === s.id).from}–${P60.sections.find((x) => x.id === s.id).to - 1}</td></tr>`).join('');

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Launch video, draft 1</title>
<style>
@font-face { font-family: 'Junicode'; font-style: normal; font-weight: 400 600; font-stretch: 100% 112%; src: url(data:font/woff2;base64,${font('junicode-latin-roman.woff2')}) format('woff2'); }
@font-face { font-family: 'Junicode'; font-style: italic; font-weight: 400 600; font-stretch: 100% 112%; src: url(data:font/woff2;base64,${font('junicode-latin-italic.woff2')}) format('woff2'); }
:root {
  /* the Reading Room's own palette (app/src/themes/reading-room.css); one column of record cards on the room grey */
  --room: #e6e4de; --card: #f3eee1; --ink: #1e2733; --red: #9b3b2a; --muted: #575146; --rule: rgba(30,39,51,.14);
  --serif: 'Junicode', 'Iowan Old Style', Georgia, serif;
  color-scheme: light;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--room); color: var(--ink); font: 400 1.0625rem/1.5 var(--serif); }
main { max-width: 64rem; margin: 0 auto; padding: 2.5rem 1.25rem 5rem; display: grid; gap: 2.5rem; }
h1, h2, h3 { font-weight: 400; text-wrap: balance; margin: 0; }
h1 { font-size: 2.4rem; font-stretch: 112%; line-height: 1.1; }
h2 { font-size: 1.5rem; font-stretch: 112%; }
h3 { font-size: 1.25rem; font-stretch: 112%; }
.caps { font-variant-caps: all-small-caps; letter-spacing: .06em; color: var(--muted); }
.lede { display: grid; gap: .6rem; max-width: 42rem; }
.lede p { margin: 0; }
.specs { display: flex; flex-wrap: wrap; gap: .4rem 1.4rem; font-variant-caps: all-small-caps; letter-spacing: .06em; color: var(--muted); }
.specs b { color: var(--red); font-weight: 400; font-variant-numeric: tabular-nums; }
.player { display: grid; grid-template-columns: minmax(0, 34rem) minmax(0, 1fr); gap: 1.5rem; align-items: start; }
.player video { width: 100%; aspect-ratio: 1; background: var(--card); border: 1px solid var(--rule); }
.files { display: grid; gap: .5rem; font-size: .95rem; }
.files p { margin: 0; }
section { display: grid; gap: 1.1rem; }
.card { background: var(--card); border: 1px solid var(--rule); padding: 1.25rem 1.4rem; display: grid; gap: .8rem; }
.beat { background: var(--card); border: 1px solid var(--rule); padding: 1.1rem 1.3rem 1.2rem; display: grid; gap: .7rem; }
.beat header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: .4rem 1rem; border-bottom: 1px solid var(--rule); padding-bottom: .5rem; }
.when { margin: 0; display: flex; gap: 1rem; font-variant-caps: all-small-caps; letter-spacing: .06em; color: var(--red); font-variant-numeric: tabular-nums; }
.beat p { margin: 0; max-width: 46rem; }
.term { font-style: italic; color: var(--muted); }
.stills { display: grid; grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr)); gap: .6rem; }
figure { margin: 0; display: grid; gap: .25rem; }
figure img { width: 100%; height: auto; display: block; border: 1px solid var(--rule); }
figcaption { font-size: .8rem; color: var(--muted); font-variant-numeric: tabular-nums; }
svg { width: 100%; height: auto; }
svg .g { stroke: var(--rule); } svg .a { stroke: var(--muted); } svg .t { fill: var(--muted); font: 12px var(--serif); }
svg .line { fill: none; stroke: var(--red); stroke-width: 2.2; }
table { border-collapse: collapse; width: 100%; font-size: .95rem; }
th, td { text-align: left; padding: .35rem .6rem .35rem 0; border-bottom: 1px solid var(--rule); vertical-align: top; }
th { font-weight: 400; font-variant-caps: all-small-caps; letter-spacing: .06em; color: var(--muted); }
td.n { font-variant-numeric: tabular-nums; }
.wrap { overflow-x: auto; }
ol.q { margin: 0; padding-left: 1.4rem; display: grid; gap: .7rem; list-style: decimal; }
ol.q li::marker { color: var(--red); font-variant-numeric: tabular-nums; }
ul { margin: 0; padding-left: 1.2rem; display: grid; gap: .4rem; }
a { color: var(--red); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 1.1rem; }
.wide img { width: 100%; height: auto; border: 1px solid var(--rule); }
@media (max-width: 720px) { .player, .two { grid-template-columns: 1fr; } h1 { font-size: 1.9rem; } }
</style></head>
<body><main>
<header class="lede">
  <p class="caps">If This Finds You · launch video</p>
  <h1>Launch video, draft 1</h1>
  <p>A square video for X and Instagram, drawn frame by frame by the site’s own engine: every hand in it is generated, Maybelle’s letter is written out by the same code the site uses, and the table of letters is painted the way the Letters page paints them. No music yet; the cuts sit on a 112.5 BPM grid so any track at that tempo drops in.</p>
  <p class="specs"><span><b>${P30.seconds.toFixed(1)}</b> seconds</span><span><b>1080 × 1080</b></span><span><b>112.5</b> BPM, <b>13</b> bars</span><span><b>${P30.handsShown}</b> hands at 30 fps</span><span><b>${P60.handsShown}</b> at 60 fps</span></p>
</header>

<section class="player" aria-label="The draft">
  <video src="draft.mp4" poster="img/f0000.jpg" controls loop muted playsinline preload="metadata"></video>
  <div class="files">
    <h2>The draft</h2>
    <p>This is the 30 fps version for X, with a placeholder click on every beat (higher on each bar’s first beat) so the timing can be judged; unmute to hear it.</p>
    <p>Three files came with it: the X version (30 fps), a timing version with a bar and beat counter in the corner for trying tracks against, and a 60 fps version for Instagram, silent.</p>
    <p class="term">Rendered in about 80 seconds on this Mac. Every change below is a setting, not a re-edit.</p>
  </div>
</section>

<section>
  <h2>Beat by beat</h2>
  <p class="caps">A bar is four beats, 2.13 seconds. Times are at 30 fps.</p>
  ${rows}
</section>

<section class="two">
  <div class="card">
    <h2>How fast the flip gets</h2>
    ${chart(P30)}
    <p>The gap between cuts halves step by step, so the speed-up sounds steady: we hear tempo as a ratio. At 30 fps that is 16, 8, 4, 2 and then 1 frame per hand, all whole frames at this tempo. The jump to 120 is the last three beats, where each word has its own hand.</p>
  </div>
  <div class="card">
    <h2>Where the sections fall</h2>
    <div class="wrap"><table><thead><tr><th>Section</th><th>Bars</th><th>From, s</th><th>To, s</th><th>Frames, 30</th><th>Frames, 60</th></tr></thead><tbody>${beatTable}</tbody></table></div>
    <p>Change the tempo or where beat 1 falls in the track, and everything moves with it, in whole frames, without drifting.</p>
  </div>
</section>

<section class="card">
  <h2>The tool: Remotion, free for you</h2>
  <p>Remotion makes video from code and renders it with its own browser and encoder (nothing to install). Its free licence covers individuals and companies of up to three people, commercial use included, so it costs nothing here; a company of four or more would pay $25 per person a month. Remotion Studio gives a timeline you can scrub, with a settings panel for the tempo, the beat-1 offset, the inks, the labels, the landing hand and the letter.</p>
  <div class="wrap"><table><thead><tr><th>Option</th><th>Cost</th><th>Why not</th></tr></thead><tbody>
    <tr><td>HyperFrames (HeyGen)</td><td>Free</td><td>Has beat detection, but it’s before version 1.0 and needs ffmpeg installed.</td></tr>
    <tr><td>Motion Canvas</td><td>Free</td><td>No release since December 2024.</td></tr>
    <tr><td>After Effects</td><td>$22.99 a month</td><td>Can’t run the engine; hundreds of hands would come in as image sequences.</td></tr>
    <tr><td>Canvas and the browser’s encoder</td><td>Free</td><td>What the site’s own video export uses. No timeline to scrub.</td></tr>
  </tbody></table></div>
</section>

<section class="card wide">
  <h2>Choosing the landing hand</h2>
  <p>Maybelle’s letter in twelve of the sampled hands (frame at 15.7 s, the e’s mid-change). I picked the fifth, lunar-willow-41: a school print with a bold fountain pen, readable at phone size and right for a child’s letter. The red one (fourth) would clash with the red letters.</p>
  <img src="img/candidates.jpg" alt="Maybelle’s letter written in twelve candidate hands" width="1480" height="1112" loading="lazy">
</section>

<section class="card">
  <h2>Decisions for you</h2>
  <ol class="q">
    <li><b>Music.</b> Which track? Anything near 112.5 BPM fits as it is; another tempo works too. Tell me the BPM and where its first downbeat falls.</li>
    <li><b>Frame rate.</b> X’s help pages cap uploads at 40 fps, so the X version is 30 fps. The 60 fps version for Instagram makes the fastest stretch a smooth blur instead of a flicker. Post both?</li>
    <li><b>Hundreds of hands.</b> In the last three beats of the flip each word takes its own hand. That’s how it reaches ${P30.handsShown} at 30 fps; with whole phrases only it would be 138. Keep it?</li>
    <li><b>One ink.</b> Every hand writes in the same dark ink so only the handwriting changes. Each hand’s own ink (blue, black, sepia…) is a switch.</li>
    <li><b>Labels.</b> The red “Hand no.” counter and the writer’s name under the slow cuts: keep both, one, or neither?</li>
    <li><b>The letter.</b> Maybelle to Santa, 1908, is short, by an ordinary writer, and full of e’s. Alternatives: Emily Dickinson’s “Dear Peacock” (famous), or the 1889 pen-friend letter that opens “To the person in whose hands this message may fall” (on theme).</li>
    <li><b>“All the letters.”</b> I read it as the Letters table: real letters, each in its own hand. It could instead be a canvas of letterforms, the alphabet in hundreds of hands. And zoom only out, or out and then into another letter?</li>
    <li><b>End card.</b> The title in the wordmark’s hand (stacked, where the video began), “Open source”, “Thousands of handwritten fonts” and the address as a red stamp. Would you rather have the one-line logo?</li>
    <li><b>Flashing.</b> The fastest stretch changes the ink 30 times a second. The paper stays still and I left the heaviest and faintest pens out of the flip. Before posting, run the final file through a free flash checker such as PEAT.</li>
  </ol>
</section>

<section class="card">
  <h2>From the research</h2>
  <ul>
    <li>Type in motion that follows the music is usually driven from the beat grid in code: Rob Stenson’s animations for OH no Type Co., and his talk “A Font is a Percussion Instrument”. That’s how this draft is built.</li>
    <li>LettError’s Beowolf (1990) was the first font that changed its letters at random; they printed “thirty randomised E’s”. Worth a nod in the post.</li>
    <li>X plays videos muted in the timeline and loops anything under a minute, so the story has to read without sound and the end should run back into the start.</li>
    <li>Foundry launch films run 60 to 120 seconds; at under 30 this is shorter than all of them, closer to a social loop.</li>
    <li>Your saved references closest to this: a B cycling from hairline to ultra-bold (are.na), Space Type Generator’s field, and a three-line centred end card (are.na).</li>
  </ul>
</section>
</main></body></html>`;
fs.writeFileSync(path.join(outDir, 'index.html'), html);
console.log('wrote', path.join(outDir, 'index.html'), (html.length / 1024).toFixed(0), 'KB');

// capture-page.mjs: photograph the live Fonts page at 3× (headless Chrome over the DevTools protocol), scrolled into
// its list so the header and the sticky tester bar are at the top, with every row writing the pangram. The fonts
// video shows the page's own header and bar from this picture (public/fonts-page.png) and draws its list and the
// typing itself; the bar's tester box and the list's top edge are measured into src/data/fonts-page.json.
//   node scripts/capture-page.mjs [width=1024] [height=720] [tag]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const W = Number(process.argv[2] || 1024), H = Number(process.argv[3] || 720), DPR = 3;
// a tag for another size's files (fonts-page-<tag>.png, fonts-page-<tag>.json); none for the main one
const TAG = process.argv[4] ? `-${process.argv[4]}` : '';
const LINE = 'The quick brown fox jumps over the lazy dog';
const URL_ = `https://ifthisfindsyou.app/fonts?set=fontsvid&text=${encodeURIComponent(LINE)}`;
const chrome = path.resolve('node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell');
const port = 9333;
const proc = spawn(chrome, [`--remote-debugging-port=${port}`, '--hide-scrollbars', `--window-size=${W},${H}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let targets;
  for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
  await send('Page.enable');
  await send('Page.navigate', { url: URL_ });
  await sleep(7000);
  // into the list: the first row just under the sticky bar
  const info = await evaluate(`(async () => {
    const bar = document.querySelector('.fx-toolbar-wrap');
    window.scrollTo(0, 1600);
    await new Promise((r) => setTimeout(r, 3000));
    const r = (el) => el && el.getBoundingClientRect().toJSON();
    const header = document.querySelector('header');
    const input = document.querySelector('.fx-toolbar input, input[type="text"], textarea');
    const cs = input && getComputedStyle(input);
    const rows = [...document.querySelectorAll('.fx-row')].map(r).filter((b) => b.bottom > 0 && b.top < innerHeight);
    return { scrollY, header: r(header), bar: r(bar), input: r(input), inputStyle: cs && { fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color, paddingLeft: cs.paddingLeft, background: cs.backgroundColor, value: input.value }, rows, url: location.href };
  })()`);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(`public/fonts-page${TAG}.png`, Buffer.from(shot.result.data, 'base64'));
  fs.writeFileSync(`src/data/fonts-page${TAG}.json`, JSON.stringify({ width: W, height: H, dpr: DPR, ...info }, null, 1));
  console.log(JSON.stringify(info, null, 1));
  ws.close();
} finally {
  proc.kill();
}

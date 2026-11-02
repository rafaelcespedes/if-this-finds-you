// Build the same font the page exports, from Node, for verification with fontTools/HarfBuzz.
// Usage: node tools/node-export.mjs <seed> [print|script] [outfile]
// Loads opentype.js 1.3.4 (pinned) from jsdelivr, plus ../hershey-data.js, ../hand.js, ../fontbuild.js.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [seed = 'maple-river-42', style = 'print', outArg] = process.argv.slice(2);
const OT_URL = 'https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.js';
const otSrc = process.env.OPENTYPE_JS ? fs.readFileSync(process.env.OPENTYPE_JS, 'utf8') : await (await fetch(OT_URL)).text();
const ctx = { console, Math, Uint8Array, Float32Array, ArrayBuffer, DataView, Array, Object, String, Number, JSON, Error, TypeError, parseInt, Symbol, Map, Set, Int8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float64Array };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(otSrc, ctx);
for (const f of ['hershey-data.js', 'extras.js', 'hand.js', 'fontbuild.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const opentype = ctx.opentype;
const hand = ctx.Hand.makeHand(seed, style);
const t0 = Date.now();
const { buffer, info } = ctx.FontBuild.buildFont(opentype, hand, { alts: 3 });
const out = outArg || path.join(root, 'out', `${seed}-${style}.otf`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(buffer));
console.log(JSON.stringify({ out, ms: Date.now() - t0, ...info, verify: ctx.FontBuild.verify(opentype, buffer) }));

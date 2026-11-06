// Loading the two hand models once (public/hands/), for the video and the hand lab.
import { staticFile } from 'remotion';
import { parseGlb, type HandModel, type Side } from './glb';

let models: Promise<Record<Side, HandModel>> | null = null;
export function loadHands() {
  models ??= Promise.all(['left', 'right'].map((n) => fetch(staticFile(`hands/${n}.glb`)).then((r) => r.arrayBuffer())))
    .then(([l, r]) => ({ L: parseGlb(l, 'L'), R: parseGlb(r, 'R') }));
  return models;
}

let font: Promise<unknown> | null = null;
/** the interface's typeface (the keys, the bar), for drawing on a canvas */
export const UI_FONT = '"RR Schibsted", system-ui, sans-serif';
export function loadUiFont() {
  font ??= new FontFace('RR Schibsted', `url(${staticFile('fonts/schibsted-grotesk-latin.woff2')}) format('woff2')`, { weight: '400 900' })
    .load().then((f) => document.fonts.add(f));
  return font;
}

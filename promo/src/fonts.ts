// Junicode 2, the Reading Room's book face (OFL, public/fonts/OFL.txt), loaded before any frame is drawn.
import { staticFile } from 'remotion';

let ready: Promise<void> | null = null;
export function loadFonts() {
  if (ready) return ready;
  const faces = [
    new FontFace('RR Junicode', `url(${staticFile('fonts/junicode-latin-roman.woff2')}) format('woff2')`, { weight: '400 600', stretch: '100% 112%', style: 'normal' }),
    new FontFace('RR Junicode', `url(${staticFile('fonts/junicode-latin-italic.woff2')}) format('woff2')`, { weight: '400 600', stretch: '100% 112%', style: 'italic' }),
  ];
  ready = Promise.all(faces.map((f) => f.load().then((ff) => { document.fonts.add(ff); })))
    .then(() => undefined);
  return ready;
}

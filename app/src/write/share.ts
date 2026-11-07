// A note made into a picture to post (Share ▸ Post on X, Copy picture, Save). Rafael, 7 Nov 2026: "I'm posting most of
// these things on Twitter. It'd be nice if people could share it on Twitter … it creates some sort of raster asset".
// Three shapes, all made on this device from the note's first sheet (lib/actions.ts renderLiveSheets: the paper and
// ink the image download paints). Nothing is kept anywhere; the post links to the writing page, never to the note.
//   Square (the default)  the writing as large as it goes, a quiet foot with the wordmark and the address: reads in a
//                         phone's feed
//   Wide                  16:9, X's safest shape, the same foot
//   The page              the whole first sheet lying on the desk, with the writer's name (a landscape card in a
//                         landscape frame)
// The crop: the ink with a margin, centred, never so tight one word becomes a poster; when it would take most of the
// sheet's width it shows the whole sheet lying on the desk instead (its printed details and edges whole, never cut on
// one side); a note longer than the frame shows from its top and fades out, never a hard cut through a line.
import type { InkBox, SheetShot } from '@/lib/actions';

export type ShareShape = 'square' | 'wide' | 'page';
export const SHARE_SHAPES: { id: ShareShape; label: string }[] = [
  { id: 'square', label: 'Square' },
  { id: 'wide', label: 'Wide' },
  { id: 'page', label: 'The page' },
];
export const SHARE_ADDRESS = 'ifthisfindsyou.app/write';
export const SHARE_URL = 'https://ifthisfindsyou.app/write';

const ROOM = '#e6e4de';
const INK = '#1e2733';
const MUTED = '#575146';
const FONT = `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, 'Segoe UI', Roboto, sans-serif`;

// ---------- the wordmark, drawn in a colour (its SVG is currentColor); without it, the name in type ----------
let markSvg: Promise<string> | null = null;
async function wordmark(color: string): Promise<HTMLImageElement | null> {
  try {
    markSvg ??= fetch('/brand/wordmark-5.svg').then((r) => (r.ok ? r.text() : Promise.reject(new Error('no wordmark'))));
    const svg = (await markSvg).replace(/currentColor/g, color);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch {
    markSvg = null; // a network hiccup isn't kept: the next picture asks again
    return null;
  }
}
/** The wordmark at height h with its left edge at x (or the name in type, if the drawing couldn't be had). */
function drawMark(g: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, midY: number, h: number) {
  if (img) {
    g.drawImage(img, x, midY - h / 2, (img.naturalWidth / img.naturalHeight) * h, h);
    return;
  }
  g.fillStyle = INK;
  g.font = `600 ${Math.round(h * 0.8)}px ${FONT}`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText('If This Finds You', x, midY);
}
function drawText(g: CanvasRenderingContext2D, text: string, x: number, midY: number, px: number, align: CanvasTextAlign) {
  g.fillStyle = MUTED;
  g.font = `400 ${px}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(text, x, midY);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Crop = { sx: number; sy: number; sw: number; sh: number; fade: boolean };
/** The part of a sheet (W × H) to show in a frame of this aspect, for ink at b. */
function cropTo(W: number, H: number, b: InkBox, aspect: number): Crop {
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const pad = Math.max(bw, bh * aspect) * 0.1;
  // the sheet's very edge (torn, deckled) stays out of a crop that sits inside it
  const ex = W * 0.02, ey = H * 0.015;
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  // a card (a postcard, a notecard: as wide as it's tall, or wider) is shown whole: its print is part of it
  const card = W >= H * 0.9;
  let w = card ? Infinity : Math.max(bw + 2 * pad, (bh + 2 * pad) * aspect, W * 0.32);
  // the writing itself takes most of the sheet's width: the whole sheet, lying on the desk, rather than one side cut
  // (judged on the writing, not on the crop widened below, or a few lines would shrink to a strip; QA 7 Nov)
  const wide = w > (W - 2 * ex) * 0.8;
  // writing near the sheet's left edge (binding holes, a margin rule): the crop starts at the edge itself, so nothing
  // there is cut in half, and reaches as far right as the writing does
  const snap = !card && !wide && cx - w / 2 < W * 0.12;
  if (snap) w = Math.min(Math.max(w, b.x1 + pad - ex), W - 2 * ex);
  if (wide) w = Math.max(Math.min(w, W * 1.5), W * 1.12);
  let h = w / aspect;
  const tall = bh + 2 * pad > h;
  // a short note that still takes nearly the sheet's height (or a card): the whole sheet, all of it, with desk round
  // it. A note longer than the frame shows from its top and fades out at the foot instead (never shrunk to fit)
  if (card || (!tall && h >= H * 0.9)) {
    w = Math.max(W * 1.12, H * 1.12 * aspect);
    h = w / aspect;
    return { sx: (W - w) / 2, sy: (H - h) / 2, sw: w, sh: h, fade: false };
  }
  const inside = w <= W - 2 * ex;
  const sx = !inside ? (W - w) / 2 : snap ? ex : clamp(cx - w / 2, ex, W - ex - w);
  // centred on the writing; near the sheet's top, a little of the desk above it rather than the writing pushed up
  const sy = tall
    ? clamp(b.y0 - pad, inside ? ey : 0, H - h)
    : clamp(cy - h / 2, -h * 0.08, H - h - (inside ? ey : 0));
  return { sx, sy, sw: w, sh: h, fade: tall && sy + h < b.y1 };
}

/** That part of the sheet in a box (the desk's colour round the sheet, with a soft shadow where the desk shows). */
function drawCrop(g: CanvasRenderingContext2D, S: HTMLCanvasElement, r: Crop, w: number, h: number) {
  const k = w / r.sw;
  g.save();
  g.beginPath();
  g.rect(0, 0, w, h);
  g.clip();
  g.fillStyle = ROOM;
  g.fillRect(0, 0, w, h);
  g.save();
  if (r.sx < 0 || r.sy < 0 || r.sy + r.sh > S.height) {
    g.shadowColor = 'rgba(40,30,20,0.14)';
    g.shadowBlur = 28;
    g.shadowOffsetY = 10;
  }
  g.drawImage(S, -r.sx * k, -r.sy * k, S.width * k, S.height * k);
  g.restore();
  // a note longer than the frame: it fades into the desk, never a hard cut through a line
  if (r.fade) {
    const f = g.createLinearGradient(0, h * 0.8, 0, h);
    f.addColorStop(0, 'rgba(230,228,222,0)');
    f.addColorStop(1, ROOM);
    g.fillStyle = f;
    g.fillRect(0, h * 0.8, w, h * 0.2);
  }
  g.restore();
}

function frame(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) throw new Error('This browser could not create an image.');
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  return { c, g };
}

/** A picture with the writing above a quiet foot: the wordmark left, the address right (sized to read in a feed). */
async function withFoot(S: HTMLCanvasElement, ink: InkBox, W: number, H: number, foot: number, markH: number, textPx: number) {
  const { c, g } = frame(W, H);
  const paperH = H - foot;
  drawCrop(g, S, cropTo(S.width, S.height, ink, W / paperH), W, paperH);
  g.fillStyle = ROOM;
  g.fillRect(0, paperH, W, foot);
  const mid = paperH + foot / 2;
  drawMark(g, await wordmark(INK), 64, mid, markH);
  drawText(g, SHARE_ADDRESS, W - 64, mid, textPx, 'right');
  return c;
}

/** The picture for a shape, from the note's first sheet. */
export async function sharePicture(sheet: SheetShot, shape: ShareShape, writer: string): Promise<HTMLCanvasElement> {
  const S = sheet.canvas;
  const ink = sheet.ink;
  if (!ink) throw new Error('Nothing written yet.');
  if (shape === 'square') return withFoot(S, ink, 1200, 1200, 160, 42, 30);
  if (shape === 'wide') return withFoot(S, ink, 1600, 900, 150, 46, 36);
  // the page: the whole sheet lying on the desk, a little askew, its writer's name under it; a landscape card
  // (a postcard, a notecard) gets a landscape frame
  const wideSheet = S.width > S.height;
  const FW = wideSheet ? 1350 : 1080, FH = wideSheet ? 1080 : 1350;
  const { c, g } = frame(FW, FH);
  g.fillStyle = ROOM;
  g.fillRect(0, 0, FW, FH);
  const room = { w: FW - 2 * 80, h: FH - 70 - 150 };
  const k = Math.min(room.w / S.width, room.h / S.height);
  const w = S.width * k, h = S.height * k;
  g.save();
  g.translate(FW / 2, 70 + room.h / 2);
  g.rotate((-1.1 * Math.PI) / 180);
  g.shadowColor = 'rgba(40,30,20,0.16)';
  g.shadowBlur = 40;
  g.shadowOffsetY = 18;
  g.drawImage(S, -w / 2, -h / 2, w, h);
  g.restore();
  const mid = FH - 75;
  drawMark(g, await wordmark(INK), 72, mid, 38);
  drawText(g, writer ? `In the hand of ${writer}` : SHARE_ADDRESS, FW - 72, mid, 28, 'right');
  return c;
}

export const toPng = (c: HTMLCanvasElement) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('The picture could not be made.'))), 'image/png'));

/** X's post box, the words filled in (a picture can't be: it's pasted, or comes through the share sheet). */
export const xIntent = (text: string) => `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(SHARE_URL)}`;

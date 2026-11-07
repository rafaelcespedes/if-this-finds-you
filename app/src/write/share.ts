// A note made into a picture to post (Share ▸ Post on X, Copy image, Save). Rafael, 7 Nov 2026: "I'm posting most of
// these things on Twitter. It'd be nice if people could share it on Twitter … it creates some sort of raster asset".
// Three shapes, all made on this device from the note's own sheets (lib/actions.ts renderLiveSheets: the paper and
// ink the image download paints); nothing is uploaded, and the post links to the writing page, never to the note.
//   Square (the default)  the paper to the edges, the writing as large as it goes, a quiet foot with the wordmark and
//                         the address: reads in a phone's feed
//   Wide                  16:9, X's safest shape, the paper full bleed and the wordmark in a pill in its corner
//   The page              the whole first sheet lying on the desk, with the writer's name: for a full page
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

// ---------- the wordmark, drawn in a colour (its SVG is currentColor) ----------
let markSvg: Promise<string> | null = null;
async function wordmark(color: string): Promise<HTMLImageElement> {
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
}
const drawMark = (g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, h: number, align: 'left' | 'center' | 'right' = 'left') => {
  const w = (img.naturalWidth / img.naturalHeight) * h;
  const left = align === 'left' ? x : align === 'center' ? x - w / 2 : x - w;
  g.drawImage(img, left, y, w, h);
  return w;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The part of a sheet to show in a frame of this aspect: the ink with a margin round it, as large as it goes, centred
 * on it, never narrower than half the sheet (one word isn't blown up to a poster). A note that needs more than the
 * sheet's width shows the whole sheet lying on the desk (sx < 0), up to half as wide again; longer still, it shows from
 * its top. The sheet's very edge stays out of a crop that fits inside it.
 */
function cropTo(W: number, H: number, ink: InkBox | null, aspect: number) {
  const b = ink ?? { x0: W * 0.1, y0: H * 0.08, x1: W * 0.9, y1: H * 0.36 };
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const pad = Math.max(bw, bh * aspect) * 0.09;
  const edge = W * 0.015;
  const w = Math.min(Math.max(bw + 2 * pad, (bh + 2 * pad) * aspect, W * 0.5), W * 1.5);
  const h = w / aspect;
  const sx = w <= W - 2 * edge ? clamp((b.x0 + b.x1) / 2 - w / 2, edge, W - edge - w) : (W - w) / 2;
  const tall = bh + 2 * pad > h;
  const sy = clamp(tall ? b.y0 - pad : (b.y0 + b.y1) / 2 - h / 2, 0, Math.max(0, H - h));
  return { sx, sy, sw: w, sh: h };
}

/** Draw that part of the sheet into a box (on the desk's colour, the sheet with a soft shadow where the desk shows). */
function drawCrop(g: CanvasRenderingContext2D, S: HTMLCanvasElement, r: ReturnType<typeof cropTo>, w: number, h: number) {
  const k = w / r.sw;
  g.save();
  g.beginPath();
  g.rect(0, 0, w, h);
  g.clip();
  g.fillStyle = ROOM;
  g.fillRect(0, 0, w, h);
  if (r.sx < 0 || r.sy + r.sh > S.height) {
    g.shadowColor = 'rgba(40,30,20,0.14)';
    g.shadowBlur = 28;
    g.shadowOffsetY = 10;
  }
  g.drawImage(S, -r.sx * k, -r.sy * k, S.width * k, S.height * k);
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

/** The picture for a shape, from the note's sheets (the first; "The page" too, for now). */
export async function sharePicture(sheets: SheetShot[], shape: ShareShape, writer: string): Promise<HTMLCanvasElement> {
  const first = sheets[0];
  if (!first) throw new Error('Nothing written yet.');
  const S = first.canvas;
  if (shape === 'square') {
    const { c, g } = frame(1200, 1200);
    const paperH = 1040;
    drawCrop(g, S, cropTo(S.width, S.height, first.ink, 1200 / paperH), 1200, paperH);
    g.fillStyle = ROOM;
    g.fillRect(0, paperH, 1200, 1200 - paperH);
    const mark = await wordmark(INK);
    drawMark(g, mark, 64, paperH + (160 - 34) / 2, 34);
    g.fillStyle = MUTED;
    g.font = `400 24px ${FONT}`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    g.fillText(SHARE_ADDRESS, 1200 - 64, paperH + 80);
    return c;
  }
  if (shape === 'wide') {
    const { c, g } = frame(1600, 900);
    drawCrop(g, S, cropTo(S.width, S.height, first.ink, 1600 / 900), 1600, 900);
    // the wordmark in a small pill of paper in the corner
    const mark = await wordmark(INK);
    const mh = 24, mw = (mark.naturalWidth / mark.naturalHeight) * mh;
    const pw = mw + 36, ph = mh + 24, px = 1600 - 44 - pw, py = 900 - 36 - ph;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.10)';
    g.shadowBlur = 6;
    g.shadowOffsetY = 1;
    g.fillStyle = 'rgba(246,243,236,0.9)';
    g.beginPath();
    g.roundRect(px, py, pw, ph, ph / 2);
    g.fill();
    g.restore();
    drawMark(g, mark, px + 18, py + 12, mh);
    return c;
  }
  // the page: the whole sheet lying on the desk, a little askew, its writer's name under it
  const { c, g } = frame(1080, 1350);
  g.fillStyle = ROOM;
  g.fillRect(0, 0, 1080, 1350);
  const room = { w: 1080 - 2 * 80, h: 1350 - 70 - 140 };
  const k = Math.min(room.w / S.width, room.h / S.height);
  const w = S.width * k, h = S.height * k;
  g.save();
  g.translate(540, 70 + room.h / 2);
  g.rotate((-1.1 * Math.PI) / 180);
  g.shadowColor = 'rgba(40,30,20,0.16)';
  g.shadowBlur = 40;
  g.shadowOffsetY = 18;
  g.drawImage(S, -w / 2, -h / 2, w, h);
  g.restore();
  const mark = await wordmark(INK);
  drawMark(g, mark, 72, 1350 - 46 - 30, 30);
  if (writer) {
    g.fillStyle = MUTED;
    g.font = `400 22px ${FONT}`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    g.fillText(`In the hand of ${writer}`, 1080 - 72, 1350 - 46 - 15);
  }
  return c;
}

export const toPng = (c: HTMLCanvasElement) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('The image could not be encoded.'))), 'image/png'));

/** X's post box, the words filled in (a picture can't be: it's pasted, or comes through the share sheet). */
export const xIntent = (text: string) => `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(SHARE_URL)}`;

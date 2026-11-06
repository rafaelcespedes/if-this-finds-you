// Rafael's MacBook keyboard and trackpad (macbook.ts) on a canvas, in the look of the video's keyboard (keyboard.ts
// drawKeyboard): frosted glass plates over the paper, quiet white keys, the pressed ones sinking.
import { MAC_KEYS, TRACKPAD, WELL } from './macbook';

const INK = '#1e2733', MUTED = '#575146';
export interface MmFrame { PX: number; ox: number; oy: number }
const px = (f: MmFrame, x: number, y: number) => ({ x: f.ox + x * f.PX, y: f.oy - y * f.PX });

/** a glass plate (x, y, w, h px; corner R): what's under it blurred, whitened, its two shadows outside it */
function glass(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, R: number, k0: number, o: { top?: number; bottom?: number } = {}) {
  const shape = () => { ctx.beginPath(); ctx.roundRect(x, y, w, h, R); };
  const m = 48 * k0;
  const under = document.createElement('canvas');
  under.width = Math.ceil(w + 2 * m); under.height = Math.ceil(h + 2 * m);
  under.getContext('2d')!.drawImage(ctx.canvas, x - m, y - m, under.width, under.height, 0, 0, under.width, under.height);
  for (const [dy, b, a] of [[18, 44, 0.13], [2, 6, 0.06]] as const) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.roundRect(x, y, w, h, R); ctx.clip('evenodd');
    ctx.shadowColor = `rgba(30, 39, 51, ${a})`; ctx.shadowBlur = b * k0; ctx.shadowOffsetY = dy * k0; ctx.shadowOffsetX = 0;
    shape(); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
  }
  ctx.save();
  shape(); ctx.clip();
  ctx.filter = `blur(${16 * k0}px)`;
  ctx.drawImage(under, x - m, y - m);
  ctx.filter = 'none';
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, `rgba(255,255,255,${o.top ?? 0.62})`); g.addColorStop(1, `rgba(255,255,255,${o.bottom ?? 0.38})`);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(x, y, w, k0);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2 * k0; shape(); ctx.stroke();
  ctx.restore();
}

/** the keyboard and the trackpad, keys down by code (0..1) */
export function drawMacbook(ctx: CanvasRenderingContext2D, f: MmFrame, down: Map<string, number>, font: string, k0: number) {
  ctx.save();
  // the trackpad first (the keyboard's shadow falls over its top edge)
  const tp = px(f, TRACKPAD.x - TRACKPAD.w / 2, TRACKPAD.y + TRACKPAD.h / 2);
  glass(ctx, tp.x, tp.y, TRACKPAD.w * f.PX, TRACKPAD.h * f.PX, TRACKPAD.r * f.PX, k0, { top: 0.5, bottom: 0.34 });
  ctx.beginPath(); ctx.roundRect(tp.x, tp.y, TRACKPAD.w * f.PX, TRACKPAD.h * f.PX, TRACKPAD.r * f.PX);
  ctx.strokeStyle = 'rgba(30, 39, 51, 0.07)'; ctx.lineWidth = 1.5 * k0; ctx.stroke();
  const pad = 2.2;
  const wl = px(f, WELL.x - WELL.w / 2 - pad, WELL.y + WELL.h / 2 + pad);
  glass(ctx, wl.x, wl.y, (WELL.w + 2 * pad) * f.PX, (WELL.h + 2 * pad) * f.PX, 7 * f.PX, k0);
  const r = 2.4 * f.PX;
  for (const kk of MAC_KEYS) {
    if (kk.code === 'TouchID') {
      const c = px(f, kk.x, kk.y);
      ctx.beginPath(); ctx.roundRect(c.x - (kk.w / 2) * f.PX, c.y - (kk.h / 2) * f.PX, kk.w * f.PX, kk.h * f.PX, r);
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
      ctx.beginPath(); ctx.arc(c.x, c.y, (kk.h / 2 - 2.2) * f.PX, 0, 2 * Math.PI); ctx.strokeStyle = 'rgba(30, 39, 51, 0.08)'; ctx.lineWidth = 1.2 * k0; ctx.stroke();
      continue;
    }
    const d = down.get(kk.code) ?? 0;
    const tl = px(f, kk.x - kk.w / 2, kk.y + kk.h / 2);
    const x = tl.x, y = tl.y + d * 0.6 * f.PX, w = kk.w * f.PX, h = kk.h * f.PX;
    const shape = () => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
    if (d < 1) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.roundRect(x, y, w, h, r); ctx.clip('evenodd');
      ctx.shadowColor = `rgba(30, 39, 51, ${0.12 * (1 - d)})`; ctx.shadowBlur = (1 - d) * 3 * k0; ctx.shadowOffsetY = (1 - d) * 2 * k0;
      shape(); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.restore();
    }
    shape();
    ctx.fillStyle = `rgba(${255 - 34 * d}, ${255 - 32 * d}, ${255 - 28 * d}, ${0.78 + 0.12 * d})`; ctx.fill();
    ctx.save(); shape(); ctx.clip(); ctx.strokeStyle = 'rgba(30, 39, 51, 0.06)'; ctx.lineWidth = 2 * k0; shape(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = d > 0.3 ? INK : MUTED;
    const P = f.PX;
    if (kk.small) {
      const size = (kk.code.startsWith('Arrow') ? 2.4 : kk.code.startsWith('F') && kk.code.length <= 3 ? 2.3 : 2.75) * P;
      ctx.font = `450 ${size}px ${font}`;
      ctx.textBaseline = 'alphabetic';
      const al = kk.align ?? 'center';
      ctx.textAlign = al === 'left' ? 'left' : al === 'right' ? 'right' : 'center';
      const lx = al === 'left' ? x + 1.9 * P : al === 'right' ? x + w - 1.9 * P : x + w / 2;
      if (kk.code.startsWith('Arrow')) { ctx.textBaseline = 'middle'; ctx.fillText(kk.label, x + w / 2, y + h / 2 + 0.1 * P); continue; }
      ctx.fillText(kk.label, lx, y + h - 1.8 * P);
      if (kk.sub) { ctx.font = `450 ${3.4 * P}px ${font}`; ctx.fillText(kk.sub, lx, y + 5.2 * P); }
    } else if (kk.sub) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `450 ${3.5 * P}px ${font}`;
      ctx.fillText(kk.sub, x + w / 2, y + h * 0.33);
      ctx.fillText(kk.label, x + w / 2, y + h * 0.7);
    } else if (kk.label) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `450 ${5.0 * P}px ${font}`;
      ctx.fillText(kk.label, x + w / 2, y + h / 2 + 0.2 * P);
    }
  }
  ctx.restore();
}

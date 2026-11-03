// The small physical marks a letter picks up over its life, true to its era (docs: the side notes'
// stationery-adornments.md): the creases of how it was folded, what's left of the wafer or wax that sealed it, the
// pin or clip that held it in a bundle and the rust it left, foxing, and a tide line where it got wet. Planned with
// the printed marks (lib/paper/marks.ts, the adorned set) and painted once into the paper, under the writing.
// Nothing here is a real institution's mark. Lengths in mm.
import type { Ctx2D } from './paint';
import { rng } from './rng';

export type AdornKind = 'fold' | 'seal' | 'pin' | 'clip' | 'fox' | 'tide';

/** What paintAdornment needs: where, how big, which variant, and its numbers (creases, spots). */
export interface Adornment {
  kind: AdornKind;
  x: number;
  y: number;
  size: number;
  rot: number;
  ink: string;
  /** the variant ('brass', 'steel', 'wax', 'wafer') */
  text: { label?: string };
  data?: number[];
  seed: string;
}

const TAU = Math.PI * 2;

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
// fine random grain (made once): worn, matt patches in a seal's colour
let grain: AnyCanvas | null = null;
function grainTile() {
  if (grain) return grain;
  const S = 64;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d') as Ctx2D;
  const img = g.createImageData(S, S);
  const r = rng('adorn:grain');
  for (let i = 0; i < S * S; i++) img.data[i * 4 + 3] = Math.round(255 * Math.pow(r(), 2.2));
  g.putImageData(img, 0, 0);
  return (grain = c);
}

/** A seeded lumpy closed outline round (cx, cy), radius r (px), as a path on ctx. */
function blob(ctx: Ctx2D, r: () => number, cx: number, cy: number, rad: number, lump = 0.22, n = 14) {
  const pts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU + (r() - 0.5) * 0.3;
    const d = rad * (1 - lump / 2 + r() * lump);
    return [cx + Math.cos(a) * d, cy + Math.sin(a) * d];
  });
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.quadraticCurveTo(x0, y0, mx, my);
  }
  const [x0, y0] = pts[0], [x1, y1] = pts[1];
  ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  ctx.closePath();
}

/** Paint one adornment onto a sheet (ctx at the sheet's origin, already clipped to it; k px per mm). */
export function paintAdornment(ctx: Ctx2D, a: Adornment, k: number, W: number, H: number) {
  const r = rng(a.seed);
  ctx.save();
  switch (a.kind) {
    // creases: a soft shadow on one side of the fold and a hair of light on the other, fading toward the ends;
    // data is [axis (0 across, 1 down, 2 a tag slit), position mm, tilt radians, …]
    case 'fold': {
      const d = a.data ?? [];
      for (let i = 0; i < d.length; i += 3) {
        const axis = d[i], at = d[i + 1], tilt = d[i + 2];
        if (axis === 2) {
          // a slit cut for the paper tag that closed the packet: a short dark cut with a pale lip
          ctx.save();
          ctx.translate(at * k, tilt * k);
          ctx.rotate((r() - 0.5) * 0.2);
          ctx.lineCap = 'round';
          ctx.strokeStyle = 'rgba(70, 55, 35, 0.45)';
          ctx.lineWidth = Math.max(0.8, 0.18 * k);
          ctx.beginPath(); ctx.moveTo(-1.8 * k, 0); ctx.lineTo(1.8 * k, 0); ctx.stroke();
          ctx.strokeStyle = 'rgba(255, 252, 244, 0.5)';
          ctx.lineWidth = Math.max(0.6, 0.12 * k);
          ctx.beginPath(); ctx.moveTo(-1.6 * k, 0.25 * k); ctx.lineTo(1.6 * k, 0.25 * k); ctx.stroke();
          ctx.restore();
          continue;
        }
        const len = axis === 0 ? W : H;
        const [x0, y0, x1, y1] = axis === 0
          ? [-2 * k, at * k - Math.tan(tilt) * len * k * 0.5, (len + 2) * k, at * k + Math.tan(tilt) * len * k * 0.5]
          : [at * k - Math.tan(tilt) * len * k * 0.5, -2 * k, at * k + Math.tan(tilt) * len * k * 0.5, (len + 2) * k];
        const nx = axis === 0 ? 0 : 1, ny = axis === 0 ? 1 : 0;
        const side = r() < 0.5 ? 1 : -1;
        const bend = (r() - 0.5) * 0.8 * k;
        const fade = (c: string, alpha: number) => {
          const g = ctx.createLinearGradient(x0, y0, x1, y1);
          g.addColorStop(0, `rgba(${c},${(alpha * 0.4).toFixed(3)})`);
          g.addColorStop(0.2 + r() * 0.2, `rgba(${c},${alpha.toFixed(3)})`);
          g.addColorStop(0.6 + r() * 0.2, `rgba(${c},${(alpha * (0.6 + r() * 0.4)).toFixed(3)})`);
          g.addColorStop(1, `rgba(${c},${(alpha * 0.5).toFixed(3)})`);
          return g;
        };
        const line = (off: number) => {
          ctx.beginPath();
          ctx.moveTo(x0 + nx * off, y0 + ny * off);
          ctx.quadraticCurveTo((x0 + x1) / 2 + nx * (off + bend), (y0 + y1) / 2 + ny * (off + bend), x1 + nx * off, y1 + ny * off);
          ctx.stroke();
        };
        // the shadowed side: wide and soft (two widths stacked, no blur, which would cost a sheet's width)
        ctx.globalCompositeOperation = 'multiply';
        ctx.strokeStyle = fade('120, 100, 70', 0.05);
        ctx.lineWidth = 1.4 * k;
        line(side * 0.45 * k);
        ctx.strokeStyle = fade('120, 100, 70', 0.07);
        ctx.lineWidth = 0.7 * k;
        line(side * 0.3 * k);
        // the crease itself: a hair of darker line
        ctx.strokeStyle = fade('90, 75, 50', 0.12);
        ctx.lineWidth = Math.max(0.6, 0.12 * k);
        line(0);
        // the lit side
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = fade('255, 253, 246', 0.38);
        ctx.lineWidth = Math.max(0.6, 0.3 * k);
        line(-side * 0.3 * k);
      }
      break;
    }
    // what's left of a wafer or a wax seal where the letter was opened: a broken disc, matt, with fibres torn up
    // round it
    case 'seal': {
      const cx = a.x * k, cy = a.y * k, R = (a.size / 2) * k;
      const wax = a.text.label === 'wax';
      ctx.translate(cx, cy);
      ctx.rotate(a.rot);
      // the paper's surface pulled up where the seal came away: paler and a little rough, fading out
      const pull = ctx.createRadialGradient(R * 0.25, 0, R * 0.2, R * 0.25, 0, R * 1.35);
      pull.addColorStop(0, 'rgba(255, 252, 244, 0.32)');
      pull.addColorStop(0.7, 'rgba(255, 252, 244, 0.16)');
      pull.addColorStop(1, 'rgba(255, 252, 244, 0)');
      ctx.fillStyle = pull;
      blob(ctx, r, R * 0.25, 0, R * 1.3, 0.35, 16);
      ctx.fill();
      // the fragment, on its own canvas: the part of the disc that stayed on this side, its torn edge ragged, matt
      // and patchy where it wore
      const S = Math.ceil(R * 2.6);
      const f = makeCanvas(S, S);
      const g = f.getContext('2d') as Ctx2D;
      g.translate(S / 2, S / 2);
      blob(g, r, 0, 0, R, wax ? 0.35 : 0.12, wax ? 11 : 18);
      g.clip();
      g.fillStyle = a.ink;
      const cut = (0.1 + r() * 0.35) * R;
      g.beginPath();
      g.moveTo(-R * 1.2, -R * 1.2);
      g.lineTo(cut, -R * 1.2);
      for (let i = 0; i <= 12; i++) g.lineTo(cut + (r() - 0.5) * R * 0.3, -R + (2 * R * i) / 12);
      g.lineTo(-R * 1.2, R * 1.2);
      g.closePath();
      g.fill();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 6; i++) {
        const px = S / 2 + (r() - 0.65) * R * 1.6, py = S / 2 + (r() - 0.5) * R * 1.8, pr = R * (0.15 + r() * 0.35);
        const w = g.createRadialGradient(px, py, 0, px, py, pr);
        w.addColorStop(0, `rgba(0,0,0,${(0.35 + r() * 0.4).toFixed(2)})`);
        w.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = w;
        g.fillRect(0, 0, S, S);
      }
      const grain = g.createPattern(grainTile(), 'repeat');
      if (grain) {
        grain.setTransform(new DOMMatrix().scale(Math.max(0.5, k * 0.09)));
        g.globalAlpha = wax ? 0.35 : 0.55;
        g.fillStyle = grain;
        g.fillRect(0, 0, S, S);
      }
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = wax ? 0.8 : 0.62;
      ctx.drawImage(f, -S / 2, -S / 2);
      break;
    }
    // a pin pushed in and out of the bundle: two small holes, each with a halo where the metal stained the paper
    // (brass greyish green, steel rust), and between them a faint trace of the shaft
    case 'pin': {
      const gap = (a.size / 2) * k;
      ctx.translate(a.x * k, a.y * k);
      ctx.rotate(a.rot);
      const steel = a.text.label === 'steel';
      const halo = steel ? '160, 92, 40' : '95, 100, 75';
      ctx.globalCompositeOperation = 'multiply';
      for (const s of [-1, 1]) {
        const hx = s * gap, hr = (steel ? 1.6 + r() * 1.6 : 1 + r() * 1) * k;
        const g = ctx.createRadialGradient(hx + (r() - 0.5) * k, (r() - 0.5) * k * 0.6, 0, hx, 0, hr);
        g.addColorStop(0, `rgba(${halo}, ${steel ? 0.34 : 0.26})`);
        g.addColorStop(0.45, `rgba(${halo}, ${steel ? 0.14 : 0.1})`);
        g.addColorStop(1, `rgba(${halo}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(hx - hr, -hr, hr * 2, hr * 2);
      }
      ctx.strokeStyle = `rgba(${halo}, ${steel ? 0.1 : 0.05})`;
      ctx.lineWidth = 0.6 * k;
      ctx.shadowColor = `rgba(${halo}, 0.3)`;
      ctx.shadowBlur = 0.4 * k;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-gap, 0); ctx.lineTo(gap, 0); ctx.stroke();
      ctx.shadowBlur = 0;
      // the holes: dark, with the fibres pushed up round them
      for (const s of [-1, 1]) {
        const hx = s * gap;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(255, 252, 244, 0.55)';
        ctx.beginPath(); ctx.arc(hx + 0.08 * k, 0.08 * k, 0.48 * k, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(45, 35, 25, 0.75)';
        ctx.beginPath(); ctx.arc(hx, 0, Math.max(0.6, 0.3 * k), 0, TAU); ctx.fill();
      }
      break;
    }
    // a paperclip's rust, not the clip: the wire's outline, broken, strongest where the wire pressed
    case 'clip': {
      // traced on a small canvas of its own, then laid down once, softened
      const L = a.size * k, w = 8 * k, m = Math.ceil(1.5 * k);
      const c = makeCanvas(Math.ceil(w + 2 * m), Math.ceil(L + 2 * m));
      const g = c.getContext('2d') as Ctx2D;
      g.translate(m + w / 2, m);
      g.lineCap = 'round';
      // the wire's loops: outer (full width) and inner (narrower, shorter), from the top edge down
      const loops: [number, number, number][] = [[0, w, L], [1.4 * k, w - 2.8 * k, L * 0.72]];
      for (const [x0, lw, len] of loops) {
        const rad = lw / 2;
        // walk the loop in short dashes, the rust uneven along it and missing in places
        const segs = 46;
        const total = 2 * (len - rad) + Math.PI * rad;
        let prev: [number, number] | null = null;
        for (let i = 0; i <= segs; i++) {
          const d = (i / segs) * total;
          let px: number, py: number;
          if (d < len - rad) { px = x0; py = d; }
          else if (d < len - rad + Math.PI * rad) { const an = Math.PI - (d - (len - rad)) / rad; px = x0 + rad + Math.cos(an) * rad; py = len - rad + Math.sin(an) * rad; }
          else { px = x0 + lw; py = len - rad - (d - (len - rad + Math.PI * rad)); }
          const p: [number, number] = [px - w / 2, py];
          // strongest near the top, where the clip gripped; fading toward its far end, gone in places
          if (prev && r() > 0.14) {
            const grip = 1 - 0.75 * (py / len);
            g.strokeStyle = `rgba(150, 82, 32, ${((0.05 + r() * 0.16) * grip).toFixed(3)})`;
            g.lineWidth = (0.35 + r() * 0.45) * k;
            g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(p[0], p[1]); g.stroke();
          }
          prev = p;
        }
      }
      ctx.translate(a.x * k, a.y * k);
      ctx.rotate(a.rot);
      ctx.globalCompositeOperation = 'multiply';
      ctx.shadowColor = 'rgba(150, 80, 30, 0.35)';
      ctx.shadowBlur = 0.7 * k;
      ctx.drawImage(c, -w / 2 - m, -m);
      break;
    }
    // foxing: a cluster of small reddish-brown spots, each with a darker core; data is [x, y, radius, …] in mm
    case 'fox': {
      ctx.globalCompositeOperation = 'multiply';
      const d = a.data ?? [];
      for (let i = 0; i < d.length; i += 3) {
        const x = d[i] * k, y = d[i + 1] * k, rad = d[i + 2] * k;
        const s = 0.5 + r() * 0.5;
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, `rgba(160, 105, 50, ${(0.36 * s).toFixed(3)})`);
        g.addColorStop(0.35, `rgba(170, 120, 65, ${(0.2 * s).toFixed(3)})`);
        g.addColorStop(1, 'rgba(176, 138, 90, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      break;
    }
    // a tide line: where water came in from an edge and dried, the paper faintly tinted inside and a brown rim at
    // its furthest reach
    case 'tide': {
      const cx = a.x * k, cy = a.y * k, R = a.size * k;
      ctx.globalCompositeOperation = 'multiply';
      blob(ctx, r, cx, cy, R, 0.3, 18);
      ctx.fillStyle = 'rgba(190, 155, 100, 0.07)';
      ctx.fill();
      // the rim: a soft band, a little darker at its outer edge
      ctx.strokeStyle = 'rgba(160, 115, 60, 0.07)';
      ctx.lineWidth = 1.6 * k;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(140, 95, 45, 0.09)';
      ctx.lineWidth = 0.45 * k;
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

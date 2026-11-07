// The keyboard: only the keys a short letter needs, on a floating glass plate at the bottom of the frame. Laid out in
// frame pixels; the hands (hands/) work in millimetres over the same layout, a key pitch being 19 mm as on any
// keyboard. The plain video draws it with HTML (InkDemo.tsx); the one with hands draws it on a canvas (drawKeyboard)
// so the ghost hands can bend and blur what's under them.

export interface Key { id: string; label: string; x: number; y: number; w: number; h: number; small?: boolean; align?: 'left' | 'right' }
export interface Keyboard {
  keys: Key[];
  plate: { x: number; y: number; w: number; h: number };
  /** a key's width, the gap between keys, a key's height (px) */
  unit: { U: number; G: number; H: number };
  /** the frame's scale against 1080 (its shorter side) */
  k0: number;
}
export const S0 = 1080;
export const PLATE = { pad: 22, radius: 30 };
/** the keyboard's (and the bar's) margin from the frame's sides, and from its bottom, at 1080 */
export const MARGIN_SIDE = 48;
export const KEY_PITCH_MM = 19;

/** the keyboard for a frame S wide and SH tall: centred, as far from the bottom as from the sides. `scale` < 1 makes
 *  the keys smaller (the plate shrinks with them, still centred); `top` puts the plate's top edge there (px) instead. */
export function keyboard(S: number, SH: number, o: { scale?: number; top?: number; full?: boolean } = {}): Keyboard {
  // sized from the frame's shorter side (so a wide frame doesn't get giant keys), centred across its width
  const D = Math.min(S, SH), k0 = D / S0;
  // the keys sized so the plate spans the shorter side less MARGIN_SIDE each side (a 72 px key at 66 px before)
  let fit = ((D - 2 * (MARGIN_SIDE + PLATE.pad) * k0) / ((1080 - 2 * (66 + PLATE.pad)) * k0)) * (o.scale ?? 1);
  // the letters as they sit on any keyboard (each row a little further in), with the few keys the letter uses
  // (`full`: a number row, brackets and ⌥ too, for the walkthrough of every interaction: InkEvery.tsx)
  const rows: { offset: number; keys: [string, string, number, ('left' | 'right')?][] }[] = o.full ? [
    { offset: 0, keys: [['1', '1', 1], ['2', '2', 1], ['3', '3', 1], ['4', '4', 1], ['5', '5', 1], ['6', '6', 1], ['7', '7', 1], ['8', '8', 1], ['9', '9', 1], ['0', '0', 1], ['-', '-', 1], ['Backspace', 'delete', 1.45, 'right']] },
    { offset: 0.5, keys: [['q', 'Q', 1], ['w', 'W', 1], ['e', 'E', 1], ['r', 'R', 1], ['t', 'T', 1], ['y', 'Y', 1], ['u', 'U', 1], ['i', 'I', 1], ['o', 'O', 1], ['p', 'P', 1], ['[', '[', 1], [']', ']', 1]] },
    { offset: 0.8, keys: [['a', 'A', 1], ['s', 'S', 1], ['d', 'D', 1], ['f', 'F', 1], ['g', 'G', 1], ['h', 'H', 1], ['j', 'J', 1], ['k', 'K', 1], ['l', 'L', 1], ['Enter', 'return', 1.65, 'right']] },
    { offset: -0.55, keys: [['Shift', 'shift', 2.05, 'left'], ['z', 'Z', 1], ['x', 'X', 1], ['c', 'C', 1], ['v', 'V', 1], ['b', 'B', 1], ['n', 'N', 1], ['m', 'M', 1], [',', ',', 1], ['.', '.', 1], ['/', '/', 1]] },
    { offset: 0, keys: [['Alt', '⌥', 1.15], ['Meta', '⌘', 1.3], [' ', '', 5.2]] },
  ] : [
    { offset: 0, keys: [['q', 'Q', 1], ['w', 'W', 1], ['e', 'E', 1], ['r', 'R', 1], ['t', 'T', 1], ['y', 'Y', 1], ['u', 'U', 1], ['i', 'I', 1], ['o', 'O', 1], ['p', 'P', 1], ['Backspace', 'delete', 1.45, 'right']] },
    { offset: 0.3, keys: [['a', 'A', 1], ['s', 'S', 1], ['d', 'D', 1], ['f', 'F', 1], ['g', 'G', 1], ['h', 'H', 1], ['j', 'J', 1], ['k', 'K', 1], ['l', 'L', 1], ['Enter', 'return', 1.6, 'right']] },
    { offset: -0.55, keys: [['Shift', 'shift', 1.55, 'left'], ['z', 'Z', 1], ['x', 'X', 1], ['c', 'C', 1], ['v', 'V', 1], ['b', 'B', 1], ['n', 'N', 1], ['m', 'M', 1], [',', ',', 1], ['.', '.', 1]] },
    { offset: 0, keys: [['Meta', '⌘', 1.3], [' ', '', 5.2]] },
  ];
  // (the full keyboard is wider: its keys a little smaller, so its plate spans the same width)
  if (o.full) {
    const wide = (r: (typeof rows)[number]) => r.keys.reduce((a, [, , w]) => a + w, 0) + (8 / 72) * (r.keys.length - 1) + Math.abs(r.offset);
    fit *= (1080 - 2 * (66 + PLATE.pad)) / 72 / Math.max(...rows.slice(0, -1).map(wide));
  }
  const U = 72 * k0 * fit, G = 8 * k0 * fit, H = 64 * k0 * fit;
  const rowW = (r: (typeof rows)[number]) => r.keys.reduce((a, [, , w]) => a + w * U, 0) + G * (r.keys.length - 1);
  const last = rows.length - 1;
  const W = Math.max(...rows.slice(0, last).map((r) => rowW(r) + Math.abs(r.offset) * U));
  const x0 = (S - W) / 2;
  // the plate as far from the bottom edge as from the sides (of a square frame; centred in a wider one)
  const pad0 = PLATE.pad * k0, side = MARGIN_SIDE * k0;
  const plateH = rows.length * H + (rows.length - 1) * G + 2 * pad0;
  const top = o.top != null ? o.top + pad0 : SH - side - plateH + pad0;
  const keys: Key[] = [];
  rows.forEach((row, r) => {
    // the letter rows staggered as on a keyboard; the bottom row centred under the space between them
    let x = r === last ? (S - rowW(row)) / 2 : x0 + (row.offset > 0 ? row.offset * U : 0);
    if (row.offset < 0) x = x0;
    for (const [id, label, w, align] of row.keys) {
      keys.push({ id, label, x, y: top + r * (H + G), w: w * U, h: H, small: label.length > 1 && !/^[⌘⌥]$/.test(label), align });
      x += w * U + G;
    }
  });
  const pad = PLATE.pad * k0;
  const minX = Math.min(...keys.map((kk) => kk.x)), maxX = Math.max(...keys.map((kk) => kk.x + kk.w));
  const maxY = Math.max(...keys.map((kk) => kk.y + kk.h));
  return { keys, plate: { x: minX - pad, y: top - pad, w: maxX - minX + 2 * pad, h: maxY - top + 2 * pad }, unit: { U, G, H }, k0 };
}

/** a recorded key as the keys it presses */
export function keysOf(key: string): string[] {
  if (key === 'Meta+z') return ['Meta', 'z'];
  if (key === 'Meta+u') return ['Meta', 'u'];
  if (key === 'Meta+b') return ['Meta', 'b'];
  if (key === 'BackspaceHold') return ['Backspace'];
  if (key === 'click' || key === 'select') return [];
  if (/^[A-Z]$/.test(key)) return ['Shift', key.toLowerCase()];
  return [key];
}

/** the keyboard of the video with hands: smaller keys (HAND_KEYS of the plain one's), its plate's top where the plain
 *  one's is (so the writing keeps its room), leaving the space under it for the backs of the hands */
export const HAND_KEYS = 0.75;
export function handKeyboard(S: number, SH: number, scale = HAND_KEYS): Keyboard {
  return keyboard(S, SH, { scale, top: keyboard(S, SH).plate.y });
}

// ---------- millimetres: where the hands live ----------
/** frame px ↔ world mm for a keyboard: x from the frame's centre, y up from the home row's centre line, a key pitch of
 *  19 mm */
export function mmFrame(kb: Keyboard, S: number) {
  const a = kb.keys.find((k) => k.id === 'a')!;
  const PX = (kb.unit.U + kb.unit.G) / KEY_PITCH_MM;
  const ox = S / 2, oy = a.y + a.h / 2;
  return {
    PX, ox, oy,
    toPx: (x: number, y: number) => ({ x: ox + x * PX, y: oy - y * PX }),
    toMm: (x: number, y: number) => ({ x: (x - ox) / PX, y: (oy - y) / PX }),
  };
}
/** the keys in world mm (their centres and sizes), the same for any frame: the layout scales as one */
export function keysMm(): Map<string, { x: number; y: number; w: number; h: number }> {
  const kb = keyboard(S0, S0);
  const f = mmFrame(kb, S0);
  return new Map(kb.keys.map((k) => {
    const c = f.toMm(k.x + k.w / 2, k.y + k.h / 2);
    return [k.id, { x: c.x, y: c.y, w: k.w / f.PX, h: k.h / f.PX }];
  }));
}

// ---------- the keyboard on a canvas (the video with hands) ----------
const INK = '#1e2733', MUTED = '#575146';
/** the plate and its keys as the HTML version draws them (InkDemo.tsx), onto ctx over what's already there (the paper):
 *  the plate's glass blurs the paper under it, keys sink as they're pressed (down: key id → 0..1) */
export function drawKeyboard(ctx: CanvasRenderingContext2D, kb: Keyboard, down: Map<string, number>, font: string) {
  const { plate: pl, k0 } = kb, R = PLATE.radius * k0;
  ctx.save();
  // the glass: what's under it, blurred, then the white of the plate, with its two shadows below
  const under = document.createElement('canvas');
  under.width = Math.ceil(pl.w + 96 * k0); under.height = Math.ceil(pl.h + 96 * k0);
  under.getContext('2d')!.drawImage(ctx.canvas, pl.x - 48 * k0, pl.y - 48 * k0, under.width, under.height, 0, 0, under.width, under.height);
  const plateShape = () => { ctx.beginPath(); ctx.roundRect(pl.x, pl.y, pl.w, pl.h, R); };
  for (const [y, b, a] of [[18, 44, 0.13], [2, 6, 0.06]] as const) {
    ctx.save();
    // the shadow only outside the plate (as CSS draws a box-shadow), so the translucent glass doesn't darken
    ctx.beginPath(); ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.roundRect(pl.x, pl.y, pl.w, pl.h, R); ctx.clip('evenodd');
    ctx.shadowColor = `rgba(30, 39, 51, ${a})`; ctx.shadowBlur = b * k0; ctx.shadowOffsetY = y * k0;
    ctx.shadowOffsetX = 0;
    plateShape(); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
  }
  ctx.save();
  plateShape(); ctx.clip();
  ctx.filter = `blur(${16 * k0}px)`;
  ctx.drawImage(under, pl.x - 48 * k0, pl.y - 48 * k0);
  ctx.filter = 'none';
  const g = ctx.createLinearGradient(0, pl.y, 0, pl.y + pl.h);
  g.addColorStop(0, 'rgba(255,255,255,0.62)'); g.addColorStop(1, 'rgba(255,255,255,0.38)');
  ctx.fillStyle = g; ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
  // its edges: a white line across the top, a faint white rim all round
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(pl.x, pl.y, pl.w, k0);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2 * k0; plateShape(); ctx.stroke();
  ctx.restore();
  // the keys
  for (const kk of kb.keys) {
    const d = down.get(kk.id) ?? 0;
    const y = kk.y + d * 2 * k0, r = 12 * k0;
    const shape = () => { ctx.beginPath(); ctx.roundRect(kk.x, y, kk.w, kk.h, r); };
    if (d < 1) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.roundRect(kk.x, y, kk.w, kk.h, r); ctx.clip('evenodd');
      ctx.shadowColor = `rgba(30, 39, 51, ${0.12 * (1 - d)})`; ctx.shadowBlur = (1 - d) * 3 * k0; ctx.shadowOffsetY = (1 - d) * 2 * k0;
      shape(); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.restore();
    }
    shape();
    ctx.fillStyle = `rgba(${255 - 34 * d}, ${255 - 32 * d}, ${255 - 28 * d}, ${0.78 + 0.12 * d})`; ctx.fill();
    ctx.save(); shape(); ctx.clip(); ctx.strokeStyle = 'rgba(30, 39, 51, 0.06)'; ctx.lineWidth = 2 * k0; shape(); ctx.stroke(); ctx.restore();
    ctx.fillStyle = d > 0.3 ? INK : MUTED;
    const size = (kk.small ? 15 : kk.id === 'Meta' ? 24 : 23) * k0;
    ctx.font = `450 ${size}px ${font}`;
    if (kk.small) {
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = kk.align === 'left' ? 'left' : kk.align === 'right' ? 'right' : 'center';
      const x = kk.align === 'left' ? kk.x + 11 * k0 : kk.align === 'right' ? kk.x + kk.w - 11 * k0 : kk.x + kk.w / 2;
      ctx.fillText(kk.label, x, y + kk.h - 9 * k0 - 0.22 * size);
    } else if (kk.label) {
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      ctx.fillText(kk.label, kk.x + kk.w / 2, y + kk.h / 2 + 0.06 * size);
    }
  }
  ctx.restore();
}

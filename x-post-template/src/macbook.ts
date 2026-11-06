// Rafael's keyboard: a 16-inch MacBook Pro (2021), US layout, in millimetres. World mm as the hands use them (x right,
// y forward toward the screen, z up; the key tops at z = 0), centred across the keyboard, y = 0 on the home row's
// centre line. A key pitch of 19 mm; the trackpad below. The phone's video of a take is mapped onto this layout
// (scripts/take-hands.py), so the ghost hands land on these keys where his fingers landed on his.

export interface MacKey { code: string; label: string; sub?: string; x: number; y: number; w: number; h: number; small?: boolean; align?: 'left' | 'right' | 'center' }
export const PITCH = 19;
/** a key cap's gap to its neighbours, mm */
const GAP = 2.6;
const CAP_H = PITCH - GAP;

type Row = [code: string, label: string, span: number, opts?: { sub?: string; small?: boolean; align?: 'left' | 'right'; half?: 'top' | 'bottom' }][];
const L = (code: string, ch: string): Row[number] => [code, ch.toUpperCase(), 1];
const ROWS: { y: number; keys: Row }[] = [
  { y: 3.08, keys: [['Escape', 'esc', 1.3, { small: true, align: 'left' }], ...Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, `F${i + 1}`, 1.0167, { small: true }] as Row[number]), ['TouchID', '', 1]] },
  { y: 2, keys: [['Backquote', '~', 1, { sub: '`' }], ...'1234567890'.split('').map((d, i) => [`Digit${d}`, d, 1, { sub: '!@#$%^&*()'[i] }] as Row[number]), ['Minus', '–', 1, { sub: '_' }], ['Equal', '=', 1, { sub: '+' }], ['Backspace', 'delete', 1.5, { small: true, align: 'right' }]] },
  { y: 1, keys: [['Tab', 'tab', 1.5, { small: true, align: 'left' }], ...'qwertyuiop'.split('').map((c) => L(`Key${c.toUpperCase()}`, c)), ['BracketLeft', '[', 1, { sub: '{' }], ['BracketRight', ']', 1, { sub: '}' }], ['Backslash', '\\', 1, { sub: '|' }]] },
  { y: 0, keys: [['CapsLock', 'caps lock', 1.75, { small: true, align: 'left' }], ...'asdfghjkl'.split('').map((c) => L(`Key${c.toUpperCase()}`, c)), ['Semicolon', ';', 1, { sub: ':' }], ['Quote', '’', 1, { sub: '"' }], ['Enter', 'return', 1.75, { small: true, align: 'right' }]] },
  { y: -1, keys: [['ShiftLeft', 'shift', 2.25, { small: true, align: 'left' }], ...'zxcvbnm'.split('').map((c) => L(`Key${c.toUpperCase()}`, c)), ['Comma', ',', 1, { sub: '<' }], ['Period', '.', 1, { sub: '>' }], ['Slash', '/', 1, { sub: '?' }], ['ShiftRight', 'shift', 2.25, { small: true, align: 'right' }]] },
  { y: -2, keys: [['Fn', 'fn', 1, { small: true, align: 'left' }], ['ControlLeft', 'control', 1, { small: true, align: 'right' }], ['AltLeft', 'option', 1, { small: true, align: 'right' }], ['MetaLeft', 'command', 1.25, { small: true, align: 'right', sub: '⌘' }], ['Space', '', 5], ['MetaRight', 'command', 1.25, { small: true, align: 'left', sub: '⌘' }], ['AltRight', 'option', 1, { small: true, align: 'left' }], ['ArrowLeft', '◀', 1, { small: true, half: 'bottom' }], ['ArrowUp', '▲', 1, { small: true, half: 'top' }], ['ArrowRight', '▶', 1, { small: true, half: 'bottom' }]] },
];
/** the row's width, in pitches */
export const ROW_U = 14.5;

function build(): MacKey[] {
  const out: MacKey[] = [];
  for (const row of ROWS) {
    let u = -ROW_U / 2;
    for (const [code, label, span, o = {}] of row.keys) {
      const cx = (u + span / 2) * PITCH, cy = row.y * PITCH;
      const w = span * PITCH - GAP;
      if (o.half) {
        const h = (CAP_H - 1) / 2;
        out.push({ code, label, x: cx, y: o.half === 'top' ? cy + h / 2 + 0.5 : cy - h / 2 - 0.5, w, h, small: true, align: 'center' });
        if (code === 'ArrowUp') out.push({ code: 'ArrowDown', label: '▼', x: cx, y: cy - h / 2 - 0.5, w, h, small: true, align: 'center' });
      } else {
        out.push({ code, label, sub: o.sub, x: cx, y: cy, w, h: CAP_H, small: o.small, align: o.align ?? 'center' });
      }
      u += span;
    }
  }
  return out;
}
export const MAC_KEYS = build();
export const MAC_KEY = new Map(MAC_KEYS.map((k) => [k.code, k]));
/** the well the keys sit in (mm: centre x, y; size) */
export const WELL = (() => {
  const x0 = Math.min(...MAC_KEYS.map((k) => k.x - k.w / 2)), x1 = Math.max(...MAC_KEYS.map((k) => k.x + k.w / 2));
  const y0 = Math.min(...MAC_KEYS.map((k) => k.y - k.h / 2)), y1 = Math.max(...MAC_KEYS.map((k) => k.y + k.h / 2));
  const pad = 3.2;
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
})();
/** the trackpad (mm: centre x, y; size), as measured in the take's video */
export const TRACKPAD = { x: 2, y: -103, w: 157, h: 101, r: 8 };

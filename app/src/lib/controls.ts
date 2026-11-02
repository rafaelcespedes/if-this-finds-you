// The control set (docs/research/controls-and-feel.md §4). Every slider is seed-relative: the thumb
// starts at this hand's natural value (marked on the track) and moving it adds an offset, so a new
// hand is never dragged toward the same setting.
//
// zone decides what New hand does with your offset (§3, "the mental model to put on screen"):
//   who  - the writer: rerolled, offsets cleared
//   how  - today's writing: the seed sets a resting value, your offset persists
//   with - pen, ink, paper: kept as you set them
import { PARAMS, type Hand } from '@engine';
import { words } from './hands';
import { PENDING_PARAMS, PREVIEW, supports } from './engine-features';
import { clamp } from './utils';

export type Zone = 'who' | 'how' | 'with';
export type AdvancedGroup = 'Pens and ink' | 'Writing and page' | 'Letters and variety';

export interface SliderControl {
  /** engine param key (app-level keys: lineSpacing) */
  key: string;
  /** two-letter code in share links */
  code: string;
  label: string;
  ends: [string, string];
  min: number;
  max: number;
  step: number;
  zone: Zone;
  tier: 'primary' | 'advanced';
  group?: AdvancedGroup;
  /** natural value when the hand doesn't carry one */
  fallback: number;
  describe: (v: number) => string;
  /** app-level: handled by the app, not passed to the engine */
  app?: boolean;
  /** only shown for styles where it makes sense */
  when?: (ctx: { connected: boolean }) => boolean;
}

const ends = (l: string, r: string, mid = 'Medium') => (lo: number, hi: number) => (v: number) => {
  const t = (v - lo) / (hi - lo || 1);
  return t < 0.3 ? l : t > 0.7 ? r : mid;
};

function def(c: Omit<SliderControl, 'describe' | 'step'> & { step?: number; describe?: (v: number) => string }): SliderControl {
  const eng = PARAMS.find((d) => d.key === c.key);
  const min = eng?.min != null ? clamp(c.min, eng.min, eng.max ?? c.max) : c.min;
  const max = eng?.max != null ? clamp(c.max, eng.min ?? c.min, eng.max) : c.max;
  return {
    step: c.step ?? eng?.step ?? (max - min) / 100,
    describe: c.describe ?? ends(c.ends[0], c.ends[1])(min, max),
    ...c,
    min,
    max,
  };
}

export const CONTROLS: SliderControl[] = [
  // ---------- primary: how it's written ----------
  def({ key: 'neatness', code: 'ne', label: 'Neatness', ends: ['Hurried', 'Careful'], min: 0.05, max: 1, zone: 'how', tier: 'primary', fallback: 0.6, describe: words.neatness }),
  def({ key: 'hurry', code: 'hu', label: 'Hurry', ends: ['Calm', 'Rushed'], min: 0, max: 1, step: 0.01, zone: 'how', tier: 'primary', fallback: 0.35, describe: ends('Calm', 'Rushed', 'Steady')(0, 1) }),
  def({ key: 'pressure', code: 'pr', label: 'Pressure', ends: ['Light', 'Heavy'], min: 0, max: 0.95, zone: 'how', tier: 'primary', fallback: 0.35, describe: words.pressure }),
  def({ key: 'slant', code: 'sl', label: 'Slant', ends: ['Back', 'Forward'], min: -15, max: 30, zone: 'who', tier: 'primary', fallback: 4, describe: words.slant }),

  // ---------- advanced: pens and ink ----------
  def({ key: 'penWidth', code: 'pw', label: 'Tip size', ends: ['Fine', 'Bold'], min: 14, max: 110, step: 1, zone: 'with', tier: 'advanced', group: 'Pens and ink', fallback: 56, describe: words.penWidth }),
  def({ key: 'inkFlow', code: 'if', label: 'Ink flow', ends: ['Dry', 'Wet'], min: 0, max: 1, step: 0.01, zone: 'with', tier: 'advanced', group: 'Pens and ink', fallback: 0.5 }),
  def({ key: 'inkVariation', code: 'iv', label: 'Ink variation', ends: ['Even', 'Lively'], min: 0, max: 1, step: 0.01, zone: 'with', tier: 'advanced', group: 'Pens and ink', fallback: 0.4 }),
  def({ key: 'paperTooth', code: 'pt', label: 'Paper tooth', ends: ['Smooth', 'Toothy'], min: 0, max: 1, step: 0.01, zone: 'with', tier: 'advanced', group: 'Pens and ink', fallback: 0.4 }),
  def({ key: 'nibAngle', code: 'na', label: 'Nib angle', ends: ['Flat', 'Steep'], min: 0, max: 90, step: 1, zone: 'who', tier: 'advanced', group: 'Pens and ink', fallback: 38, describe: (v) => `${Math.round(v)}°` }),

  // ---------- advanced: writing and page ----------
  def({ key: 'lineSpacing', code: 'ls', label: 'Line spacing', ends: ['Tight', 'Airy'], min: 0.8, max: 1.5, step: 0.01, zone: 'who', tier: 'advanced', group: 'Writing and page', fallback: 1, app: true, describe: (v) => `${v.toFixed(2)}×` }),
  def({ key: 'lineRhythm', code: 'lr', label: 'Line rhythm', ends: ['Even', 'Wandering'], min: 0, max: 1, step: 0.01, zone: 'how', tier: 'advanced', group: 'Writing and page', fallback: 0.3 }),
  def({ key: 'drift', code: 'bw', label: 'Baseline wobble', ends: ['Steady', 'Wavy'], min: 0, max: 1.6, step: 0.01, zone: 'how', tier: 'advanced', group: 'Writing and page', fallback: 0.7 }),
  def({ key: 'marginDiscipline', code: 'md', label: 'Margins', ends: ['Strict', 'Loose'], min: 0, max: 1, step: 0.01, zone: 'how', tier: 'advanced', group: 'Writing and page', fallback: 0.3 }),
  def({ key: 'tracking', code: 'lt', label: 'Letter spacing', ends: ['Close', 'Open'], min: -30, max: 80, step: 1, zone: 'who', tier: 'advanced', group: 'Writing and page', fallback: 0, when: ({ connected }) => !connected }),
  def({ key: 'wordSpace', code: 'ws', label: 'Word spacing', ends: ['Close', 'Open'], min: 0.6, max: 1.8, step: 0.01, zone: 'who', tier: 'advanced', group: 'Writing and page', fallback: 1.1 }),

  // ---------- advanced: letters and variety ----------
  def({ key: 'xHeight', code: 'xh', label: 'Letter height', ends: ['Short', 'Tall'], min: 0.36, max: 0.78, step: 0.005, zone: 'who', tier: 'advanced', group: 'Letters and variety', fallback: 0.55 }),
  def({ key: 'width', code: 'wd', label: 'Letter width', ends: ['Narrow', 'Wide'], min: 0.62, max: 1.12, step: 0.005, zone: 'who', tier: 'advanced', group: 'Letters and variety', fallback: 0.85 }),
  def({ key: 'tremor', code: 'tr', label: 'Tremor', ends: ['Steady', 'Shaky'], min: 0, max: 5, step: 0.05, zone: 'who', tier: 'advanced', group: 'Letters and variety', fallback: 1.4 }),
  def({ key: 'tiredness', code: 'ti', label: 'Tiredness', ends: ['Fresh', 'Tired'], min: 0, max: 1, step: 0.01, zone: 'how', tier: 'advanced', group: 'Letters and variety', fallback: 0.25 }),
];

export const ADVANCED_GROUPS: AdvancedGroup[] = ['Pens and ink', 'Writing and page', 'Letters and variety'];

export const controlByKey = (key: string) => CONTROLS.find((c) => c.key === key);
export const controlByCode = (code: string) => CONTROLS.find((c) => c.code === code);

/** Live: the engine (or the app) uses it today. Pending: a placeholder waiting for the engine. */
export function isLive(c: SliderControl, hand?: Hand) {
  if (c.app) return true;
  if (supports(c.key)) return true;
  if (c.key in PENDING_PARAMS) return false;
  // hidden personality traits the hand already carries work as overrides
  return hand ? typeof hand[c.key] === 'number' : true;
}

/** Shown in the panel: live controls, plus pending ones in preview mode. */
export const isShown = (c: SliderControl, hand: Hand, ctx: { connected: boolean }) =>
  (isLive(c, hand) || PREVIEW) && (!c.when || c.when(ctx));

/** The hand's natural value for a control. */
export function naturalValue(c: SliderControl, hand: Hand) {
  if (c.app) return c.fallback;
  const v = hand[c.key];
  return typeof v === 'number' ? v : c.fallback;
}

// ---------- pen tip sizes: Fine / Medium / Bold scale the hand's own pen width ----------
export const PEN_SIZES = [
  { id: 'fine', label: 'Fine', factor: 0.72 },
  { id: 'medium', label: 'Medium', factor: 1 },
  { id: 'bold', label: 'Bold', factor: 1.38 },
] as const;
export type PenSize = (typeof PEN_SIZES)[number]['id'];
export const penSizeFactor = (id: string) => PEN_SIZES.find((s) => s.id === id)?.factor ?? 1;

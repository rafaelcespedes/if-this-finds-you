// Types for the handwriting engine (../engine/index.js, plain JS, imported through the `@engine` alias).
// Only the parts the app uses are typed. The engine stays the source of truth; see docs/ARCHITECTURE.md.
declare module '@engine' {
  /** Writer params: one consistent set per seed (makeHand), plus UI overrides (withOverrides). */
  export interface Hand {
    seed: string;
    style: string;
    pen: string;
    neatness: number;
    slant: number;
    penWidth: number;
    pressure: number;
    xHeight: number;
    ascender: number;
    descender: number;
    width: number;
    roundness: number;
    [key: string]: unknown;
  }

  export interface Glyph {
    advance: number;
    contours: number[][][];
    strokes: { center: number[][]; contour: number[][]; dot?: boolean; mark?: boolean }[];
    variant: unknown;
  }

  export type PageItem =
    | { kind: 'glyph'; ch: string; g: Glyph; x: number; y: number; charIndex: number; inkIndex: number; line: number }
    | { kind: 'miss'; ch: string; x: number; y: number; charIndex: number; line: number };

  /** layout() result. Font units (UPM 1000), y down, item.y is the baseline. */
  export interface Page {
    items: PageItem[];
    height: number;
    lines: number;
    misses: string[];
    lineHeight: number;
  }

  export interface LayoutOptions {
    maxWidth?: number;
    lineHeight?: number;
    firstBaseline?: number;
  }

  export interface RenderOptions {
    width: number;
    emPx: number;
    ink?: string;
  }

  export interface ParamDef {
    key: string;
    label: string;
    group: string;
    min?: number;
    max?: number;
    step?: number;
    format?: string;
    type?: 'select';
    options?: () => { value: string; label: string }[];
  }

  export interface Rng {
    (): number;
    range(a: number, b: number): number;
    gauss(): number;
    pick<T>(list: T[]): T;
  }

  export const UPM: number;
  export const CAP: number;
  export const PARAMS: ParamDef[];

  export function rng(seed: string): Rng;
  export function makeHand(seed: string, style: string): Hand;
  export function withOverrides(hand: Hand, overrides: Record<string, unknown> | null | undefined): Hand;
  export function makeGlyph(p: Hand, ch: string, inst: unknown, ctx?: unknown): Glyph;
  export function has(p: Hand, ch: string): boolean;
  export function layout(p: Hand, text: string, opts?: LayoutOptions): Page;
  export function renderSVG(p: Hand, page: Pick<Page, 'items' | 'height'>, opts: RenderOptions): string;
  export function styleNames(): string[];
  export function choose(p: Hand, ch: string, ctx?: unknown): unknown;
  export function penOutline(p: Hand, pts: number[][], seedOff: number, opt?: { dot?: boolean }): number[][] | null;
  export function contoursToD(contours: number[][][], ox: number, oy: number, sc: number): string;
  export function getStyle(name: string): { name: string; label?: string; connected?: boolean } | undefined;

  export interface BuiltFont {
    font: unknown;
    buffer: ArrayBuffer;
    info: { glyphs: number; alternates: number; bytes: number; [key: string]: unknown };
  }
  export function buildFont(opentype: unknown, params: Hand, opts?: { alts?: number; calt?: boolean }): BuiltFont;
  export function verify(opentype: unknown, buffer: ArrayBuffer): { ok: boolean; features: string[] };
}

declare module 'opentype.js';

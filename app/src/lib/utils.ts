import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Save a Blob as a file. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** A name that's safe as a file name everywhere: readable words and spaces kept, only the characters file systems refuse dropped. */
export const fileSafe = (s: string) =>
  s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).trim() || 'letter';

/**
 * A sideways row of choices (papers, pens, school cards): bring the chosen one fully into view when it changed
 * from elsewhere (Find another, a link), scrolling only the row, never the page.
 */
export function keepChosenInView(row: HTMLElement | null, pad = 20) {
  const el = row?.querySelector<HTMLElement>('[aria-checked="true"], [aria-pressed="true"]');
  if (!row || !el) return;
  const r = row.getBoundingClientRect();
  const e = el.getBoundingClientRect();
  const dx = e.left < r.left + pad ? e.left - r.left - pad : e.right > r.right - pad ? e.right - r.right + pad : 0;
  if (!dx) return;
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  row.scrollBy({ left: dx, behavior: still ? 'auto' : 'smooth' });
}

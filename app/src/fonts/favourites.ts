// Saved hands: kept in this browser only (localStorage), newest first, each with everything needed to write it again
// exactly (seed, tradition, pen, ink, values, the tool link). Other tabs follow along. If storage is off (a private
// window), saving still works for the visit.
import { useSyncExternalStore } from 'react';
import type { FontEntry } from './protocol';

const KEY = 'seedhand:fonts:saved';
const MAX = 200;

let list: FontEntry[] = read();
const listeners = new Set<() => void>();

function read(): FontEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((e) => e && typeof e.id === 'string' && typeof e.seed === 'string' && typeof e.tool === 'string') : [];
  } catch {
    return [];
  }
}
function write(next: FontEntry[]) {
  list = next.slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage off or full: kept for the visit */ }
  listeners.forEach((fn) => fn());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    list = read();
    listeners.forEach((fn) => fn());
  });
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const get = () => list;

export const isSaved = (id: string) => list.some((e) => e.id === id);
export function toggleSaved(e: FontEntry) {
  write(isSaved(e.id) ? list.filter((x) => x.id !== e.id) : [e, ...list]);
}

export function useSaved() {
  return useSyncExternalStore(subscribe, get, get);
}

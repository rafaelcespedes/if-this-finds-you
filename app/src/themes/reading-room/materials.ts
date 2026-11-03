// The Reading Room's writing materials, cracked open while you write (desktop; Rafael, 4 Nov). When a visitor starts
// a letter of their own, the desk's drawer opens partway on paper, pen and ink, and the column it lives in stays
// beside the sheet while they write (App.tsx reads this to keep the aside shown; ReadingDesk.tsx sets it). Once a
// visit: closing the drawer puts it away for the rest of the session, and writing hides the column again as before.
import { useSyncExternalStore } from 'react';

const KEY = 'seedhand:rr-materials'; // 'shown' once it has cracked open this visit, 'closed' once put away
let open = false;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

function readSession() {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}
function writeSession(v: string) {
  try { sessionStorage.setItem(KEY, v); } catch { /* private mode: this visit only */ }
}

export const materials = {
  /** May they crack open now? Only once a visit. */
  canOpen: () => readSession() == null,
  /** The drawer is open partway or fully beside a letter being written: keep the column shown. */
  open() {
    writeSession('shown');
    if (!open) { open = true; notify(); }
  },
  /** Put away (the drawer closed): writing hides the column again, and it won't crack open again this visit. */
  close() {
    writeSession('closed');
    if (open) { open = false; notify(); }
  },
};

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const get = () => open;

/** Whether the writing materials are keeping the desk's column beside the sheet. */
export function useMaterialsOpen() {
  return useSyncExternalStore(subscribe, get, get);
}

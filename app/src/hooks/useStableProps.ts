import { useRef } from 'react';

const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
const hasFns = (o: Record<string, unknown>) => Object.values(o).some((v) => typeof v === 'function');

/**
 * Props that only change when their data does: every callback (at the top level, and inside a plain object that holds
 * callbacks, like `letter` or `ink`) becomes a stable function that calls the latest one, and the object itself stays
 * the same until a data value changes (compared with Object.is). With memo() on the receiver, a parent re-render that
 * changes nothing it shows skips it entirely (the panel no longer redraws on every key).
 */
export function useStableProps<T extends object>(props: T): T {
  const latest = useRef(props);
  latest.current = props;
  const fns = useRef(new Map<string, (...a: unknown[]) => unknown>());
  const prev = useRef<{ data: unknown[]; out: T } | null>(null);

  const stable = (path: string[]) => {
    const key = path.join('.');
    let f = fns.current.get(key);
    if (!f) {
      f = (...a: unknown[]) => {
        let v: unknown = latest.current;
        for (const k of path) v = (v as Record<string, unknown> | undefined)?.[k];
        return typeof v === 'function' ? (v as (...b: unknown[]) => unknown)(...a) : undefined;
      };
      fns.current.set(key, f);
    }
    return f;
  };

  // the data, in a fixed order, to compare with last time
  const data: unknown[] = [];
  const shape = (o: Record<string, unknown>, path: string[], depth: number): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'function') { out[k] = stable([...path, k]); data.push(`fn:${k}`); }
      else if (depth === 0 && plain(v) && hasFns(v)) out[k] = shape(v, [...path, k], 1);
      else { out[k] = v; data.push(k, v); }
    }
    return out;
  };
  const next = shape(props as Record<string, unknown>, [], 0) as T;
  const p = prev.current;
  if (p && p.data.length === data.length && p.data.every((v, i) => Object.is(v, data[i]))) return p.out;
  prev.current = { data, out: next };
  return next;
}

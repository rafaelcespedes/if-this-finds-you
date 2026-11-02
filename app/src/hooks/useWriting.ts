import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { WriteRequest, WriteResult } from '@/lib/write-protocol';
import { perf } from '@/lib/perf';

type Req = Omit<WriteRequest, 'id'>;

/**
 * The written page for a request, produced by a worker. Returns the newest finished result (the page
 * keeps showing the previous writing until the next one is ready). Requests are debounced only when
 * writing gets slow (long letters), so short notes update on every key.
 */
export function useWriting(req: Req) {
  const [result, setResult] = useState<WriteResult | null>(null);
  const worker = useRef<Worker | null>(null);
  const nextId = useRef(0);
  const sentAt = useRef(new Map<number, number>());
  const lastMs = useRef(0);

  useEffect(() => {
    const w = new Worker(new URL('../workers/write.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (e: MessageEvent<WriteResult | { id: number; error: string }>) => {
      const data = e.data;
      if ('error' in data) {
        console.error('[seedhand] write failed:', data.error);
        toast.error('The hand couldn’t write this', { id: 'write-error', description: 'Try a different hand or shorten the note.' });
        return;
      }
      const t = sentAt.current.get(data.id);
      if (t != null) perf.samples.push({ name: 'keystroke→writing', ms: performance.now() - t });
      perf.samples.push({ name: 'worker write', ms: data.ms });
      lastMs.current = data.ms;
      for (const id of sentAt.current.keys()) if (id <= data.id) sentAt.current.delete(id);
      setResult((prev) => (prev && prev.id > data.id ? prev : data));
    };
    w.onerror = (e) => {
      console.error('[seedhand] writer worker failed to start:', e.message || e);
      toast.error('The page couldn’t start writing', { id: 'write-error', description: 'Reload the page to try again.' });
    };
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);

  const { seed, style, overrides, text, paper, size, lineSpacing, inkKey } = req;
  const overridesKey = JSON.stringify(overrides);
  useEffect(() => {
    const send = () => {
      const w = worker.current;
      if (!w) return;
      const id = ++nextId.current;
      sentAt.current.set(id, performance.now());
      w.postMessage({ id, seed, style, overrides: JSON.parse(overridesKey), text, paper, size, lineSpacing, inkKey } satisfies WriteRequest);
    };
    // fast writes go straight through; slow ones wait for a short pause in typing
    const delay = lastMs.current > 70 ? Math.min(180, lastMs.current * 0.6) : 0;
    if (!delay) { send(); return; }
    const t = window.setTimeout(send, delay);
    return () => window.clearTimeout(t);
  }, [seed, style, overridesKey, text, paper, size, lineSpacing, inkKey]);

  return result;
}

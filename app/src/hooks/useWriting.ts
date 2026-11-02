import { useEffect, useRef, useState } from 'react';
import type { WriteRequest, WriteResult } from '@/lib/write-protocol';
import { toast } from 'sonner';
import { perf } from '@/lib/perf';

type Req = Omit<WriteRequest, 'id'>;

/**
 * The written page for a request, produced by a worker. Returns the newest finished result
 * (the page keeps showing the previous writing until the next one is ready).
 */
export function useWriting(req: Req) {
  const [result, setResult] = useState<WriteResult | null>(null);
  const worker = useRef<Worker | null>(null);
  const nextId = useRef(0);
  const sentAt = useRef(new Map<number, number>());

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

  const { seed, style, overrides, text, paper, size } = req;
  useEffect(() => {
    const w = worker.current;
    if (!w) return;
    const id = ++nextId.current;
    sentAt.current.set(id, performance.now());
    w.postMessage({ id, seed, style, overrides, text, paper, size } satisfies WriteRequest);
  }, [seed, style, overrides, text, paper, size]);

  return result;
}

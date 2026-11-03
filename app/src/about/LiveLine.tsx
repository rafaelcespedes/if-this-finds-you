// The page's one bit of live writing: a short line written out by a writer met just now, a different one on each
// visit, with "Another writer" to meet someone else. The engine loads only after the page has painted (write.ts),
// and the line's words are on the page as text, so nothing waits for it and a screen reader hears it once.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Writer } from './write';

export const LINE = 'I hope this finds you well.';

/** The line's size: as big as a heading on a wide screen, still one or two lines on a phone. */
const emFor = (width: number) => Math.round(Math.min(46, Math.max(30, width / 13)));

type Status = 'waiting' | 'writing' | 'done' | 'failed';

export function LiveLine() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mounted = useRef<{ destroy(): void } | null>(null);
  const count = useRef(0);
  const [writer, setWriter] = useState<Writer | null>(null);
  const [status, setStatus] = useState<Status>('waiting');

  const writeOnce = useCallback(async () => {
    const host = hostRef.current;
    if (!host) return;
    try {
      const { write } = await import('./write');
      const width = Math.floor(host.clientWidth);
      const em = emFor(width);
      const w = write(LINE, `about:${Date.now()}:${++count.current}:${Math.random()}`, width, em);
      if (!w) throw new Error('no writer');
      mounted.current?.destroy();
      const m = w.mount(host);
      mounted.current = m;
      setWriter(w.writer);
      setStatus('writing');
      m.play(() => setStatus('done'));
    } catch {
      setStatus('failed');
    }
  }, []);

  // after the first paint, when the browser has a moment
  useEffect(() => {
    // Safari has no idle callback: a short timeout instead
    const idle = 'requestIdleCallback' in window;
    const id = idle ? window.requestIdleCallback(() => void writeOnce(), { timeout: 800 }) : window.setTimeout(() => void writeOnce(), 120);
    return () => {
      if (idle) window.cancelIdleCallback(id);
      else window.clearTimeout(id);
      mounted.current?.destroy();
    };
  }, [writeOnce]);

  if (status === 'failed') {
    // the engine didn't load (offline, an old browser): the line in type, and nothing pretends to be handwriting
    return <p className="about-line about-line--type">{LINE}</p>;
  }

  return (
    <figure className="about-line" data-status={status}>
      <p className="sr-only">{LINE}</p>
      <div ref={hostRef} className="about-line-ink" aria-hidden />
      <figcaption className="about-line-caption" aria-live="polite">
        {writer ? (
          <>
            <span className="about-line-by">
              Written just now by <span className="about-line-name">{writer.name}</span>, who never existed.
            </span>
            <span className="about-line-meta">
              <span><span className="about-label">Hand</span> {writer.tradition}</span>
              {writer.pen && <span><span className="about-label">Pen</span> {writer.pen}</span>}
              <button type="button" className="about-text-button" onClick={() => void writeOnce()}>
                Another writer
              </button>
            </span>
          </>
        ) : (
          <span className="about-line-by about-line-by--waiting">A writer is picking up a pen…</span>
        )}
      </figcaption>
    </figure>
  );
}

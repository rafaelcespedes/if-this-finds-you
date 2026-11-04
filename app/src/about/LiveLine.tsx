// The page's one bit of live writing: a short line written out by a writer met just now, a different one on each
// visit, with "Change writer" (the desk's own control) to meet someone else. The engine loads only after the page has painted (write.ts),
// and the line's words are on the page as text, so nothing waits for it and a screen reader hears it once.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Shuffle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Writer } from './write';

export const LINE = 'I hope this finds you well.';

/** The line's size: as big as a heading on a wide screen, still one or two lines on a phone. */
const emFor = (width: number) => Math.round(Math.min(46, Math.max(30, width / 13)));
/**
 * The room the line gets, held from the first frame so nothing below moves when it arrives. Measured over 160 writers
 * each (3 Nov 2026): one line of ink is 1.2–1.75 em tall with its margin, two lines up to 3.45 em. Wide slips keep the
 * line to one line (write's oneLine); narrow ones let it wrap once. A taller hand is scaled to fit (about.css).
 */
function slotFor(width: number) {
  const em = emFor(width);
  const oneLine = width >= 480;
  return { em, oneLine, height: Math.round(em * (oneLine ? 1.9 : 3.5)) };
}

type Status = 'waiting' | 'writing' | 'done' | 'failed';

export function LiveLine() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mounted = useRef<{ destroy(): void } | null>(null);
  const count = useRef(0);
  const [writer, setWriter] = useState<Writer | null>(null);
  const [status, setStatus] = useState<Status>('waiting');
  const [slot, setSlot] = useState<number | null>(null);

  // before the first paint: the slip's room, from its width
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (host) setSlot(slotFor(Math.floor(host.clientWidth)).height);
  }, []);

  const writeOnce = useCallback(async () => {
    const host = hostRef.current;
    if (!host) return;
    try {
      const { write } = await import('./write');
      const width = Math.floor(host.clientWidth);
      const { em, oneLine } = slotFor(width);
      const w = write(LINE, `about:${Date.now()}:${++count.current}:${Math.random()}`, width, em, { oneLine });
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
      <div ref={hostRef} className="about-line-ink" style={slot ? { height: slot } : undefined} aria-hidden />
      <figcaption className="about-line-caption">
        {/* holds the room of the longest caption from the first frame (the longest name, hand and pen there are), so
            the page doesn't move when the writer's own caption replaces the waiting line */}
        <span className="about-line-cap about-line-sizer" aria-hidden>
          <span className="about-line-by">Written just now by Dorothea Achterberg, who never existed.</span>
          <span className="about-line-meta">
            <span><span className="about-label">Hand</span> Norwegian school 1849</span>
            <span><span className="about-label">Pen</span> Broad / italic nib</span>
          </span>
          <Button variant="secondary" size="sm" tabIndex={-1} className="about-line-change">
            <Shuffle aria-hidden /> Change writer
          </Button>
        </span>
        <span className="about-line-cap" aria-live="polite">
          {writer ? (
            <>
              <span className="about-line-by">
                Written just now by <span className="about-line-name">{writer.name}</span>, who never existed.
              </span>
              <span className="about-line-meta">
                <span><span className="about-label">Hand</span> {writer.tradition}</span>
                {writer.pen && <span><span className="about-label">Pen</span> {writer.pen}</span>}
              </span>
              <Button variant="secondary" size="sm" className="about-line-change" onClick={() => void writeOnce()}>
                <Shuffle aria-hidden /> Change writer
              </Button>
            </>
          ) : (
            <span className="about-line-by about-line-by--waiting">A writer is picking up a pen…</span>
          )}
        </span>
      </figcaption>
    </figure>
  );
}

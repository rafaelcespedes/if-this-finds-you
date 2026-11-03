import { useEffect, useState } from 'react';

/**
 * The visual viewport (what's visible above an on-screen keyboard). iOS Safari keeps the layout viewport
 * full height and pans this one instead, so fixed controls must follow it. Re-measured on every event,
 * never cached (iOS 26 can leave height ~24 px short and offsetTop stale after the keyboard closes).
 */
export function useVisualViewport() {
  const read = () => {
    const vv = window.visualViewport;
    return vv ? { top: vv.offsetTop, height: vv.height } : { top: 0, height: window.innerHeight };
  };
  const [v, setV] = useState(read);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const on = () => setV(read());
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    return () => {
      vv.removeEventListener('resize', on);
      vv.removeEventListener('scroll', on);
    };
  }, []);
  return v;
}

/** Scroll so a box (client px) sits inside the visible area, with some room around it. */
export function keepInView(top: number, bottom: number, lineH: number) {
  const vv = window.visualViewport;
  const viewTop = vv ? vv.offsetTop : 0;
  const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const roomBelow = lineH * 3, roomAbove = lineH;
  let dy = 0;
  if (bottom > viewBottom - roomBelow) dy = bottom - (viewBottom - roomBelow);
  else if (top < viewTop + roomAbove) dy = top - (viewTop + roomAbove);
  if (Math.abs(dy) > 2) window.scrollBy({ top: dy, behavior: smooth ? 'smooth' : 'auto' });
}

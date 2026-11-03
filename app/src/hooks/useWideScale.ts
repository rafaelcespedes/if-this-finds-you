import { useEffect, useState } from 'react';

/** Past this width a desktop screen is "wide": the sheet and the panel grow with it. */
const WIDE_FROM = 1600;
const MOST = 1.5;

/**
 * How much bigger a very wide screen draws the page: 1 up to 1600 px wide (and 950 px tall), then in step with the
 * screen, to 1.5 at about 2400 x 1425. Browser zoom shrinks the window's CSS size, so zooming in brings it back to 1.
 */
export function useWideScale() {
  const read = () => {
    if (typeof window === 'undefined' || window.innerWidth < WIDE_FROM) return 1;
    const k = Math.min(window.innerWidth / WIDE_FROM, window.innerHeight / 950);
    return Math.round(Math.min(MOST, Math.max(1, k)) * 20) / 20;
  };
  const [k, setK] = useState(read);
  useEffect(() => {
    const on = () => setK(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return k;
}

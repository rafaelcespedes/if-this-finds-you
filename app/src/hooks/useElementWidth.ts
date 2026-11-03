import { useLayoutEffect, useState, type RefObject } from 'react';

/** Content-box width of an element, kept up to date with a ResizeObserver. */
export function useElementWidth(ref: RefObject<HTMLElement | null>) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0].contentRect.width;
      setW((prev) => (Math.abs(prev - cw) > 0.5 ? cw : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

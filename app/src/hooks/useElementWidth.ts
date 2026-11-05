import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Content-box width of an element, kept up to date with a ResizeObserver. The element may come later than the
 * component: the letter page, opened from a link, first shows its loading state and renders the sheet's column only
 * once the letters arrive. So the element is looked for after every render, and watched from the one where it appears
 * (or is replaced). Watching only at mount left the width at 0 whenever the letters came after it: a blank sheet.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>) {
  const [w, setW] = useState(0);
  const [el, setEl] = useState<HTMLElement | null>(null);
  // after every render: has the element appeared, changed or gone?
  useLayoutEffect(() => {
    if (ref.current !== el) setEl(ref.current);
  });
  useLayoutEffect(() => {
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0].contentRect.width;
      setW((prev) => (Math.abs(prev - cw) > 0.5 ? cw : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return w;
}

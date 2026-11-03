// Is an element near the screen? One shared IntersectionObserver for every row (a screen and a half above and
// below), so only the rows you could scroll to soon are written.
import { useEffect, useState, type RefObject } from 'react';

const callbacks = new Map<Element, (near: boolean) => void>();
let io: IntersectionObserver | null = null;
const observer = () =>
  (io ??= new IntersectionObserver((entries) => {
    for (const e of entries) callbacks.get(e.target)?.(e.isIntersecting);
  }, { rootMargin: '120% 0px 120% 0px' }));

export function useNear(ref: RefObject<Element | null>) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    callbacks.set(el, setNear);
    observer().observe(el);
    return () => { callbacks.delete(el); observer().unobserve(el); };
  }, [ref]);
  return near;
}

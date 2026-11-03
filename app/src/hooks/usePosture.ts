import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The two postures (editor-ux.md §3.2): at the desk (writer, controls, share) and writing (paper, ink,
 * caret). Typing hides the desk after the second keystroke within 1.5 s; moving the pointer more than
 * 8 px, Esc or Done brings it back. It never comes back on a timer: writers pause a long time.
 */
export function usePosture(editing: boolean) {
  const [writing, setWriting] = useState(false);
  const keys = useRef<number[]>([]);

  const onTyped = useCallback(() => {
    const now = performance.now();
    keys.current = keys.current.filter((t) => now - t < 1500);
    keys.current.push(now);
    if (keys.current.length >= 2) setWriting(true);
  }, []);

  useEffect(() => {
    if (!editing) { setWriting(false); keys.current = []; }
  }, [editing]);

  useEffect(() => {
    if (!writing) return;
    let origin: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (!origin) { origin = { x: e.clientX, y: e.clientY }; return; }
      if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 8) { setWriting(false); keys.current = []; }
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [writing]);

  const toggle = useCallback(() => setWriting((w) => !w), []);
  return { writing, onTyped, toggle };
}

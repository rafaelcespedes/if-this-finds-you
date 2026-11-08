import { memo, useDeferredValue, useId, useLayoutEffect, useMemo, useRef } from 'react';
import type { Hand } from '@engine';
import { edgeForScreen, inlineSVG } from '@/lib/writing';
import { cn } from '@/lib/utils';

/** The writer's name, written in their own hand. */
export const Signature = memo(function Signature({ p, name, ink, emPx = 30, className }: { p: Hand; name: string; ink: string; emPx?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  // a new hand's name is laid out just after the new hand shows (a deferred render), so a tap answers first
  const hand = useDeferredValue(p);
  const who = useDeferredValue(name);
  const svg = useMemo(() => inlineSVG(hand, who, emPx, uid), [hand, who, emPx, uid]);
  // a touch screen: the ink's edge and felt's bleed off, as on the page (lib/writing.ts EDGE_OFF)
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { edgeForScreen(host.current?.querySelector('svg')); }, [svg]);
  return (
    <div
      ref={host}
      aria-hidden
      className={cn('writing [&_svg]:h-auto [&_svg]:max-w-full', className)}
      style={{ color: ink }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});

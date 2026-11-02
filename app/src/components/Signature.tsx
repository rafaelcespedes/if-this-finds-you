import { memo, useId, useMemo } from 'react';
import type { Hand } from '@engine';
import { inlineSVG } from '@/lib/writing';
import { cn } from '@/lib/utils';

/** The writer's name, written in their own hand. */
export const Signature = memo(function Signature({ p, name, ink, emPx = 30, className }: { p: Hand; name: string; ink: string; emPx?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const svg = useMemo(() => inlineSVG(p, name, emPx, uid), [p, name, emPx, uid]);
  return (
    <div
      aria-hidden
      className={cn('writing [&_svg]:h-auto [&_svg]:max-w-full', className)}
      style={{ color: ink }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});

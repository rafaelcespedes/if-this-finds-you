import { memo, useId, useMemo } from 'react';
import { layout, UPM, type Hand } from '@engine';
import { inlineSVG } from '@/lib/writing';
import { cn } from '@/lib/utils';

/** The writer's name, written in their own hand. */
export const Signature = memo(function Signature({ p, name, ink, emPx = 30, className }: { p: Hand; name: string; ink: string; emPx?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const svg = useMemo(() => {
    const first = 0.92 * UPM;
    const page = layout(p, name, { maxWidth: 1e6, firstBaseline: first, lineHeight: 1.6 * UPM });
    let right = 0;
    for (const it of page.items) right = Math.max(right, it.x + (it.kind === 'glyph' ? it.g.advance : 560));
    const items = page.items.map((it) => ({ ...it, x: it.x + 60 }));
    return inlineSVG(p, items, right + 160, first + 0.42 * UPM, emPx, uid);
  }, [p, name, emPx, uid]);
  return (
    <div
      aria-hidden
      className={cn('writing [&_svg]:h-auto [&_svg]:max-w-full', className)}
      style={{ color: ink }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});

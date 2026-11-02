// The writing layer. This is the one place the app puts handwriting on screen (see lib/writing.ts).
// Today it shows the engine's SVG, drawn once at a reference scale and sized by CSS; a canvas/WebGL
// renderer or the stroke-by-stroke write-on animation can replace the inside without touching callers.
import { memo } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  svg: string;
  ink: string;
  className?: string;
}

export const Writing = memo(function Writing({ svg, ink, className }: Props) {
  return (
    <div
      aria-hidden
      className={cn('writing writing-fill pointer-events-none absolute inset-0', className)}
      style={{ color: ink }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
});

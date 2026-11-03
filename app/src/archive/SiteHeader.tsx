// The archive's top line: the way back to the tool, and (on a letter) the way back to the index.
import { ArrowLeft } from 'lucide-react';
import type { MouseEvent } from 'react';

/** The handwriting tool (index.html) and the archive (letters.html), side by side in the build. */
export const TOOL_URL = import.meta.env.BASE_URL;
export const ARCHIVE_URL = `${import.meta.env.BASE_URL}letters.html`;

const link =
  'rounded-md px-1.5 py-1 -mx-1.5 transition-colors duration-150 hover-device:hover:text-foreground pointer-coarse:py-3';

export function SiteHeader({ current, back, onBack }: { current: 'index' | 'letter'; back?: string; onBack?: (e: MouseEvent) => void }) {
  return (
    <header className="absolute inset-x-0 top-[max(1rem,env(safe-area-inset-top,0px))] z-10 mx-auto flex max-w-[1180px] items-baseline justify-between gap-4 px-4 text-[12.5px] text-muted-foreground sm:px-8 lg:top-5 lg:px-10">
      {current === 'letter' && back ? (
        <a href={back} onClick={onBack} className={`${link} inline-flex items-center gap-1.5 text-foreground/80`}>
          <ArrowLeft aria-hidden className="size-3.5" /> All letters
        </a>
      ) : (
        <a href={TOOL_URL} className={`${link} text-[13px] font-medium tracking-[-0.01em] text-foreground/80`}>Seedhand</a>
      )}
      <nav aria-label="Seedhand" className="flex items-baseline gap-4">
        {current === 'letter' ? (
          <a href={TOOL_URL} className={link}>Seedhand</a>
        ) : (
          <a href={TOOL_URL} className={link}>Write a letter</a>
        )}
      </nav>
    </header>
  );
}

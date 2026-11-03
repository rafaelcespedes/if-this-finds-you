// The library's top line: the product's name (the way to the writing tool) and "All letters" (the way back to
// the library), with a page's own controls on the right.
import type { ReactNode } from 'react';
import { APP_NAME } from '@/lib/brand';

/** The writing tool (index.html) and the library (letters.html), side by side in the build. */
export const TOOL_URL = import.meta.env.BASE_URL;
export const ARCHIVE_URL = `${import.meta.env.BASE_URL}letters.html`;

export const headerLink =
  'rounded-md px-1.5 py-1 -mx-1.5 transition-colors duration-150 hover-device:hover:text-foreground pointer-coarse:py-3';

/** `back`: the library's index as it was left (on a letter page); absent on the index itself. */
export function SiteHeader({ back, children }: { back?: string; children?: ReactNode }) {
  return (
    <header className="absolute inset-x-0 top-[max(1rem,env(safe-area-inset-top,0px))] z-10 mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-4 text-[12.5px] text-muted-foreground sm:px-8 lg:top-5 lg:px-10">
      <nav aria-label="Where you are" className="flex min-w-0 items-baseline gap-2">
        <a href={TOOL_URL} className={`${headerLink} shrink-0 text-[13px] font-medium tracking-[-0.01em] text-foreground/80`}>{APP_NAME}</a>
        <span aria-hidden className="text-faint">/</span>
        {back ? (
          <a href={back} className={`${headerLink} truncate`}>All letters</a>
        ) : (
          <span aria-current="page" className="truncate text-foreground/70">All letters</span>
        )}
      </nav>
      <div className="flex shrink-0 items-center gap-3">{children}</div>
    </header>
  );
}

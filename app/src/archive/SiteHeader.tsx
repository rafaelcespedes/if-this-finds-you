// The library's top line, as the tool's: the wordmark on the left (the way to the writing tool), and on the right a
// page's own links: "Write a letter" on the index, "All letters" and Previous / Next on a letter.
import type { ReactNode } from 'react';
import { Wordmark } from '@/components/Wordmark';
import { APP_NAME, withLogo } from '@/lib/brand';

/** The writing tool (index.html) and the library (letters.html), side by side in the build. Links to the tool keep a
 * logo chosen with ?logo= (withLogo); share links never carry it. */
export const TOOL_URL = import.meta.env.BASE_URL;
export const toolHref = withLogo(TOOL_URL);
export const ARCHIVE_URL = `${import.meta.env.BASE_URL}letters.html`;

export const headerLink =
  'rounded-md px-1.5 py-1 -mx-1.5 transition-colors duration-150 hover-device:hover:text-foreground pointer-coarse:py-3';

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="absolute inset-x-0 top-[max(1rem,env(safe-area-inset-top,0px))] z-10 mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-4 text-[12.5px] text-muted-foreground sm:px-8 lg:top-5 lg:px-10">
      {/* the wordmark in the same slot as the tool's header (it sizes itself: lib/brand.ts logoHeight) */}
      <a href={toolHref} aria-label={`${APP_NAME}: write a letter`} className="-mx-1 flex h-8 shrink-0 items-center rounded-md px-1 text-foreground/85 transition-colors duration-150 hover-device:hover:text-foreground lg:h-9">
        <Wordmark />
      </a>
      <div className="flex min-w-0 shrink-0 items-center gap-3">{children}</div>
    </header>
  );
}

// The library's pages share the site's one header (components/SiteHeader.tsx, docs/NAVIGATION.md). This file keeps the
// addresses the library builds links from, and the page for a missing letter.
import type { ReactNode } from 'react';
import { withLogo } from '@/lib/brand';
import { ARCHIVE_URL, TOOL_URL } from '@/lib/places';

export { SiteHeader } from '@/components/SiteHeader';
/** The writing tool (index.html) and the library (letters.html), side by side in the build. Links to the tool keep a
 * logo chosen with ?logo= (withLogo); share links never carry it. */
export { ARCHIVE_URL, TOOL_URL };
export const toolHref = withLogo(TOOL_URL);

/** A page that has no letter to show: why, and the way on. */
export function Missing({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex max-w-[30rem] flex-col items-start gap-3 py-10">
      <h1 className="text-[22px] font-medium tracking-[-0.015em] text-foreground">{title}</h1>
      <p className="text-[14px] leading-[1.55] text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}

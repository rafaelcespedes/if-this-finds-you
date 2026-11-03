// The header's wordmark: the logo's SVG drawn inline, so it takes the text colour (currentColor). Until the
// file is there (or if it can't load), the product's name in type.
import { useEffect, useState } from 'react';
import { APP_NAME, faviconSrc, logoHeight, logoSrc } from '@/lib/brand';
import { cn } from '@/lib/utils';

let kept: string | null | undefined;

/** Only the drawing: no scripts, no foreign content, no event attributes. */
function clean(svg: string) {
  if (!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) return null;
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/(href\s*=\s*["'])\s*javascript:[^"']*/gi, '$1#');
}

export function Wordmark({ className }: { className?: string }) {
  const [svg, setSvg] = useState<string | null | undefined>(kept);
  useEffect(() => {
    if (kept !== undefined) return;
    let live = true;
    fetch(logoSrc)
      .then((r) => (r.ok ? r.text() : null))
      .then((t) => { kept = t ? clean(t) : null; if (live) setSvg(kept); })
      .catch(() => { kept = null; if (live) setSvg(null); });
    return () => { live = false; };
  }, []);
  // the favicon follows the logo (only when that logo has its own)
  useEffect(() => {
    const icon = faviconSrc;
    if (!icon) return;
    fetch(icon, { method: 'HEAD' }).then((r) => {
      if (!r.ok) return;
      const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link) link.href = icon;
    }).catch(() => {});
  }, []);
  if (!svg) return <span className={cn('text-[13px] font-medium tracking-[-0.01em]', className)}>{APP_NAME}</span>;
  return <span role="img" aria-label={APP_NAME} className={cn('block [&_svg]:block [&_svg]:h-full [&_svg]:w-auto', logoHeight, className)} dangerouslySetInnerHTML={{ __html: svg }} />;
}

// One hand as a foundry line item: the writer's name and a few quiet words about the hand, its actions (save it,
// write with it, download the font), and a big specimen line in the hand. The row's height is set before anything is
// written (protocol.ts boxHeight), so rows never move when their writing arrives.
import { memo, useEffect, useRef, useState } from 'react';
import { Download, Heart, LoaderCircle, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn, saveBlob } from '@/lib/utils';
import type { FontReply, FontRequest } from '@/workers/font.worker';
import { toolHref } from '@/archive/SiteHeader';
import { boxHeight, type FontEntry, type RenderSpec } from './protocol';
import { fonts, useSpecimen } from './store';
import { toggleSaved } from './favourites';
import { useNear } from './near';

interface Props {
  entry: FontEntry | undefined;
  index: number;
  /** what the specimen is written for (text and size settle a moment after you stop typing or sliding) */
  spec: RenderSpec;
  /** the size the row is shown at right now (the slider, live): the last specimen is scaled to it meanwhile */
  liveEm: number;
  saved: boolean;
  compact: boolean;
}

/** The open font package, built by the tool's own font worker (about a second) and saved as the engine names it. */
function buildFont(e: FontEntry) {
  return new Promise<{ filename: string }>((resolve, reject) => {
    const w = new Worker(new URL('../workers/font.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<FontReply>) => {
      w.terminate();
      const r = ev.data;
      if (!r.ok) { reject(new Error(r.error)); return; }
      saveBlob(new Blob([r.zip], { type: 'application/zip' }), r.filename);
      resolve({ filename: r.filename });
    };
    w.onerror = (ev) => { w.terminate(); reject(new Error(ev.message || 'The font couldn’t be built')); };
    w.postMessage({ seed: e.seed, style: e.style, overrides: e.overrides, name: e.name } satisfies FontRequest);
  });
}

function Action({ label, onClick, href, pressed, busy, compact, children, text }: {
  label: string; onClick?: () => void; href?: string; pressed?: boolean; busy?: boolean; compact: boolean; children: React.ReactNode; text?: string;
}) {
  const cls = cn(
    'font-action relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg text-[13px] font-medium after:absolute after:-inset-1 after:content-[\'\'] pointer-coarse:h-10',
    text && !compact ? 'px-2.5' : 'w-8 justify-center pointer-coarse:w-10',
    pressed && 'is-on',
  );
  const inner = (
    <>
      {children}
      {text && !compact && <span>{text}</span>}
    </>
  );
  const el = href ? (
    <a href={href} className={cls} aria-label={compact || !text ? label : undefined}>{inner}</a>
  ) : (
    <button type="button" onClick={onClick} className={cls} aria-label={compact || !text ? label : undefined} aria-pressed={pressed} aria-busy={busy || undefined} disabled={busy}>
      {inner}
    </button>
  );
  if (text && !compact) return el;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{el}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export const FontRow = memo(function FontRow({ entry, index, spec, liveEm, saved, compact }: Props) {
  const ref = useRef<HTMLLIElement>(null);
  const near = useNear(ref);
  const { specimen, failed } = useSpecimen(entry, spec, ref.current, near);
  const [building, setBuilding] = useState(false);
  const h = boxHeight(liveEm, spec.lines);
  const shownRef = useRef(false);
  useEffect(() => {
    if (specimen && !shownRef.current) { shownRef.current = true; fonts.shown(); }
  }, [specimen]);

  const download = async () => {
    if (!entry || building) return;
    setBuilding(true);
    toast('Making the font…', { id: `font-${entry.id}`, description: `${entry.name}: the .otf and .ttf, about a second.` });
    try {
      const { filename } = await buildFont(entry);
      toast('Font saved', { id: `font-${entry.id}`, description: `${filename}. Free and open source (SIL Open Font License).` });
    } catch (err) {
      toast('The font couldn’t be made', { id: `font-${entry.id}`, description: err instanceof Error ? err.message : undefined });
    } finally {
      setBuilding(false);
    }
  };

  const ink = spec.mode === 'ink';
  const fade = specimen?.fresh ? 'specimen-in' : '';
  const alt = entry ? `“${spec.text}”, written in ${entry.name}’s hand` : '';
  return (
    <li ref={ref} className="font-row">
      <div className="font-row-meta">
        {entry ? (
          <>
            <h2 className="font-row-name">{entry.name}</h2>
            <p className="font-row-attrs">{entry.attrs.join(' · ')}</p>
          </>
        ) : (
          <>
            <span aria-hidden className="font-row-skeleton" />
            <span className="sr-only">Font {index + 1}, being chosen</span>
          </>
        )}
        <div className={cn('font-row-actions', !entry && 'invisible')}>
          <Action label={saved ? 'Saved (remove)' : 'Save this hand'} compact pressed={saved} onClick={() => entry && toggleSaved(entry)}>
            <Heart aria-hidden className={cn('size-4', saved && 'fill-current')} />
          </Action>
          <Action label="Write with this hand" text="Write with it" compact={compact} href={entry ? `${toolHref}#${entry.tool}` : undefined}>
            <PenLine aria-hidden className="size-4" />
          </Action>
          <Action label={building ? 'Making the font…' : 'Download the font'} text="Download" compact={compact} busy={building} onClick={download}>
            {building ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Download aria-hidden className="size-4" />}
          </Action>
        </div>
      </div>
      <div
        className={cn('font-row-specimen', ink && 'is-ink', specimen?.clipped && !ink && (spec.lines > 1 ? 'is-clipped-2' : 'is-clipped'))}
        style={{ height: h, ...(ink && entry ? { background: entry.tint } : {}) }}
      >
        {specimen?.svg != null && (
          <div role="img" aria-label={alt} className={cn('font-specimen-svg', fade)} dangerouslySetInnerHTML={{ __html: specimen.svg }} />
        )}
        {specimen?.url && <img src={specimen.url} alt={alt} decoding="async" draggable={false} className={cn('font-specimen-img', fade)} style={{ aspectRatio: `${specimen.width} / ${specimen.height}` }} />}
        {failed && !specimen && <span className="font-row-failed">This hand couldn’t be written here.</span>}
      </div>
    </li>
  );
});

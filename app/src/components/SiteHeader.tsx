// The site's one header, on every page, so the pages can't drift apart (docs/NAVIGATION.md).
// The wordmark on the left is the way to the writing tool (on the tool itself it's plain: a link there would drop the
// letter on the desk). On the right, the three places in the same words and order everywhere, the current one marked
// and not a link; before them My letters, only when letters are kept on this device. The words show only when they
// fit on one line beside the wordmark (a phone, large text, a narrow window beside the tool's panel); otherwise the
// page's one action, then a Menu chip that opens the same list.
// The looks restyle it through data hooks, never through its classes: header[data-site-header], [data-site-link]
// (aria-current on the place you're in), [data-site-kept], [data-site-divider], [data-site-chip], [data-site-action],
// and in the phone menu [data-site-menu], [data-site-label].
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { DropdownMenu, Popover } from 'radix-ui';
import { Menu } from 'lucide-react';
import { Wordmark } from '@/components/Wordmark';
import { APP_NAME, withLogo } from '@/lib/brand';
import { DRAFTS_KEY, TAB, draftLabel, drafts, type Draft } from '@/lib/drafts';
import { keptHref, PLACES, TOOL_URL, type Place } from '@/lib/places';
import { cn } from '@/lib/utils';

/** Your letters kept on this device. The tool passes its own (and opens one in place); other pages read them here. */
export type Kept = { list: Draft[]; onOpen: (savedAt: number) => void; found?: boolean };

type Props = {
  /** the place this page is, or sits inside (a letter is inside All letters) */
  current?: Place;
  /** the page sits inside `current` (a letter): that place stays a link, the way back */
  inside?: boolean;
  /** a place's link on this page instead of its address (a letter: All letters as it was left) */
  hrefs?: Partial<Record<Place, string>>;
  kept?: Kept;
  /** the page's own action, before the places (the tool without its panel: Share) */
  action?: ReactNode;
  /** writing on a phone: everything but the wordmark steps aside */
  quiet?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

/** The phone header's small chips (Menu here, Share in the tool): drawn 32 px, still a 44 px target. */
export const headerChip =
  "pointer-events-auto relative grid size-[32px] shrink-0 place-items-center rounded-[9px] border border-[color-mix(in_oklab,var(--foreground)_14%,transparent)] bg-panel text-foreground/85 shadow-[0_1px_2px_rgba(60,45,20,0.10)] transition-colors duration-150 after:absolute after:-inset-1.5 after:content-[''] active:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-accent [&_svg]:size-[16px]";

// a place in the header: a big enough target without making the line taller
const link =
  "pointer-events-auto relative inline-flex shrink-0 items-baseline gap-1 rounded-[3px] px-1.5 py-0.5 font-medium text-foreground/80 transition-colors duration-150 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] hover-device:hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring data-[state=open]:text-foreground";
// the place you're in: a short rule under its words (Rubric's vermilion, one of the few marks that guide the eye)
const mark = "relative before:pointer-events-none before:absolute before:inset-x-0 before:bottom-px before:h-[1.5px] before:bg-[var(--mark)] before:content-[''] forced-colors:before:bg-[CanvasText]";

export const SiteHeader = forwardRef<HTMLElement, Props>(function SiteHeader(
  { current, inside, hrefs, kept, action, quiet, className, style, children },
  ref,
) {
  const device = useDeviceKept();
  const mine = kept ?? device;
  const onTool = current === 'write' && !inside;
  // the words on one line beside the wordmark, or (when they don't fit) the Menu chip
  const { headerRef, actionRef, wordsRef, compact } = useFits(ref);
  return (
    <header
      ref={headerRef}
      data-site-header
      style={style}
      className={cn(
        // over the page, clear of a notch or camera island (the phone sideways too); only its links take clicks, so
        // the canvas under it still drags
        'pointer-events-none absolute inset-x-0 top-[max(1rem,env(safe-area-inset-top,0px))] z-10 flex items-start justify-between gap-4 pr-[max(1rem,env(safe-area-inset-right,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] text-[0.78125rem] text-muted-foreground sm:pr-[max(2rem,env(safe-area-inset-right,0px))] sm:pl-[max(2rem,env(safe-area-inset-left,0px))] lg:top-5 lg:pr-[max(2.5rem,env(safe-area-inset-right,0px))] lg:pl-[max(2.5rem,env(safe-area-inset-left,0px))]',
        className,
      )}
    >
      {onTool ? (
        <span className="flex h-8 shrink-0 items-center text-foreground/85 lg:h-9"><Wordmark /></span>
      ) : (
        <a
          href={withLogo(TOOL_URL)}
          aria-label={`${APP_NAME}: write a letter`}
          className="pointer-events-auto -mx-1 flex h-8 shrink-0 items-center rounded-[3px] px-1 text-foreground/85 transition-colors duration-150 hover-device:hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring lg:h-9"
        >
          <Wordmark />
        </a>
      )}
      {children}
      <div
        inert={quiet || undefined}
        className={cn('flex min-h-8 min-w-0 items-center justify-end gap-x-2 transition-opacity duration-150 lg:min-h-9', quiet && 'opacity-0')}
      >
        {action && <div ref={actionRef} data-site-action className="pointer-events-auto flex shrink-0 items-center">{action}</div>}
        {/* never wrapped: when the line doesn't fit it stays measurable, out of sight and out of reach, and the Menu
            takes over */}
        <div
          ref={wordsRef}
          inert={compact || undefined}
          className={cn('flex shrink-0 items-center gap-x-1 whitespace-nowrap', compact && 'invisible absolute top-0 right-0')}
        >
          {mine.list.length > 0 && (
            <>
              <KeptMenu kept={mine} />
              <span aria-hidden data-site-divider className="mx-1 h-3 w-px shrink-0 bg-[var(--rule-link)]" />
            </>
          )}
          <nav aria-label="Site">
            <ul className="flex items-center gap-x-1">
              {PLACES.map((p) => (
                <li key={p.id} className="flex">
                  <PlaceLink place={p} current={current} inside={inside} href={hrefs?.[p.id]} className={link} />
                </li>
              ))}
            </ul>
          </nav>
        </div>
        {compact && <SiteMenu current={current} inside={inside} hrefs={hrefs} kept={mine} />}
      </div>
    </header>
  );
});

/**
 * Whether the words fit on one line beside the wordmark (and the page's action). Measured, not guessed from the
 * window: the room changes with the tool's panel, large text, a look's wider capitals and My letters' count. Starts
 * compact and is measured before the first paint, then again whenever the header or the words change size.
 */
function useFits(outer: React.ForwardedRef<HTMLElement>) {
  const header = useRef<HTMLElement | null>(null);
  const actionRef = useRef<HTMLDivElement | null>(null);
  const wordsRef = useRef<HTMLDivElement | null>(null);
  const [compact, setCompact] = useState(true);
  const headerRef = useCallback((el: HTMLElement | null) => {
    header.current = el;
    if (typeof outer === 'function') outer(el);
    else if (outer) outer.current = el;
  }, [outer]);
  useLayoutEffect(() => {
    const h = header.current;
    const words = wordsRef.current;
    if (!h || !words) return;
    const measure = () => {
      const px = (v: string) => parseFloat(v) || 0;
      const hs = getComputedStyle(h);
      // the wordmark comes first, with its margins
      const logo = h.firstElementChild as HTMLElement | null;
      const ls = logo && getComputedStyle(logo);
      const logoW = logo && ls ? logo.offsetWidth + px(ls.marginLeft) + px(ls.marginRight) : 0;
      const room = h.clientWidth - px(hs.paddingLeft) - px(hs.paddingRight) - logoW - px(hs.columnGap);
      const action = actionRef.current;
      const gap = action ? px(getComputedStyle(action.parentElement!).columnGap) : 0;
      const need = words.offsetWidth + (action ? action.offsetWidth + gap : 0);
      setCompact(need > room + 0.5);
    };
    measure();
    // the header (window, panel), the words (fonts arriving, My letters' count), the wordmark (its drawing arrives
    // after the first paint) and the action
    const ro = new ResizeObserver(measure);
    for (const el of [h, words, h.firstElementChild, actionRef.current]) if (el) ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { headerRef, actionRef, wordsRef, compact };
}

/** A place: the one you're in is marked and isn't a link; the one a page sits inside is marked and is the way back. */
function PlaceLink({ place, current, inside, href, className }: {
  place: (typeof PLACES)[number];
  current?: Place;
  inside?: boolean;
  href?: string;
  className: string;
}) {
  const at = current === place.id;
  const words = <span data-site-words className={cn(at && mark)}>{place.label}</span>;
  if (at && !inside) return <span data-site-link aria-current="page" className={cn(className, 'cursor-default text-foreground')}>{words}</span>;
  return (
    <a data-site-link href={href ?? withLogo(place.href)} aria-current={at ? 'true' : undefined} className={cn(className, at && 'text-foreground')}>
      {words}
    </a>
  );
}

/** Kept letters, the tab's own first. */
function ordered(list: Draft[]) {
  const i = list.findIndex((d) => d.tab === TAB);
  return i > 0 ? [list[i], ...list.filter((_, j) => j !== i)] : list;
}

/** Off the tool: the letters kept on this device (another tab may keep or take one), opened in the tool. */
function useDeviceKept(): Kept {
  const [list, setList] = useState<Draft[]>(() => drafts());
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === DRAFTS_KEY || e.key == null) setList(drafts()); };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);
  return { list, onOpen: (savedAt) => window.location.assign(withLogo(keptHref(savedAt))) };
}

const menuSurface =
  'z-50 w-[min(18rem,calc(100vw-24px))] origin-(--radix-popper-transform-origin) rounded-2xl border border-border bg-[color-mix(in_oklab,var(--popover)_96%,transparent)] p-1.5 shadow-[0_1px_2px_rgba(60,45,20,0.08),0_16px_40px_-12px_rgba(40,30,10,0.35)] backdrop-blur-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:data-[state=open]:zoom-in-100 motion-reduce:data-[state=closed]:zoom-out-100';
const keptRow = 'flex min-h-11 w-full cursor-default items-center justify-between gap-3 rounded-[3px] px-3 py-1.5 text-left text-[0.875rem] text-foreground outline-none select-none';

function KeptLine({ d, kept, now }: { d: Draft; kept: Kept; now: number }) {
  const { words, when } = draftLabel(d, now);
  return (
    <>
      <span className="grid min-w-0">
        <span className="truncate">{words}</span>
        {d.tab === TAB && <span className="text-[0.7188rem] text-muted-foreground">{kept.found ? 'The one you were writing here' : 'Written in this tab'}</span>}
      </span>
      <span className="shrink-0 text-[0.75rem] text-muted-foreground">{when}</span>
    </>
  );
}

/** My letters, when the words fit: how many are kept, and the list to bring one back. */
function KeptMenu({ kept }: { kept: Kept }) {
  const now = Date.now();
  const n = kept.list.length;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" data-site-kept className={link}>
          My letters
          <span className="font-normal text-muted-foreground tabular-nums">{n}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="bottom" align="end" sideOffset={8} collisionPadding={12} className={menuSurface}>
          <DropdownMenu.Label className="px-3 pt-1 pb-0.5 text-[0.7188rem] text-muted-foreground">Kept on this device</DropdownMenu.Label>
          {ordered(kept.list).map((d, i) => (
            <DropdownMenu.Item key={d.savedAt + ':' + i} onSelect={() => kept.onOpen(d.savedAt)} className={cn(keptRow, 'data-[highlighted]:bg-accent')}>
              <KeptLine d={d} kept={kept} now={now} />
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** When the words don't fit: one Menu chip for the places and your kept letters (a count on it when there are any). */
function SiteMenu({ current, inside, hrefs, kept }: { current?: Place; inside?: boolean; hrefs?: Partial<Record<Place, string>>; kept: Kept }) {
  const [open, setOpen] = useState(false);
  const n = kept.list.length;
  const now = Date.now();
  const row = "relative flex min-h-11 w-full items-center rounded-[3px] px-3 text-[0.9375rem] text-foreground outline-none transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring hover-device:hover:bg-accent active:bg-accent";
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" data-site-chip aria-label={n ? `Menu, ${n} ${n === 1 ? 'letter' : 'letters'} kept` : 'Menu'} className={headerChip}>
          <Menu aria-hidden />
          {n > 0 && (
            <span aria-hidden className="absolute -top-1.5 -right-1.5 grid h-[16px] min-w-[16px] place-items-center rounded-full bg-[var(--ink)] px-1 text-[10px] leading-none font-medium text-[var(--primary-foreground)] tabular-nums">{n}</span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          data-site-menu
          aria-label="Menu"
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          // the first place to go (focus skips links by default, and would land on a kept letter)
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>('a[data-site-link]')?.focus();
          }}
          // Escape closes the menu only (a letter page also goes back on Escape)
          onEscapeKeyDown={(e) => e.stopPropagation()}
          className={menuSurface}
        >
          <nav aria-label="Site">
            <ul>
              {PLACES.map((p) => (
                <li key={p.id}>
                  <PlaceLink place={p} current={current} inside={inside} href={hrefs?.[p.id]} className={cn(row, 'font-medium')} />
                </li>
              ))}
            </ul>
          </nav>
          {n > 0 && (
            <>
              <div aria-hidden className="mx-2 my-1 h-px bg-border" />
              <p data-site-label className="px-3 pt-1 pb-0.5 text-[0.7188rem] text-muted-foreground">My letters, kept on this device</p>
              <ul>
                {ordered(kept.list).map((d, i) => (
                  <li key={d.savedAt + ':' + i}>
                    <button type="button" onClick={() => { setOpen(false); kept.onOpen(d.savedAt); }} className={cn(keptRow, 'hover-device:hover:bg-accent active:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring')}>
                      <KeptLine d={d} kept={kept} now={now} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

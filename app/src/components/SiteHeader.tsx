// The site's one header, on every page, so the pages can't drift apart (docs/NAVIGATION.md).
// The wordmark on the left is the way to the writing tool (on the tool itself it's plain: a link there would drop the
// letter on the desk). On the right, the four places in the same words and order everywhere, the current one marked
// and not a link; before them My letters, only when letters are kept on this device. The words show only when they
// fit on one line beside the wordmark (a phone, large text, a narrow window beside the tool's panel); otherwise the
// page's one action, then a Menu chip that opens the same list.
// The looks restyle it through data hooks, never through its classes: header[data-site-header], [data-site-link]
// (aria-current on the place you're in), [data-site-kept], [data-site-divider], [data-site-chip], [data-site-action],
// and in the phone menu [data-site-menu], [data-site-label].
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ActionSheet, Sheet, useSheets, type SheetEntry } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/useMediaQuery';
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
  /** the running head's middle: what this page holds (a letter's number, place and year; the letter counter; where
   * you are on the canvas). Centred over the page, or over the stage when `beside` is set */
  centre?: ReactNode;
  /** @deprecated ignored: phones keep the head minimal, with no middle (Rafael, 3 Nov); remove it where it's passed */
  centreShort?: ReactNode;
  /** a column kept at the right, beside the stage (the tool's record): the middle centres over the stage, and the
   * places still run to the right edge. A CSS length */
  beside?: string;
  /** writing on a phone: everything but the wordmark steps aside */
  quiet?: boolean;
  /** pinned within its container rather than the window (the desk, where it can be narrower than the window): the
   * container must be positioned and as tall as the page */
  within?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

/** The phone header's small chips (Menu here, Share in the tool): drawn 32 px, a 48 px target (44 at the least
 * beside another chip, 12 px away). */
export const headerChip =
  "pointer-events-auto relative grid size-[32px] shrink-0 place-items-center rounded-[9px] border border-[color-mix(in_oklab,var(--foreground)_14%,transparent)] bg-panel text-foreground/85 shadow-[0_1px_2px_rgba(60,45,20,0.10)] transition-[background-color,scale] duration-[var(--dur-press,100ms)] ease-out after:absolute after:-inset-2 after:content-[''] hover-device:hover:bg-[var(--st-hover,var(--accent))] active:scale-[var(--st-scale,0.97)] active:bg-[var(--st-press,var(--accent))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-[var(--st-press,var(--accent))] [&_svg]:size-[16px]";
const CHIP = 32;

// a place in the header: a big enough target without making the line taller
const link =
  "pointer-events-auto relative inline-flex shrink-0 items-baseline gap-1 rounded-[3px] px-1.5 py-0.5 font-medium text-foreground/80 transition-colors duration-150 after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] hover-device:hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring data-[state=open]:text-foreground";
/**
 * How the place you're in shows (index.css): 1 its words in the look's red (the default), 2 a soft tint of it behind
 * them, 3 full ink with the other places quieter. ?navsel=1|2|3 to compare; kept for the tab, as ?look= is.
 */
export type NavSel = '1' | '2' | '3';
function readNavSel(): NavSel {
  try {
    const asked = new URLSearchParams(location.search).get('navsel');
    if (asked === '1' || asked === '2' || asked === '3') { sessionStorage.setItem('seedhand:navsel', asked); return asked; }
    const kept = sessionStorage.getItem('seedhand:navsel');
    if (kept === '1' || kept === '2' || kept === '3') return kept;
  } catch { /* storage off: the default */ }
  return '1';
}
export const NAV_SEL: NavSel = typeof location !== 'undefined' ? readNavSel() : '1';
// a piece that isn't shown right now: still laid out (so it can be measured), out of sight and out of reach
const away = 'invisible absolute top-0 right-0';

export const SiteHeader = forwardRef<HTMLElement, Props>(function SiteHeader(
  { current, inside, hrefs, kept, action, centre: centreProp, beside, quiet, within, className, style, children },
  ref,
) {
  const device = useDeviceKept();
  const mine = kept ?? device;
  const onTool = current === 'write' && !inside;
  // phones keep the head minimal: the wordmark, the page's action and the Menu, no middle (Rafael, 3 Nov)
  const phone = useMediaQuery('(max-width: 39.99rem)');
  const centre = phone ? undefined : centreProp;
  const m = useFits(ref, `${!!beside}${!!centre}${!!action}`);
  const { fit } = m;
  const words = fit === 'A' || fit === 'B';
  const middle = centre && (fit === 'A' || fit === 'B' || fit === 'C') ? 'full' : 'none';
  const header = (
    <header
      ref={m.headerRef}
      data-site-header
      data-navsel={NAV_SEL}
      style={beside ? { ...style, ['--site-beside' as string]: beside } : style}
      className={cn(
        // over the page, clear of a notch or camera island (the phone sideways too); only its links take clicks, so
        // the canvas under it still drags. Its own layer (30): above the page and the desk's side column, below the
        // docks' menus, the phone's control sheet (40), and every menu, sheet and toast (50).
        // Pinned to the top while the page scrolls (Rafael: "keep the nav sticky"), on any screen at least 32rem
        // tall; a shorter one (a phone on its side, or very large text) lets it scroll away rather than lose the
        // page to it. Print keeps it where it was. Its height is --site-head (index.css).
        within
          ? 'relative top-0 [@media(min-height:32rem)]:sticky print:relative'
          : 'absolute inset-x-0 top-0 z-30 [@media(min-height:32rem)]:fixed print:absolute',
        'pointer-events-none overflow-x-clip pt-[max(1rem,env(safe-area-inset-top,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] text-[0.78125rem] text-muted-foreground sm:pr-[max(2rem,env(safe-area-inset-right,0px))] sm:pl-[max(2rem,env(safe-area-inset-left,0px))] lg:pt-5 lg:pr-[max(2.5rem,env(safe-area-inset-right,0px))] lg:pl-[max(2.5rem,env(safe-area-inset-left,0px))]',
        // a band of the page's own ground from the top of the window, so nothing scrolling under it shows through,
        // fading out over 12 px below it
        "bg-background after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-3 after:bg-gradient-to-b after:from-background after:to-transparent after:content-['']",
        className,
      )}
    >
      {children}
      {/* the running head: the wordmark, the page's middle, the places, on one line (the looks may rule it) */}
      <div
        ref={m.rowRef}
        data-site-row
        className={cn(
          'relative items-center gap-x-4',
          fit === 'A' ? (beside ? 'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_var(--site-beside)]' : 'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]') : 'flex',
        )}
      >
        {beside && <span ref={m.besideRef} aria-hidden className="invisible absolute top-0 left-0 h-0" style={{ width: 'var(--site-beside)' }} />}
        {/* the wordmark keeps its size, unless the Menu alone doesn't fit beside it (a narrow phone with very large
            text): then, and only then, it shrinks to the room left */}
        <div ref={m.logoRef} className={cn('col-start-1 flex min-h-8 items-center justify-self-start lg:min-h-9', fit === 'E' ? 'min-w-0 shrink' : 'shrink-0')}>
          {onTool ? (
            <span className="flex h-8 min-w-0 items-center text-foreground/85 lg:h-9"><Wordmark /></span>
          ) : (
            <a
              href={withLogo(TOOL_URL)}
              aria-label={`${APP_NAME}: write a letter`}
              // a 48 px tall target around the 32 px line
              className="pointer-events-auto relative -mx-1 flex h-8 min-w-0 items-center rounded-[3px] px-1 after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] text-foreground/85 transition-[color,opacity] duration-150 hover-device:hover:text-foreground active:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring lg:h-9"
            >
              <Wordmark />
            </a>
          )}
        </div>
        {centre && (
          <div
            ref={m.centreRef}
            data-site-centre
            inert={middle !== 'full' || undefined}
            className={cn('flex shrink-0 items-center whitespace-nowrap', middle !== 'full' ? away : fit === 'A' ? 'col-start-2 justify-self-center' : 'mx-auto')}
          >
            {centre}
          </div>
        )}
        <div
          inert={quiet || undefined}
          className={cn(
            // 12 px between the page's action and the Menu, so their 48 px targets don't take from each other
            'flex min-h-8 min-w-0 shrink-0 items-center justify-end gap-x-3 transition-opacity duration-150 lg:min-h-9',
            fit === 'A' ? 'col-[3/-1] justify-self-end' : middle === 'none' && 'ml-auto',
            quiet && 'opacity-0',
          )}
        >
          {action && <div ref={m.actionRef} data-site-action className="pointer-events-auto flex shrink-0 items-center">{action}</div>}
          {/* never wrapped: when the line doesn't fit, the Menu takes over */}
          <div ref={m.wordsRef} inert={!words || undefined} className={cn('flex shrink-0 items-center gap-x-1 whitespace-nowrap', !words && away)}>
            {mine.list.length > 0 && (
              <>
                <KeptMenu kept={mine} />
                <span aria-hidden data-site-divider className="mx-1 h-3 w-px shrink-0 bg-[var(--rule-link)]" />
              </>
            )}
            <nav aria-label="Site">
              <ul className="flex items-center gap-x-1">
                {PLACES.map((p) => (
                  // the last place's ink ends where the rule ends (its padding reaches past the edge)
                  <li key={p.id} className="flex last:-mr-1.5">
                    <PlaceLink place={p} current={current} inside={inside} href={hrefs?.[p.id]} className={link} />
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          {!words && <SiteMenu current={current} inside={inside} hrefs={hrefs} kept={mine} />}
        </div>
      </div>
    </header>
  );
  // the desk: a track as tall as its column, for the header to stick in (the layer is the track's)
  return within ? <div className="pointer-events-none absolute inset-0 z-30 print:static">{header}</div> : header;
});

/**
 * What fits on the running head's one line, measured rather than guessed from the window: the room changes with the
 * tool's panel, large text, a look's wider capitals, My letters' count and the page's middle. In order of preference:
 *   A  the places in words, the middle centred over the page (or the stage)
 *   B  the places in words, the middle between the wordmark and them
 *   C  the Menu, the middle in full
 *   E  the Menu alone (always on a phone, where the head has no middle)
 * Measured before the first paint, then whenever the header or any piece changes size (fonts and the wordmark's
 * drawing arrive late).
 */
type Fit = 'A' | 'B' | 'C' | 'E';
function useFits(outer: React.ForwardedRef<HTMLElement>, pieces: string) {
  const header = useRef<HTMLElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const logoRef = useRef<HTMLDivElement | null>(null);
  const besideRef = useRef<HTMLSpanElement | null>(null);
  const centreRef = useRef<HTMLDivElement | null>(null);
  const actionRef = useRef<HTMLDivElement | null>(null);
  const wordsRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<Fit>('E');
  const headerRef = useCallback((el: HTMLElement | null) => {
    header.current = el;
    if (typeof outer === 'function') outer(el);
    else if (outer) outer.current = el;
  }, [outer]);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const px = (v: string) => parseFloat(v) || 0;
      const room = row.clientWidth;
      const g = px(getComputedStyle(row).columnGap);
      const w = (el: HTMLElement | null) => (el ? el.offsetWidth : 0);
      // the wordmark at its own size (it may be shrunk to fit right now): its drawing's height times its proportions
      const svg = logoRef.current?.querySelector('svg');
      const vb = svg?.viewBox.baseVal;
      const logo = svg && vb && vb.height ? Math.max(w(logoRef.current), Math.ceil(svg.getBoundingClientRect().height * (vb.width / vb.height))) : w(logoRef.current);
      const beside = w(besideRef.current);
      const centre = w(centreRef.current);
      const action = actionRef.current;
      const inner = action ? px(getComputedStyle(action.parentElement!).columnGap) : 0;
      const lead = action ? action.offsetWidth + inner : 0;
      const words = lead + w(wordsRef.current);
      const menu = lead + CHIP;
      const fits = (...parts: number[]) => parts.filter((x) => x > 0).reduce((a, b) => a + b, 0) + g * (parts.filter((x) => x > 0).length - 1) <= room + 0.5;
      let next: Fit;
      if (centre) {
        // centred: each side of the middle has to hold its own half
        const side = (room - centre - beside - g * (beside ? 3 : 2)) / 2;
        if (logo <= side && words <= side + (beside ? g + beside : 0)) next = 'A';
        else if (fits(logo, centre, words)) next = 'B';
        else if (fits(logo, centre, menu)) next = 'C';
        else next = 'E';
      } else {
        next = fits(logo, words) ? 'B' : 'E';
      }
      setFit(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [row, logoRef.current, besideRef.current, centreRef.current, actionRef.current, wordsRef.current]) if (el) ro.observe(el);
    return () => ro.disconnect();
    // again when a piece comes or goes (the middle arrives with the letters)
  }, [pieces]);
  return { fit, headerRef, rowRef, logoRef, besideRef, centreRef, actionRef, wordsRef };
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
  const words = <span data-site-words>{place.label}</span>;
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

/**
 * My letters, when the words fit: how many are kept, and the list to bring one back. The shared ActionSheet: a menu
 * from "My letters 2" on a desktop, a sheet of rows on a touch screen.
 */
function KeptMenu({ kept }: { kept: Kept }) {
  const now = Date.now();
  const n = kept.list.length;
  const entries: SheetEntry[] = [
    { kind: 'label', id: 'kept', label: 'Kept on this device' },
    ...ordered(kept.list).map((d, i) => {
      const { words, when } = draftLabel(d, now);
      return {
        id: `${d.savedAt}:${i}`,
        // the time stays at the right of the words (the row's end slot is for an icon, a spinner or a tick)
        label: (
          <span className="flex min-w-0 items-baseline justify-between gap-3">
            <span className="truncate">{words}</span>
            <span className="shrink-0 text-[0.75rem] text-muted-foreground">{when}</span>
          </span>
        ),
        hint: d.tab === TAB ? (kept.found ? 'The one you were writing here' : 'Written in this tab') : undefined,
        onSelect: () => kept.onOpen(d.savedAt),
      };
    }),
  ];
  return (
    <ActionSheet
      title="My letters"
      entries={entries}
      width="w-[min(18rem,calc(100vw-24px))]"
      trigger={
        <button type="button" data-site-kept className={cn(link, 'active:underline active:decoration-current active:underline-offset-[3px]')}>
          My letters
          <span className="font-normal text-muted-foreground tabular-nums">{n}</span>
        </button>
      }
    />
  );
}

/**
 * When the words don't fit: one Menu chip (with a count when letters are kept) that opens the shared Sheet. On a
 * phone that's a bottom sheet you can drag or flick away: the places as big rows, the current one marked, then My
 * letters. On a larger screen (large text, a narrow window) the same list in a popover.
 */
function SiteMenu({ current, inside, hrefs, kept }: { current?: Place; inside?: boolean; hrefs?: Partial<Record<Place, string>>; kept: Kept }) {
  const sheets = useSheets();
  const [open, setOpen] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const n = kept.list.length;
  const now = Date.now();
  // big, thumb-sized rows in the sheet; the menu's own size in a popover. Every row answers a press at once.
  const row = cn(
    'sheet-row relative flex w-full items-center text-left text-foreground outline-none transition-[scale,background-color] duration-[var(--dur-press,100ms)] ease-out select-none active:scale-[var(--st-scale,0.97)] active:bg-[var(--st-press,var(--accent))] hover-device:hover:bg-[var(--st-hover,var(--accent))] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
    sheets ? 'min-h-14 gap-3 rounded-[10px] px-4 text-[1.125rem]' : 'min-h-11 gap-3 rounded-[3px] px-3 text-[0.9375rem]',
  );
  return (
    <Sheet
      title="Menu"
      showTitle={false}
      open={open}
      onOpenChange={setOpen}
      side="bottom"
      align="end"
      className="w-[min(18rem,calc(100vw-24px))] p-1.5"
      // the first place to go (opening would focus the first button, a kept letter)
      onOpenAutoFocus={(e) => { e.preventDefault(); body.current?.querySelector<HTMLElement>('a[data-site-link]')?.focus({ preventScroll: true }); }}
      // Escape closes the menu only (a letter's page also goes back on Escape)
      onEscapeKeyDown={(e) => e.stopPropagation()}
      trigger={
        <button type="button" data-site-chip aria-label={n ? `Menu, ${n} ${n === 1 ? 'letter' : 'letters'} kept` : 'Menu'} className={headerChip}>
          <Menu aria-hidden />
          {n > 0 && (
            <span aria-hidden className="absolute -top-1.5 -right-1.5 grid h-[16px] min-w-[16px] place-items-center rounded-full bg-[var(--ink)] px-1 text-[10px] leading-none font-medium text-[var(--primary-foreground)] tabular-nums">{n}</span>
          )}
        </button>
      }
    >
      {(close) => (
        <div ref={body} data-site-menu data-navsel={NAV_SEL} className={cn('grid', sheets && 'pb-1')}>
          <nav aria-label="Site">
            <ul className="grid">
              {PLACES.map((p) => (
                <li key={p.id}>
                  <PlaceLink place={p} current={current} inside={inside} href={hrefs?.[p.id]} className={cn(row, 'font-medium')} />
                </li>
              ))}
            </ul>
          </nav>
          {n > 0 && (
            <>
              <div aria-hidden className={cn('my-1.5 h-px bg-border', sheets ? 'mx-4' : 'mx-2')} />
              <p data-site-label className={cn('pt-1 pb-1 text-muted-foreground', sheets ? 'px-4 text-[0.8125rem]' : 'px-3 text-[0.7188rem]')}>My letters, kept on this device</p>
              <ul className="grid">
                {ordered(kept.list).map((d, i) => (
                  <li key={d.savedAt + ':' + i}>
                    <button type="button" onClick={() => { close(); kept.onOpen(d.savedAt); }} className={cn(row, 'justify-between', sheets ? 'text-[1rem]' : 'text-[0.875rem]')}>
                      <KeptLine d={d} kept={kept} now={now} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

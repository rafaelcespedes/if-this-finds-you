// The overlay system every page uses: how a menu or a panel of choices opens, moves and closes. The look gives the
// skin (the Reading Room's slips, rules and small caps); this gives the behaviour, and the same feel everywhere.
//
//   Phones: a bottom sheet (vaul): drag it down to dismiss, flick it away, rubber-banding at the top, a spring settle,
//           the page dimming in step with the drag; safe-area aware, focus kept inside, Esc, the backdrop and the
//           phone's Back close it.
//   Desktop: a menu or popover that scales and fades from its trigger (transform-origin at the trigger), in ~180 ms.
//
// Two shapes:
//   ActionSheet  a list of actions (Share, In ink): a menu on desktop (arrow keys, type-ahead), a sheet of rows on phones
//   Sheet        any content (the writer's details, your kept letters): a popover on desktop, a sheet on phones
//
// Rows have a fixed slot at the end for their icon, a spinner while something is being made, or a tick once it's done,
// so nothing moves while it works; every row and button answers a press at once (scale 0.97).
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { DropdownMenu, Popover } from 'radix-ui';
import { Drawer } from 'vaul';
import { Check, Loader2 } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { menuContent } from '@/components/ui/menu';

/** Phones and other small touch screens get sheets; everything else gets menus and popovers. */
export const SHEET_QUERY = '(max-width: 639.98px), (pointer: coarse) and (max-width: 1023.98px)';
export const useSheets = () => useMediaQuery(SHEET_QUERY);

export type RowStatus = 'busy' | 'done' | null | undefined;

export type SheetEntry =
  | {
    kind?: 'item';
    id: string;
    label: ReactNode;
    /** a second line, quieter */
    hint?: ReactNode;
    icon?: ReactNode;
    /** busy: being made (a spinner, and the row waits); done: just finished (a tick) */
    status?: RowStatus;
    onSelect: () => void;
    disabled?: boolean;
    /** a smaller, secondary row */
    quiet?: boolean;
    /** a choice that is on (a tick at the start) */
    checked?: boolean;
  }
  | { kind: 'separator'; id: string }
  | { kind: 'label'; id: string; label: ReactNode };

// ---------- Back closes a phone sheet ----------
// A phone's Back button (or a swipe back) closes an open sheet instead of leaving the page (phone QA, launch day).
// Opening a sheet adds one entry to the tab's history, at the same address. Back takes it out: the sheet closes, and
// the page's own listeners never hear of it. Closing the sheet any other way (a choice, the backdrop, a swipe down,
// Escape) takes the entry back out the same quiet way, so no stray step is left for Back. Whatever the page wrote to
// the address while the sheet was open (the Fonts filters, the desk's link) stays. A choice that leaves the page (a
// link, a kept letter opened from another page) leaves history alone, so the new page loads as it should.

type OpenSheet = { close: () => void; length: number; popped: boolean };
/** the open sheets, the last opened on top */
const openSheets: OpenSheet[] = [];
/** sheets closed some other way whose entry is about to be taken back out */
const tidying: { timer: number; at: string }[] = [];
/** our own history.back() calls still to arrive, and the address to keep after each */
const swallowing: string[] = [];
/** the address while a sheet is open, a frame at a time (Back arrives on the entry before it, at the old address) */
let latest = '';
let sampling = 0;
/** the page is going (a link, location.assign): leave history alone */
let leaving = false;
let leavingTimer = 0;

function sample() {
  if (!openSheets.length) { sampling = 0; return; }
  latest = location.href;
  sampling = requestAnimationFrame(sample);
}
function onLeave() {
  leaving = true;
  // a navigation that didn't happen after all (a download, a cancelled one): sheets tidy up again
  clearTimeout(leavingTimer);
  leavingTimer = window.setTimeout(() => { leaving = false; }, 3000);
}
function keep(at: string) {
  if (at && location.href !== at) history.replaceState(history.state, '', at);
}
function onPop(e: PopStateEvent) {
  // our own tidying up: the page doesn't hear it, and keeps its address
  const own = swallowing.shift();
  if (own != null) { e.stopImmediatePropagation(); keep(own); return; }
  // Back on an entry about to be tidied away (closed a moment ago): that's the tidying done
  const t = tidying.pop();
  if (t) { clearTimeout(t.timer); e.stopImmediatePropagation(); keep(t.at); return; }
  // Back with a sheet open: close the top one, and nothing else
  const top = openSheets.pop();
  if (!top) return;
  e.stopImmediatePropagation();
  keep(latest);
  top.popped = true;
  top.close();
}
if (typeof window !== 'undefined') {
  // registered at load and in the capture phase, so it runs before any page's own popstate listener
  window.addEventListener('popstate', onPop, true);
  window.addEventListener('pageshow', (e) => { if (e.persisted) leaving = false; });
}

/** While `open`, Back closes the sheet (see above). */
function useBackCloses(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    const state = history.state;
    history.pushState(state && typeof state === 'object' ? { ...state } : state, '');
    const me: OpenSheet = { close: () => closeRef.current(), length: history.length, popped: false };
    openSheets.push(me);
    if (openSheets.length === 1) window.addEventListener('beforeunload', onLeave);
    latest = location.href;
    if (!sampling) sampling = requestAnimationFrame(sample);
    return () => {
      const i = openSheets.indexOf(me);
      if (i >= 0) openSheets.splice(i, 1);
      if (!openSheets.length) window.removeEventListener('beforeunload', onLeave);
      if (me.popped) return;
      // closed some other way: take its entry back out, once whatever the choice started has begun (a navigation
      // shows itself by then, in WebKit too, where location.assign waits for a task of its own)
      const t = {
        at: location.href,
        timer: window.setTimeout(() => {
          const k = tidying.indexOf(t);
          if (k >= 0) tidying.splice(k, 1);
          // the page is going, or something has been added on top since: leave history alone
          if (leaving || history.length !== me.length) return;
          swallowing.push(location.href);
          history.back();
        }, 50),
      };
      tidying.push(t);
    };
  }, [open]);
}

// ---------- the phone sheet ----------

/** The sheet's surface: the page's panel colour, a grabber, room for the home indicator. */
const sheetSurface =
  'sheet-surface fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] max-w-[640px] flex-col rounded-t-[20px] border-t border-border bg-panel pb-[max(12px,env(safe-area-inset-bottom,0px))] shadow-[0_-1px_2px_rgba(60,45,20,0.05),0_-16px_44px_-16px_rgba(40,30,10,0.35)] outline-none';
const sheetBackdrop = 'sheet-backdrop fixed inset-0 z-50 bg-[rgba(24,20,14,0.32)]';

function PhoneSheet({ trigger, title, showTitle = true, open, onOpenChange, children, describe, onOpenAutoFocus, onEscapeKeyDown }: { trigger: ReactElement; title: string; showTitle?: boolean; open?: boolean; onOpenChange?: (o: boolean) => void; children: ReactNode; describe?: string; onOpenAutoFocus?: (e: Event) => void; onEscapeKeyDown?: (e: KeyboardEvent) => void }) {
  const surface = useRef<HTMLDivElement>(null);
  useBackCloses(!!open, () => onOpenChange?.(false));
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className={sheetBackdrop} />
        <Drawer.Content
          ref={surface}
          tabIndex={-1}
          className={sheetSurface}
          aria-describedby={undefined}
          // focus comes into the sheet however it opened (a tap too): onto the sheet itself, not a field in it, so no
          // keyboard pops up; a page that picks its own place (onOpenAutoFocus + preventDefault) keeps it
          onOpenAutoFocus={(e) => {
            onOpenAutoFocus?.(e);
            if (e.defaultPrevented) return;
            e.preventDefault();
            surface.current?.focus({ preventScroll: true });
          }}
          onEscapeKeyDown={onEscapeKeyDown}
        >
          <div aria-hidden className="flex h-6 shrink-0 cursor-grab items-end justify-center">
            <span className="h-[5px] w-9 rounded-full bg-[color-mix(in_oklab,var(--foreground)_18%,transparent)]" />
          </div>
          <Drawer.Title className={cn('sheet-title shrink-0 px-5 pt-2 pb-2 text-[0.8125rem] font-medium text-muted-foreground', !showTitle && 'sr-only')}>{title}</Drawer.Title>
          {describe && <Drawer.Description className="sr-only">{describe}</Drawer.Description>}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/**
 * The slot at a row's end: its icon, a spinner while busy, a tick when done (always the same size). On a row with a
 * hint it sits on the label's line, not the middle of the whole block.
 */
function StatusSlot({ icon, status, top }: { icon?: ReactNode; status?: RowStatus; top?: boolean }) {
  return (
    <span aria-hidden className={cn('grid size-5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-[18px]', top && 'mt-[calc((1lh-1.25rem)/2)] self-start')}>
      {status === 'busy' ? <Loader2 className="animate-spin" /> : status === 'done' ? <Check className="text-[var(--ink)]" /> : icon}
    </span>
  );
}

/** A row in a phone sheet: 52 px, a press that answers at once. */
function SheetRow({ entry, close, checks }: { entry: Extract<SheetEntry, { onSelect: () => void }>; close: () => void; checks?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={entry.checked ?? undefined}
      disabled={entry.disabled || entry.status === 'busy'}
      aria-busy={entry.status === 'busy' || undefined}
      onClick={() => { entry.onSelect(); close(); }}
      className={cn(
        'sheet-row flex min-h-[52px] w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-foreground transition-[transform,background-color] duration-100 ease-out select-none active:scale-[0.97] active:bg-accent disabled:opacity-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        entry.quiet ? 'text-[0.875rem]' : 'text-[1rem]',
      )}
    >
      {checks && (
        <span aria-hidden className="grid size-5 shrink-0 place-items-center self-start pt-0.5">{entry.checked && <Check className="size-[18px] text-[var(--ink)]" />}</span>
      )}
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="min-w-0">{entry.label}</span>
        {entry.hint && <span className="text-[0.75rem] leading-snug text-muted-foreground">{entry.hint}</span>}
      </span>
      <StatusSlot icon={entry.icon} status={entry.status} top={!!entry.hint} />
    </button>
  );
}

// ---------- ActionSheet: a list of actions ----------

interface ActionSheetProps {
  /** the button that opens it (a single element; it gets the trigger's aria and handlers) */
  trigger: ReactElement;
  /** what the sheet is (shown on phones; the menu's label on desktop) */
  title: string;
  entries: SheetEntry[];
  onOpenChange?: (open: boolean) => void;
  /** desktop: where the menu opens from */
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  /** desktop: the menu's width class */
  width?: string;
  /** desktop: after the menu closes on a choice (true when it moved the focus itself) */
  onAfterChoice?: () => boolean;
}

export function ActionSheet({ trigger, title, entries, onOpenChange, side = 'bottom', align = 'end', width = 'w-[244px]', onAfterChoice }: ActionSheetProps) {
  const sheets = useSheets();
  const [open, setOpen] = useState(false);
  const set = (o: boolean) => { setOpen(o); onOpenChange?.(o); };
  const [chose, setChose] = useState(false);
  // when some rows can be ticked, every row keeps the tick's room, so the words line up
  const checks = entries.some((e) => (e.kind ?? 'item') === 'item' && (e as { checked?: boolean }).checked != null);

  if (sheets) {
    return (
      <PhoneSheet trigger={trigger} title={title} open={open} onOpenChange={set}>
        <div role="list" className="grid pb-1">
          {entries.map((e) =>
            e.kind === 'separator' ? <div key={e.id} role="presentation" className="mx-3 my-1.5 h-px bg-border" />
              : e.kind === 'label' ? <div key={e.id} className="px-3 pt-2 pb-1 text-[0.75rem] text-muted-foreground">{e.label}</div>
                : <div key={e.id} role="listitem"><SheetRow entry={e} checks={checks} close={() => set(false)} /></div>,
          )}
        </div>
      </PhoneSheet>
    );
  }
  return (
    <DropdownMenu.Root open={open} onOpenChange={set}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          aria-label={title}
          onCloseAutoFocus={(ev) => { if (chose && onAfterChoice?.()) ev.preventDefault(); setChose(false); }}
          className={cn(menuContent, width)}
        >
          {entries.map((e) =>
            e.kind === 'separator' ? <DropdownMenu.Separator key={e.id} className="mx-2 my-1 h-px bg-border" />
              : e.kind === 'label' ? <DropdownMenu.Label key={e.id} className="px-3 pt-1 pb-0.5 text-[0.7188rem] text-muted-foreground">{e.label}</DropdownMenu.Label>
                : (
                  <MenuRow
                    key={e.id}
                    checked={e.checked}
                    disabled={e.disabled || e.status === 'busy'}
                    onSelect={() => { setChose(true); e.onSelect(); }}
                    className={cn(
                      'menu-row flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[3px] px-3 text-foreground outline-none transition-transform duration-100 ease-out select-none active:scale-[0.98] data-[disabled]:opacity-50 data-[highlighted]:bg-accent',
                      e.quiet ? 'text-[0.8125rem]' : 'text-[0.875rem]',
                      e.hint && 'py-2',
                    )}
                  >
                    {checks && <span aria-hidden className="grid size-4 shrink-0 place-items-center self-start pt-0.5">{e.checked && <Check className="size-4 text-[var(--ink)]" />}</span>}
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span>{e.label}</span>
                      {e.hint && <span className="text-[0.7188rem] leading-snug text-muted-foreground">{e.hint}</span>}
                    </span>
                    <StatusSlot icon={e.icon} status={e.status} top={!!e.hint} />
                  </MenuRow>
                ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** A desktop menu row: a checkbox item when it can be ticked (screen readers hear it), a plain item otherwise. */
function MenuRow({ checked, disabled, onSelect, className, children }: { checked?: boolean; disabled?: boolean; onSelect: () => void; className: string; children: ReactNode }) {
  if (checked != null) {
    return (
      <DropdownMenu.CheckboxItem checked={checked} disabled={disabled} onSelect={onSelect} className={className}>
        {children}
      </DropdownMenu.CheckboxItem>
    );
  }
  return <DropdownMenu.Item disabled={disabled} onSelect={onSelect} className={className}>{children}</DropdownMenu.Item>;
}

// ---------- Sheet: any content ----------

interface SheetProps {
  trigger: ReactElement;
  title: string;
  /** shown as the sheet's heading on phones (default); false keeps it for screen readers only */
  showTitle?: boolean;
  children: ReactNode | ((close: () => void) => ReactNode);
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  /** desktop: the popover's classes (width, padding) */
  className?: string;
  /** desktop: after it closes (true when it moved the focus itself) */
  onCloseAutoFocus?: (e: Event) => void;
  /** where focus goes as it opens (preventDefault to keep it on the panel itself) */
  onOpenAutoFocus?: (e: Event) => void;
  /** Escape, before it closes the sheet (e.g. stop a page's own Escape from also acting) */
  onEscapeKeyDown?: (e: KeyboardEvent) => void;
}

export function Sheet({ trigger, title, showTitle = true, children, open: openProp, onOpenChange, side = 'bottom', align = 'start', className, onCloseAutoFocus, onOpenAutoFocus, onEscapeKeyDown }: SheetProps) {
  const sheets = useSheets();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const set = (o: boolean) => { setOpenState(o); onOpenChange?.(o); };
  const close = () => set(false);
  const body = typeof children === 'function' ? children(close) : children;
  if (sheets) {
    return (
      <PhoneSheet trigger={trigger} title={title} showTitle={showTitle} open={open} onOpenChange={set} onOpenAutoFocus={onOpenAutoFocus} onEscapeKeyDown={onEscapeKeyDown}>
        <div className="px-3 pb-2">{body}</div>
      </PhoneSheet>
    );
  }
  return (
    <Popover.Root open={open} onOpenChange={set}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          aria-label={title}
          onCloseAutoFocus={onCloseAutoFocus}
          onOpenAutoFocus={onOpenAutoFocus}
          onEscapeKeyDown={onEscapeKeyDown}
          className={cn(
            'z-50 max-h-[min(var(--radix-popover-content-available-height),calc(100dvh-24px))] origin-(--radix-popover-content-transform-origin) overflow-y-auto overscroll-contain rounded-2xl border border-border bg-popover p-4 shadow-[0_1px_2px_rgba(60,45,20,0.08),0_16px_40px_-12px_rgba(40,30,10,0.35)] outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:data-[state=open]:zoom-in-100 motion-reduce:data-[state=closed]:zoom-out-100',
            className,
          )}
        >
          {body}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

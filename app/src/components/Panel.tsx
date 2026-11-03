// The controls, in the order people reach for them (the panel on desktop, the sheet on phones):
//   always there   the writer (tap for "About this hand"), New hand, share, and what's on the page
//   the look       Paper, Pen, Ink, Handwriting, How they write (three sliders)
//   More           everything else, folded away: the other sliders, occasion, signature, seed, keep-when-rolling
// Writing modes (Ink / Pencil / Fair copy) live with the writing, under the sheet and in the pen tray.
import { memo, useEffect, useId, useState } from 'react';
import { CaseSensitive, ChevronDown, Download, Link, Loader2, Share, Shuffle, Users } from 'lucide-react';
import { DropdownMenu, Popover } from 'radix-ui';
import { getStyle, UPM, type Hand } from '@engine';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Segmented, SegmentedItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PaperCanvas } from '@/components/PaperCanvas';
import { PenSwatches, TipChoice } from '@/components/PenPicker';
import { Signature } from '@/components/Signature';
import { StylePicker } from '@/components/StylePicker';
import { ADVANCED_GROUPS, CONTROLS, isLive, isShown, naturalValue, penSizeFactor, type SliderControl } from '@/lib/controls';
import { ENGINE_TIPS, MODELLED_INK } from '@/lib/engine-features';
import { describeHand, words } from '@/lib/hands';
import { handSources } from '@/lib/credits';
import { sampleById } from '@/lib/samples';
import { branded } from '@/lib/brand';
import { styleCard, styleName } from '@/lib/styles';
import { AUTO_INK, INK_FAMILIES, inkColor, inkName } from '@/lib/inks';
import { OCCASIONS } from '@/lib/occasions';
import { getPaper, PAPERS, type PaperId, type PaperSpec } from '@/lib/papers';
import { PENS_LIVE, PENS_SHOWN, penName } from '@/lib/pens';
import { controlValue } from '@/lib/params';
import type { LockKey } from '@/lib/roll';
import { AMOUNT_RANGE, SIZE_RANGE, type NoteState } from '@/lib/state';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export interface PanelProps {
  state: NoteState;
  /** the seed's natural hand, and the hand as it's drawn (natural + your changes) */
  natural: Hand;
  p: Hand;
  name: string;
  /** em size in mm at the current paper and size (for showing the tip in mm) */
  emMm: number;
  /** the engine's ink key when it models ink (for pen samples) */
  inkKey: string | null;
  variety: number;
  /** kept when rolling a new hand */
  locks: Set<LockKey>;
  /** keep the paper, pen and ink (all three) when rolling a new hand, or not */
  onKeepLook: (keep: boolean) => void;
  busy: { download: boolean; font: boolean };
  onNewHand: () => void;
  onSimilarHand: () => void;
  onSeed: (seed: string) => void;
  onStyle: (style: string) => void;
  onControl: (key: string, v: number) => void;
  onResetControl: (key: string) => void;
  onResetOffsets: () => void;
  onPen: (pen: string) => void;
  onPenSize: (size: NoteState['penSize']) => void;
  onInk: (id: string) => void;
  onPaper: (id: PaperId) => void;
  onSize: (v: number) => void;
  onOccasion: (id: string | null) => void;
  onAmount: (v: number) => void;
  /** the writer signs below the last line (or stops signing) */
  onSign: () => void;
  onVariety: (v: number) => void;
  onShare: () => void;
  onDownload: () => void;
  onExportFont: () => void;
  /** a text field in the panel took focus (the phone sheet opens fully, above the keyboard) */
  onFieldFocus?: () => void;
  /** what's on the page: a found letter, or the writer's own (with kept drafts) */
  letter?: {
    found: boolean;
    own: boolean;
    drafts: number;
    onAnother: () => void;
    onBackToMine: () => void;
  };
  /** Ink mode (when the engine writes in ink): used by the writing menu and the pen tray, not the panel */
  ink?: {
    on: boolean;
    /** anything written in ink yet */
    letter: boolean;
    onMode: (mode: 'ink' | 'pencil' | 'fair') => void;
    onFairCopy: () => void;
    onFreshSheet: () => void;
  };
}

/** The desktop panel: the writer and New hand, then the look, then More. */
export function Panel(props: PanelProps) {
  return (
    <div className="flex min-h-full flex-col">
      <WriterHeader {...props} />
      <LookControls {...props} />
      <MoreControls {...props} />
    </div>
  );
}

// ---------- always there: the writer, New hand, share, what's on the page ----------
function WriterHeader(props: PanelProps) {
  const { onNewHand } = props;
  return (
    <section aria-label="Writer" className="px-5 pt-4 pb-4">
      <AboutHand {...props}>
        <button type="button" className="group -mx-1.5 block w-[calc(100%+12px)] rounded-lg px-1.5 pt-1 pb-1.5 text-left transition-colors duration-150 hover-device:hover:bg-[#f3f0e9] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring">
          <span key={props.state.seed + props.state.style} className="hand-in block" style={{ color: inkColor(props.state.ink) }}>
            <Signature p={props.p} name={props.name} ink="currentColor" emPx={34} className="-ml-1 h-[54px] overflow-visible" />
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[16px] leading-tight font-medium tracking-[-0.012em]">
            {props.name}
            <ChevronDown aria-hidden className="size-3.5 text-faint transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </span>
        </button>
      </AboutHand>
      <div className="mt-3 flex gap-2">
        <Button size="lg" className="flex-1 justify-between pr-3 pl-3.5" onClick={onNewHand}>
          <span className="flex items-center gap-2">
            <Shuffle aria-hidden /> New hand
          </span>
          <kbd className="hidden rounded-[5px] border border-white/15 px-1.5 py-px font-sans text-[11px] leading-4 text-white/70 pointer-fine:inline-block">R</kbd>
        </Button>
        <ShareMenu {...props} size="lg" />
      </div>
      <LetterStatus {...props} className="mt-2.5" />
    </section>
  );
}

/** The writer, in their own hand, and where everything on the page comes from. Opens from the writer's name. */
export function AboutHand({ children, ...props }: PanelProps & { children: React.ReactNode }) {
  const { p, name, state } = props;
  const sources = handSources(p);
  const letter = state.sample ? sampleById(state.sample) : undefined;
  const dt = 'text-[11.5px] text-muted-foreground';
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[min(320px,calc(100vw-24px))] origin-(--radix-popover-content-transform-origin) rounded-2xl border border-border bg-[#fdfcf9] p-4 shadow-[0_1px_2px_rgba(60,45,20,0.08),0_16px_40px_-12px_rgba(40,30,10,0.35)] outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:data-[state=open]:zoom-in-100 motion-reduce:data-[state=closed]:zoom-out-100"
        >
          <div style={{ color: inkColor(state.ink) }}>
            <Signature p={p} name={name} ink="currentColor" emPx={30} className="-ml-1 h-[46px] overflow-visible" />
          </div>
          <div className="mt-1 text-[15px] leading-tight font-medium">{name}</div>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{describeHand(p)}</p>
          <dl className="mt-3.5 grid gap-2.5 border-t border-border pt-3 text-[12.5px] leading-snug">
            <div>
              <dt className={dt}>Learned to write</dt>
              <dd>{learnedFrom(state.style)}</dd>
            </div>
            {letter && (
              <div>
                <dt className={dt}>This letter</dt>
                <dd>
                  {letter.author}, {letter.year}{letter.title ? `. ${letter.title}` : ''}
                  {letter.translator && <>, translated by {letter.translator.name}</>}. Public domain.
                  {letter.source?.url && (
                    <> <a href={letter.source.url} target="_blank" rel="noreferrer" className="underline decoration-[#cfc8b9] underline-offset-2 hover-device:hover:text-foreground">Source</a></>
                  )}
                </dd>
              </div>
            )}
            {sources.length > 0 && (
              <div>
                <dt className={dt}>Letter shapes</dt>
                <dd className="grid gap-1">
                  {sources.map((s) => (
                    <span key={s.name}>
                      {branded(s.name)}. <span className="text-muted-foreground">{readerCredit(s.credit)}</span>
                      {s.url && <> <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-[#cfc8b9] underline-offset-2 hover-device:hover:text-foreground">Source</a></>}
                    </span>
                  ))}
                </dd>
              </div>
            )}
            <div>
              <dt className={dt}>Seed</dt>
              <dd className="tabular">{state.seed}</dd>
            </div>
          </dl>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Share: copy a link, save the image; the font file is a quieter extra. One icon wherever it sits. */
export function ShareMenu({ busy, onShare, onDownload, onExportFont, size }: PanelProps & { size?: 'lg' }) {
  const working = busy.download || busy.font;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="secondary" size="icon" aria-label="Share" className={cn('size-11', size === 'lg' && 'size-11')}>
          {working ? <Loader2 className="animate-spin" aria-hidden /> : <Share aria-hidden />}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[236px] origin-(--radix-dropdown-menu-content-transform-origin) rounded-2xl border border-border bg-[color-mix(in_oklab,#fdfcf9_96%,transparent)] p-1.5 shadow-[0_1px_2px_rgba(60,45,20,0.08),0_16px_40px_-12px_rgba(40,30,10,0.35)] backdrop-blur-md data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:data-[state=open]:zoom-in-100 motion-reduce:data-[state=closed]:zoom-out-100"
        >
          <MenuItem onSelect={onShare} icon={<Link aria-hidden />}>Copy link</MenuItem>
          <MenuItem onSelect={onDownload} icon={busy.download ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />} disabled={busy.download}>
            Download image
          </MenuItem>
          <DropdownMenu.Separator className="mx-2 my-1 h-px bg-border" />
          <DropdownMenu.Label className="px-3 pt-1 pb-0.5 text-[11.5px] text-muted-foreground">More formats</DropdownMenu.Label>
          <MenuItem onSelect={onExportFont} icon={busy.font ? <Loader2 className="animate-spin" aria-hidden /> : <CaseSensitive aria-hidden />} disabled={busy.font} quiet>
            Font file (.otf)
          </MenuItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuItem({ children, icon, onSelect, disabled, quiet }: { children: React.ReactNode; icon: React.ReactNode; onSelect: () => void; disabled?: boolean; quiet?: boolean }) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex h-11 cursor-default items-center justify-between gap-3 rounded-[10px] px-3 text-foreground outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent [&_svg]:size-[17px] [&_svg]:text-muted-foreground',
        quiet ? 'text-[13px]' : 'text-[14px]',
      )}
    >
      {children}
      {icon}
    </DropdownMenu.Item>
  );
}

/**
 * Which letter is on the page, and a way to the other kind: "A found letter · Another letter" (and "Back to my
 * letter" when one is kept), or "Your letter · Read a found letter" (yours is kept on this device).
 */
export function LetterStatus({ letter, className, compact }: PanelProps & { className?: string; compact?: boolean }) {
  if (!letter) return null;
  const link = 'shrink-0 rounded-md px-1 py-0.5 font-medium text-foreground underline decoration-[#cfc8b9] underline-offset-[3px] transition-[text-decoration-color] duration-150 hover-device:hover:decoration-foreground pointer-coarse:py-2.5';
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-muted-foreground', className)}>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className={cn('size-1.5 rounded-full', letter.found ? 'bg-[#b89a62]' : 'bg-[var(--ink)]')} />
        {letter.found ? 'A found letter' : letter.own ? 'Your letter' : 'A blank page'}
      </span>
      {!compact && letter.own && <span className="text-faint">kept as you change hands</span>}
      <span className="ml-auto flex items-center gap-1">
        {letter.found && letter.drafts > 0 && (
          <button type="button" onClick={letter.onBackToMine} className={link}>Back to my letter</button>
        )}
        <button type="button" onClick={letter.onAnother} className={link}>
          {letter.found ? 'Another letter' : 'Read a found letter'}
        </button>
      </span>
    </div>
  );
}

// ---------- the look: paper, pen, ink, handwriting, how they write ----------
/** What people change first, in that order. Papers sit in one sideways row, like pens. */
export function LookControls(props: PanelProps & { rows?: boolean; flush?: boolean }) {
  const { state, flush } = props;
  const ink = inkColor(state.ink);
  const pad = flush ? '' : 'px-5';
  return (
    <>
      <Group label="Paper" value={getPaper(state.paper).name} className={pad} first>
        <PaperPicker value={getPaper(state.paper).family} onChange={props.onPaper} rows />
      </Group>
      {PENS_SHOWN && (
        <Group
          label="Pen"
          value={penName(state.pen)}
          className={pad}
          aside={<TipChoice value={state.penSize} ink={ink} onChange={props.onPenSize} />}
        >
          {!PENS_LIVE && <Soon />}
          <PenSwatches seed={state.seed} style={state.style} pen={state.pen} penSize={state.penSize} ink={ink} inkKey={props.inkKey} onPen={props.onPen} />
        </Group>
      )}
      <Group label="Ink" value={inkName(state.ink)} className={pad}>
        <InkPicker value={state.ink} pen={state.pen} onChange={props.onInk} />
      </Group>
      <Group
        label="Handwriting"
        className={pad}
        aside={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={props.onSimilarHand} className="-mr-2 text-muted-foreground">
                <Users aria-hidden /> Similar
              </Button>
            </TooltipTrigger>
            <TooltipContent>A sibling of this hand (Shift R)</TooltipContent>
          </Tooltip>
        }
      >
        <StylePicker seed={state.seed} style={state.style} ink={ink} onStyle={props.onStyle} />
      </Group>
      <Group label="How they write" className={pad}>
        <div className="grid gap-3.5">
          {topSliders(props).map((c) => <ControlRow key={c.key} c={c} {...props} ends={TOP_ENDS[c.key] ?? c.ends} />)}
          <SliderRow label="Size" value={state.size} min={SIZE_RANGE.min} max={SIZE_RANGE.max} step={SIZE_RANGE.step} describe={words.size} onChange={props.onSize} mark={1} onReset={() => props.onSize(1)} ends={['Small', 'Large']} />
        </div>
      </Group>
    </>
  );
}

/** the two sliders people understand at a glance (with Size, the three in How they write) */
const TOP = ['neatness', 'hurry', 'slant'];
const TOP_ENDS: Record<string, [string, string]> = { neatness: ['Messy', 'Neat'], hurry: ['Calm', 'Rushed'], slant: ['Leans back', 'Leans forward'] };
function shownSliders(props: PanelProps) {
  const connected = !!getStyle(props.state.style)?.connected;
  return CONTROLS.filter((c) => c.tier === 'primary' && isShown(c, props.natural, { connected }));
}
function topSliders(props: PanelProps) {
  const shown = shownSliders(props);
  return TOP.map((k) => shown.find((c) => c.key === k)).filter((c): c is SliderControl => !!c).slice(0, 2);
}

/** Where the hand learned to write, in words: "Everyday joined, modern" or "German school (joined), Germany · 1915–1941". */
function learnedFrom(style: string) {
  const [fam] = styleName(style).split(':');
  const card = styleCard(style);
  if (card.title === 'Everyday') return `Everyday ${fam.toLowerCase()}, ${card.sub.toLowerCase()}`;
  return `${card.title} (${fam.toLowerCase()})${card.sub ? `, ${card.sub}` : ''}`;
}

/** A source credit for readers: the product's name, and the engine's notes to its own docs ("(hand-traditions.md §4)") stay out. */
function readerCredit(credit: string) {
  return branded(credit).replace(/\s*\([^)]*\.md[^)]*\)/g, '');
}

/** One group of controls: a plain label (and what's chosen), an optional small extra on the right. */
function Group({ label, value, aside, children, className, first }: { label: string; value?: string; aside?: React.ReactNode; children: React.ReactNode; className?: string; first?: boolean }) {
  const id = useId();
  return (
    <section data-row aria-labelledby={id} className={cn('grid grid-cols-[minmax(0,1fr)] gap-2 py-3.5', !first && 'border-t border-border/70', className)}>
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h3 id={id} className="flex min-w-0 items-baseline gap-2 text-[13px] font-medium">
          {label}
          {value && <span className="truncate font-normal text-muted-foreground">{value}</span>}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ---------- More: everything else, folded away ----------
export function MoreControls(props: PanelProps & { flush?: boolean }) {
  const { state, flush } = props;
  const connected = !!getStyle(state.style)?.connected;
  const [open, setOpen] = useState(() => readOpen());
  const id = useId();
  const top = new Set(topSliders(props).map((c) => c.key));
  const rest = shownSliders(props).filter((c) => !top.has(c.key));
  const groups = ADVANCED_GROUPS.map((g) => ({
    g,
    items: CONTROLS.filter((c) => c.tier === 'advanced' && c.group === g && isShown(c, props.natural, { connected })),
  }));
  const changed = Object.values(state.offsets).some((v) => v) || state.penSize !== 'medium';
  const kept = props.locks.size === 3;
  const pad = flush ? '' : 'px-5';
  return (
    <section data-row className={cn('border-t border-border/70', !flush && 'mb-4')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => { writeOpen(!o); return !o; })}
        className={cn(
          'flex w-full items-center justify-between py-4 text-[13px] font-medium transition-colors duration-150 hover-device:hover:bg-[#f3f0e9] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring pointer-coarse:py-3.5',
          flush ? 'rounded-lg' : 'px-5',
        )}
      >
        <span className="flex items-baseline gap-2">
          More
          <span className="font-normal text-muted-foreground">Pressure, slant, occasion, seed…</span>
        </span>
        <ChevronDown aria-hidden className={cn('size-4 text-muted-foreground transition-transform duration-200 ease-out', open && 'rotate-180')} />
      </button>
      <div id={id} className={cn('grid transition-[grid-template-rows] duration-300 ease-[var(--ease-drawer)] motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden" inert={!open}>
          <div className={cn('grid gap-6 pt-1 pb-6', pad)}>
            <div className="grid gap-3.5">
              {rest.map((c) => <ControlRow key={c.key} c={c} {...props} />)}
            </div>
            <div className="grid gap-3">
              <OccasionRow {...props} />
              <Switch
                label="Keep my paper, pen and ink"
                hint="New hand changes only the writer"
                checked={kept}
                onChange={props.onKeepLook}
              />
            </div>
            {groups.map(({ g, items }) => (
              <div key={g} className="grid gap-3.5">
                <div data-row className="text-[12.5px] text-muted-foreground">{g}</div>
                {items.map((c) => <ControlRow key={c.key} c={c} {...props} />)}
                {g === 'Letters and variety' && (
                  <SliderRow
                    label="Variety"
                    value={props.variety}
                    min={0}
                    max={100}
                    step={1}
                    describe={(v) => (v <= 20 ? 'Siblings' : v <= 70 ? 'Strangers' : 'Wild')}
                    onChange={props.onVariety}
                    mark={60}
                    onReset={() => props.onVariety(60)}
                    hint="How far New hand jumps"
                  />
                )}
              </div>
            ))}
            <div className="grid gap-2">
              <SeedField seed={state.seed} onCommit={props.onSeed} onFocus={props.onFieldFocus} />
              {changed && (
                <button
                  type="button"
                  onClick={props.onResetOffsets}
                  className="justify-self-start text-[12.5px] text-muted-foreground underline-offset-4 transition-colors duration-150 hover-device:hover:text-foreground hover-device:hover:underline pointer-coarse:py-3"
                >
                  Back to {props.name.split(' ')[0]}’s natural hand
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
function readOpen() {
  try { return localStorage.getItem('seedhand:advanced') === '1'; } catch { return false; }
}
function writeOpen(v: boolean) {
  try { localStorage.setItem('seedhand:advanced', v ? '1' : '0'); } catch { /* fine */ }
}

/** An on/off switch with a plain label. */
function Switch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div data-row className="flex items-center justify-between gap-3">
      <span className="grid">
        <span id={id} className="text-[13px] font-medium">{label}</span>
        {hint && <span className="text-[12px] text-muted-foreground">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring after:absolute after:-inset-2 after:content-['']",
          checked ? 'bg-[var(--ink)]' : 'bg-[#dcd6ca]',
        )}
      >
        <span
          aria-hidden
          className={cn('absolute top-[3px] left-[3px] size-5 rounded-full bg-[#fffefb] shadow-[0_1px_2px_rgba(30,24,12,0.25)] transition-transform duration-200 ease-[var(--ease-drawer)]', checked && 'translate-x-[18px]')}
        />
      </button>
    </div>
  );
}

function SeedField({ seed, onCommit, onFocus }: { seed: string; onCommit: (s: string) => void; onFocus?: () => void }) {
  const [v, setV] = useState(seed);
  const id = useId();
  useEffect(() => setV(seed), [seed]);
  const commit = () => {
    const s = v.trim().toLowerCase().replace(/\s+/g, '-');
    if (s && s !== seed) onCommit(s);
    else setV(seed);
  };
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
      <label htmlFor={id} className="shrink-0">
        Seed
      </label>
      <input
        id={id}
        name="seed"
        value={v}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        enterKeyHint="done"
        onChange={(e) => setV(e.target.value)}
        onFocus={onFocus}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setV(seed); (e.target as HTMLInputElement).blur(); }
        }}
        className="tabular min-w-0 flex-1 rounded-md border border-border bg-[#fdfcf9] px-2 py-1.5 text-[13px] text-foreground transition-[border-color,background-color] duration-150 focus:border-input focus:bg-[#fffefb] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring pointer-coarse:px-2.5 pointer-coarse:py-2.5 pointer-coarse:text-[16px]"
      />
    </div>
  );
}

function ControlRow({ c, natural, state, emMm, onControl, onResetControl, ends }: { c: SliderControl; ends?: [string, string] } & PanelProps) {
  const value = controlValue(c.key, natural, state);
  let mark = naturalValue(c, natural);
  if (c.key === 'penWidth' && !ENGINE_TIPS) mark *= penSizeFactor(state.penSize);
  const describe = c.key === 'penWidth' ? (v: number) => `${((v / UPM) * emMm).toFixed(2)} mm` : c.describe;
  return (
    <SliderRow
      label={c.label}
      value={value}
      min={c.min}
      max={c.max}
      step={c.step}
      describe={describe}
      onChange={(v) => onControl(c.key, v)}
      mark={mark}
      onReset={() => onResetControl(c.key)}
      soon={!isLive(c, natural)}
      ends={ends}
    />
  );
}

function OccasionRow({ state, onOccasion, onAmount }: PanelProps) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <div data-row className="flex min-h-8 items-center justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium">
          Occasion
        </label>
        <div className="relative">
          <select
            id={id}
            value={state.occasion ?? ''}
            onChange={(e) => onOccasion(e.target.value || null)}
            className="h-8 cursor-pointer appearance-none rounded-md border border-border bg-[#fdfcf9] py-0 pr-7 pl-2.5 text-[13px] text-foreground shadow-[0_1px_1px_rgba(60,45,20,0.04)] transition-colors duration-150 hover-device:hover:bg-[#f4f1ea] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:h-11 pointer-coarse:text-[16px]"
          >
            <option value="">Everyday</option>
            {OCCASIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>
      {state.occasion && (
        <SliderRow
          label="Amount"
          value={state.amount}
          min={AMOUNT_RANGE.min}
          max={AMOUNT_RANGE.max}
          step={AMOUNT_RANGE.step}
          describe={(v) => `${Math.round(v * 100)}%`}
          onChange={onAmount}
          mark={1}
          onReset={() => onAmount(1)}
        />
      )}
    </div>
  );
}

// ---------- building blocks ----------
function Soon() {
  return (
    <span className="rounded-full bg-[#ebe6dc] px-1.5 py-px text-[11px] leading-4 text-muted-foreground" title="Wired up, waiting for the engine">
      soon
    </span>
  );
}

const SliderRow = memo(function SliderRow({
  label, value, min, max, step, describe, onChange, mark, onReset, soon, hint, ends,
}: {
  label: string; value: number; min: number; max: number; step: number; describe: (v: number) => string;
  onChange: (v: number) => void; mark?: number; onReset?: () => void; soon?: boolean; hint?: string;
  /** what each end does, in plain words ("Messy", "Neat"), under the track */
  ends?: [string, string];
}) {
  const id = useId();
  const word = describe(value);
  return (
    <div data-row className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span id={id} className="flex items-center gap-1.5 text-[13px] font-medium">
          {label}
          {soon && <Soon />}
        </span>
        <span className="tabular text-[13px] text-muted-foreground" aria-hidden>
          {word}
        </span>
      </div>
      <Slider
        aria-labelledby={id}
        aria-valuetext={word}
        aria-description={hint}
        value={[Math.min(max, Math.max(min, value))]}
        min={min}
        max={max}
        step={step}
        mark={mark}
        onReset={onReset}
        onValueChange={(v) => onChange(v[0])}
      />
      {ends && (
        <span aria-hidden className="-mt-1 flex justify-between text-[11.5px] text-faint pointer-coarse:-mt-2">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </span>
      )}
      {hint && <span className="-mt-0.5 text-[12px] text-muted-foreground">{hint}</span>}
    </div>
  );
});

// paper swatches show a magnified corner of each sheet, where its character is
const SWATCH = { w: 40, h: 30 };
const swatchCrop = (paper: PaperSpec) => ({ ...paper.swatch, ...SWATCH });

/** Papers as a grid (desktop panel) or one row that scrolls sideways (phone sheet). */
const PaperPicker = memo(function PaperPicker({ value, onChange, rows }: { value: PaperId; onChange: (id: PaperId) => void; rows?: boolean }) {
  return (
    <Segmented
      type="single"
      aria-label="Paper"
      value={value}
      onValueChange={(v) => v && onChange(v as PaperId)}
      className={cn(
        'mt-1.5 bg-transparent p-0',
        rows
          ? 'sheet-row -mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          : 'grid grid-flow-row grid-cols-3 gap-2',
      )}
    >
      {PAPERS.map((paper) => (
        <Tooltip key={paper.id}>
          <TooltipTrigger asChild>
            <SegmentedItem
              value={paper.id}
              aria-label={`${paper.name}: ${paper.hint}`}
              className={cn(
                'group h-auto flex-col items-stretch gap-1.5 rounded-lg p-1 pb-1.5 text-[12px] data-[state=on]:bg-[#fffefb] pointer-coarse:h-auto',
                rows && 'w-[86px] shrink-0 snap-start bg-secondary',
              )}
            >
              <span className="relative block overflow-hidden rounded-[5px] shadow-[0_0_0_0.5px_rgba(60,45,20,0.16),0_1px_2px_rgba(60,45,20,0.08)] transition-shadow duration-150 group-data-[state=on]:shadow-[0_0_0_1.5px_var(--ink),0_1px_2px_rgba(60,45,20,0.08)]">
                <PaperCanvas paper={paper} pxPerMm={2.1} crop={swatchCrop(paper)} className="h-auto! w-full!" />
              </span>
              <span className="truncate px-0.5 text-center leading-tight">{paper.name}</span>
            </SegmentedItem>
          </TooltipTrigger>
          <TooltipContent side="bottom">{paper.hint}</TooltipContent>
        </Tooltip>
      ))}
      {rows && <span aria-hidden className="w-3 shrink-0" />}
    </Segmented>
  );
});

/** Ink families: each swatch is a small dab showing how the ink pools, not one flat colour. */
const InkPicker = memo(function InkPicker({ value, pen, onChange }: { value: string; pen: string; onChange: (id: string) => void }) {
  const families = INK_FAMILIES.filter((f) => !f.pen || f.pen === pen);
  const options = MODELLED_INK ? [{ id: AUTO_INK, name: 'The pen’s own', color: '' }, ...families] : families;
  // balanced rows: as few rows as fit, then the same number of swatches in each
  const coarse = useMediaQuery('(pointer: coarse)');
  const max = coarse ? 7 : 9;
  const cols = Math.ceil(options.length / Math.ceil(options.length / max));
  return (
    <Segmented
      type="single"
      aria-label="Ink"
      value={value}
      onValueChange={(v) => v && onChange(v)}
      className="mt-1.5 grid justify-items-center gap-0.5 bg-transparent p-0"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoFlow: 'row' }}
    >
      {options.map((ink) => (
        <Tooltip key={ink.id}>
          <TooltipTrigger asChild>
            <SegmentedItem
              value={ink.id}
              aria-label={ink.name}
              className="size-8 rounded-full p-0 data-[state=on]:bg-transparent data-[state=on]:shadow-none pointer-coarse:size-11"
            >
              <span
                className="block size-[22px] rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)] ring-offset-2 ring-offset-panel transition-[box-shadow] duration-150 [[data-state=on]>&]:ring-[1.5px] [[data-state=on]>&]:ring-[var(--ink)]"
                style={{
                  background: ink.color
                    ? `radial-gradient(circle at 40% 36%, color-mix(in oklab, ${ink.color} 84%, white) 0 22%, transparent 62%), radial-gradient(circle at 66% 70%, color-mix(in oklab, ${ink.color} 86%, black) 0 26%, transparent 64%), ${ink.color}`
                    : 'conic-gradient(from 200deg, #263084, #233250, #26262e, #624228, #263084)',
                }}
              />
            </SegmentedItem>
          </TooltipTrigger>
          <TooltipContent>{ink.name}</TooltipContent>
        </Tooltip>
      ))}
    </Segmented>
  );
});

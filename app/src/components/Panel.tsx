// The controls, in the order people reach for them (the panel on desktop, the sheet on phones):
//   always there   the writer (tap for "About this hand"), New hand, share, and what's on the page
//   the look       Paper, Pen, Ink, Handwriting, How they write (three sliders)
//   More           everything else, folded away: the other sliders, occasion, signature, seed, keep-when-rolling
// Writing modes (Ink / Pencil / Fair copy) live with the writing, under the sheet and in the pen tray.
import { memo, useDeferredValue, useEffect, useId, useRef, useState } from 'react';
import { CaseSensitive, ChevronDown, Download, Film, ImagePlay, Link, Loader2, Share, Shuffle, Users } from 'lucide-react';
import { getStyle, UPM, type Hand } from '@engine';
import { Button } from '@/components/ui/button';
import { Segmented, SegmentedChip, SegmentedItem } from '@/components/ui/toggle-group';
import { Switch } from '@/components/ui/switch';
import { SliderRow, Soon } from '@/components/ui/slider-row';
import { Group, MoreButton } from '@/components/ui/group';
import { ActionSheet, Sheet, type SheetEntry } from '@/components/ui/sheet';
import { inputField } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PenSwatches, TipChoice } from '@/components/PenPicker';
import { Signature } from '@/components/Signature';
import { StylePicker } from '@/components/StylePicker';
import { ADVANCED_GROUPS, CONTROLS, isLive, isShown, naturalValue, penSizeFactor, type SliderControl } from '@/lib/controls';
import { ENGINE_TIPS, MODELLED_INK } from '@/lib/engine-features';
import { describeHand, words } from '@/lib/hands';
import { handSources } from '@/lib/credits';
import { sampleById } from '@/lib/samples';
import type { Draft } from '@/lib/drafts';
import { branded } from '@/lib/brand';
import { styleCard, styleName } from '@/lib/styles';
import { AUTO_INK, INK_FAMILIES, inkColor, inkName } from '@/lib/inks';
import { OCCASIONS } from '@/lib/occasions';
import { getPaper, PAPERS, variantsOf, type PaperId } from '@/lib/papers';
import { FONT_PACKAGE } from '@/lib/actions';
import { PENS_LIVE, PENS_SHOWN, penName } from '@/lib/pens';
import { controlValue } from '@/lib/params';
import { isNeat, type LockKey } from '@/lib/roll';
import { AMOUNT_RANGE, SIZE_RANGE, type NoteState } from '@/lib/state';
import { cn, keepChosenInView } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { LOOK } from '@/lib/look';
import { FindRow } from '@/themes/postmarked/tool';

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
  /** controls research #5: keep one of paper, pen or ink through Find another */
  onLock?: (key: LockKey, on: boolean) => void;
  busy: { download: boolean; font: boolean; video: boolean };
  /** the letter writing itself out, as a video or a GIF (null until the browser's been asked what it can make) */
  onExportVideo: (kind: 'video' | 'gif') => void;
  exportable: { video: boolean; gif: boolean } | null;
  /** the share menu opened: a moment to ask the browser */
  onShareOpen: () => void;
  onNewHand: () => void;
  /** the same letter in another writer's hand (stationery kept) */
  onChangeWriter: () => void;
  /** after a choice in a popover (Change writer): back to the letter if it was in use; true when it took the focus */
  resumeWriting?: () => boolean;
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
  /** New hand skips the hard-to-read writers */
  onNeatOnly: (v: boolean) => void;
  /** the hand on the page is easy to read */
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
    /** the kept letters, newest first */
    kept: Draft[];
    /** one of them was written in this tab */
    mine: boolean;
    onAnother: () => void;
    /** this tab's newest, or the one put down at `savedAt` */
    onBackToMine: (savedAt?: number) => void;
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
/** The panel, skipped when nothing it shows changed (App passes stable props: hooks/useStableProps). */
export const Panel = memo(function Panel(props: PanelProps) {
  return (
    <div className="flex min-h-full flex-col">
      <WriterHeader {...props} />
      <LookControls {...props} />
      <MoreControls {...props} />
    </div>
  );
});

// ---------- always there: the writer, New hand, share, what's on the page ----------
function WriterHeader(props: PanelProps) {
  const { onNewHand } = props;
  // desktop: the writer's name in their own hand grounds the panel; the name in type, with what's known about
  // the hand, sits on the letter's corner
  return (
    // a hairline under it, like the panel's other groups, instead of a wide gap
    <section aria-label="Writer" className="border-b border-border/70 px-5 pt-4 pb-4">
      <div className="flex items-start gap-2">
        <span key={props.state.seed + props.state.style} aria-label={props.name} role="img" className="hand-in block min-w-0 flex-1" style={{ color: inkColor(props.state.ink) }}>
          <Signature p={props.p} name={props.name} ink="currentColor" emPx={34} className="-ml-1 h-[54px] overflow-visible" />
        </span>
        <ShareMenu {...props} size="lg" />
      </div>
      {/* look C (?look=postmarked): Find another is a round stamp */}
      {LOOK === 'postmarked' ? <FindRow {...props} /> : (
      <Button size="lg" className="mt-2 w-full justify-between pr-3 pl-3.5" onClick={onNewHand} aria-keyshortcuts="R">
        <span className="flex items-center gap-2">
          <Shuffle aria-hidden /> Find another
        </span>
        <kbd aria-hidden className="hidden rounded-[5px] border border-white/15 px-1.5 py-px font-sans text-[0.6875rem] leading-4 text-white/70 pointer-fine:inline-block">R</kbd>
      </Button>
      )}
      {props.letter && !props.letter.found && <LetterStatus {...props} className="mt-2.5 justify-center" />}
    </section>
  );
}

/** The writer, in their own hand, and where everything on the page comes from. Opens from the writer's name. */
export function AboutHand({ children, ...props }: PanelProps & { children: React.ReactNode }) {
  const { p, name, state } = props;
  const sources = handSources(p);
  const letter = state.sample ? sampleById(state.sample) : undefined;
  const dt = 'text-[0.7188rem] text-muted-foreground';
  const changed = useRef(false);
  // on the overlay system (ui/sheet.tsx): a popover from the name on desktop, a bottom sheet on phones
  return (
    <Sheet
      title={`About ${name}’s hand`}
      showTitle={false}
      trigger={children as React.ReactElement}
      align="start"
      className="w-[min(320px,calc(100vw-24px))] bg-[var(--field)]"
      onCloseAutoFocus={(e) => {
        if (changed.current && props.resumeWriting?.()) e.preventDefault();
        changed.current = false;
      }}
    >
      {(close) => (
        // a swipe or press on it never reaches the control sheet it opened from (React events bubble through the portal)
        <div onPointerDown={(e) => e.stopPropagation()} onPointerMove={(e) => e.stopPropagation()}>
          <div style={{ color: inkColor(state.ink) }}>
            <Signature p={p} name={name} ink="currentColor" emPx={30} className="-ml-1 h-[46px] overflow-visible" />
          </div>
          <div className="mt-1 text-[0.9375rem] leading-tight font-medium">{name}</div>
          <p className="mt-0.5 text-[0.7812rem] leading-snug text-muted-foreground">{describeHand(p)}</p>
          <Button variant="secondary" onClick={() => { changed.current = true; props.onChangeWriter(); close(); }} className="mt-3 w-full active:scale-[0.97]">
            <Shuffle aria-hidden /> Change writer
          </Button>
          <dl className="mt-3.5 grid gap-2.5 border-t border-border pt-3 text-[0.7812rem] leading-snug">
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
                    <> <a href={letter.source.url} target="_blank" rel="noreferrer" className="underline decoration-[var(--rule-link)] underline-offset-2 hover-device:hover:decoration-current active:decoration-current">Source</a></>
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
                      {sourceLine(s.name, readerCredit(s.credit))}
                      {s.url && <> <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-[var(--rule-link)] underline-offset-2 hover-device:hover:decoration-current active:decoration-current">Source</a></>}
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
        </div>
      )}
    </Sheet>
  );
}

/** Share: copy a link, save the image; the font file is a quieter extra. One icon wherever it sits. */
export function ShareMenu({ busy, onShare, onDownload, onExportFont, onExportVideo, exportable, onShareOpen, size }: PanelProps & { size?: 'lg' | 'chip' }) {
  const working = busy.download || busy.font || busy.video;
  // each row shows what it's doing: a spinner while it's made, a tick for a moment once it's saved
  const done = useJustDone(busy);
  const status = (k: keyof typeof busy) => (busy[k] ? 'busy' as const : done[k] ? 'done' as const : null);
  const entries: SheetEntry[] = [
    { id: 'link', label: 'Copy link', icon: <Link />, onSelect: onShare },
    { id: 'image', label: 'Download image', icon: <Download />, status: status('download'), hint: busy.download ? 'Preparing…' : undefined, onSelect: onDownload },
    // the letter writing itself out: made in a few seconds, saved when it's done
    { id: 'video', label: 'Download video', icon: <Film />, status: busy.video ? 'busy' : done.video ? 'done' : null, hint: busy.video ? 'Being made…' : undefined, disabled: exportable?.video === false, onSelect: () => onExportVideo('video') },
    { kind: 'separator', id: 's1' },
    { kind: 'label', id: 'more', label: 'More formats' },
    { id: 'gif', label: 'Animated GIF', icon: <ImagePlay />, quiet: true, disabled: busy.video || exportable?.gif === false, onSelect: () => onExportVideo('gif') },
    {
      id: 'font',
      label: FONT_PACKAGE ? 'Download font' : 'Font file (.otf)',
      icon: <CaseSensitive />,
      quiet: true,
      status: status('font'),
      hint: busy.font ? 'Being made…' : FONT_PACKAGE ? 'Install it on your computer. It keeps four or five versions of each letter; the page never repeats.' : undefined,
      onSelect: onExportFont,
    },
  ];
  return (
    <ActionSheet
      title="Share this letter"
      entries={entries}
      onOpenChange={(o) => o && onShareOpen()}
      trigger={
        <Button
          variant="secondary"
          size="icon"
          aria-label="Share"
          data-chip={size === 'chip' ? '' : undefined}
          className={cn(
            'size-11',
            // the phone header's small chip: drawn 32 px, still a 44 px target
            // (a lighter fill, a hairline and a soft shadow, so it reads as a button on the warm desk)
            size === 'chip' && "relative size-[32px] rounded-[9px] border border-[color-mix(in_oklab,var(--foreground)_14%,transparent)] bg-panel shadow-[0_1px_2px_rgba(60,45,20,0.10)] text-foreground/85 after:absolute after:-inset-1.5 after:content-[''] pointer-coarse:size-[32px] [&_svg]:size-[16px]",
          )}
        >
          {working ? <Loader2 className="animate-spin" aria-hidden /> : <Share aria-hidden />}
        </Button>
      }
    />
  );
}

/** Which of the busy jobs finished in the last couple of seconds (for a tick on its row). */
function useJustDone(busy: PanelProps['busy']) {
  const prev = useRef(busy);
  const [done, setDone] = useState<Partial<Record<keyof PanelProps['busy'], boolean>>>({});
  useEffect(() => {
    const was = prev.current;
    prev.current = busy;
    const finished = (Object.keys(busy) as (keyof PanelProps['busy'])[]).filter((k) => was[k] && !busy[k]);
    if (!finished.length) return;
    setDone((d) => ({ ...d, ...Object.fromEntries(finished.map((k) => [k, true])) }));
    const t = window.setTimeout(() => setDone((d) => ({ ...d, ...Object.fromEntries(finished.map((k) => [k, false])) })), 2200);
    return () => window.clearTimeout(t);
  }, [busy]);
  return done;
}

/**
 * The ways to the other letters: "Back to my letter" (when one is kept) on a found letter, "Read a found letter" on
 * your own. (Find another brings the next found letter.)
 */
export function LetterStatus({ letter, className }: PanelProps & { className?: string; compact?: boolean }) {
  if (!letter) return null;
  const link = 'shrink-0 rounded-md px-1 py-0.5 font-medium text-foreground underline decoration-[var(--rule-link)] underline-offset-[3px] transition-[text-decoration-color] duration-150 hover-device:hover:decoration-foreground pointer-coarse:py-2.5';
  return (
    // what the letter is lives on the sheet now (its label); here, only the ways to the others
    <div className={cn('flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.7812rem] text-muted-foreground', className)}>
      <span className="flex items-center gap-1">
        {/* your kept letters live in the header (My letters); on a found letter, Find another brings the next one */}
        {!letter.found && <button type="button" onClick={letter.onAnother} className={link}>Read a found letter</button>}
      </span>
    </div>
  );
}

/**
 * "Find a neater hand", when the hand on the page isn't neat (it came before the switch, or from a link). Whether it is
 * takes a layout (tens of ms on a slow phone), so it's worked out just after a new hand shows (a deferred render).
 */
function NeatNudge({ p, onNewHand }: { p: Hand; onNewHand: () => void }) {
  const hand = useDeferredValue(p);
  if (isNeat(hand)) return null;
  return (
    <button
      type="button"
      onClick={onNewHand}
      className="justify-self-start rounded-md px-1 py-0.5 text-[0.7812rem] font-medium text-foreground underline decoration-[var(--rule-link)] underline-offset-[3px] transition-[text-decoration-color] duration-150 hover-device:hover:decoration-foreground pointer-coarse:py-2.5"
    >
      Find a neater hand
    </button>
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
      <Group label="Paper" value={getPaper(state.paper).name} className={pad} first lock={lockFor(props, 'paper')}>
        <PaperPicker value={getPaper(state.paper).family} onChange={props.onPaper} rows />
        <PaperVariants value={state.paper} onChange={props.onPaper} />
      </Group>
      {PENS_SHOWN && (
        <Group
          label="Pen"
          value={penName(state.pen)}
          className={pad}
          lock={lockFor(props, 'pen')}
          aside={<TipChoice value={state.penSize} ink={ink} onChange={props.onPenSize} />}
        >
          {!PENS_LIVE && <Soon />}
          <PenSwatches seed={state.seed} style={state.style} pen={state.pen} penSize={state.penSize} ink={ink} inkKey={props.inkKey} onPen={props.onPen} />
        </Group>
      )}
      <Group label="Ink" value={inkName(state.ink)} className={pad} lock={lockFor(props, 'ink')}>
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
        <div className="mt-3.5 grid gap-1.5">
          <Switch
            label="Neat hands only"
            words={['Neat only', 'Any hand']}
            tip="Tidies messy hands a little, and Find another skips the hard-to-read ones"
            checked={state.neatOnly}
            onChange={props.onNeatOnly}
          />
          {/* the hand on the page came before the switch (or from a link): one tap to a neat one */}
          {state.neatOnly && <NeatNudge p={props.p} onNewHand={props.onNewHand} />}
        </div>
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

function lockFor(props: PanelProps, key: LockKey) {
  if (!props.onLock) return undefined;
  const on = props.locks.has(key);
  return { on, toggle: () => props.onLock!(key, !on) };
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
  const named = card.title.toLowerCase() === fam.toLowerCase() ? card.title : `${card.title} (${fam.toLowerCase()})`;
  return `${named}${card.sub ? `, ${card.sub}` : ''}`;
}

/** A source and its credit, without saying the title twice ("Spencer, Compendium…" then "Platt Rogers Spencer, Compendium…"). */
function sourceLine(name: string, credit: string) {
  const title = branded(name).replace(/\s*\([^)]*\)\s*$/, '');
  const core = title.includes(', ') ? title.slice(title.indexOf(', ') + 2) : title;
  if (core.length > 8 && credit.includes(core)) return <span className="text-muted-foreground">{credit}</span>;
  return <>{branded(name)}. <span className="text-muted-foreground">{credit}</span></>;
}

/** A source credit for readers: the product's name, and the engine's notes to its own docs ("(hand-traditions.md §4)") stay out. */
function readerCredit(credit: string) {
  return branded(credit).replace(/\s*\([^)]*\.md[^)]*\)/g, '');
}

// ---------- More: everything else, folded away ----------
export function MoreControls(props: PanelProps & { flush?: boolean }) {
  const { state, flush } = props;
  const connected = !!getStyle(state.style)?.connected;
  const [open, setOpen] = useState(() => readOpen());
  // folded away, its dozens of sliders aren't drawn at all (each new hand would redraw them: most of a second
  // on a slow phone); once opened they stay, so folding it again still slides
  const [drawn, setDrawn] = useState(open);
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
      <MoreButton open={open} controls={id} flush={flush} summary="Pressure, slant, occasion, seed…" onClick={() => { setDrawn(true); setOpen((o) => { writeOpen(!o); return !o; }); }}>
        More
      </MoreButton>
      <div id={id} className={cn('grid transition-[grid-template-rows] duration-300 ease-[var(--ease-drawer)] motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden" inert={!open}>
          {drawn && <div className={cn('grid gap-6 pt-1 pb-6', pad)}>
            <div className="grid gap-3.5">
              {rest.map((c) => <ControlRow key={c.key} c={c} {...props} />)}
            </div>
            <div className="grid gap-3">
              <OccasionRow {...props} />
              <Switch
                label="Keep my paper, pen and ink"
                hint="Find another changes only the writer and the letter"
                checked={kept}
                onChange={props.onKeepLook}
              />
            </div>
            {groups.map(({ g, items }) => (
              <div key={g} className="grid gap-3.5">
                <div data-row className="text-[0.7812rem] text-muted-foreground">{g}</div>
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
                    hint="How far Find another jumps"
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
                  className="justify-self-start text-[0.7812rem] text-muted-foreground underline-offset-4 transition-colors duration-150 hover-device:hover:text-foreground hover-device:hover:underline pointer-coarse:py-3"
                >
                  Back to {props.name.split(' ')[0]}’s natural hand
                </button>
              )}
            </div>
          </div>}
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
    <div className="flex items-center gap-2 text-[0.7812rem] text-muted-foreground">
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
        className={cn(inputField, 'tabular min-w-0 flex-1')}
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
      {/* large text: the choice goes under its label rather than past the panel's edge */}
      <div data-row className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <label htmlFor={id} className="text-[0.8125rem] font-medium">
          Occasion
        </label>
        <div className="relative min-w-0 max-w-full">
          <select
            id={id}
            value={state.occasion ?? ''}
            onChange={(e) => onOccasion(e.target.value || null)}
            className="h-8 max-w-full cursor-pointer appearance-none truncate rounded-md border border-border bg-[var(--field)] py-0 pr-7 pl-2.5 text-[0.8125rem] text-foreground shadow-[0_1px_1px_rgba(60,45,20,0.04)] transition-colors duration-150 hover-device:hover:bg-[var(--st-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:h-11 pointer-coarse:text-[1rem]"
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
// paper swatches show a magnified corner of each sheet, where its character is

/** Papers as a grid (desktop panel) or one row that scrolls sideways (phone sheet). */
/** The kinds of the chosen paper (a pad: white A5, British blue, binsen, German A4), as small chips. */
function PaperVariants({ value, onChange }: { value: PaperId; onChange: (id: PaperId) => void }) {
  const variants = variantsOf(value);
  if (variants.length < 2) return null;
  return (
    <Segmented
      slide
      type="single"
      aria-label={`Kind of ${getPaper(value).name.toLowerCase()}`}
      value={getPaper(value).id}
      onValueChange={(v) => v && onChange(v as PaperId)}
      className="mt-2 flex flex-wrap justify-start gap-1.5 bg-transparent p-0"
    >
      {variants.map((v) => (
        <Tooltip key={v.id}>
          <TooltipTrigger asChild>
            <SegmentedChip value={v.id} aria-label={`${v.variant}: ${v.hint}`}>
              {v.variant}
            </SegmentedChip>
          </TooltipTrigger>
          <TooltipContent side="bottom">{v.hint}</TooltipContent>
        </Tooltip>
      ))}
    </Segmented>
  );
}

const PaperPicker = memo(function PaperPicker({ value, onChange, rows }: { value: PaperId; onChange: (id: PaperId) => void; rows?: boolean }) {
  // the chosen paper stays in view when it changes from elsewhere (Find another, a link)
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => { requestAnimationFrame(() => keepChosenInView(host.current?.querySelector<HTMLElement>('.sheet-row') ?? null)); }, [value]);
  return (
    <div ref={host} className="contents">
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
                // chosen: the whole tile lifts and takes the ink's ring, as the pens do (a variant keeps its family's tile chosen)
                'group h-auto flex-col items-stretch gap-1.5 rounded-lg p-1 pb-1.5 text-[0.75rem] aria-checked:bg-[var(--tile-on)] aria-checked:text-foreground aria-checked:shadow-[0_0_0_1.5px_var(--ink),0_1px_2px_rgba(40,30,10,0.1)] pointer-coarse:h-auto',
                rows && 'w-[86px] shrink-0 snap-start bg-secondary',
              )}
            >
              <span className="relative block overflow-hidden rounded-[5px] shadow-[0_0_0_0.5px_rgba(60,45,20,0.16),0_1px_2px_rgba(60,45,20,0.08)] transition-shadow duration-150">
                {/* flat: the sheet's own colour (the name under it tells near-whites apart) */}
                <span className="swatch block aspect-[4/3] w-full" style={{ background: paper.tint }} />
              </span>
              <span className="truncate px-0.5 text-center leading-tight">{paper.name}</span>
            </SegmentedItem>
          </TooltipTrigger>
          <TooltipContent side="bottom">{paper.hint}</TooltipContent>
        </Tooltip>
      ))}
      {rows && <span aria-hidden className="w-3 shrink-0" />}
    </Segmented>
    </div>
  );
});

/** Ink families: each swatch is a small dab showing how the ink pools, not one flat colour. */
const InkPicker = memo(function InkPicker({ value, pen, onChange }: { value: string; pen: string; onChange: (id: string) => void }) {
  const families = INK_FAMILIES.filter((f) => !f.pen || f.pen === pen);
  const options = MODELLED_INK ? [{ id: AUTO_INK, name: 'The pen’s own', color: '' }, ...families] : families;
  // balanced rows: as few rows as fit, then the same number of swatches in each
  const coarse = useMediaQuery('(pointer: coarse)');
  const max = coarse ? 7 : 9;
  // laid out for every ink there could be (a pencil's graphite too), so changing pens never adds a row
  const all = INK_FAMILIES.length + (MODELLED_INK ? 1 : 0);
  const cols = Math.ceil(all / Math.ceil(all / max));
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
              className="size-8 rounded-full p-0 aria-checked:bg-transparent aria-checked:shadow-none pointer-coarse:size-11"
            >
              <span
                className="swatch block size-[22px] rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)] ring-offset-2 ring-offset-panel transition-[box-shadow] duration-150 [[aria-checked=true]>&]:ring-[1.5px] [[aria-checked=true]>&]:ring-[var(--ink)]"
                style={{
                  // flat colours, like the rest of the panel; the pen's own ink is two of its usual colours, split
                  background: ink.color || 'linear-gradient(135deg, #263084 50%, #26262e 50%)',
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

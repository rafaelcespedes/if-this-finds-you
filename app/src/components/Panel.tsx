import { memo, useEffect, useId, useState } from 'react';
import { Check, ChevronDown, Download, Link2, Loader2, Lock, LockOpen, PenLine, Shuffle, Type, Users } from 'lucide-react';
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
import { sampleById, sampleCredit } from '@/lib/samples';
import { AUTO_INK, INK_FAMILIES, inkColor, inkName } from '@/lib/inks';
import { OCCASIONS } from '@/lib/occasions';
import { PAPERS, type PaperId, type PaperSpec } from '@/lib/papers';
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
  onToggleLock: (key: LockKey) => void;
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
  /** Ink mode (when the engine writes in ink): the mode, and the letter's sheet commands */
  ink?: {
    on: boolean;
    /** anything written in ink yet */
    letter: boolean;
    onMode: (mode: 'ink' | 'pencil' | 'fair') => void;
    onFairCopy: () => void;
    onFreshSheet: () => void;
  };
}

/** The desktop panel: every section in one column, actions pinned at the bottom. */
export function Panel(props: PanelProps) {
  return (
    <div className="flex min-h-full flex-col">
      <WriterCard {...props} />
      <Section label="How it’s written">
        <WritingControls {...props} />
      </Section>
      <Section label="Pen, ink and paper">
        <PenPaperControls {...props} />
      </Section>
      <Advanced {...props} />
      <Credits p={props.p} sample={props.state.sample} />
      <section
        aria-label="Share and download"
        className="sticky bottom-0 mt-auto border-t border-border bg-[color-mix(in_oklab,var(--panel)_94%,transparent)] px-5 pt-4 pb-5 backdrop-blur-sm"
      >
        <Actions {...props} />
      </section>
    </div>
  );
}

// ---------- writer ----------
const WriterCard = memo(function WriterCard(props: PanelProps) {
  const { p, name, state, onNewHand, onSimilarHand, onSeed, onStyle, onFieldFocus } = props;
  return (
    <section aria-label="Writer" className="px-5 pt-5 pb-5">
      <div key={state.seed + state.style} className="hand-in" style={{ color: inkColor(state.ink) }}>
        <Signature p={p} name={name} ink="currentColor" emPx={36} className="-ml-1 h-[58px] overflow-visible" />
      </div>
      <h2 className="mt-1 text-[17px] leading-tight font-medium tracking-[-0.012em]">{name}</h2>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">{describeHand(p)}</p>
      <SeedField seed={state.seed} onCommit={onSeed} onFocus={onFieldFocus} />
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <Button size="lg" className="justify-between pr-3 pl-3.5" onClick={onNewHand}>
          <span className="flex items-center gap-2">
            <Shuffle aria-hidden /> New hand
          </span>
          <kbd className="hidden rounded-[5px] border border-white/15 px-1.5 py-px font-sans text-[11px] leading-4 text-white/70 pointer-fine:inline-block">R</kbd>
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="lg" variant="secondary" onClick={onSimilarHand} className="px-3.5">
              <Users aria-hidden /> Similar
            </Button>
          </TooltipTrigger>
          <TooltipContent>A sibling of this hand (Shift R)</TooltipContent>
        </Tooltip>
      </div>
      <div className="mt-4">
        <StylePicker seed={state.seed} style={state.style} ink={inkColor(state.ink)} onStyle={onStyle} />
      </div>
    </section>
  );
});

/** The phone sheet's Hand tab: style and school, a sibling hand, the seed. */
export function HandControls(props: PanelProps) {
  const { p, state, onSimilarHand, onSeed, onStyle, onFieldFocus } = props;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div data-row>
        <StylePicker seed={state.seed} style={state.style} ink={inkColor(state.ink)} onStyle={onStyle} />
      </div>
      <div data-row className="flex items-center gap-2">
        <Button variant="secondary" onClick={onSimilarHand} className="shrink-0 px-3.5">
          <Users aria-hidden /> Similar hand
        </Button>
        <p className="min-w-0 text-[12.5px] leading-snug text-muted-foreground">{describeHand(p)}</p>
      </div>
      <div data-row>
        <SeedField seed={state.seed} onCommit={onSeed} onFocus={onFieldFocus} />
      </div>
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
    <div className="mt-3 flex items-center gap-2 text-[12.5px] text-muted-foreground first:mt-0">
      <label htmlFor={id} className="shrink-0">
        Seed
      </label>
      <input
        id={id}
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
        className="tabular min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] text-foreground transition-[border-color,background-color] duration-150 hover-device:hover:border-border focus:border-input focus:bg-[#fffefb] focus:outline-none pointer-coarse:border-border pointer-coarse:bg-[#fdfcf9] pointer-coarse:px-2.5 pointer-coarse:py-2.5 pointer-coarse:text-[16px]"
      />
    </div>
  );
}

// ---------- how it's written ----------
export function WritingControls(props: PanelProps) {
  const { state } = props;
  const connected = !!getStyle(state.style)?.connected;
  const primary = CONTROLS.filter((c) => c.tier === 'primary' && isShown(c, props.natural, { connected }));
  const changed = Object.values(state.offsets).some((v) => v) || state.penSize !== 'medium';
  return (
    <>
      {props.ink && <InkRow {...props} />}
      <div className="grid gap-3.5">
        {primary.map((c) => (
          <ControlRow key={c.key} c={c} {...props} />
        ))}
        <SliderRow label="Size" value={state.size} min={SIZE_RANGE.min} max={SIZE_RANGE.max} step={SIZE_RANGE.step} describe={words.size} onChange={props.onSize} mark={1} onReset={() => props.onSize(1)} />
      </div>
      <OccasionRow {...props} />
      <div data-row className="mt-3">
        <Row label="Signature">
          <Button variant={state.signed ? 'secondary' : 'outline'} size="sm" onClick={props.onSign} aria-pressed={state.signed}>
            {state.signed ? <Check aria-hidden /> : <PenLine aria-hidden />}
            {state.signed ? 'Signed' : 'Sign it'}
          </Button>
        </Row>
      </div>
      <div data-row className="mt-3 min-h-5">
        {changed && (
          <button
            type="button"
            onClick={props.onResetOffsets}
            className="text-[12.5px] text-muted-foreground underline-offset-4 transition-colors duration-150 hover-device:hover:text-foreground hover-device:hover:underline pointer-coarse:py-3"
          >
            Back to {props.name.split(' ')[0]}’s natural hand
          </button>
        )}
      </div>
    </>
  );
}

/** Ink (what's written stays; the writer corrects by hand) or Fair copy (the page redraws cleanly). */
function InkRow({ ink, state }: PanelProps) {
  if (!ink) return null;
  // Pencil is the pencil pen: it rubs out, so edits redraw the page (the engine's own Pencil mode comes later)
  const value = state.pen === 'pencil' ? 'pencil' : state.mode;
  return (
    <div data-row className="mb-4 grid gap-2">
      <div className="text-[13px] font-medium">Writing in</div>
      <Segmented type="single" aria-label="Writing in" value={value} onValueChange={(v) => v && ink.onMode(v as 'ink' | 'pencil' | 'fair')}>
        <SegmentedItem value="ink">Ink</SegmentedItem>
        <SegmentedItem value="pencil">Pencil</SegmentedItem>
        <SegmentedItem value="fair">Fair copy</SegmentedItem>
      </Segmented>
      <p className="text-[12px] leading-snug text-muted-foreground">
        {value === 'pencil'
          ? 'A pencil rubs out: change anything and the page is written again.'
          : value === 'ink'
            ? 'What’s written stays. Change your mind and the writer crosses it out, their own way.'
            : 'Every edit redraws the page cleanly.'}
      </p>
      {ink.on && ink.letter && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={ink.onFairCopy}>Make a fair copy</Button>
          <Button variant="ghost" size="sm" onClick={ink.onFreshSheet}>Fresh sheet</Button>
        </div>
      )}
    </div>
  );
}

function ControlRow({ c, natural, state, emMm, onControl, onResetControl }: { c: SliderControl } & PanelProps) {
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
    />
  );
}

function OccasionRow({ state, onOccasion, onAmount }: PanelProps) {
  const id = useId();
  return (
    <div className="mt-4 grid gap-2">
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

// ---------- pen, ink and paper ----------
export function PenPaperControls(props: PanelProps & { rows?: boolean }) {
  const { state, rows } = props;
  const ink = inkColor(state.ink);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {PENS_SHOWN && (
        <div data-row className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          <Row label="Pen" value={penName(state.pen)} lock={<LockToggle what="pen" {...props} />}>
            {!PENS_LIVE && <Soon />}
          </Row>
          <PenSwatches seed={state.seed} style={state.style} pen={state.pen} penSize={state.penSize} ink={ink} inkKey={props.inkKey} onPen={props.onPen} />
        </div>
      )}
      <div data-row>
        <Row label="Tip">
          <TipChoice value={state.penSize} ink={ink} onChange={props.onPenSize} />
        </Row>
      </div>
      <div data-row>
        <Row label="Ink" value={inkName(state.ink)} lock={<LockToggle what="ink" {...props} />} />
        <InkPicker value={state.ink} pen={state.pen} onChange={props.onInk} />
      </div>
      <div data-row>
        <Row label="Paper" value={PAPERS.find((x) => x.id === state.paper)?.name} lock={<LockToggle what="paper" {...props} />} />
        <PaperPicker value={state.paper} onChange={props.onPaper} rows={rows} />
      </div>
    </div>
  );
}

// ---------- advanced ----------
export function Advanced(props: PanelProps & { flush?: boolean }) {
  const connected = !!getStyle(props.state.style)?.connected;
  const [open, setOpen] = useState(() => readOpen());
  const id = useId();
  const groups = ADVANCED_GROUPS.map((g) => ({
    g,
    items: CONTROLS.filter((c) => c.tier === 'advanced' && c.group === g && isShown(c, props.natural, { connected })),
  }));
  return (
    <section data-row className={cn(!props.flush && 'border-t border-border')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => { writeOpen(!o); return !o; })}
        className={cn(
          'flex w-full items-center justify-between py-4 text-[13px] font-medium transition-colors duration-150 hover-device:hover:bg-[#f3f0e9] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring pointer-coarse:py-3.5',
          props.flush ? 'rounded-lg' : 'px-5',
        )}
      >
        More controls
        <ChevronDown aria-hidden className={cn('size-4 text-muted-foreground transition-transform duration-200 ease-out', open && 'rotate-180')} />
      </button>
      <div id={id} className={cn('grid transition-[grid-template-rows] duration-300 ease-[var(--ease-drawer)] motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden" inert={!open}>
          <div className={cn('grid gap-6 pt-1 pb-6', !props.flush && 'px-5')}>
            {groups.map(({ g, items }) => (
              <div key={g} className="grid gap-3.5">
                <div data-row className="text-[12.5px] text-muted-foreground">{g}</div>
                {items.map((c) => (
                  <ControlRow key={c.key} c={c} {...props} />
                ))}
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

// ---------- where the letters come from ----------
export const Credits = memo(function Credits({ p, flush, sample: sampleId }: { p: Hand; flush?: boolean; sample?: string | null }) {
  const sources = handSources(p);
  const words = sampleById(sampleId);
  if (!sources.length && !words) return null;
  return (
    <details data-row className={cn('group py-4 text-[12px] leading-snug text-muted-foreground', !flush && 'border-t border-border px-5')}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-sm marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:py-2 [&::-webkit-details-marker]:hidden">
        <span>{[words && sampleCredit(words), sources.length && `Letter shapes: ${sources.map((s) => s.name).join(', ')}`].filter(Boolean).join(' · ')}</span>
        <ChevronDown aria-hidden className="size-3.5 shrink-0 transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <ul className="mt-2 grid gap-1.5">
        {words && (
          <li>
            <span className="text-foreground/80">{words.author}, {words.year}.</span> {words.title}
            {words.translator && <>, translated by {words.translator.name}</>}. Public domain.
            {words.source?.url && (
              <>
                {' '}
                <a href={words.source.url} target="_blank" rel="noreferrer" className="underline decoration-[#cfc8b9] underline-offset-2 hover-device:hover:text-foreground">
                  Source
                </a>
              </>
            )}
          </li>
        )}
        {sources.map((s) => (
          <li key={s.name}>
            <span className="text-foreground/80">{s.name}.</span> {s.credit}
            {s.url && (
              <>
                {' '}
                <a href={s.url} target="_blank" rel="noreferrer" className="underline decoration-[#cfc8b9] underline-offset-2 hover-device:hover:text-foreground">
                  Source
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
});

// ---------- actions: share, download, font ----------
function Actions(props: PanelProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={props.onShare}>
          <Link2 /> Share link
        </Button>
        <Button variant="outline" onClick={props.onDownload} disabled={props.busy.download} aria-label="Download note as an image">
          {props.busy.download ? <Loader2 className="animate-spin" /> : <Download />} Download note
        </Button>
      </div>
      <div className="mt-3 px-0.5">
        <button
          type="button"
          onClick={props.onExportFont}
          disabled={props.busy.font}
          className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground underline decoration-[#cfc8b9] underline-offset-[3px] transition-[text-decoration-color] duration-150 hover-device:hover:decoration-foreground disabled:opacity-60 pointer-coarse:min-h-11"
        >
          <Type className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          Export font file (.otf)
          {props.busy.font && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        </button>
        <p className="mt-0.5 pl-[22px] text-[12px] leading-snug text-muted-foreground">
          The font holds 3 versions of each letter. The page varies endlessly.
        </p>
      </div>
    </>
  );
}

// ---------- building blocks ----------
function Section({ children, label }: { children: React.ReactNode; label: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="border-t border-border px-5 pt-4 pb-5">
      <h3 id={id} className="mb-3 text-[12.5px] font-normal text-muted-foreground">
        {label}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value, children, lock }: { label: string; value?: string; children?: React.ReactNode; lock?: React.ReactNode }) {
  return (
    <div className={cn('flex min-h-7 items-center justify-between gap-3', lock && 'pointer-coarse:min-h-11')}>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 text-[13px] font-medium">{label}</span>
        {value && <span className="truncate text-[13px] text-muted-foreground">{value}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {children}
        {lock}
      </span>
    </div>
  );
}

/** Keep this pen / ink / paper when New hand rolls everything else. On touch it says so in a word. */
function LockToggle({ what, locks, onToggleLock }: { what: LockKey } & PanelProps) {
  const locked = locks.has(what);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-pressed={locked}
          aria-label={`Keep this ${what} for new hands`}
          onClick={() => onToggleLock(what)}
          className={cn(
            'relative -mr-1.5 inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1.5 text-[12px] transition-[color,background-color] duration-150 select-none hover-device:hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
            // touch: a labelled pill with a full 44 px target
            "pointer-coarse:mr-0 pointer-coarse:h-8 pointer-coarse:rounded-full pointer-coarse:px-3 pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-1.5 pointer-coarse:after:content-['']",
            locked
              ? 'text-[var(--ink)] pointer-coarse:bg-[color-mix(in_oklab,var(--ink)_11%,transparent)]'
              : 'text-faint hover-device:hover:text-foreground pointer-coarse:bg-secondary pointer-coarse:text-muted-foreground',
          )}
        >
          {locked ? <Lock className="size-3.5" strokeWidth={2.2} aria-hidden /> : <LockOpen className="size-3.5" aria-hidden />}
          <span className="hidden pointer-coarse:inline">{locked ? 'Kept' : 'Keep'}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{locked ? `New hands keep this ${what}` : `Keep this ${what} for new hands`}</TooltipContent>
    </Tooltip>
  );
}

function Soon() {
  return (
    <span className="rounded-full bg-[#ebe6dc] px-1.5 py-px text-[11px] leading-4 text-muted-foreground" title="Wired up, waiting for the engine">
      soon
    </span>
  );
}

const SliderRow = memo(function SliderRow({
  label, value, min, max, step, describe, onChange, mark, onReset, soon, hint,
}: {
  label: string; value: number; min: number; max: number; step: number; describe: (v: number) => string;
  onChange: (v: number) => void; mark?: number; onReset?: () => void; soon?: boolean; hint?: string;
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
      {hint && <span className="-mt-0.5 text-[12px] text-muted-foreground">{hint}</span>}
    </div>
  );
});

// paper swatches show a magnified corner of each sheet, where its character is
const SWATCH = { w: 40, h: 30 };
function swatchCrop(paper: PaperSpec) {
  if (paper.swatch) return { ...paper.swatch, ...SWATCH };
  const x = paper.margin ? paper.margin.x - 15 : paper.grid ? paper.grid.box[0] - 2 : paper.dots ? paper.dots.box[0] - 3 : 6;
  const y = paper.lines ? paper.lines.first - 6 : paper.grid ? paper.grid.box[1] - 2 : paper.dots ? paper.dots.box[1] - 3 : 6;
  return { x: Math.max(0, x), y: Math.max(0, y), ...SWATCH };
}

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

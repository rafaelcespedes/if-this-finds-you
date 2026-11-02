import { memo, useEffect, useId, useState } from 'react';
import { ChevronDown, Download, Link2, Loader2, Shuffle, Type, Users } from 'lucide-react';
import { getStyle, styleNames, UPM, type Hand } from '@engine';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Segmented, SegmentedItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PaperCanvas } from '@/components/PaperCanvas';
import { Signature } from '@/components/Signature';
import { ADVANCED_GROUPS, CONTROLS, PEN_SIZES, isLive, isShown, naturalValue, penSizeFactor, type SliderControl } from '@/lib/controls';
import { MODELLED_INK } from '@/lib/engine-features';
import { describeHand, words } from '@/lib/hands';
import { AUTO_INK, INK_FAMILIES, inkColor, inkName } from '@/lib/inks';
import { OCCASIONS } from '@/lib/occasions';
import { PAPERS, type PaperId, type PaperSpec } from '@/lib/papers';
import { PEN_CHOICES, PENS_LIVE, PENS_SHOWN } from '@/lib/pens';
import { controlValue } from '@/lib/params';
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
  variety: number;
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
  onVariety: (v: number) => void;
  onShare: () => void;
  onDownload: () => void;
  onExportFont: () => void;
  /** the drawer shows the writer in the dock, so it skips the big header */
  compact?: boolean;
}

const STYLE_LABEL: Record<string, string> = { print: 'Print', script: 'Joined' };

export function Panel(props: PanelProps) {
  const { state, compact } = props;
  const connected = !!getStyle(state.style)?.connected;
  const primary = CONTROLS.filter((c) => c.tier === 'primary' && isShown(c, props.natural, { connected }));
  const changed = Object.values(state.offsets).some((v) => v) || state.penSize !== 'medium';
  return (
    <div className={cn('flex flex-col', !compact && 'min-h-full')}>
      {compact ? (
        <section aria-label="Writer and actions" className="px-5 pt-2 pb-5">
          <SeedField seed={state.seed} onCommit={props.onSeed} />
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <StylePicker {...props} />
            <Button variant="secondary" onClick={props.onSimilarHand} className="pointer-coarse:h-11">
              <Users aria-hidden /> Similar
            </Button>
          </div>
          <div className="mt-4">
            <Actions {...props} />
          </div>
        </section>
      ) : (
        <WriterCard {...props} />
      )}

      <Section label="How it’s written">
        <div className="grid gap-3.5">
          {primary.map((c) => (
            <ControlRow key={c.key} c={c} {...props} />
          ))}
        </div>
        <OccasionRow {...props} />
        <div className="mt-3 min-h-5">
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
      </Section>

      <Section label="Pen, ink and paper">
        <PenRow {...props} />
        <div className="mt-4">
          <Row label="Ink" value={inkName(state.ink)} />
          <InkPicker value={state.ink} pen={state.pen} onChange={props.onInk} />
        </div>
        <div className="mt-4">
          <Row label="Paper" value={PAPERS.find((x) => x.id === state.paper)?.name} />
          <PaperPicker value={state.paper} onChange={props.onPaper} />
        </div>
        <div className="mt-4">
          <SliderRow label="Size" value={state.size} min={SIZE_RANGE.min} max={SIZE_RANGE.max} step={SIZE_RANGE.step} describe={words.size} onChange={props.onSize} mark={1} onReset={() => props.onSize(1)} />
        </div>
      </Section>

      <Advanced {...props} connected={connected} />

      {!compact && (
        <section
          aria-label="Share and download"
          className="sticky bottom-0 mt-auto border-t border-border bg-[color-mix(in_oklab,var(--panel)_94%,transparent)] px-5 pt-4 pb-5 backdrop-blur-sm"
        >
          <Actions {...props} />
        </section>
      )}
    </div>
  );
}

// ---------- writer ----------
const WriterCard = memo(function WriterCard(props: PanelProps) {
  const { p, name, state, onNewHand, onSimilarHand, onSeed } = props;
  return (
    <section aria-label="Writer" className="px-5 pt-5 pb-5">
      <div key={state.seed + state.style} className="hand-in" style={{ color: inkColor(state.ink) }}>
        <Signature p={p} name={name} ink="currentColor" emPx={36} className="-ml-1 h-[58px] overflow-visible" />
      </div>
      <h2 className="mt-1 text-[17px] leading-tight font-medium tracking-[-0.012em]">{name}</h2>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">{describeHand(p)}</p>
      <SeedField seed={state.seed} onCommit={onSeed} />
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
      <div className="mt-3">
        <StylePicker {...props} />
      </div>
    </section>
  );
});

function StylePicker({ state, onStyle }: PanelProps) {
  const styles = styleNames();
  return (
    <Segmented type="single" aria-label="Style" value={state.style} onValueChange={(v) => v && onStyle(v)} className="w-full">
      {styles.map((s) => (
        <SegmentedItem key={s} value={s}>
          {STYLE_LABEL[s] ?? getStyle(s)?.label ?? s}
        </SegmentedItem>
      ))}
    </Segmented>
  );
}

function SeedField({ seed, onCommit }: { seed: string; onCommit: (s: string) => void }) {
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
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setV(seed); (e.target as HTMLInputElement).blur(); }
        }}
        className="tabular min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] text-foreground transition-[border-color,background-color] duration-150 hover-device:hover:border-border focus:border-input focus:bg-[#fffefb] focus:outline-none pointer-coarse:py-2.5 pointer-coarse:text-[16px]"
      />
    </div>
  );
}

// ---------- controls ----------
function ControlRow({ c, natural, state, emMm, onControl, onResetControl }: { c: SliderControl } & PanelProps) {
  const value = controlValue(c.key, natural, state);
  let mark = naturalValue(c, natural);
  if (c.key === 'penWidth') mark *= penSizeFactor(state.penSize);
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
      <div className="flex min-h-8 items-center justify-between gap-3">
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

function PenRow({ state, onPen, onPenSize }: PanelProps) {
  return (
    <div className="grid gap-2">
      <Row label="Pen">{PENS_SHOWN && !PENS_LIVE && <Soon />}</Row>
      {PENS_SHOWN && (
        <Segmented
          type="single"
          aria-label="Pen"
          value={state.pen}
          onValueChange={(v) => v && onPen(v)}
          className="grid grid-flow-row grid-cols-3 gap-0.5"
        >
          {PEN_CHOICES.map((pen) => (
            <SegmentedItem key={pen.id} value={pen.id} className="px-2 text-[12.5px]">
              {pen.name}
            </SegmentedItem>
          ))}
        </Segmented>
      )}
      <Segmented type="single" aria-label="Pen tip" value={state.penSize} onValueChange={(v) => v && onPenSize(v as NoteState['penSize'])}>
        {PEN_SIZES.map((s) => (
          <SegmentedItem key={s.id} value={s.id}>
            {s.label}
          </SegmentedItem>
        ))}
      </Segmented>
    </div>
  );
}

// ---------- advanced ----------
function Advanced(props: PanelProps & { connected: boolean }) {
  const [open, setOpen] = useState(() => readOpen());
  const id = useId();
  const groups = ADVANCED_GROUPS.map((g) => ({
    g,
    items: CONTROLS.filter((c) => c.tier === 'advanced' && c.group === g && isShown(c, props.natural, { connected: props.connected })),
  }));
  return (
    <section className="border-t border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => { writeOpen(!o); return !o; })}
        className="flex w-full items-center justify-between px-5 py-4 text-[13px] font-medium transition-colors duration-150 hover-device:hover:bg-[#f3f0e9] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring pointer-coarse:py-5"
      >
        More controls
        <ChevronDown aria-hidden className={cn('size-4 text-muted-foreground transition-transform duration-200 ease-out', open && 'rotate-180')} />
      </button>
      <div id={id} className={cn('grid transition-[grid-template-rows] duration-300 ease-[var(--ease-drawer)] motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden" inert={!open}>
          <div className="grid gap-6 px-5 pt-1 pb-6">
            {groups.map(({ g, items }) => (
              <div key={g} className="grid gap-3.5">
                <div className="text-[12.5px] text-muted-foreground">{g}</div>
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

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-6 items-center justify-between gap-3">
      <span className="text-[13px] font-medium">{label}</span>
      {value ? <span className="text-[13px] text-muted-foreground">{value}</span> : children}
    </div>
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
    <div className="grid gap-1">
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

const PaperPicker = memo(function PaperPicker({ value, onChange }: { value: PaperId; onChange: (id: PaperId) => void }) {
  return (
    <Segmented
      type="single"
      aria-label="Paper"
      value={value}
      onValueChange={(v) => v && onChange(v as PaperId)}
      className="mt-1.5 grid grid-flow-row grid-cols-3 gap-2 bg-transparent p-0"
    >
      {PAPERS.map((paper) => (
        <Tooltip key={paper.id}>
          <TooltipTrigger asChild>
            <SegmentedItem
              value={paper.id}
              aria-label={`${paper.name}: ${paper.hint}`}
              className="group h-auto flex-col items-stretch gap-1.5 rounded-lg p-1 pb-1.5 text-[12px] data-[state=on]:bg-[#fffefb] pointer-coarse:h-auto"
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

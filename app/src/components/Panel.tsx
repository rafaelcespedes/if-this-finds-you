import { memo, useEffect, useId, useState } from 'react';
import { Download, Link2, Loader2, Shuffle, Type } from 'lucide-react';
import type { Hand } from '@engine';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Segmented, SegmentedItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PaperCanvas } from '@/components/PaperCanvas';
import { Signature } from '@/components/Signature';
import { HAND_CONTROLS } from '@/lib/controls';
import { describeHand, words } from '@/lib/hands';
import { INKS, getInk } from '@/lib/inks';
import { PAPERS, type PaperId, type PaperSpec } from '@/lib/papers';
import { SIZE_RANGE, type NoteState, type OverrideKey } from '@/lib/state';
import { cn } from '@/lib/utils';

export interface PanelProps {
  state: NoteState;
  /** the effective hand (seed + overrides) */
  p: Hand;
  name: string;
  busy: { download: boolean; font: boolean };
  onNewHand: () => void;
  onSeed: (seed: string) => void;
  onStyle: (style: string) => void;
  onOverride: (key: OverrideKey, v: number) => void;
  onResetOverrides: () => void;
  onSize: (v: number) => void;
  onPaper: (id: PaperId) => void;
  onInk: (id: string) => void;
  onShare: () => void;
  onDownload: () => void;
  onExportFont: () => void;
  /** the drawer shows the writer in the dock, so it can skip the header */
  compact?: boolean;
}

export function Panel(props: PanelProps) {
  const { state, p, compact } = props;
  return (
    <div className={cn('flex flex-col', !compact && 'min-h-full')}>
      {compact ? (
        <section aria-label="Writer and actions" className="px-5 pt-2 pb-5">
          <SeedField seed={state.seed} onCommit={props.onSeed} />
          <div className="mt-3">
            <Actions {...props} />
          </div>
        </section>
      ) : (
        <WriterCard {...props} />
      )}
      <Section>
        <Row label="Style">
          <Segmented
            type="single"
            aria-label="Style"
            value={state.style}
            onValueChange={(v) => v && props.onStyle(v)}
            className="w-[150px]"
          >
            <SegmentedItem value="print">Print</SegmentedItem>
            <SegmentedItem value="script">Script</SegmentedItem>
          </Segmented>
        </Row>
        <div className="mt-4 grid gap-3.5">
          {HAND_CONTROLS.map((c) => (
            <SliderRow
              key={c.key}
              label={c.label}
              value={p[c.key] as number}
              min={c.min}
              max={c.max}
              step={c.step}
              describe={c.describe}
              onChange={(v) => props.onOverride(c.key, v)}
            />
          ))}
        </div>
        <div className="mt-3 h-5">
          {Object.keys(state.overrides).length > 0 && (
            <button
              type="button"
              onClick={props.onResetOverrides}
              className="text-[12.5px] text-muted-foreground underline-offset-4 transition-colors duration-150 hover-device:hover:text-foreground hover-device:hover:underline pointer-coarse:py-3"
            >
              Back to {props.name.split(' ')[0]}’s natural hand
            </button>
          )}
        </div>
      </Section>

      <Section>
        <Label>Paper</Label>
        <PaperPicker value={state.paper} onChange={props.onPaper} />
        <div className="mt-4">
          <SliderRow
            label="Size"
            value={state.size}
            min={SIZE_RANGE.min}
            max={SIZE_RANGE.max}
            step={SIZE_RANGE.step}
            describe={words.size}
            onChange={props.onSize}
          />
        </div>
        <div className="mt-4">
          <Row label="Ink" value={getInk(state.ink).name}>
            <span />
          </Row>
          <InkPicker value={state.ink} onChange={props.onInk} />
        </div>
      </Section>

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
        <div className="min-w-0">
          <button
            type="button"
            onClick={props.onExportFont}
            disabled={props.busy.font}
            className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground underline decoration-[#cfc8b9] underline-offset-[3px] transition-[text-decoration-color] duration-150 hover-device:hover:decoration-foreground disabled:opacity-60 pointer-coarse:py-2.5"
          >
            <Type className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            Export font file (.otf)
            {props.busy.font && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          </button>
          <p className="mt-0.5 pl-[22px] text-[12px] leading-snug text-muted-foreground">
            The font holds 3 versions of each letter. The page varies endlessly.
          </p>
        </div>
      </div>
    </>
  );
}

// ---------- writer ----------
const WriterCard = memo(function WriterCard({ p, name, state, onNewHand, onSeed }: PanelProps) {
  const ink = getInk(state.ink).color;
  return (
    <section aria-label="Writer" className="px-5 pt-5 pb-5">
      <div key={state.seed + state.style} className="hand-in">
        <Signature p={p} name={name} ink={ink} emPx={36} className="-ml-1 h-[58px] overflow-visible" />
        <h2 className="mt-1 text-[17px] leading-tight font-medium tracking-[-0.012em]">{name}</h2>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">{describeHand(p)}</p>
      </div>
      <SeedField seed={state.seed} onCommit={onSeed} />
      <Button size="lg" className="mt-4 w-full justify-between pl-3.5 pr-3" onClick={onNewHand}>
        <span className="flex items-center gap-2">
          <Shuffle aria-hidden /> New hand
        </span>
        <kbd className="hidden rounded-[5px] border border-white/15 px-1.5 py-px font-sans text-[11px] leading-4 text-white/70 pointer-fine:inline-block">
          R
        </kbd>
      </Button>
    </section>
  );
});

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

// ---------- building blocks ----------
function Section({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return <section className={cn('border-t border-border px-5 py-5', last && 'pb-6')}>{children}</section>;
}

function Label({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="mb-2.5 text-[13px] font-medium text-foreground">
      {children}
    </div>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="text-[13px] font-medium">{label}</span>
      {value ? <span className="text-[13px] text-muted-foreground">{value}</span> : children}
    </div>
  );
}

const SliderRow = memo(function SliderRow({
  label, value, min, max, step, describe, onChange,
}: { label: string; value: number; min: number; max: number; step: number; describe: (v: number) => string; onChange: (v: number) => void }) {
  const id = useId();
  const word = describe(value);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between">
        <span id={id} className="text-[13px] font-medium">
          {label}
        </span>
        <span className="text-[13px] text-muted-foreground" aria-hidden>
          {word}
        </span>
      </div>
      <Slider
        aria-labelledby={id}
        aria-valuetext={word}
        value={[Math.min(max, Math.max(min, value))]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
});

// paper swatches show a magnified corner of each sheet, where its character is
const SWATCH = { w: 40, h: 30 };
function swatchCrop(paper: PaperSpec) {
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
      className="grid grid-flow-row grid-cols-3 gap-2 bg-transparent p-0"
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

const InkPicker = memo(function InkPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <Segmented
      type="single"
      aria-label="Ink"
      value={value}
      onValueChange={(v) => v && onChange(v)}
      className="mt-1.5 flex justify-between gap-1 bg-transparent p-0"
    >
      {INKS.map((ink) => (
        <Tooltip key={ink.id}>
          <TooltipTrigger asChild>
            <SegmentedItem
              value={ink.id}
              aria-label={ink.name}
              className="size-9 rounded-full p-0 data-[state=on]:bg-transparent data-[state=on]:shadow-none pointer-coarse:size-11"
            >
              <span
                className="block size-6 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] ring-offset-2 ring-offset-panel transition-[box-shadow] duration-150 [[data-state=on]>&]:ring-[1.5px] [[data-state=on]>&]:ring-[var(--ink)]"
                style={{ background: `radial-gradient(circle at 35% 30%, color-mix(in oklab, ${ink.color} 78%, white), ${ink.color} 62%)` }}
              />
            </SegmentedItem>
          </TooltipTrigger>
          <TooltipContent>{ink.name}</TooltipContent>
        </Tooltip>
      ))}
    </Segmented>
  );
});

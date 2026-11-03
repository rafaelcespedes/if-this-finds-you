// What every row writes and how: a line (the set's letter opening, every letter, the alphabet, figures, the writer's
// own name, or your words), the size, and As a font (the font itself, what you download) or Live hand (the engine's
// live writing, with the writer's own pen, ink and paper). Stays in reach on wide screens while you scroll.
import { useId } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Segmented, SegmentedItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import type { Mode } from './protocol';
import { LINES, SIZE, type Line } from './route';

interface Props {
  line: Line;
  onLine: (l: Line) => void;
  /** your own words (what the field holds) */
  text: string;
  onText: (t: string) => void;
  /** the line every row writes now, shown in the field until you type */
  placeholder: string;
  size: number;
  onSize: (v: number) => void;
  onSizeCommit: (v: number) => void;
  mode: Mode;
  onMode: (m: Mode) => void;
  onFocusChange?: (focused: boolean) => void;
  narrow: boolean;
}

export function SpecimenBar(p: Props) {
  const sizeId = useId();
  const current = p.line === 'own' ? 'Your words' : LINES.find((l) => l.id === p.line)?.label ?? '';
  return (
    <div className={cn('specimen-bar flex gap-x-5 gap-y-3', p.narrow ? 'flex-col' : 'items-center')}>
      <div className="archive-field relative flex h-10 min-w-0 flex-1 items-center">
        {/* the line: a quiet menu at the start of the field */}
        <label className="line-pick relative flex h-full shrink-0 cursor-pointer items-center gap-1 border-r border-border pr-2 pl-3 text-[13px] text-muted-foreground">
          <span className="max-w-[9.5rem] truncate">{current}</span>
          <ChevronDown aria-hidden className="size-3.5 opacity-60" />
          <select
            aria-label="What every hand writes"
            value={p.line === 'own' ? '' : p.line}
            onChange={(e) => p.onLine(e.target.value as Line)}
            className="absolute inset-0 w-full cursor-pointer appearance-none opacity-0"
          >
            {p.line === 'own' && <option value="">Your words</option>}
            {LINES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
        <label className="relative flex h-full min-w-0 flex-1 items-center">
          <span className="sr-only">Your own words</span>
          <input
            type="text"
            value={p.text}
            onChange={(e) => p.onText(e.target.value.slice(0, 160))}
            onFocus={() => p.onFocusChange?.(true)}
            onBlur={() => p.onFocusChange?.(false)}
            onKeyDown={(e) => { if (e.key === 'Escape' && p.text) { e.preventDefault(); p.onText(''); } }}
            placeholder={p.placeholder}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="done"
            className="h-full w-full min-w-0 bg-transparent pr-9 pl-3 text-[14px] outline-none placeholder:text-faint"
          />
          {p.text && (
            <button type="button" aria-label="Back to the letter’s opening" onMouseDown={(e) => e.preventDefault()} onClick={() => p.onText('')} className="absolute right-2 grid size-6 place-items-center rounded-md text-faint transition-colors duration-150 hover-device:hover:text-foreground">
              <X aria-hidden className="size-3.5" />
            </button>
          )}
        </label>
      </div>
      <div className="flex items-center gap-5">
        <div className={cn('flex items-center gap-3', p.narrow ? 'min-w-0 flex-1' : 'w-[200px]')}>
          <span id={sizeId} className="shrink-0 text-[12.5px] text-muted-foreground">Size</span>
          <Slider aria-labelledby={sizeId} aria-valuetext={`${p.size} pixels`} min={SIZE.min} max={SIZE.max} step={SIZE.step} value={[p.size]}
            onValueChange={([v]) => p.onSize(v)} onValueCommit={([v]) => p.onSizeCommit(v)} className="min-w-0 flex-1" />
          {!p.narrow && <span aria-hidden className="w-8 shrink-0 text-right text-[12.5px] text-muted-foreground tabular">{p.size}</span>}
        </div>
        <Segmented type="single" value={p.mode} onValueChange={(v) => v && p.onMode(v as Mode)} aria-label="How the hands are shown" className="shrink-0">
          <SegmentedItem value="font" aria-label="As a font: what you download">{p.narrow ? 'Font' : 'As a font'}</SegmentedItem>
          <SegmentedItem value="live" aria-label="Live hand: the writer’s own pen, ink and paper">{p.narrow ? 'Live' : 'Live hand'}</SegmentedItem>
        </Segmented>
      </div>
    </div>
  );
}

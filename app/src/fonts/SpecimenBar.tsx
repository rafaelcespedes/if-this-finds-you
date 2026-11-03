// How every specimen is written: your own words (or the default line), the size, and plain (the font as it
// downloads) or ink on paper (the hand as the live page writes it). Above the list, and it stays in reach on wide
// screens while you scroll.
import { useId } from 'react';
import { X } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Segmented, SegmentedItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import type { Mode } from './protocol';
import { DEFAULT_TEXT, SIZE } from './route';

interface Props {
  text: string;
  onText: (t: string) => void;
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
  return (
    <div className={cn('specimen-bar flex gap-x-5 gap-y-3', p.narrow ? 'flex-col' : 'items-center')}>
      <label className="relative flex min-w-0 flex-1 items-center">
        <span className="sr-only">Your own words to try</span>
        <input
          type="text"
          value={p.text}
          onChange={(e) => p.onText(e.target.value.slice(0, 160))}
          onFocus={() => p.onFocusChange?.(true)}
          onBlur={() => p.onFocusChange?.(false)}
          onKeyDown={(e) => { if (e.key === 'Escape' && p.text) { e.preventDefault(); p.onText(''); } }}
          placeholder={`Type to try your own words. ${DEFAULT_TEXT}`}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          className="archive-field h-10 w-full pr-9 pl-3 text-[14px] placeholder:text-faint"
        />
        {p.text && (
          <button type="button" aria-label="Back to the default line" onMouseDown={(e) => e.preventDefault()} onClick={() => p.onText('')} className="absolute right-2 grid size-6 place-items-center rounded-md text-faint transition-colors duration-150 hover-device:hover:text-foreground">
            <X aria-hidden className="size-3.5" />
          </button>
        )}
      </label>
      <div className="flex items-center gap-5">
        <div className={cn('flex items-center gap-3', p.narrow ? 'min-w-0 flex-1' : 'w-[220px]')}>
          <span id={sizeId} className="shrink-0 text-[12.5px] text-muted-foreground">Size</span>
          <Slider
            aria-labelledby={sizeId}
            aria-valuetext={`${p.size} pixels`}
            min={SIZE.min}
            max={SIZE.max}
            step={SIZE.step}
            value={[p.size]}
            onValueChange={([v]) => p.onSize(v)}
            onValueCommit={([v]) => p.onSizeCommit(v)}
            className="min-w-0 flex-1"
          />
          {!p.narrow && <span aria-hidden className="w-9 shrink-0 text-right text-[12.5px] text-muted-foreground tabular">{p.size}</span>}
        </div>
        <Segmented type="single" value={p.mode} onValueChange={(v) => v && p.onMode(v as Mode)} aria-label="How the specimens are shown" className="shrink-0">
          <SegmentedItem value="plain">Plain</SegmentedItem>
          <SegmentedItem value="ink" aria-label="Ink on paper">{p.narrow ? 'On paper' : 'Ink on paper'}</SegmentedItem>
        </Segmented>
      </div>
    </div>
  );
}

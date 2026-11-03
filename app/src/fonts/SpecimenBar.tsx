// What every row writes and how: a line (the set's letter opening, every letter, the alphabet, figures, the writer's
// own name, or your words), the size, and As a font (the font itself, what you download) or Live hand (the engine's
// live writing, with the writer's own pen, ink and paper). Built from the tool's own controls (its menu, field,
// slider row and segmented control), so it looks and behaves like the panel on the home page.
import { ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { inputField } from '@/components/ui/input';
import { ActionSheet } from '@/components/ui/sheet';
import { SliderRow } from '@/components/ui/slider-row';
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
  mode: Mode;
  onMode: (m: Mode) => void;
  onFocusChange?: (focused: boolean) => void;
  narrow: boolean;
}

/** What every hand writes: the shared ActionSheet (a menu from a quiet button on desktop, rows on phones). */
function LinePicker({ line, onLine }: { line: Line; onLine: (l: Line) => void }) {
  const current = line === 'own' ? 'Your words' : LINES.find((l) => l.id === line)?.label ?? '';
  return (
    <ActionSheet
      title="What every hand writes"
      side="bottom"
      align="start"
      width="w-[236px]"
      entries={LINES.map((l) => ({ id: l.id, label: l.label, checked: line === l.id, onSelect: () => onLine(l.id) }))}
      trigger={
        <Button variant="outline" className="group max-w-[11rem] shrink-0 justify-between gap-1.5 px-3 font-normal" aria-label={`What every hand writes: ${current}`}>
          <span className="truncate">{current}</span>
          <ChevronDown aria-hidden className="size-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </Button>
      }
    />
  );
}

export function SpecimenBar(p: Props) {
  return (
    <div className={cn('specimen-bar flex gap-x-6 gap-y-3', p.narrow ? 'flex-col' : 'items-center')}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <LinePicker line={p.line} onLine={p.onLine} />
        <label className="relative flex min-w-0 flex-1 items-center">
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
            className={cn(inputField, 'h-9 w-full min-w-0 pr-9 pointer-coarse:h-11 placeholder:text-faint')}
          />
          {p.text && (
            <Button variant="ghost" size="icon" aria-label="Back to the letter’s opening" onMouseDown={(e) => e.preventDefault()} onClick={() => p.onText('')}
              className="absolute right-0.5 size-8 text-[var(--muted-foreground)] pointer-coarse:size-10">
              <X aria-hidden className="size-3.5" />
            </Button>
          )}
        </label>
      </div>
      <div className={cn('flex items-end gap-5', p.narrow && 'w-full')}>
        <div className={cn(p.narrow ? 'min-w-0 flex-1' : 'w-[200px]')}>
          <SliderRow label="Size" value={p.size} min={SIZE.min} max={SIZE.max} step={SIZE.step} describe={(v) => `${v} px`} onChange={p.onSize} />
        </div>
        <Segmented type="single" value={p.mode} onValueChange={(v) => v && p.onMode(v as Mode)} aria-label="How the hands are shown" className="w-[184px] shrink-0">
          <SegmentedItem value="font" aria-label="As a font: what you download">As a font</SegmentedItem>
          <SegmentedItem value="live" aria-label="Live hand: the writer’s own pen, ink and paper">Live hand</SegmentedItem>
        </Segmented>
      </div>
    </div>
  );
}

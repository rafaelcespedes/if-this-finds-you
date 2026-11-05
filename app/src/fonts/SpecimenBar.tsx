// What every row writes: the set's letter opening, every letter, the alphabet, figures, the writer's own name, or your
// words. Two homes, one at a time: on wide screens a ruled tester line above the list (the shared ActionSheet as its
// menu, and a field); everywhere else the dock's Text sheet (TextPanel: ticked rows, then the field). The size and
// the As a font / Live hand switch were cut on 4 Nov 2026 (the live hand is in each hand's record now).
import { Check, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { inputField } from '@/components/ui/input';
import { ActionSheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { LINES, type Line } from './route';

interface Props {
  line: Line;
  onLine: (l: Line) => void;
  /** your own words (what the field holds) */
  text: string;
  onText: (t: string) => void;
  /** the line every row writes now, shown in the field until you type */
  placeholder: string;
  onFocusChange?: (focused: boolean) => void;
}

/** The field for your own words, with a clear button once there are some. */
export function WordsField({ text, onText, placeholder, onFocusChange, escapeClears }: Omit<Props, 'line' | 'onLine'> & { escapeClears?: boolean }) {
  return (
    <label className="relative flex min-w-0 flex-1 items-center">
      <span className="sr-only">Your own words</span>
      <input
        type="text"
        value={text}
        onChange={(e) => onText(e.target.value.slice(0, 160))}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
        // on the tester line Escape clears your words; in a sheet it closes the sheet, as everywhere
        onKeyDown={(e) => { if (escapeClears && e.key === 'Escape' && text) { e.preventDefault(); onText(''); } }}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
        className={cn(inputField, 'h-9 w-full min-w-0 pr-9 pointer-coarse:h-11 placeholder:text-faint')}
      />
      {text && (
        <Button variant="ghost" size="icon" aria-label="Clear your words" onMouseDown={(e) => e.preventDefault()} onClick={() => onText('')}
          className="absolute right-0.5 size-8 text-[var(--muted-foreground)] pointer-coarse:size-10">
          <X aria-hidden className="size-3.5" />
        </Button>
      )}
    </label>
  );
}

/** What every hand writes: the shared ActionSheet (a menu from a quiet button on desktop, rows on phones). */
export function LinePicker({ line, onLine, variant = 'outline' }: { line: Line; onLine: (l: Line) => void; variant?: 'outline' | 'secondary' }) {
  const current = line === 'own' ? 'Your words' : LINES.find((l) => l.id === line)?.label ?? '';
  return (
    <ActionSheet
      title="What every hand writes"
      side="bottom"
      align="start"
      width="w-[236px]"
      entries={LINES.map((l) => ({ id: l.id, label: l.label, checked: line === l.id, onSelect: () => onLine(l.id) }))}
      trigger={
        <Button variant={variant} className="group max-w-[11rem] shrink-0 justify-between gap-1.5 px-3 font-normal data-[state=open]:bg-[var(--st-press)]" aria-label={`What every hand writes: ${current}`}>
          <span className="truncate">{current}</span>
          <ChevronDown aria-hidden className="size-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </Button>
      }
    />
  );
}

/** Wide screens: one ruled tester line above the list (the line's menu, then the field). */
export function SpecimenBar(p: Props) {
  return (
    <div className="specimen-bar flex min-w-0 flex-wrap items-center gap-2 [&>label]:min-w-[min(100%,14rem)]">
      <LinePicker line={p.line} onLine={p.onLine} />
      <WordsField text={p.text} onText={p.onText} placeholder={p.placeholder} onFocusChange={p.onFocusChange} escapeClears />
    </div>
  );
}

/** The dock's Text sheet: the lines as ticked rows (the shared sheet's rows), then your own words. */
export function TextPanel(p: Props & { onDone: () => void }) {
  return (
    <div className="text-panel grid gap-3">
      <div role="radiogroup" aria-label="What every hand writes" className="grid">
        {LINES.map((l) => {
          const on = p.line === l.id;
          return (
            <button key={l.id} type="button" role="radio" aria-checked={on} onClick={() => { p.onLine(l.id); p.onDone(); }}
              className="sheet-row flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-foreground transition-[scale,background-color] duration-(--st-dur) ease-(--ease-out) active:duration-(--dur-press) select-none active:scale-[0.98] active:bg-accent hover-device:hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
              <span aria-hidden className="grid size-5 shrink-0 place-items-center">{on && <Check className="size-[18px] text-[var(--ink)]" />}</span>
              <span className="min-w-0 flex-1">{l.label}</span>
            </button>
          );
        })}
      </div>
      <div className="grid gap-1.5 px-3 pb-1">
        <span className="text-panel-label text-[0.75rem] text-muted-foreground">Or your own words</span>
        <WordsField text={p.text} onText={p.onText} placeholder={p.line === 'own' ? p.placeholder : 'Type a line…'} onFocusChange={p.onFocusChange} />
      </div>
    </div>
  );
}

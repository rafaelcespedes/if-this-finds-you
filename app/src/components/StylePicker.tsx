// Style: Print or Joined first, then the school inside it, each card written in this writer's hand in that
// school. Scales to many styles: the cards scroll sideways, and the family switch stays two choices.
import { memo, useEffect, useMemo, useRef } from 'react';
import { makeHand } from '@engine';
import { Segmented, SegmentedItem } from '@/components/ui/toggle-group';
import { Specimen } from '@/components/Specimen';
import { baseStyle, familyOf, styleCard, styleFamilies } from '@/lib/styles';
import { cn, keepChosenInView } from '@/lib/utils';

/** the last school picked in each family, so Print → Joined → Print comes back to it */
const lastInFamily = new Map<string, string>();

interface Props {
  seed: string;
  style: string;
  /** CSS colour of the ink, for the samples */
  ink: string;
  onStyle: (style: string) => void;
}

export const StylePicker = memo(function StylePicker({ seed, style, ink, onStyle }: Props) {
  const families = useMemo(() => styleFamilies(), []);
  const fam = familyOf(style);
  const styles = families.find((f) => f.id === fam)?.styles ?? [style];
  useEffect(() => { lastInFamily.set(fam, style); }, [fam, style]);

  // keep the chosen card in view when the style changes from elsewhere (New hand, a shared link)
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => { requestAnimationFrame(() => keepChosenInView(row.current)); }, [style]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = styles.indexOf(style);
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : null;
    if (next == null) return;
    e.preventDefault();
    const s = styles[(next + styles.length) % styles.length];
    onStyle(s);
    requestAnimationFrame(() => row.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
      <Segmented
        type="single"
        aria-label="Print or joined"
        value={fam}
        onValueChange={(f) => f && f !== fam && onStyle(lastInFamily.get(f) ?? baseStyle(f))}
      >
        {families.map((f) => (
          <SegmentedItem key={f.id} value={f.id}>
            {f.label}
          </SegmentedItem>
        ))}
      </Segmented>
      {styles.length > 1 && (
        <div
          ref={row}
          role="radiogroup"
          aria-label="School"
          onKeyDown={onKeyDown}
          className="sheet-row -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-2 overflow-x-auto px-5 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {styles.map((s) => (
            <SchoolCard key={s} seed={seed} style={s} ink={ink} selected={s === style} onPick={() => onStyle(s)} />
          ))}
          {/* room after the last card, so it can scroll clear of the edge */}
          <span aria-hidden className="w-3 shrink-0" />
        </div>
      )}
    </div>
  );
});

function SchoolCard({ seed, style, ink, selected, onPick }: { seed: string; style: string; ink: string; selected: boolean; onPick: () => void }) {
  const { title, sub } = styleCard(style);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${title}, ${sub}`}
      tabIndex={selected ? 0 : -1}
      onClick={onPick}
      className={cn(
        'group flex w-[128px] shrink-0 snap-start flex-col items-start rounded-xl px-2.5 pt-2 pb-2 text-left transition-[background-color,box-shadow] duration-150 ease-out select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.98] motion-reduce:active:scale-100',
        selected
          ? 'bg-[#fffefb] shadow-[0_0_0_1.5px_var(--ink),0_1px_2px_rgba(40,30,10,0.1)]'
          : 'bg-secondary hover-device:hover:bg-accent',
      )}
    >
      <Specimen
        sampleKey={`school|${seed}|${style}`}
        hand={() => makeHand(seed, style)}
        text="Dear"
        emPx={25}
        color={ink}
        className="-ml-1.5 h-[34px] w-full overflow-hidden"
      />
      <span className="mt-1.5 w-full truncate text-[12.5px] leading-tight font-medium text-foreground">{title}</span>
      <span className="w-full truncate text-[11.5px] leading-tight text-muted-foreground">{sub}</span>
    </button>
  );
}

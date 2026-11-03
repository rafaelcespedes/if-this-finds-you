// The tool's on/off switch (with its plain label, an optional hint and an ⓘ tip), as the panel draws it. Shared by the
// tool's panel and the Fonts page, so both look and behave the same. Given `words`, the two states are named instead
// ("Neat only | Any hand"): you read the state rather than decode a switch.
import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import { Segmented, SegmentedItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** An on/off switch with a plain label. */
export function Switch({ label, hint, tip, checked, onChange, words: say }: { label: string; hint?: string; tip?: string; checked: boolean; onChange: (v: boolean) => void; words?: [string, string] }) {
  // the two states as words, one face sliding between them
  if (say) return <WordToggle label={label} tip={tip} say={say} checked={checked} onChange={onChange} />;
  const id = useId();
  const tipId = useId();
  return (
    <div data-row className="flex items-center justify-between gap-3">
      <span className="grid">
        <span className="flex items-center gap-1">
          {/* the words flip it too (a bigger target than the switch alone) */}
          <span id={id} onClick={() => onChange(!checked)} className="cursor-pointer text-[0.8125rem] font-medium select-none">{label}</span>
          {tip && <InfoTip id={tipId} text={tip} />}
        </span>
        {hint && <span className="text-[0.75rem] text-muted-foreground">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        aria-describedby={tip ? tipId : undefined}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring after:absolute after:-inset-2 after:content-['']",
          checked ? 'bg-[var(--mark)]' : 'bg-[var(--switch-off)] shadow-[inset_0_0_0_1.5px_#8a8478]',
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

export function WordToggle({ label, tip, say, checked, onChange }: { label: string; tip?: string; say: [string, string]; checked: boolean; onChange: (v: boolean) => void }) {
  const tipId = useId();
  const name = label === 'Neat hands only' ? 'Hands' : label;
  return (
    <div data-row className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1 text-[13px] font-medium">
        {name}
        {tip && <InfoTip id={tipId} text={tip} />}
      </span>
      <Segmented slide type="single" aria-label={label} data-words="" value={checked ? 'on' : 'off'} onValueChange={(v) => v && onChange(v === 'on')} className="w-[176px]">
        <SegmentedItem value="on">{say[0]}</SegmentedItem>
        <SegmentedItem value="off">{say[1]}</SegmentedItem>
      </Segmented>
    </div>
  );
}

/** A small ⓘ beside a label: its explanation on hover or focus, and on a tap (phones). Never flips what it's next to. */
export function InfoTip({ id, text }: { id: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="What this does"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          className="relative grid size-5 place-items-center rounded-full text-faint transition-colors duration-150 after:absolute after:-inset-2.5 after:content-[''] hover-device:hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <Info aria-hidden className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent id={id} className="max-w-[240px]">{text}</TooltipContent>
    </Tooltip>
  );
}

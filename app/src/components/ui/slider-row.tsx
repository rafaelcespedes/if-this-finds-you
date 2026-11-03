// The tool's slider row: a label, the value in plain words, the slider, and what each end does. Shared by the tool's
// panel and the Fonts page.
import { memo, useId } from 'react';
import { Slider } from '@/components/ui/slider';

export function Soon() {
  return (
    <span className="rounded-full bg-[#ebe6dc] px-1.5 py-px text-[0.6875rem] leading-4 text-muted-foreground" title="Wired up, waiting for the engine">
      soon
    </span>
  );
}

export const SliderRow = memo(function SliderRow({
  label, value, min, max, step, describe, onChange, mark, onReset, soon, hint, ends,
}: {
  label: string; value: number; min: number; max: number; step: number; describe: (v: number) => string;
  onChange: (v: number) => void; mark?: number; onReset?: () => void; soon?: boolean; hint?: string;
  /** what each end does, in plain words ("Messy", "Neat"), under the track */
  ends?: [string, string];
}) {
  const id = useId();
  const word = describe(value);
  return (
    <div data-row className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span id={id} className="flex items-center gap-1.5 text-[0.8125rem] font-medium">
          {label}
          {soon && <Soon />}
        </span>
        <span className="tabular text-[0.8125rem] text-muted-foreground" aria-hidden>
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
      {ends && (
        <span aria-hidden className="-mt-1 flex justify-between text-[0.7188rem] text-faint pointer-coarse:-mt-2">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </span>
      )}
      {hint && <span className="-mt-0.5 text-[0.75rem] text-muted-foreground">{hint}</span>}
    </div>
  );
});

// How you're writing, next to the writing: one small menu under the sheet. The mode (Ink, Pencil, Fair copy),
// what you can do with the sheet (a fair copy, a fresh sheet, a blank page instead of a found letter), the
// signature, and editing the text plainly. The look lives in the panel; this is about the writing.
import { Check, ChevronDown } from 'lucide-react';
import { useRef } from 'react';
import { DropdownMenu } from 'radix-ui';
import { menuContent, menuItem } from '@/components/ui/menu';
import { cn } from '@/lib/utils';

export type WritingMode = 'ink' | 'pencil' | 'fair';

interface Props {
  /** Ink mode exists (the engine writes in ink) */
  inkAvailable: boolean;
  mode: WritingMode;
  onMode: (m: WritingMode) => void;
  /** anything written in ink yet (a fair copy and a fresh sheet need it) */
  inkLetter: boolean;
  onFairCopy: () => void;
  onFreshSheet: () => void;
  /** a found letter is on the page: a blank page instead */
  onBlankPage?: () => void;
  signed: boolean;
  onSign: () => void;
  plainText: boolean;
  onPlainText: () => void;
  /** after a choice: back to the letter if it was in use (true when it took the focus from the menu's button) */
  onAfter?: () => boolean;
}

const LABEL: Record<WritingMode, string> = { ink: 'In ink', pencil: 'In pencil', fair: 'Fair copy' };
const HINT: Record<WritingMode, string> = {
  ink: 'What’s written stays; changes are crossed out by hand',
  pencil: 'Rubs out: changes are written again',
  fair: 'Every change redraws the page cleanly',
};

export function WritingMenu(p: Props) {
  // a choice made (not Escape, not a click away): the writing carries on where it was
  const chose = useRef(false);
  const pick = (fn: () => void) => () => { chose.current = true; fn(); };
  const item = menuItem;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="group inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[0.7812rem] text-muted-foreground transition-colors duration-150 hover-device:hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring pointer-coarse:py-3"
        >
          {p.inkAvailable ? LABEL[p.mode] : 'Writing'}
          <ChevronDown aria-hidden className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          onCloseAutoFocus={(e) => {
            if (chose.current && p.onAfter?.()) e.preventDefault();
            chose.current = false;
          }}
          className={cn(menuContent, 'w-[272px]')}
        >
          {p.inkAvailable && (
            <>
              <DropdownMenu.RadioGroup value={p.mode} onValueChange={(v) => pick(() => p.onMode(v as WritingMode))()}>
                {(['ink', 'pencil', 'fair'] as WritingMode[]).map((m) => (
                  <DropdownMenu.RadioItem key={m} value={m} className={cn(item, 'items-start')}>
                    <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
                      <DropdownMenu.ItemIndicator><Check className="size-4 text-[var(--ink)]" aria-hidden /></DropdownMenu.ItemIndicator>
                    </span>
                    <span className="grid">
                      <span>{LABEL[m]}</span>
                      <span className="text-[0.75rem] leading-snug text-muted-foreground">{HINT[m]}</span>
                    </span>
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
              <DropdownMenu.Separator className="mx-2 my-1 h-px bg-border" />
            </>
          )}
          {p.inkAvailable && p.mode === 'ink' && p.inkLetter && (
            <>
              <DropdownMenu.Item className={item} onSelect={pick(p.onFairCopy)}><span className="w-4" />Make a fair copy</DropdownMenu.Item>
              <DropdownMenu.Item className={item} onSelect={pick(p.onFreshSheet)}><span className="w-4" />Fresh sheet</DropdownMenu.Item>
            </>
          )}
          {p.onBlankPage && <DropdownMenu.Item className={item} onSelect={pick(p.onBlankPage)}><span className="w-4" />Blank page</DropdownMenu.Item>}
          <DropdownMenu.Item className={item} onSelect={pick(p.onSign)}>
            <span className="grid w-4 place-items-center">{p.signed && <Check className="size-4 text-[var(--ink)]" aria-hidden />}</span>
            {p.signed ? 'Signed' : 'Sign it'}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={p.onPlainText}>
            <span className="w-4" />{p.plainText ? 'Hide the plain text' : 'Edit as plain text'}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

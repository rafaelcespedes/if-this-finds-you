// How you're writing, next to the writing: one small menu under the sheet. The mode (Ink, Pencil, Fair copy),
// what you can do with the sheet (a fair copy, a fresh sheet, a blank page instead of a found letter), the
// signature, and editing the text plainly. The look lives in the panel; this is about the writing.
// On the overlay system (ui/sheet.tsx): a menu on desktop, a sheet on phones.
import { ChevronDown } from 'lucide-react';
import { ActionSheet, type SheetEntry } from '@/components/ui/sheet';

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
  const entries: SheetEntry[] = [];
  if (p.inkAvailable) {
    for (const m of ['ink', 'pencil', 'fair'] as WritingMode[]) {
      entries.push({ id: m, label: LABEL[m], hint: HINT[m], checked: p.mode === m, onSelect: () => p.onMode(m) });
    }
    entries.push({ kind: 'separator', id: 's1' });
  }
  if (p.inkAvailable && p.mode === 'ink' && p.inkLetter) {
    entries.push({ id: 'fair-copy', label: 'Make a fair copy', checked: false, onSelect: p.onFairCopy });
    entries.push({ id: 'fresh', label: 'Fresh sheet', checked: false, onSelect: p.onFreshSheet });
  }
  if (p.onBlankPage) entries.push({ id: 'blank', label: 'Blank page', checked: false, onSelect: p.onBlankPage });
  entries.push({ id: 'sign', label: p.signed ? 'Signed' : 'Sign it', checked: p.signed, onSelect: p.onSign });
  entries.push({ id: 'plain', label: p.plainText ? 'Hide the plain text' : 'Edit as plain text', checked: false, onSelect: p.onPlainText });
  return (
    <ActionSheet
      title="How you’re writing"
      entries={entries}
      side="top"
      width="w-[272px]"
      // a choice made (not Escape, not a click away): the writing carries on where it was
      onAfterChoice={p.onAfter}
      trigger={
        <button
          type="button"
          className="group inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[0.7812rem] text-muted-foreground transition-[color,transform] duration-150 hover-device:hover:text-foreground active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring pointer-coarse:min-h-11 pointer-coarse:py-3"
        >
          {p.inkAvailable ? LABEL[p.mode] : 'Writing'}
          <ChevronDown aria-hidden className="size-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      }
    />
  );
}

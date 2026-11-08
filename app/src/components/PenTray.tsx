import { useState } from 'react';
import { Check, MailOpen, PenLine, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  /** visible area (above the on-screen keyboard), from the visual viewport */
  viewport: { top: number; height: number };
  signed: boolean;
  onUnderline: () => void;
  onPress: () => void;
  onPS: () => void;
  onSign: () => void;
  onDone: () => void;
  /** Ink mode: the pen corrects on its own; Undo lifts only wet ink */
  ink?: boolean;
  onUndo?: () => void;
  /** how you're writing (when the engine writes in ink): Ink, Pencil or Fair copy */
  mode?: 'ink' | 'pencil' | 'fair';
  onMode?: (m: 'ink' | 'pencil' | 'fair') => void;
  /** Ink mode, with something written: a clean copy on a fresh sheet */
  onFairCopy?: () => void;
  /** a reply: their letter pulls down above the keyboard (and goes back up) */
  onTheirLetter?: () => void;
  theirOpen?: boolean;
}

/**
 * The pen tray (editor-ux.md §3.4): one 44 px row floating 8 px above the phone keyboard while writing.
 * Pen (formatting a pen can do), undo, and Done. Its buttons never take focus from the paper.
 */
export function PenTray({ viewport, signed, onUnderline, onPress, onPS, onSign, onDone, ink, onUndo, mode, onMode, onFairCopy, onTheirLetter, theirOpen }: Props) {
  const [menu, setMenu] = useState(false);
  const keep = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault(); // the keyboard stays up
  const top = Math.max(8, viewport.top + viewport.height - 44 - 8);
  const item = (label: string, run: () => void) => (
    <button
      type="button"
      onPointerDown={keep}
      onMouseDown={keep}
      onClick={() => { run(); setMenu(false); }}
      className="flex h-11 w-full items-center rounded-lg px-3 text-left text-[0.9375rem] transition-colors duration-150 active:bg-accent"
    >
      {label}
    </button>
  );
  return (
    <div className="fixed inset-x-0 z-40 px-3" style={{ top }}>
      {menu && (
        <div
          className="absolute bottom-[52px] left-3 w-64 rounded-2xl bg-[color-mix(in_oklab,var(--panel)_96%,transparent)] p-1.5 shadow-[0_10px_30px_-10px_rgba(60,45,20,0.4)] backdrop-blur-md animate-in fade-in-0 slide-in-from-bottom-1 duration-150"
          role="menu"
        >
          {mode && onMode && (
            <div role="group" aria-label="Writing in" className="mb-1 grid grid-cols-3 gap-0.5 rounded-xl bg-secondary p-0.5">
              {(['ink', 'pencil', 'fair'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onPointerDown={keep}
                  onMouseDown={keep}
                  onClick={() => onMode(m)}
                  className={cn('h-10 rounded-[3px] text-[0.8125rem] font-medium transition-colors duration-150', mode === m ? 'bg-[#fffefb] text-foreground shadow-[0_1px_2px_rgba(40,30,10,0.12)]' : 'text-muted-foreground')}
                >
                  {m === 'ink' ? 'Ink' : m === 'pencil' ? 'Pencil' : 'Fair copy'}
                </button>
              ))}
            </div>
          )}
          {!ink && item('Underline', onUnderline)}
          {!ink && item('Press harder', onPress)}
          {item('Add a P.S.', onPS)}
          {item(signed ? 'Remove signature' : 'Sign it', onSign)}
          {onFairCopy && item('Make a copy', onFairCopy)}
        </div>
      )}
      <div className="mx-auto flex h-11 max-w-[560px] items-center gap-1 rounded-[22px] bg-[color-mix(in_oklab,var(--panel)_94%,transparent)] px-1 shadow-[0_1px_2px_rgba(60,45,20,0.08),0_10px_28px_-12px_rgba(60,45,20,0.38)] backdrop-blur-md">
        <button
          type="button"
          aria-expanded={menu}
          aria-label="Pen"
          onPointerDown={keep}
          onMouseDown={keep}
          onClick={() => setMenu((m) => !m)}
          className={cn("relative flex h-9 items-center gap-1.5 rounded-full px-3 text-[0.875rem] transition-colors duration-150 after:absolute after:-inset-x-1 after:-inset-y-1 after:content-['']", menu ? 'bg-accent' : 'active:bg-accent')}
        >
          <PenLine className="size-4" aria-hidden /> Pen
        </button>
        <button
          type="button"
          aria-label="Undo"
          onPointerDown={keep}
          onMouseDown={keep}
          onClick={() => (onUndo ? onUndo() : document.execCommand('undo'))}
          className="relative grid size-9 place-items-center rounded-full transition-colors duration-150 after:absolute after:-inset-1 after:content-[''] active:bg-accent"
        >
          <Undo2 className="size-4" aria-hidden />
        </button>
        {onTheirLetter && (
          <button
            type="button"
            aria-expanded={theirOpen}
            onPointerDown={keep}
            onMouseDown={keep}
            onClick={onTheirLetter}
            className={cn("relative flex h-9 items-center gap-1.5 rounded-full px-3 text-[0.875rem] transition-colors duration-150 after:absolute after:-inset-x-1 after:-inset-y-1 after:content-['']", theirOpen ? 'bg-accent' : 'active:bg-accent')}
          >
            <MailOpen className="size-4" aria-hidden /> Their letter
          </button>
        )}
        <span className="flex-1" />
        <Button size="sm" className="h-9 rounded-full px-4" onPointerDown={keep} onMouseDown={keep} onClick={onDone}>
          <Check aria-hidden /> Done
        </Button>
      </div>
    </div>
  );
}

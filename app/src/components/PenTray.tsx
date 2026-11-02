import { useState } from 'react';
import { Check, PenLine, Undo2 } from 'lucide-react';
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
}

/**
 * The pen tray (editor-ux.md §3.4): one 44 px row floating 8 px above the phone keyboard while writing.
 * Pen (formatting a pen can do), undo, and Done. Its buttons never take focus from the paper.
 */
export function PenTray({ viewport, signed, onUnderline, onPress, onPS, onSign, onDone }: Props) {
  const [menu, setMenu] = useState(false);
  const keep = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault(); // the keyboard stays up
  const top = Math.max(8, viewport.top + viewport.height - 44 - 8);
  const item = (label: string, run: () => void) => (
    <button
      type="button"
      onPointerDown={keep}
      onMouseDown={keep}
      onClick={() => { run(); setMenu(false); }}
      className="flex h-11 w-full items-center rounded-lg px-3 text-left text-[15px] transition-colors duration-150 active:bg-accent"
    >
      {label}
    </button>
  );
  return (
    <div className="fixed inset-x-0 z-40 px-3" style={{ top }}>
      {menu && (
        <div
          className="absolute bottom-[52px] left-3 w-56 rounded-2xl bg-[color-mix(in_oklab,var(--panel)_96%,transparent)] p-1.5 shadow-[0_10px_30px_-10px_rgba(60,45,20,0.4)] backdrop-blur-md animate-in fade-in-0 slide-in-from-bottom-1 duration-150"
          role="menu"
        >
          {item('Underline', onUnderline)}
          {item('Press harder', onPress)}
          {item('Add a P.S.', onPS)}
          {item(signed ? 'Remove signature' : 'Sign it', onSign)}
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
          className={cn("relative flex h-9 items-center gap-1.5 rounded-full px-3 text-[14px] transition-colors duration-150 after:absolute after:-inset-x-1 after:-inset-y-1 after:content-['']", menu ? 'bg-accent' : 'active:bg-accent')}
        >
          <PenLine className="size-4" aria-hidden /> Pen
        </button>
        <button
          type="button"
          aria-label="Undo"
          onPointerDown={keep}
          onMouseDown={keep}
          onClick={() => document.execCommand('undo')}
          className="relative grid size-9 place-items-center rounded-full transition-colors duration-150 after:absolute after:-inset-1 after:content-[''] active:bg-accent"
        >
          <Undo2 className="size-4" aria-hidden />
        </button>
        <span className="flex-1" />
        <Button size="sm" className="h-9 rounded-full px-4" onPointerDown={keep} onMouseDown={keep} onClick={onDone}>
          <Check aria-hidden /> Done
        </Button>
      </div>
    </div>
  );
}

// Every key the writing app answers to, on one card (⌘/ or More ▸ Keyboard shortcuts). Most of what the hand can do
// is on the keyboard, and some of it (pressing Backspace again on a crossed-out word) can't be guessed: this is where
// it's all written down.
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';

export type ShortcutRow = { keys: string[]; does: string };
export type ShortcutGroup = { title: string; rows: ShortcutRow[] };

export function shortcutGroups(mod: string, extra: ShortcutGroup[] = []): ShortcutGroup[] {
  return [
    {
      title: 'Writing in ink',
      rows: [
        { keys: ['⌫'], does: 'Before the pen gets there, it’s gone. After, the word is crossed out' },
        { keys: ['⌫', '⌫'], does: 'Again on a crossed-out word: crossed out harder. Hold it to scribble it out' },
        { keys: [`${mod}Z`], does: 'Lifts ink while it’s wet. On a dry crossing-out, writes stet and brings the word back' },
        { keys: [`${mod}B`], does: 'Goes over the selected words again; with none, what you type next is pressed harder' },
        { keys: [`${mod}I`], does: 'What you type next leans in' },
        { keys: [`${mod}U`], does: 'Underlines them by hand (twice for a double underline)' },
        { keys: [`⇧${mod}E`], does: 'Highlights them, under the ink' },
        { keys: [`${mod}↩`], does: 'A P.S.' },
      ],
    },
    {
      title: 'Lines, the writer’s own way',
      rows: [
        { keys: ['#', 'space'], does: `A title (⌥${mod}1). ## for a heading (⌥${mod}2), ⌥${mod}0 back to plain` },
        { keys: ['-', 'space'], does: `A list with the writer’s own bullet (⇧${mod}7); 1. for numbers (⇧${mod}9)` },
        { keys: ['[]', 'space'], does: `A checklist (⇧${mod}L). Click a box, or ⇧${mod}U, to tick it` },
        { keys: ['↩', '↩'], does: 'Return on an empty item ends the list' },
      ],
    },
    ...extra,
    {
      title: 'Letters',
      rows: [
        { keys: [`⌥${mod}N`], does: 'A new letter' },
        { keys: [`${mod}\\`], does: 'Show or hide your letters' },
        { keys: [`${mod}.`], does: 'Hide the toolbar (Esc brings it back)' },
        { keys: [`${mod}S`], does: 'Everything is kept as you go; this says so' },
        { keys: [`${mod}/`], does: 'These shortcuts' },
      ],
    },
  ];
}

export function Shortcuts({ open, onOpenChange, groups }: { open: boolean; onOpenChange: (o: boolean) => void; groups: ShortcutGroup[] }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="wr-dialog-scrim" />
        <Dialog.Content className="wr-dialog" aria-describedby={undefined}>
          <div className="wr-dialog-head">
            <Dialog.Title>Keyboard shortcuts</Dialog.Title>
            <Dialog.Close className="wr-icon" aria-label="Close"><X aria-hidden /></Dialog.Close>
          </div>
          {groups.map((g) => (
            <section key={g.title} className="wr-keys">
              <h3>{g.title}</h3>
              <dl>
                {g.rows.map((r) => (
                  <div key={r.does}>
                    <dt>{r.keys.map((k, i) => <kbd key={i}>{k}</kbd>)}</dt>
                    <dd>{r.does}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Formatting by hand. The words people know from Notes (Title, Heading, Bold, Underline, a checklist), done the way a
// hand does them: a title is written the way this writer writes one (underlined, in capitals, centred), Bold goes
// over the words again, Italic leans them in, a checklist's box is drawn and its tick drawn when you tick it, and the
// highlighter is a felt swipe under the ink.
//
// Three speeds (docs/WRITING.md): what's typed next changes at once; marks on written words are made by the pen going
// back; a line already in ink keeps its style (ink can't be re-set).
import { Bold, Check, Highlighter, Italic, List, ListOrdered, ListTodo, Underline } from 'lucide-react';
import type { FormatCommand } from '@/components/PaperEditor';
import type { InkFormat, InkHighlight } from '@/lib/ink';

export const HIGHLIGHTERS: { id: InkHighlight; name: string; color: string }[] = [
  { id: 'yellow', name: 'Yellow', color: '#f7e14a' },
  { id: 'pink', name: 'Pink', color: '#f59ac0' },
  { id: 'green', name: 'Green', color: '#9be27f' },
  { id: 'blue', name: 'Blue', color: '#8fd0f5' },
];

/** the style at the caret, in a word, for the Aa button */
export function styleName(f: InkFormat | null): string {
  if (!f) return 'Body';
  if (f.list === 'check') return 'Checklist';
  if (f.list === 'bullet' || f.list === 'number') return 'List';
  return f.role === 'title' ? 'Title' : f.role === 'heading' ? 'Heading' : 'Body';
}

interface Props {
  fmt: InkFormat | null;
  clean: boolean;
  mod: string;
  highlighter: InkHighlight;
  onHighlighter: (h: InkHighlight) => void;
  run: (cmd: FormatCommand) => void;
}

export function FormatPanel({ fmt, clean, mod, highlighter, onHighlighter, run }: Props) {
  const line = !clean && (fmt?.canFormatLine ?? true);
  const roleOn = (r: string) => !!fmt && !fmt.list && fmt.role === r;
  return (
    <div className="wr-format">
      <section aria-label="Line">
        <div className="wr-styles" role="radiogroup" aria-label="Style of this line">
          <button type="button" role="radio" aria-checked={roleOn('title')} className="wr-style wr-style-title" disabled={!line} onClick={() => run('title')} title={`Title  ⌥${mod}1`}>Title</button>
          <button type="button" role="radio" aria-checked={roleOn('heading')} className="wr-style wr-style-heading" disabled={!line} onClick={() => run('heading')} title={`Heading  ⌥${mod}2`}>Heading</button>
          <button type="button" role="radio" aria-checked={roleOn('body')} className="wr-style" disabled={!line} onClick={() => run('body')} title={`Body  ⌥${mod}0`}>Body</button>
        </div>
        <div className="wr-lists">
          <button type="button" className="wr-btn" aria-pressed={fmt?.list === 'bullet'} disabled={!line} onClick={() => run('bullets')} title={`Bulleted list  ⇧${mod}7`}><List aria-hidden /> List</button>
          <button type="button" className="wr-btn" aria-pressed={fmt?.list === 'number'} disabled={!line} onClick={() => run('numbers')} title={`Numbered list  ⇧${mod}9`}><ListOrdered aria-hidden /> Numbers</button>
          <button type="button" className="wr-btn" aria-pressed={fmt?.list === 'check'} disabled={!line} onClick={() => run('checklist')} title={`Checklist  ⇧${mod}L`}><ListTodo aria-hidden /> Checklist</button>
        </div>
        {!clean && fmt && !fmt.canFormatLine && <p className="wr-format-note">This line is already in ink. Titles and lists start on a new line.</p>}
        {clean && <p className="wr-format-note">Titles, lists and the highlighter are written in ink for now.</p>}
      </section>
      <section aria-label="Words">
        <div className="wr-lists">
          <button type="button" className="wr-btn" aria-pressed={!!fmt?.weight} onClick={() => run('weight')} title={`Pressed harder: what you type next. On a selection, the pen goes over it.  ${mod}B`}><Bold aria-hidden /> Press harder</button>
          <button type="button" className="wr-btn" aria-pressed={!!fmt?.lean} disabled={clean} onClick={() => run('lean')} title={`Leaning in: what you type next  ${mod}I`}><Italic aria-hidden /> Lean</button>
          <button type="button" className="wr-btn" onClick={() => run('underline')} title={`Underlined by hand (twice for double)  ${mod}U`}><Underline aria-hidden /> Underline</button>
        </div>
      </section>
      {!clean && (
        <section aria-label="Highlighter" className="wr-hls">
          <button type="button" className="wr-btn" onClick={() => run('highlight')} title={`Highlight the selection  ⇧${mod}E`}><Highlighter aria-hidden /> Highlight</button>
          <div className="wr-hl-colors" role="radiogroup" aria-label="Highlighter colour">
            {HIGHLIGHTERS.map((h) => (
              <button key={h.id} type="button" role="radio" aria-checked={highlighter === h.id} aria-label={h.name} title={h.name} className="wr-hl" style={{ background: h.color }} onClick={() => onHighlighter(h.id)}>
                {highlighter === h.id && <Check aria-hidden />}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

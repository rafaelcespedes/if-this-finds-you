// Formatting by hand. The words people know from Notes (Title, Heading, Bold, Underline, a checklist), done the way a
// hand does them: a title is written the way this writer writes one (underlined, in capitals, centred), Bold goes
// over the words again, Italic leans them in, a checklist's box is drawn and its tick drawn when you tick it, and the
// highlighter is a felt swipe under the ink.
//
// Three speeds (docs/WRITING.md): what's typed next changes at once; marks on written words are made by the pen going
// back; a line already in ink keeps its style (ink can't be re-set).
//
// The panel (Rafael, 7 Nov): one grid of three columns, every control a tile of one height and radius, one way of
// showing what's on (filled, as the writer panel's chips), a disabled tile plainly off (never filled); Title, Heading
// and Body in the writer's own hand, in the UI's type only while the sample is written.
import { useId } from 'react';
import { Bold, Check, Highlighter, Italic, List, ListOrdered, ListTodo, Underline } from 'lucide-react';
import { makeHand, type Hand } from '@engine';
import { Specimen } from '@/components/Specimen';
import type { FormatCommand } from '@/components/PaperEditor';
import type { InkFormat, InkHighlight } from '@/lib/ink';
import type { Look } from './notes';

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

/** the line styles, each written in the writer's hand at its own size (the sample's em, px) */
const STYLES = [
  { cmd: 'title', label: 'Title', em: 20, keys: '⌥{mod}1' },
  { cmd: 'heading', label: 'Heading', em: 17, keys: '⌥{mod}2' },
  { cmd: 'body', label: 'Body', em: 15, keys: '⌥{mod}0' },
] as const;

/** a word in the writer's hand; the UI's type until it's written */
function InHand({ look, text, em }: { look: Look; text: string; em: number }) {
  return (
    <span className="wr-tile-hand" style={{ '--em': `${em}px` } as React.CSSProperties}>
      <Specimen
        sampleKey={`style|${look.seed}|${look.style}`}
        hand={() => makeHand(look.seed, look.style) as Hand}
        recipe={{ seed: look.seed, style: look.style }}
        text={text}
        emPx={em}
        color="inherit"
        className="wr-tile-sample"
      />
      <span className="wr-tile-fallback">{text}</span>
    </span>
  );
}

interface Props {
  fmt: InkFormat | null;
  clean: boolean;
  mod: string;
  highlighter: InkHighlight;
  onHighlighter: (h: InkHighlight) => void;
  run: (cmd: FormatCommand) => void;
  /** the writer, for Title, Heading and Body in their hand */
  look: Look;
}

export function FormatPanel({ fmt, clean, mod, highlighter, onHighlighter, run, look }: Props) {
  const line = !clean && (fmt?.canFormatLine ?? true);
  const roleOn = (r: string) => !!fmt && !fmt.list && fmt.role === r;
  const hl = HIGHLIGHTERS.find((h) => h.id === highlighter)?.color;
  const id = useId();
  return (
    <div className="wr-format">
      <section aria-labelledby={id + 'line'}>
        <h3 className="wr-format-label" id={id + 'line'}>Line</h3>
        <div className="wr-tiles" role="radiogroup" aria-label="Style of this line">
          {STYLES.map((s) => (
            <button key={s.cmd} type="button" role="radio" aria-checked={roleOn(s.cmd)} aria-label={s.label} className="wr-tile wr-tile-style" disabled={!line} onClick={() => run(s.cmd)} title={`${s.label}  ${s.keys.replace('{mod}', mod)}`}>
              <InHand look={look} text={s.label} em={s.em} />
            </button>
          ))}
        </div>
        <div className="wr-tiles">
          <button type="button" className="wr-tile" aria-pressed={fmt?.list === 'bullet'} disabled={!line} onClick={() => run('bullets')} title={`Bulleted list  ⇧${mod}7`}><List aria-hidden /> List</button>
          <button type="button" className="wr-tile" aria-pressed={fmt?.list === 'number'} disabled={!line} onClick={() => run('numbers')} title={`Numbered list  ⇧${mod}9`}><ListOrdered aria-hidden /> Numbers</button>
          <button type="button" className="wr-tile" aria-pressed={fmt?.list === 'check'} disabled={!line} onClick={() => run('checklist')} title={`Checklist  ⇧${mod}L`}><ListTodo aria-hidden /> Checklist</button>
        </div>
        {!clean && fmt && !fmt.canFormatLine && <p className="wr-format-note">This line is already in ink. Titles and lists start on a new line.</p>}
        {clean && <p className="wr-format-note">Titles, lists and the highlighter are written in ink for now.</p>}
      </section>
      <section aria-labelledby={id + 'words'}>
        <h3 className="wr-format-label" id={id + 'words'}>Words</h3>
        <div className="wr-tiles">
          <button type="button" className="wr-tile" aria-pressed={!!fmt?.weight} onClick={() => run('weight')} title={`Pressed harder: what you type next. On a selection, the pen goes over it.  ${mod}B`}><Bold aria-hidden /> Press harder</button>
          <button type="button" className="wr-tile" aria-pressed={!!fmt?.lean} disabled={clean} onClick={() => run('lean')} title={`Leaning in: what you type next  ${mod}I`}><Italic aria-hidden /> Lean</button>
          <button type="button" className="wr-tile" onClick={() => run('underline')} title={`Underlined by hand (twice for double)  ${mod}U`}><Underline aria-hidden /> Underline</button>
        </div>
      </section>
      {!clean && (
        <section aria-labelledby={id + 'hl'}>
          <h3 className="wr-format-label" id={id + 'hl'}>Highlighter</h3>
          <div className="wr-tiles">
            <div className="wr-hl-colors" role="radiogroup" aria-label="Highlighter colour">
              {HIGHLIGHTERS.map((h) => (
                <button key={h.id} type="button" role="radio" aria-checked={highlighter === h.id} aria-label={h.name} title={h.name} className="wr-hl" onClick={() => onHighlighter(h.id)}>
                  <span className="wr-hl-dot" style={{ background: h.color }}>{highlighter === h.id && <Check aria-hidden />}</span>
                </button>
              ))}
            </div>
            <button type="button" className="wr-tile" onClick={() => run('highlight')} title={`Highlight the selection  ⇧${mod}E`}>
              <span className="wr-tile-hl" style={{ '--hl': hl } as React.CSSProperties}><Highlighter aria-hidden /></span> Highlight
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

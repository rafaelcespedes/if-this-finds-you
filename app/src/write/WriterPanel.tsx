// The writer: this app's font menu. The writer's name, written in their own hand, opens it. Inside, your own words
// written by other writers (pick one and the note is written again in their hand), then the pen, the ink, the paper
// and the size. A writer change keeps your pen, ink and paper, the way a font change keeps your page.
import { memo, useEffect, useId, useMemo, useRef } from 'react';
import { Shuffle, Users } from 'lucide-react';
import { makeHand } from '@engine';
import { Specimen } from '@/components/Specimen';
import { describeHand, pickSimilarHand, writerName } from '@/lib/hands';
import { PEN_CHOICES } from '@/lib/pens';
import { INK_FAMILIES, inkColor } from '@/lib/inks';
import { ALL_PAPERS, PAPERS, getPaper } from '@/lib/papers';
import { PEN_SIZES } from '@/lib/controls';
import LOOKS from '@/lib/first-looks.json';
import type { Hand } from '@engine';
import type { Look } from './notes';

const WRITERS = (LOOKS as Look[]).filter((l) => l.pen !== 'pencil');
const PENS = PEN_CHOICES.filter((p) => p.id !== 'pencil');
const INKS = INK_FAMILIES.filter((i) => !i.pen);

/** the writer's name in their own hand, for the toolbar */
export const WriterName = memo(function WriterName({ look, color, emPx = 15 }: { look: Look; color: string; emPx?: number }) {
  const name = writerName(look.seed);
  return (
    <Specimen
      sampleKey={`name|${look.seed}|${look.style}`}
      hand={() => makeHand(look.seed, look.style) as Hand}
      recipe={{ seed: look.seed, style: look.style }}
      text={name}
      emPx={emPx}
      color={color}
      className="wr-name-hand"
    />
  );
});

interface Props {
  look: Look;
  /** the words to write in each hand: the selection, the line at the caret, or the note's first line */
  sample: string;
  hand: Hand;
  onLook: (patch: Partial<Look>) => void;
  onAnother: () => void;
}

/** A fade at the foot of the panel while there's more of it to scroll to (none once you're at the end): the panel is
 *  capped to the window, and a list cut off by the window's edge doesn't say there's more. */
function ScrollFade() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    let box = el?.parentElement ?? null;
    while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    if (!el || !box) return;
    const scroller = box;
    const check = () => el.toggleAttribute('data-end', scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2);
    check();
    scroller.addEventListener('scroll', check, { passive: true });
    // (the samples come in a moment later, and the window can change)
    const ro = new ResizeObserver(check);
    ro.observe(scroller);
    if (el.previousElementSibling) ro.observe(el.previousElementSibling);
    return () => { scroller.removeEventListener('scroll', check); ro.disconnect(); };
  }, []);
  return <div ref={ref} aria-hidden className="wr-fade" />;
}

export function WriterPanel({ look, sample, hand, onLook, onAnother }: Props) {
  const name = writerName(look.seed);
  const tipId = useId(), kindId = useId();
  const words = (sample.trim() || 'The quick brown fox').slice(0, 42);
  const ink = inkColor(look.ink);
  const others = useMemo(() => WRITERS.filter((w) => w.seed !== look.seed).slice(0, 12), [look.seed]);
  const family = getPaper(look.paper).family ?? look.paper;
  const variants = ALL_PAPERS.filter((p) => (p.family ?? p.id) === family);
  const take = (w: Look) => onLook({ seed: w.seed, style: w.style, offsets: w.offsets });
  return (
    <>
      <div className="wr-writer" style={{ '--sample-ink': ink } as React.CSSProperties}>
        <header className="wr-writer-head">
          <div className="wr-writer-name" style={{ color: ink }}>
            <WriterName look={look} color="inherit" emPx={26} />
            <span className="wr-writer-sub">{name} · {describeHand(hand)}</span>
          </div>
          <div className="wr-writer-moves">
            <button type="button" className="wr-btn" onClick={onAnother}><Shuffle aria-hidden /> Another</button>
            <button type="button" className="wr-btn" onClick={() => onLook({ ...pickSimilarHand(look) })}><Users aria-hidden /> Similar</button>
          </div>
        </header>

        <section className="wr-writer-section" aria-label="Your words in another hand">
          <h3>Your words, by other writers</h3>
          <ul className="wr-hands">
            {others.map((w) => (
              <li key={w.seed}>
                <button type="button" className="wr-hand" onClick={() => take(w)} title={`Write it as ${writerName(w.seed)}`}>
                  <Specimen
                    sampleKey={`hand|${w.seed}|${w.style}`}
                    hand={() => makeHand(w.seed, w.style) as Hand}
                    recipe={{ seed: w.seed, style: w.style }}
                    text={words}
                    emPx={17}
                    color="inherit"
                    className="wr-hand-sample"
                  />
                  <span className="wr-hand-name">{writerName(w.seed)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="wr-writer-section" aria-label="Pen">
          <h3>Pen</h3>
          <div className="wr-chips" role="radiogroup" aria-label="Pen">
            {PENS.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={look.pen === p.id} className="wr-chip" onClick={() => onLook({ pen: p.id })}>{p.name}</button>
            ))}
          </div>
          {/* the tip's chips say so, or they read as more pens (Rafael, 7 Nov) */}
          <div className="wr-chips" role="radiogroup" aria-labelledby={tipId}>
            <span className="wr-chips-label" id={tipId}>Tip</span>
            {PEN_SIZES.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={look.penSize === s.id} className="wr-chip" onClick={() => onLook({ penSize: s.id })}>{s.label}</button>
            ))}
          </div>
        </section>

        <section className="wr-writer-section" aria-label="Ink">
          <h3>Ink</h3>
          <div className="wr-inks" role="radiogroup" aria-label="Ink">
            {INKS.map((i) => (
              <button key={i.id} type="button" role="radio" aria-checked={look.ink === i.id} className="wr-ink" onClick={() => onLook({ ink: i.id })} title={i.name} aria-label={i.name}>
                {/* a stroke of it, not a dot */}
                <svg viewBox="0 0 40 14" aria-hidden><path d="M3 10 C 10 2, 16 2, 20 7 S 31 13, 37 4" fill="none" stroke={i.color} strokeWidth="2.6" strokeLinecap="round" /></svg>
              </button>
            ))}
          </div>
        </section>

        <section className="wr-writer-section" aria-label="Paper">
          <h3>Paper</h3>
          <div className="wr-papers" role="radiogroup" aria-label="Paper">
            {PAPERS.map((pp) => (
              <button key={pp.id} type="button" role="radio" aria-checked={family === pp.id} className="wr-paper" onClick={() => onLook({ paper: pp.id })} title={pp.name}>
                <span className="wr-paper-swatch" style={{ background: pp.tint, aspectRatio: `${pp.w} / ${pp.h}` }} />
                <span>{pp.name}</span>
              </button>
            ))}
          </div>
          {variants.length > 1 && (
            <div className="wr-chips" role="radiogroup" aria-labelledby={kindId}>
              <span className="wr-chips-label" id={kindId}>Kind</span>
              {variants.map((v) => (
                <button key={v.id} type="button" role="radio" aria-checked={look.paper === v.id} className="wr-chip" onClick={() => onLook({ paper: v.id })} title={v.hint}>
                  {v.variant ?? 'Standard'}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="wr-writer-section" aria-label="Size">
          <h3>Size</h3>
          <label className="wr-size">
            <span aria-hidden className="wr-size-a">A</span>
            <input type="range" min={0.8} max={1.45} step={0.01} value={look.size} onChange={(e) => onLook({ size: +e.target.value })} aria-label="Writing size" />
            <span aria-hidden className="wr-size-a wr-size-big">A</span>
          </label>
        </section>
      </div>
      <ScrollFade />
    </>
  );
}

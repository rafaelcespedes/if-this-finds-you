// The writer: this app's font menu. The writer's name, written in their own hand, opens it. Inside, your own words
// written by other writers (pick one and the note is written again in their hand), then the pen, the ink, the paper
// and the size. A writer change keeps your pen, ink and paper, the way a font change keeps your page.
//
// The controls (Rafael, 7 Nov; controls.tsx): Pen, Tip and Kind are segmented controls; the ink one strip of paper
// with a stroke of each, a ring sliding to the one in use; the papers drawn to their shape on one foot line; Size a
// slider you can grab anywhere along (SizeSlider). Each section's heading says what's chosen, on its right.
import { memo, useEffect, useId, useMemo, useRef } from 'react';
import { Check, Shuffle, Users } from 'lucide-react';
import { makeHand } from '@engine';
import { Specimen } from '@/components/Specimen';
import { describeHand, pickSimilarHand, writerName } from '@/lib/hands';
import { PEN_CHOICES, penName } from '@/lib/pens';
import { INK_FAMILIES, inkColor, inkName } from '@/lib/inks';
import { ALL_PAPERS, PAPERS, getPaper, type PaperSpec } from '@/lib/papers';
import { PEN_SIZES } from '@/lib/controls';
import LOOKS from '@/lib/first-looks.json';
import type { Hand } from '@engine';
import type { Look } from './notes';
import { Button, Segmented, radioKeys, tabStop, tip, useIndicator } from './controls';
import { SizeSlider } from './SizeSlider';

const WRITERS = (LOOKS as Look[]).filter((l) => l.pen !== 'pencil');
const PENS = PEN_CHOICES.filter((p) => p.id !== 'pencil');
const INKS = INK_FAMILIES.filter((i) => !i.pen);
/** the pens on a grid of four: "Their own" takes two columns when that fills the rows */
const OWN_SPAN = PENS.length % 4 === 3 ? 2 : 1;
/** the nib's size, as a dot */
const NIB: Record<string, number> = { fine: 4, medium: 6, bold: 8 };
/** a name too long for its column, shortened there (the full one is in the heading and the tooltip) */
const SHORT: Record<string, string> = { notebook: 'Notebook' };

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

/** A section's heading, and what's chosen in it on the right */
function Head({ id, title, value }: { id: string; title: string; value?: string }) {
  return (
    <div className="wr-sec-head">
      <h3 id={id}>{title}</h3>
      {/* (the radios say it too: this is for the eye) */}
      {value && <span className="wr-sec-value" aria-hidden>{value}</span>}
    </div>
  );
}

/** (c) The inks: one strip of paper with a stroke of each; a ring slides to the one in use; its name in a tooltip */
function InkStrip({ value, onPick, labelledBy }: { value: string; onPick: (id: string) => void; labelledBy: string }) {
  const group = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  useIndicator(group, ring, value, 'inks');
  const any = INKS.some((i) => i.id === value);
  return (
    <div ref={group} className="wr-inks" role="radiogroup" aria-labelledby={labelledBy} onKeyDown={radioKeys}>
      <span ref={ring} className="wr-ink-ring" aria-hidden />
      {INKS.map((i, n) => (
        <button
          key={i.id}
          type="button"
          role="radio"
          aria-checked={value === i.id}
          aria-label={i.name}
          tabIndex={tabStop(value === i.id, n, any)}
          className="wr-ink"
          style={{ '--ink': i.color } as React.CSSProperties}
          {...tip(i.name, undefined, 'top')}
          onClick={(e) => {
            // the stroke is drawn again as it's picked
            const p = e.currentTarget.querySelector('path');
            if (p) { p.removeAttribute('data-draw'); void p.getBoundingClientRect(); p.setAttribute('data-draw', ''); }
            if (value !== i.id) onPick(i.id);
          }}
        >
          {/* a stroke of it, not a dot */}
          <svg viewBox="0 0 30 12" aria-hidden><path pathLength={40} d="M2 8.5C6.5 2 10.5 2 14 6s7.5 4.5 14-3" /></svg>
        </button>
      ))}
    </div>
  );
}

/** a paper drawn small, to its shape (portrait sheets 42 px tall, landscape cards 40 px wide), with its ruling */
function sheetLook(p: PaperSpec): React.CSSProperties & { '--border-c'?: string } {
  const portrait = p.h >= p.w;
  const H = portrait ? 42 : Math.round((40 * p.h) / p.w);
  const W = portrait ? Math.round((42 * p.w) / p.h) : 40;
  const img: string[] = [], size: string[] = [], pos: string[] = [];
  const layer = (i: string, s = '100% 100%', at = '0 0') => { img.push(i); size.push(s); pos.push(at); };
  const mix = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
  if (p.margin) {
    const x = (W * p.margin.x) / p.w, c = p.margin.color;
    const second = p.margin.double ? `, transparent ${x + 0.6}px ${x + 1.2}px, ${c} ${x + 1.2}px ${x + 1.8}px, transparent ${x + 1.8}px` : `, transparent ${x + 0.6}px`;
    layer(`linear-gradient(to right, transparent ${x}px, ${c} ${x}px ${x + 0.6}px${second})`);
  }
  // printed rules; or, fainter, the guide sheet seen through a thin one (a pad's, airmail's)
  const rules = p.lines ? { ...p.lines, color: p.lines.color } : p.guide ? { ...p.guide, color: mix(p.guide.color, 16) } : null;
  if (rules) {
    const top = Math.max(4, Math.round((H * rules.first) / p.h));
    const bottom = Math.min(H - 2, Math.round((H * rules.last) / p.h) + 1);
    const x0 = 'x0' in rules && rules.x0 != null ? (W * rules.x0) / p.w : 0;
    const x1 = 'x1' in rules && rules.x1 != null ? (W * rules.x1) / p.w : W;
    layer(`repeating-linear-gradient(to bottom, transparent 0 4px, ${rules.color} 4px 4.6px)`, `${x1 - x0}px ${Math.max(5, bottom - top + 4)}px`, `${x0}px ${top - 4}px`);
  }
  if (p.laid) layer(`repeating-linear-gradient(to right, transparent 0 1.6px, ${mix(p.laid.color, 14)} 1.6px 2px)`);
  if (p.postcard) {
    const x = (W * p.postcard.divider) / p.w;
    layer(`linear-gradient(to right, transparent ${x - 0.3}px, ${p.postcard.color} ${x - 0.3}px ${x + 0.3}px, transparent ${x + 0.3}px)`);
    const [sx, sy, sw, sh] = p.postcard.stamp;
    layer(`linear-gradient(${mix(p.postcard.color, 35)}, ${mix(p.postcard.color, 35)})`, `${(W * sw) / p.w}px ${(H * sh) / p.h}px`, `${(W * sx) / p.w}px ${(H * sy) / p.h}px`);
  }
  for (const y of p.folds ?? []) {
    const at = (H * y) / p.h;
    layer(`linear-gradient(to bottom, transparent ${at}px, rgba(0, 0, 0, 0.12) ${at}px ${at + 0.5}px, transparent ${at + 0.5}px)`);
  }
  return {
    width: W,
    height: H,
    backgroundColor: p.tint,
    backgroundImage: img.join(', ') || undefined,
    backgroundSize: size.join(', ') || undefined,
    backgroundPosition: pos.join(', ') || undefined,
    backgroundRepeat: img.length ? 'no-repeat' : undefined,
    ...(p.border ? { '--border-c': p.border.color } : {}),
  };
}

/** (d) The papers: each drawn to its shape on one foot line; the one in use ringed, its name darker */
function PaperGrid({ look, family, onPick, labelledBy }: { look: Look; family: string; onPick: (id: string) => void; labelledBy: string }) {
  const any = PAPERS.some((pp) => pp.id === family);
  return (
    <div className="wr-papers" role="radiogroup" aria-labelledby={labelledBy} onKeyDown={radioKeys}>
      {PAPERS.map((pp, n) => {
        // the paper in use as it is (its kind's tint and ruling); the others as they come
        const shown = pp.id === family ? getPaper(look.paper) : pp;
        return (
          <button
            key={pp.id}
            type="button"
            role="radio"
            aria-checked={family === pp.id}
            aria-label={pp.name}
            tabIndex={tabStop(family === pp.id, n, any)}
            className="wr-paper"
            {...tip(pp.name, undefined, 'top')}
            onClick={() => { if (family !== pp.id) onPick(pp.id); }}
          >
            <span className="wr-paper-stage" aria-hidden>
              <span className="wr-paper-sheet" data-border={shown.border ? '' : undefined} style={sheetLook(shown)} />
            </span>
            <span className="wr-paper-name" aria-hidden>{SHORT[pp.id] ?? pp.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export function WriterPanel({ look, sample, hand, onLook, onAnother }: Props) {
  const name = writerName(look.seed);
  const id = useId();
  const words = (sample.trim() || 'The quick brown fox').slice(0, 42);
  const ink = inkColor(look.ink);
  // the writer in use first, marked; then others to try
  const hands = useMemo(() => [look, ...WRITERS.filter((w) => w.seed !== look.seed).slice(0, 11)], [look.seed, look.style]); // eslint-disable-line react-hooks/exhaustive-deps
  const family = getPaper(look.paper).family ?? look.paper;
  const paper = getPaper(look.paper);
  const variants = ALL_PAPERS.filter((p) => (p.family ?? p.id) === family);
  const take = (w: Look) => onLook({ seed: w.seed, style: w.style, offsets: w.offsets });
  const familyName = PAPERS.find((p) => p.id === family)?.name ?? paper.name;
  return (
    <>
      <div className="wr-writer" style={{ '--sample-ink': ink } as React.CSSProperties}>
        <header className="wr-writer-head">
          <div className="wr-writer-name" style={{ color: ink }}>
            <WriterName look={look} color="inherit" emPx={26} />
            <span className="wr-writer-sub">{name} · {describeHand(hand)}</span>
          </div>
          {/* actions, not choices: buttons */}
          <div className="wr-writer-moves">
            <Button size="sm" icon={<Shuffle aria-hidden />} onClick={onAnother}>Another</Button>
            <Button size="sm" icon={<Users aria-hidden />} onClick={() => onLook({ ...pickSimilarHand(look) })}>Similar</Button>
          </div>
        </header>

        <section className="wr-writer-section" aria-labelledby={id + 'hands'}>
          <Head id={id + 'hands'} title="Your words, by other writers" />
          <ul className="wr-hands">
            {hands.map((w) => {
              const mine = w.seed === look.seed;
              return (
                <li key={w.seed}>
                  <button
                    type="button"
                    className="wr-hand"
                    aria-current={mine || undefined}
                    aria-label={mine ? `${writerName(w.seed)}, writing now` : `Write it as ${writerName(w.seed)}`}
                    onClick={mine ? undefined : () => take(w)}
                  >
                    <Specimen
                      sampleKey={`hand|${w.seed}|${w.style}`}
                      hand={() => makeHand(w.seed, w.style) as Hand}
                      recipe={{ seed: w.seed, style: w.style }}
                      text={words}
                      emPx={17}
                      color="inherit"
                      className="wr-hand-sample"
                    />
                    <span className="wr-hand-name">{mine && <Check aria-hidden />}{writerName(w.seed)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="wr-writer-section" aria-labelledby={id + 'pen'}>
          <Head id={id + 'pen'} title="Pen" value={penName(look.pen)} />
          <Segmented<string>
            aria-labelledby={id + 'pen'}
            cols={4}
            value={look.pen}
            onChange={(pen) => onLook({ pen })}
            options={PENS.map((p, i) => ({ value: p.id, label: p.name, span: i === 0 ? OWN_SPAN : undefined }))}
          />
          {/* the tip's own name, so its choices don't read as more pens (Rafael, 7 Nov) */}
          <p className="wr-sub-head" id={id + 'tip'}>Tip</p>
          <Segmented<string>
            aria-labelledby={id + 'tip'}
            cols={3}
            value={look.penSize}
            onChange={(penSize) => onLook({ penSize })}
            options={PEN_SIZES.map((s) => ({ value: s.id, label: s.label, icon: <i className="wr-nib" aria-hidden style={{ width: NIB[s.id], height: NIB[s.id] }} /> }))}
          />
        </section>

        <section className="wr-writer-section" aria-labelledby={id + 'ink'}>
          <Head id={id + 'ink'} title="Ink" value={inkName(look.ink)} />
          <InkStrip value={look.ink} onPick={(i) => onLook({ ink: i })} labelledBy={id + 'ink'} />
        </section>

        <section className="wr-writer-section" aria-labelledby={id + 'paper'}>
          <Head id={id + 'paper'} title="Paper" value={familyName} />
          <PaperGrid look={look} family={family} onPick={(p) => onLook({ paper: p })} labelledBy={id + 'paper'} />
          {variants.length > 1 && (
            <>
              <p className="wr-sub-head" id={id + 'kind'}>Kind</p>
              <Segmented<string>
                aria-labelledby={id + 'kind'}
                value={look.paper}
                onChange={(p) => onLook({ paper: p })}
                options={variants.map((v) => ({ value: v.id, label: v.variant ?? 'Standard' }))}
              />
              <p className="wr-kind-hint">{paper.hint}</p>
            </>
          )}
        </section>

        <section className="wr-writer-section wr-size-section" aria-label="Size">
          <SizeSlider value={look.size} onChange={(size) => onLook({ size })} />
        </section>
      </div>
      <ScrollFade />
    </>
  );
}

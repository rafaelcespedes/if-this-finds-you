// A set of hands for the Fonts view: `count` writers who pass the filters, as different from each other as the
// filters allow, and always the same for the same set seed and filters (so a set is a link). Runs in the worker.
//
// This is the app's own sampler, built on the engine's seedFrom + lookOf (the look a seed would have, with pen
// locks) and the hand's legibility. When the engine exports its constrained sampler (engine/sampler.js, the
// letter-variety session), sampleFonts() hands over to it and keeps only the naming and the links (fonts.worker.ts).
//
// How a set is drawn, slot by slot: a few candidates that pass the filters (and Neat hands only), then the one
// farthest from every hand already in the set. Each pick is sent as soon as it's made, so rows fill in while the
// rest are still being chosen.
import * as E from '@engine';
import { makeHand, rng, type Hand } from '@engine';
import { filterDefs, filterKey, matches, type Catalogue, type Filters, type Profile } from './filters';

/* eslint-disable @typescript-eslint/no-explicit-any */
const engine = E as unknown as Record<string, any>;

export interface Look {
  seed: string; family: 'print' | 'script'; style: string; pen: string; tip: string; ink: string; paper: string;
  size: number; inkAge?: number; inkVariation?: number; legibility?: number; params: Record<string, number>;
}
export interface Picked { look: Look; hand: Hand; profile: Profile }

const NEAT_MIN: number = typeof engine.NEAT_MIN === 'number' ? engine.NEAT_MIN : 0.5;
const builtInSlant = (style: string): number => (typeof engine.builtInSlant === 'function' ? engine.builtInSlant(style) : 0);
export const neatOpts = (neatOnly: boolean) => (neatOnly ? undefined : { neatOnly: false });

/** The hand a look is written with, exactly as its row, the tool and the font builder see it. */
export function profileOf(look: Look, hand: Hand): Profile {
  return {
    family: look.family,
    style: look.style,
    pen: look.pen,
    neatness: look.params.neatness ?? (hand.neatness as number),
    lean: builtInSlant(look.style) + (look.params.slant ?? (hand.slant as number)),
  };
}

// how different two hands look at a glance: how the letters are built (print or joined, which school), the pen, then
// the traits people notice first (about 1 = clearly someone else)
function distance(a: Picked, b: Picked) {
  const n = (h: Hand, k: string) => (h[k as keyof Hand] as number) ?? 0;
  const d = (x: number, y: number, span: number) => ((x - y) / span) ** 2;
  return Math.sqrt(
    (a.look.family !== b.look.family ? 1.2 : 0) +
    (a.look.style !== b.look.style ? 0.5 : 0) +
    (a.look.pen !== b.look.pen ? 0.18 : 0) +
    (a.look.ink !== b.look.ink ? 0.04 : 0) +
    d(a.profile.neatness, b.profile.neatness, 0.5) * 0.6 +
    d(a.profile.lean, b.profile.lean, 30) +
    d(n(a.hand, 'xHeight'), n(b.hand, 'xHeight'), 0.25) * 0.8 +
    d(n(a.hand, 'width'), n(b.hand, 'width'), 0.4) * 0.8 +
    d(n(a.hand, 'penWidth'), n(b.hand, 'penWidth'), 70) * 0.6 +
    d(n(a.hand, 'pressure'), n(b.hand, 'pressure'), 0.8) * 0.4 +
    d(n(a.hand, 'roundness'), n(b.hand, 'roundness'), 0.8) * 0.3,
  );
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export interface SampleOpts {
  setSeed: string;
  filters: Filters;
  count: number;
  neatOnly: boolean;
  catalogue: Catalogue;
  /** false once a newer set was asked for: stop */
  alive: () => boolean;
  /** each pick, in order, as soon as it's made */
  emit: (p: Picked, index: number) => void;
  /** who the writer is (two rows of a set never share a name) */
  nameOf?: (look: Look) => string;
}

/** Draw a set. Resolves with how many were found and whether the filters ran out of hands first. */
export async function sampleSet(o: SampleOpts): Promise<{ found: number; exhausted: boolean }> {
  const f = o.filters;
  const r = rng(`fonts-set:${o.setSeed}:${filterKey(f)}:${o.neatOnly ? 'neat' : 'any'}`);
  const defs = filterDefs(o.catalogue);
  const fams = (f.family.length ? f.family : ['print', 'script']) as ('print' | 'script')[];
  const styles = f.style.length ? f.style.filter((s) => fams.includes(o.catalogue.styles.find((x) => x.id === s)?.family ?? 'print')) : null;
  const pens = f.pen.length ? f.pen : null;
  const chosen: Picked[] = [];
  const seen = new Set<string>();
  const names = new Set<string>();
  const t0 = performance.now();
  // a few candidates per slot (more is more varied, and slower); a slot gives up after this many draws
  const K = 4;
  const TRIES = 140;
  const BUDGET_MS = 6000;
  let exhausted = false;

  for (let slot = 0; slot < o.count; slot++) {
    if (!o.alive()) return { found: chosen.length, exhausted };
    const cands: Picked[] = [];
    for (let tries = 0; cands.length < K && tries < TRIES; tries++) {
      const seed: string = engine.seedFrom(rng('fonts-seed:' + r()));
      // the tradition (chosen ones in turn, else the family and the writer's own school), the pen (a lock)
      const ask = styles ? styles[Math.floor(r() * styles.length)] : fams[Math.floor(r() * fams.length)];
      const locks = pens ? { pen: pens[Math.floor(r() * pens.length)] } : {};
      const look = engine.lookOf(seed, ask, locks, { neatOnly: o.neatOnly }) as Look;
      const key = `${look.seed}~${look.style}`;
      if (seen.has(key) || (o.nameOf && names.has(o.nameOf(look)))) continue;
      if (o.neatOnly && (look.legibility ?? 1) < NEAT_MIN) continue;
      const hand = makeHand(look.seed, look.style, neatOpts(o.neatOnly));
      const profile = profileOf(look, hand);
      if (!matches(f, profile, defs)) continue;
      cands.push({ look, hand, profile });
    }
    if (!cands.length) { exhausted = true; break; }
    let best = cands[0];
    if (chosen.length) {
      let bestD = -1;
      for (const c of cands) {
        let dmin = Infinity;
        for (const x of chosen) dmin = Math.min(dmin, distance(c, x));
        if (dmin > bestD) { bestD = dmin; best = c; }
      }
    }
    seen.add(`${best.look.seed}~${best.look.style}`);
    if (o.nameOf) names.add(o.nameOf(best.look));
    chosen.push(best);
    o.emit(best, slot);
    if (performance.now() - t0 > BUDGET_MS) { exhausted = slot + 1 < o.count; break; }
    // let render requests (and a newer set) in between picks
    await tick();
  }
  return { found: chosen.length, exhausted };
}



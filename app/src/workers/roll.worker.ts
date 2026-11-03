// Rolls the hands ahead off the main thread (the engine's sampler takes 40-60 ms a hand, several times that on a
// slow phone): the page asks for the next few hands after this one, and the sibling, and gets each as it's rolled.
// Only the newest ask matters: a newer one stops an older one between hands.
import { offsetsForNewHand, type NoteState } from '@/lib/state';
import { rollHand, takeVisitChance, withSample, type LockKey } from '@/lib/roll';
import { pickSimilarHand } from '@/lib/hands';
import type { RollAsk, RollReply } from '@/lib/roll-protocol';

let latest = 0;
const post = (m: RollReply) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<RollAsk>) => {
  const ask = e.data;
  latest = ask.id;
  takeVisitChance(ask.visit);
  if (ask.kind === 'similar') {
    const s = ask.state;
    const look = withSample(s, { ...pickSimilarHand({ seed: s.seed, style: s.style }), offsets: offsetsForNewHand(s.offsets) }, new Set(ask.avoid));
    post({ id: ask.id, kind: 'similar', look });
    return;
  }
  const locked = new Set<LockKey>(ask.locked);
  const avoid = new Set(ask.avoid);
  let s: NoteState = ask.state;
  let i = 0;
  // one hand at a time, so a newer ask (the page moved on) takes over between them
  const step = () => {
    if (ask.id !== latest || i >= ask.n) return;
    const look = rollHand(s, { variety: ask.variety, locked, avoid });
    if (look.sample) avoid.add(look.sample);
    post({ id: ask.id, kind: 'next', index: i, look });
    s = { ...s, ...look };
    i++;
    setTimeout(step, 0);
  };
  step();
};

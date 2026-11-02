import { useEffect, useMemo, useState } from 'react';
import { PenLine, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SheetView } from '@/components/SheetView';
import { LiveSheets } from '@/components/LiveSheets';
import type { Live } from '@/lib/live';
import type { PaperSpec } from '@/lib/papers';
import { GLYPH_STRIDE, type WriteResult } from '@/lib/write-protocol';

interface Props {
  writing: WriteResult | null;
  /** the live page (engines with a pen): the pen writes the letter out for the recipient */
  live?: { live: Live; extras: string[]; inkKey: string | null } | null;
  paper: PaperSpec;
  pxPerMm: number;
  gap: number;
  ink: string;
  name: string;
  onWriteYourOwn: () => void;
}

/**
 * A shared letter (editor-ux.md §3.4, "the letter arrives being written"): no panel, the sheet centred,
 * and on open the letter is written in front of the recipient at about 3x, tap to finish.
 */
export function ReaderView({ writing, live, paper, pxPerMm, gap, ink, name, onWriteYourOwn }: Props) {
  const [token, setToken] = useState(0);
  const [finish, setFinish] = useState(0);
  // play once the writing has arrived, and again on Replay
  useEffect(() => {
    if ((writing || live) && token === 0) setToken(1);
  }, [writing, live, token]);

  // pace: about 3x a real hand, between 2.5 and 6.5 seconds for the whole letter, sheets in turn
  const plan = useMemo(() => {
    if (!writing) return [];
    const per = writing.svgs.map(() => 0);
    for (let i = 0; i < writing.glyphs.length; i += GLYPH_STRIDE) per[writing.glyphs[i]] = (per[writing.glyphs[i]] ?? 0) + 1;
    const chars = per.reduce((a, n) => a + n, 0) || 1;
    const total = Math.min(6.5, Math.max(2.5, chars / 45));
    let delay = 0.25;
    return per.map((n) => {
      const seconds = Math.max(0.4, (n / chars) * total);
      const p = { token, delay, seconds };
      delay += seconds + 0.3;
      return p;
    });
  }, [writing, token]);

  return (
    <>
      {live ? (
        <div className="flex flex-col items-center">
          <LiveSheets
            key={token}
            live={live.live}
            pxPerMm={pxPerMm}
            gapPx={gap}
            ink={ink}
            inkKey={live.inkKey}
            extras={live.extras}
            handKey={`reader:${token}`}
            writeOut
            hold="word"
          />
        </div>
      ) : (
      <div className="flex flex-col items-center" style={{ gap }} onClick={() => setFinish((n) => n + 1)}>
        {(writing ? writing.svgs : [null]).map((svg, i, all) => (
          <SheetView
            key={i}
            paper={paper}
            pxPerMm={pxPerMm}
            svg={svg}
            ink={writing ? writing.inkColor : ink}
            handKey={writing ? writing.handKey : ''}
            intro={false}
            index={i}
            count={all.length}
            play={token > 0 ? plan[i] : null}
            finishToken={finish}
          />
        ))}
      </div>
      )}
      <div className="mx-auto mt-6 flex max-w-[480px] flex-col items-center gap-3 text-center">
        <p className="text-[13px] text-muted-foreground">A letter in {name}’s hand.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setFinish(0); setToken((n) => n + 1); }}>
            <RotateCcw aria-hidden /> Replay
          </Button>
          <Button onClick={onWriteYourOwn}>
            <PenLine aria-hidden /> Write your own
          </Button>
        </div>
      </div>
    </>
  );
}

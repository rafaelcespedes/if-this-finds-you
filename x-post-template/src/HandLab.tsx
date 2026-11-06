// The hand lab: one still of the two hands on the keyboard, to judge their shape (look 'clay') or their glass (look
// 'ghost') without rendering the video. moment 'rest': every finger on its home key; 'press': the right middle finger
// down on I.   npx remotion still src/index.ts HandLab out/lab.png --props='{"look":"clay"}'
import { useLayoutEffect, useRef, useState } from 'react';
import { continueRender, delayRender, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { getPaper } from '@/lib/papers';
import { drawKeyboard, handKeyboard, mmFrame } from './keyboard';
import { PAPER } from './setup';
import { loadHands, loadUiFont, UI_FONT } from './hands/load';
import { HandsView } from './hands/view';
import { DIGITS, anglesOf, rigToWorld, solve, type Angles, type Digit, type Pose, type Side } from './hands/rig';
import { homeOf, homePlacement, onKey } from './hands/home';

export const handLabSchema = z.object({
  moment: z.enum(['rest', 'press']).default('rest'),
  look: z.enum(['clay', 'ghost']).default('clay'),
  /** the keys' size against the plain video's */
  scale: z.number().default(0.75),
});

export const HandLab: React.FC<z.infer<typeof handLabSchema>> = ({ moment, look, scale }) => {
  const { width: S, height: SH } = useVideoConfig();
  const flat = useRef<HTMLCanvasElement>(null), gl = useRef<HTMLCanvasElement>(null);
  const [h] = useState(() => delayRender('hand lab'));
  useLayoutEffect(() => {
    Promise.all([loadHands(), loadUiFont()]).then(([models]) => {
      const kb = handKeyboard(S, SH, scale);
      const f = mmFrame(kb, S);
      const ctx = flat.current!.getContext('2d')!;
      ctx.fillStyle = String((getPaper(PAPER) as { tint?: string }).tint ?? '#f8f6f0');
      ctx.fillRect(0, 0, S, SH);
      const pressed = moment === 'press' ? 'i' : null;
      drawKeyboard(ctx, kb, new Map(pressed ? [[pressed, 1]] : []), UI_FONT);
      const view = new HandsView(gl.current!, models, look);
      const poses = {} as Record<Side, Pose>;
      for (const side of ['L', 'R'] as const) {
        const rig = view.rigs[side];
        const pl = homePlacement(side);
        if (side === 'R' && pressed) pl.mcp.add(onKey('i').sub(onKey('k')).multiplyScalar(0.3));
        const world = rigToWorld(rig, pl);
        const ang = {} as Record<Digit, Angles>;
        for (const d of DIGITS) {
          const t = side === 'R' && d === 'middle-finger' && pressed ? onKey('i', 0.5, 0.6, -1.5) : homeOf(side, d);
          ang[d] = anglesOf(d, ...solve(rig, d, t, world));
        }
        poses[side] = { pl, ang };
      }
      view.render({ poses, PX: f.PX, ox: f.ox, oy: f.oy, under: flat.current! });
      continueRender(h);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <canvas ref={flat} width={S} height={SH} style={{ position: 'absolute', inset: 0 }} />
      <canvas ref={gl} width={S} height={SH} style={{ position: 'absolute', inset: 0 }} />
    </>
  );
};

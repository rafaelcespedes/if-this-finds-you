// A take, as a post video: Rafael on the laptop's camera, then the picture moves down to his hands on the keyboard
// (the phone's video from above), and as he starts typing his hands shrink into the corner and the frame becomes the
// letter he's writing over his own keyboard, with two ghost hands doing exactly what his hands do.
//
// Everything comes from one take of the typing recorder (recorder/; npm run take): the writing (replayed by the
// site's Ink mode, as the recorder showed it), every key down and up, the pointer, and the webcam; plus the phone's
// video, tracked (scripts/track-hands.py, hands-3d.py) and turned into the ghost hands' motion (scripts/take-pose.ts).
// The take is personal, so it lives in public/take/ (out of git): session.json, pose.json, face.mp4, hands.mp4.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AbsoluteFill, OffthreadVideo, Sequence, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction } from 'remotion';
import * as THREE from 'three';
import { z } from 'zod';
import { InkView, paper } from './ink-view';
import { clamp, easeInOutQuint } from './draw';
import { drawMacbook, type MmFrame } from './macbook-draw';
import { WELL } from './macbook';
import type { HandModel, Side } from './hands/glb';
import { loadHands, loadUiFont, UI_FONT } from './hands/load';
import { HandsView } from './hands/view';
import { DIGITS, type Angles, type Digit, type Pose } from './hands/rig';
import { S0 } from './keyboard';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const takeHandsSchema = z.object({
  /** the hands' look: 'ghost' (liquid and frost), 'frost' (fog), 'smoke' (graphite), 'outline' (a hairline),
   *  'shadow' (their shadow alone), or 'clay' (plain, to judge their motion) */
  handLook: z.enum(['ghost', 'frost', 'smoke', 'outline', 'shadow', 'clay']).default('ghost'),
});
type Props = z.infer<typeof takeHandsSchema> & { data?: TakeData };
interface TakeData { session: any; pose: any }

// ---------- the edit (seconds) ----------
/** the opening: his face from this moment of the take */
const FACE_FROM = 0.1;
/** the webcam's clock: take time = its time + FACE_OFF (from the recorder's beeps) */
const FACE_OFF = -0.128;
/** the move down from the face to the hands: when it starts (video time) and how long it takes */
const PAN_AT = 1.5, PAN = 0.8;
/** from the move on, the video shows the take from this moment */
const HANDS_FROM = 8.3;
/** the phone's clock: take time = its time + PHONE_OFF (from the beeps) */
const PHONE_OFF = 8.0;
/** the hands shrink into the corner over these take times */
const SHRINK: [number, number] = [9.9, 10.8];
/** after the last thing typed, hold on the letter */
const HOLD = 1.8;

/** take time at video time v (after the move down; before it, the face's own moment) */
const takeAt = (v: number) => HANDS_FROM + (v - PAN_AT);

let dataP: Promise<TakeData> | null = null;
const loadTake = () => (dataP ??= Promise.all([fetch(staticFile('take/session.json')).then((r) => r.json()), fetch(staticFile('take/pose.json')).then((r) => r.json())]).then(([session, pose]) => ({ session, pose })));
export const takeHandsMetadata: CalculateMetadataFunction<Props> = async () => {
  try {
    const d = await loadTake();
    return { durationInFrames: Math.round((PAN_AT + d.session.take.end + HOLD - HANDS_FROM) * 30) };
  } catch { return { durationInFrames: 30 }; }
};

/** the layout at a frame size: the keyboard and trackpad in mm on the frame, and the writing's window above them */
function layout(S: number, SH: number) {
  const k0 = Math.min(S, SH) / S0;
  const PX = 2.95 * k0;
  const plateTop = WELL.y + WELL.h / 2 + 2.2; // mm
  const top = SH - 611 * k0; // the keyboard's top edge, px (the trackpad runs off the bottom)
  const f: MmFrame = { PX, ox: S / 2 - WELL.x * PX, oy: top + plateTop * PX };
  return { k0, f, winH: top - 22 * k0 };
}

function posesAt(P: any, t: number): Record<Side, Pose> {
  const rows = P.poses[clamp(Math.round(t * P.fps), 0, P.poses.length - 1)];
  const out = {} as Record<Side, Pose>;
  (['L', 'R'] as const).forEach((side, i) => {
    const r = rows[i];
    const ang = {} as Record<Digit, Angles>;
    DIGITS.forEach((d, j) => { const o = 6 + 4 * j; ang[d] = { a: r[o], f0: r[o + 1], f1: r[o + 2], f2: r[o + 3] }; });
    out[side] = { pl: { mcp: new THREE.Vector3(r[0], r[1], r[2]), yaw: r[3], pitch: r[4], roll: r[5] }, ang };
  });
  return out;
}

/** where the pointer is at t (sheet mm), whether it shows (macOS hides it while you type), and whether it's down */
function pointerAt(take: any, t: number) {
  const ev = take.pointer as { t: number; e: string; x: number; y: number }[];
  let i = -1;
  for (let lo = 0, hi = ev.length - 1; lo <= hi;) { const m = (lo + hi) >> 1; if (ev[m].t <= t) { i = m; lo = m + 1; } else hi = m - 1; }
  if (i < 0) return null;
  const a = ev[i], b = ev[i + 1];
  const u = b && b.t - a.t < 0.1 ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
  const x = a.x + (b ? (b.x - a.x) * u : 0), y = a.y + (b ? (b.y - a.y) * u : 0);
  let down = false;
  for (let j = i; j >= 0; j--) { if (ev[j].e === 'u') break; if (ev[j].e === 'd') { down = true; break; } }
  const lastKey = (take.keys as any[]).filter((k) => k.e === 'd' && k.t <= t).reduce((m: number, k: any) => Math.max(m, k.t), -10);
  const o = a.t > lastKey ? 1 : clamp(1 - (t - lastKey) / 0.15, 0, 1) * (a.t > lastKey - 0.15 ? 1 : 0);
  return { x, y, down, o };
}

export const TakeHands: React.FC<Props> = (props) => {
  const [data, setData] = useState<TakeData | null>(null);
  const [h] = useState(() => delayRender('take'));
  useLayoutEffect(() => { loadTake().then((d) => { setData(d); continueRender(h); }); }, [h]);
  if (!data) return null;
  return <TakeScene {...props} data={data} />;
};

const TakeScene: React.FC<Props & { data: TakeData }> = ({ handLook = 'ghost', data }) => {
  const frame = useCurrentFrame();
  const { width: S, height: SH, fps } = useVideoConfig();
  const v = frame / fps;
  const T = takeAt(v);
  const SES = data.session, TAKE = SES.take, P = data.pose;
  const { k0, f, winH } = useMemo(() => layout(S, SH), [S, SH]);
  const ink = useMemo(() => new InkView(SES), [SES]);
  const cam = useMemo(() => ink.camera(S, 0, winH, k0), [ink, S, winH, k0]);
  const sheet = useMemo(() => ink.paperCanvas(cam), [ink, cam]);
  /** the bottom of the finished letter's writing, px */
  const textBottom = useMemo(() => {
    const last = ink.sheetAt(SES.states.length - 1);
    const y1 = Math.max(...(last.page.items as any[]).filter((it) => it.box).map((it) => it.box[3]));
    return cam.y + (y1 / cam.u) * cam.k;
  }, [ink, cam, SES]);
  const ref = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const view = useRef<HandsView | null>(null);
  const lastKey = (TAKE.keys as any[]).filter((k) => k.e === 'd' && k.t <= T).reduce((m: number, k: any) => Math.max(m, k.t), -10);
  // keys down now: exactly as he pressed them
  const down = new Map<string, number>();
  for (const kk of P.keys as { code: string; t0: number; t1: number }[]) {
    const d = T < kk.t0 ? clamp(1 - (kk.t0 - T) / 0.02, 0, 1) : T <= kk.t1 ? 1 : clamp(1 - (T - kk.t1) / 0.06, 0, 1);
    if (d > 0) down.set(kk.code, Math.max(down.get(kk.code) ?? 0, d));
  }
  const showScene = T >= SHRINK[0] - 0.2;
  useLayoutEffect(() => {
    const hd = delayRender(`take ${frame}`);
    Promise.all([loadHands(), loadUiFont()]).then(([models]) => {
      const ctx = ref.current!.getContext('2d', { alpha: false })!;
      ctx.fillStyle = (paper as any).tint ?? '#f8f6f0';
      ctx.fillRect(0, 0, S, SH);
      if (showScene) {
        ink.draw(ctx, T, cam, sheet, S, winH, k0, { lastKey });
        drawMacbook(ctx, f, down, UI_FONT, k0);
        if (!view.current) {
          view.current = new HandsView(glRef.current!, models as Record<Side, HandModel>, handLook);
          for (const s of ['L', 'R'] as const) view.current.rigs[s].units = 1000 * (P.scale?.[s] ?? 1);
        }
        view.current.render({ poses: posesAt(P, T), PX: f.PX, ox: f.ox, oy: f.oy, under: ref.current! });
      }
      continueRender(hd);
    });
  }, [frame]); // eslint-disable-line react-hooks/exhaustive-deps

  // the pointer, on the sheet
  const ptr = pointerAt(TAKE, T);
  // the phone's picture: the whole frame, then shrinking into the corner
  const u = easeInOutQuint(clamp((T - SHRINK[0]) / (SHRINK[1] - SHRINK[0]), 0, 1));
  const full = { x: 0, y: 0, w: S, h: SH, sc: S / 1080, top: 300, r: 0 };
  // the corner: at the right, under the letter and over the keyboard (clear of the trackpad, where his right hand is)
  const cw = 240 * k0, ch = 180 * k0;
  const kbTop = f.oy - (WELL.y + WELL.h / 2 + 2.2) * f.PX;
  const cy = clamp(textBottom + 26 * k0, 24 * k0, kbTop - 18 * k0 - ch);
  const corner = { x: S - 24 * k0 - cw, y: cy, w: cw, h: ch, sc: cw / 1080, top: 400, r: 18 * k0 };
  const L = (a: number, b: number) => a + (b - a) * u;
  const box = { x: L(full.x, corner.x), y: L(full.y, corner.y), w: L(full.w, corner.w), h: L(full.h, corner.h), sc: L(full.sc, corner.sc), top: L(full.top, corner.top), r: L(full.r, corner.r) };
  // the move down: the face goes up and out, the hands come up from below
  const pan = easeInOutQuint(clamp((v - PAN_AT) / PAN, 0, 1));
  const faceVol = 0;
  const phoneVol = (fr: number) => {
    const t = takeAt(PAN_AT + fr / fps);
    return clamp((t - HANDS_FROM) / 0.5, 0, 1) * clamp((TAKE.end + 0.25 - t) / 0.3, 0, 1);
  };

  return (
    <AbsoluteFill style={{ background: (paper as any).tint ?? '#f8f6f0' }}>
      <canvas ref={ref} width={S} height={SH} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <canvas ref={glRef} width={S} height={SH} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: showScene ? 1 : 0 }} />
      {showScene && ptr && ptr.o > 0.01 && (
        <svg width={24 * k0} height={33 * k0} viewBox="0 0 22 30" style={{ position: 'absolute', left: cam.x + ptr.x * cam.k - 2 * k0, top: cam.y + ptr.y * cam.k - 2 * k0, opacity: ptr.o, transform: `scale(${ptr.down ? 0.88 : 1})`, transformOrigin: '2px 2px', filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.25))' }}>
          <path d="M2 2 L2 24 L7.5 18.8 L11.2 27.4 L14.6 26 L10.9 17.5 L18.5 17.5 Z" fill="#111" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
        </svg>
      )}
      {/* his hands, from the phone above */}
      {v >= PAN_AT && (
        <Sequence from={Math.round(PAN_AT * fps)} layout="none">
          <div style={{ position: 'absolute', left: box.x, top: box.y + (1 - pan) * SH, width: box.w, height: box.h, overflow: 'hidden', borderRadius: box.r, boxShadow: u > 0 ? `0 ${10 * k0 * u}px ${30 * k0 * u}px rgba(30,39,51,${0.22 * u}), 0 0 0 ${k0 * u}px rgba(255,255,255,0.6)` : undefined }}>
            <OffthreadVideo src={staticFile('take/hands.mp4')} trimBefore={Math.round((HANDS_FROM - PHONE_OFF) * fps)} volume={phoneVol}
              style={{ position: 'absolute', left: 0, top: -box.top * box.sc, width: 1080 * box.sc, height: 1920 * box.sc }} />
          </div>
        </Sequence>
      )}
      {/* his face, from the laptop's camera */}
      {v < PAN_AT + PAN && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', transform: `translateY(${-pan * SH}px)` }}>
          <OffthreadVideo src={staticFile('take/face.mp4')} trimBefore={Math.round((FACE_FROM - FACE_OFF) * fps)} volume={faceVol}
            style={{ position: 'absolute', height: SH, width: (SH * 16) / 9, left: (S - (SH * 16) / 9) / 2, top: 0 }} />
        </div>
      )}
    </AbsoluteFill>
  );
};

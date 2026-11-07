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
  /** the tracker's lines over his real hands (the joints and the bones between them), to show what the ghost follows */
  handLines: z.boolean().default(true),
});
type Props = z.infer<typeof takeHandsSchema> & { data?: TakeData };
interface TakeData { session: any; pose: any; lines: any }

// ---------- the edit (seconds), for the take of 2026-11-07 at 13.09 ----------
// (the test take of 11-06 at 08.47 used FACE_FROM 0.1, FACE_OFF -0.128, PAN_AT 1.5, HANDS_FROM 8.3, PHONE_OFF 8.0,
// SHRINK 9.9-10.8)
/** the opening: his face from this moment of the take (he smiles into the camera, then looks down at the keys as
 *  the picture moves down to them) */
const FACE_FROM = 5.4;
/** the webcam's clock: take time = its time + FACE_OFF. This take's webcam has no sound (no beeps to go by), so it's
 *  from the last take's measure against the moment the camera started (startedAt): about 0.16 s - startedAt */
const FACE_OFF = -0.01;
/** where his face is in the webcam's picture (fractions across and down), to centre the square on it, and how much
 *  closer than the whole picture's height */
const FACE_AT = { x: 0.65, y: 0.575, zoom: 1.12 };
/** the move down from the face to the hands: when it starts (video time) and how long it takes */
const PAN_AT = 1.0, PAN = 0.8;
/** from the move on, the video shows the take from this moment (FACE_FROM + PAN_AT: no jump in time; the typing
 *  starts as the hands arrive) */
const HANDS_FROM = 6.4;
/** the phone's clock: take time = its time + PHONE_OFF (from the beeps) */
const PHONE_OFF = -0.924;
/** the hands shrink into the corner over these take times (the first key is at 6.87) */
const SHRINK: [number, number] = [7.6, 8.5];
/** after the last thing typed and written, hold on the letter */
const HOLD = 2.2; // take seconds (about 1.8 s of video at SPEED)
/** the pauses: while nothing is typed or clicked and the pen has finished, the take plays this much faster */
const FAST = 4;
/** and the whole take from the hands on, a touch quicker than it happened (not so it looks sped up) */
const SPEED = 1.2;
/** ...and while the pen is still writing in a pause, this much */
const PEN_FAST = 2;

// ---------- the clock: video time to take time ----------
// The take plays as it happened, except its pauses: from a moment after the pen finishes until a moment before the
// next key, it runs FAST times quicker (the pointer and the hands still move through it, just quicker; his video's
// sound is off there). Clicks keep their own pace.
interface Seg { v0: number; t0: number; t1: number; r: number }
const inks = new WeakMap<object, InkView>();
const inkOf = (session: any) => { let k = inks.get(session); if (!k) { k = new InkView(session); inks.set(session, k); } return k; };
const warps = new WeakMap<object, { segs: Seg[]; end: number }>();
function warpOf(session: any) {
  const hit = warps.get(session);
  if (hit) return hit;
  const take = session.take, ink = inkOf(session);
  const downs = (take.keys as any[]).filter((k) => k.e === 'd').map((k) => k.t as number).sort((a, b) => a - b);
  const clicks = (take.pointer as any[]).filter((p) => p.e !== 'm').map((p) => p.t as number);
  const lastKey = downs[downs.length - 1];
  const end = Math.max(lastKey, ink.penDoneAt(lastKey + 5)) + HOLD;
  // the quiet stretches of each pause between keys (clicks keep their pace): quicker still once the pen has finished
  const fast: [number, number, number][] = [];
  for (let i = 1; i < downs.length; i++) {
    const a = downs[i - 1], b = downs[i];
    if (b - a < 1.2) continue;
    let w: [number, number][] = [[a + 0.35, b - 0.45]];
    for (const c of clicks) w = w.flatMap(([x, y]) => (c + 0.25 <= x || c - 0.3 >= y ? [[x, y]] : [[x, c - 0.3], [c + 0.25, y]]) as [number, number][]);
    const pen = ink.penDoneAt(b - 0.02) + 0.2;
    for (const [x, y] of w) {
      if (x < SHRINK[1] || y - x < 0.4) continue;
      if (pen > x && pen < y) { fast.push([x, pen, PEN_FAST]); fast.push([pen, y, FAST]); } else fast.push([x, y, pen >= y ? PEN_FAST : FAST]);
    }
  }
  const segs: Seg[] = [];
  let t = HANDS_FROM, v = 0;
  const push = (t1: number, r: number) => { if (t1 > t + 1e-6) { segs.push({ v0: v, t0: t, t1, r }); v += (t1 - t) / r; t = t1; } };
  for (const [x, y, r] of fast) if (y - x >= 0.3) { push(x, SPEED); push(y, r * SPEED); }
  push(end, SPEED);
  const out = { segs, end };
  warps.set(session, out);
  return out;
}
/** take time at video time v (before the move down, the face's own moment) */
function takeAt(session: any, v: number) {
  const u = v - PAN_AT;
  if (u < 0) return HANDS_FROM + u;
  const { segs } = warpOf(session);
  const g = segs.find((x) => u < x.v0 + (x.t1 - x.t0) / x.r) ?? segs[segs.length - 1];
  return Math.min(g.t1, g.t0 + (u - g.v0) * g.r);
}

let dataP: Promise<TakeData> | null = null;
const loadTake = () => (dataP ??= Promise.all(['session', 'pose', 'lines'].map((n) => fetch(staticFile(`take/${n}.json`)).then((r) => r.json()))).then(([session, pose, lines]) => ({ session, pose, lines })));
export const takeHandsMetadata: CalculateMetadataFunction<Props> = async () => {
  try {
    const d = await loadTake();
    const { segs } = warpOf(d.session);
    const last = segs[segs.length - 1];
    return { durationInFrames: Math.round((PAN_AT + last.v0 + (last.t1 - last.t0) / last.r) * 30) };
  } catch { return { durationInFrames: 30 }; }
};

/** the layout at a frame size: the keyboard and trackpad in mm on the frame, and the writing's window above them.
 *  The keyboard sits as far from the frame's bottom as from its sides (the trackpad runs off the bottom). */
function layout(S: number, SH: number) {
  const k0 = Math.min(S, SH) / S0;
  const PX = 2.95 * k0;
  const plateTop = WELL.y + WELL.h / 2 + 2.2, plateBottom = WELL.y - WELL.h / 2 - 2.2; // mm
  const side = (S - (WELL.w + 4.4) * PX) / 2;
  const top = SH - side - (plateTop - plateBottom) * PX; // the keyboard's top edge, px
  const f: MmFrame = { PX, ox: S / 2 - WELL.x * PX, oy: top + plateTop * PX };
  return { k0, f, winH: top - 22 * k0, side };
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

/** the tracker's view of his hands over the phone's video: each bone a thin line, each joint a dot (video px * sc) */
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const HandLines: React.FC<{ lines: any; t: number; sc: number; k0: number }> = ({ lines, t, sc, k0 }) => {
  const row = lines.frames[clamp(Math.round(t * lines.fps), 0, lines.frames.length - 1)] as (string | number)[][];
  // drawn at least a hairline wide, however small the picture
  const lw = Math.max(1.1 * k0, 2.4 * sc), r = Math.max(1.6 * k0, 5 * sc);
  return (
    <svg width={lines.size[0] * sc} height={lines.size[1] * sc} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
      {row.map(([side, ...q]) => {
        const P = (j: number) => [(q[2 * j] as number) * sc, (q[2 * j + 1] as number) * sc];
        return (
          <g key={side as string} style={{ filter: `drop-shadow(0 0 ${1.5 * k0}px rgba(20,30,60,0.35))` }}>
            {BONES.map(([a, b]) => { const [x1, y1] = P(a), [x2, y2] = P(b); return <line key={`${a}-${b}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.9)" strokeWidth={lw} strokeLinecap="round" />; })}
            {Array.from({ length: 21 }, (_, j) => { const [x, y] = P(j); return <circle key={j} cx={x} cy={y} r={[4, 8, 12, 16, 20].includes(j) ? r * 1.25 : r} fill="#2c63d6" stroke="#fff" strokeWidth={lw * 0.8} />; })}
          </g>
        );
      })}
    </svg>
  );
};

export const TakeHands: React.FC<Props> = (props) => {
  const [data, setData] = useState<TakeData | null>(null);
  const [h] = useState(() => delayRender('take'));
  useLayoutEffect(() => { loadTake().then((d) => { setData(d); continueRender(h); }); }, [h]);
  if (!data) return null;
  return <TakeScene {...props} data={data} />;
};

const TakeScene: React.FC<Props & { data: TakeData }> = ({ handLook = 'ghost', handLines = true, data }) => {
  const frame = useCurrentFrame();
  const { width: S, height: SH, fps } = useVideoConfig();
  const v = frame / fps;
  const T = takeAt(data.session, v);
  const segs = warpOf(data.session).segs;
  const SES = data.session, TAKE = SES.take, P = data.pose;
  const { k0, f, winH } = useMemo(() => layout(S, SH), [S, SH]);
  const LN = data.lines;
  const ink = inkOf(SES);
  // the letter, centred in the room between the corner video (top right) and the keyboard
  const cornerBottom = (24 + 162) * k0;
  const cam = useMemo(() => ink.camera(S, cornerBottom + 8 * k0, winH, k0, { center: true }), [ink, S, winH, k0, cornerBottom]);
  const sheet = useMemo(() => ink.paperCanvas(cam), [ink, cam]);
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
  const full = { x: 0, y: 0, w: S, h: SH, sc: S / 1080, top: 800, r: 0 };
  // the corner: the top right
  const cw = 216 * k0, ch = 162 * k0;
  const corner = { x: S - 24 * k0 - cw, y: 24 * k0, w: cw, h: ch, sc: cw / 1080, top: 1000, r: 18 * k0 };
  const L = (a: number, b: number) => a + (b - a) * u;
  const box = { x: L(full.x, corner.x), y: L(full.y, corner.y), w: L(full.w, corner.w), h: L(full.h, corner.h), sc: L(full.sc, corner.sc), top: L(full.top, corner.top), r: L(full.r, corner.r) };
  // the move down: the face goes up and out, the hands come up from below
  const pan = easeInOutQuint(clamp((v - PAN_AT) / PAN, 0, 1));
  const faceVol = 0;
  /** his video's sound: in from the move down, off through the fast stretches (with a short fade each side), out at the end */
  const END = warpOf(SES).end;
  const volAt = (vv: number) => {
    const t = takeAt(SES, vv);
    const u = vv - PAN_AT;
    const g = segs.find((x) => u < x.v0 + (x.t1 - x.t0) / x.r);
    const fastNear = segs.filter((x) => x.r > SPEED).reduce((m, x) => Math.min(m, Math.max(0, x.v0 - u, u - (x.v0 + (x.t1 - x.t0) / x.r))), Infinity);
    return (g && g.r > SPEED ? 0 : clamp(fastNear / 0.08, 0, 1)) * clamp((t - HANDS_FROM) / 0.5, 0, 1) * clamp((END - 0.6 - t) / 0.4, 0, 1);
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
        <>
          <div style={{ position: 'absolute', left: box.x, top: box.y + (1 - pan) * SH, width: box.w, height: box.h, overflow: 'hidden', borderRadius: box.r, boxShadow: u > 0 ? `0 ${10 * k0 * u}px ${30 * k0 * u}px rgba(30,39,51,${0.22 * u}), 0 0 0 ${k0 * u}px rgba(255,255,255,0.6)` : undefined }}>
            {/* the phone's picture stood level (the keyboard's rows straight across), a touch larger to fill the box */}
            <div style={{ position: 'absolute', left: 0, top: -box.top * box.sc, width: 1080 * box.sc, height: 1920 * box.sc, transformOrigin: `${LN.pivot[0] * box.sc}px ${LN.pivot[1] * box.sc}px`, transform: `rotate(${-LN.level}deg) scale(1.03)` }}>
              {segs.map((g) => {
                const from = Math.round((PAN_AT + g.v0) * fps), n = Math.round((PAN_AT + g.v0 + (g.t1 - g.t0) / g.r) * fps) - from;
                return n > 0 && (
                  <Sequence key={g.v0} from={from} durationInFrames={n} layout="none">
                    <OffthreadVideo src={staticFile('take/hands.mp4')} trimBefore={Math.round((g.t0 - PHONE_OFF) * fps)} playbackRate={g.r} volume={(fr) => volAt((from + fr) / fps)}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
                  </Sequence>
                );
              })}
              {/* the laptop's screen, dark (it showed whatever was on it) */}
              <svg width={1080 * box.sc} height={1920 * box.sc} viewBox="0 0 1080 1920" style={{ position: 'absolute', left: 0, top: 0 }}>
                <polygon points={LN.screen ?? '0,0 1080,0 1080,962 0,950'} fill="#0d0d10" />
              </svg>
              {handLines && <HandLines lines={LN} t={T - PHONE_OFF} sc={box.sc} k0={k0} />}
            </div>
          </div>
        </>
      )}
      {/* his face, from the laptop's camera */}
      {v < PAN_AT + PAN && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', transform: `translateY(${-pan * SH}px)` }}>
          <OffthreadVideo src={staticFile('take/face.mp4')} trimBefore={Math.round((FACE_FROM - FACE_OFF) * fps)} volume={faceVol}
            style={{ position: 'absolute', height: SH * FACE_AT.zoom, width: (SH * FACE_AT.zoom * 16) / 9, left: clamp(S / 2 - FACE_AT.x * ((SH * FACE_AT.zoom * 16) / 9), S - (SH * FACE_AT.zoom * 16) / 9, 0), top: clamp(SH / 2 - FACE_AT.y * SH * FACE_AT.zoom, SH - SH * FACE_AT.zoom, 0) }} />
        </div>
      )}
    </AbsoluteFill>
  );
};

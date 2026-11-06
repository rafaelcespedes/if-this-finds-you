// the biggest frame-to-frame jumps in the recorded hand motion (a joint turning or a hand moving too far in one frame
// reads as a pop)
import pose from '../../src/data/hand-pose.json';
const P = pose as unknown as { fps: number; poses: number[][][] };
const D = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const out: [number, string][] = [];
for (let f = 1; f < P.poses.length; f++) for (const [i, side] of ['L', 'R'].entries()) {
  const a = P.poses[f - 1][i], b = P.poses[f][i];
  const move = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  out.push([move / 6, `${(f / P.fps).toFixed(2)}s ${side} hand moved ${move.toFixed(1)} mm`]);
  D.forEach((d, j) => { for (let k = 0; k < 4; k++) { const v = Math.abs(b[6 + 4 * j + k] - a[6 + 4 * j + k]); out.push([v / 0.2, `${(f / P.fps).toFixed(2)}s ${side} ${d} joint ${k} turned ${Math.round(v * 57.3)}°`]); } });
}
out.sort((x, y) => y[0] - x[0]);
for (const [, s] of out.slice(0, 18)) console.log(s);

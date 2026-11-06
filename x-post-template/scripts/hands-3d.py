#!/usr/bin/env python3
# hands-3d.py: the tracked hands (src/data/hand-track.json) over the keyboard, in the MacBook's millimetres
# (src/macbook.ts: x right, y toward the screen, z up, the key tops at z = 0), and which finger pressed each key.
#
#   .venv-track/bin/python scripts/hands-3d.py
#
# The keyboard: key centres picked by eye on a clean frame of the phone's video (src/data/take-keyboard.json: one
# take's, its turned video's pixels) against the layout give the keyboard's plane as the phone saw it (a
# homography), and from it the phone's lens and where it was. Each of a hand's 21 points is then a ray from the lens;
# this writes where each ray meets the key tops (p0), so scripts/take-pose.ts can find the point at any height along
# it (from above, where a point is across the keyboard is what shows; its height is the ghost hand's to choose).
# Each key down: the fingertip nearest the key in the picture pressed it (a fingertip on a key is on the plane, so
# it's exactly there). Writes src/data/hand-3d.json.
import argparse, json, os, subprocess
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TIPS = [4, 8, 12, 16, 20]

def layout():
    r = subprocess.run(['node', os.path.join(HERE, 'node-ts.mjs'), os.path.join(HERE, 'macbook-layout.ts')], capture_output=True, text=True, check=True, cwd=ROOT)
    return json.loads(r.stdout)

def camera(H, size):
    """the lens (focal length, px) and the keyboard's pose in the camera from the plane's homography (mm -> px)"""
    w, h = size
    T = np.array([[1, 0, w / 2], [0, 1, h / 2], [0, 0, 1]], float)
    Hc = np.linalg.inv(T) @ H
    h1, h2 = Hc[:, 0], Hc[:, 1]
    cands = []
    d = h1[2] * h2[2]
    if abs(d) > 1e-12:
        f2 = -(h1[0] * h2[0] + h1[1] * h2[1]) / d
        if f2 > 0: cands.append(np.sqrt(f2))
    d = h2[2] ** 2 - h1[2] ** 2
    if abs(d) > 1e-12:
        f2 = (h1[0] ** 2 + h1[1] ** 2 - h2[0] ** 2 - h2[1] ** 2) / d
        if f2 > 0: cands.append(np.sqrt(f2))
    # the phone looks almost straight down, which leaves the focal length poorly measured: keep it to an iPhone's 1x
    # lens in video (about 70 degrees across the long side) unless the plane says something close
    f0 = (max(w, h) / 2) / np.tan(np.radians(35))
    f = float(np.median(cands)) if cands and all(0.75 * f0 < c < 1.33 * f0 for c in cands) else f0
    K = np.array([[f, 0, w / 2], [0, f, h / 2], [0, 0, 1]], float)
    B = np.linalg.inv(K) @ H
    lam = 1 / np.linalg.norm(B[:, 0])
    r1, r2, t = B[:, 0] * lam, B[:, 1] * lam, B[:, 2] * lam
    if t[2] < 0: r1, r2, t = -r1, -r2, -t
    R = np.stack([r1, r2, np.cross(r1, r2)], axis=1)
    U, _, Vt = np.linalg.svd(R)
    R = U @ Vt
    return K, R, t, f, cands

def smooth_runs(arr, ok, sigma):
    """a centred Gaussian over each run of frames the hand was seen in (offline, so no lag)"""
    out = arr.copy()
    n = len(arr)
    rad = int(3 * sigma)
    k = np.exp(-0.5 * (np.arange(-rad, rad + 1) / sigma) ** 2)
    i = 0
    while i < n:
        if not ok[i]: i += 1; continue
        j = i
        while j < n and ok[j]: j += 1
        seg = arr[i:j]
        if j - i > 2:
            pad = np.concatenate([seg[:1].repeat(rad, 0), seg, seg[-1:].repeat(rad, 0)])
            sm = np.stack([np.convolve(pad[:, c], k / k.sum(), mode='valid') for c in range(seg.shape[1])], axis=1)
            out[i:j] = sm
        i = j
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--track', default=os.path.join(ROOT, 'src/data/hand-track.json'))
    ap.add_argument('--take', default=os.path.join(ROOT, 'src/data/take-session.json'))
    ap.add_argument('--keys', default=os.path.join(ROOT, 'src/data/take-keyboard.json'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'src/data/hand-3d.json'))
    ap.add_argument('--sigma', type=float, default=1.0, help='smoothing, frames')
    a = ap.parse_args()
    tr = json.load(open(a.track)); take = json.load(open(a.take))['take']; cal = json.load(open(a.keys))
    lay = layout(); KEY = {k['code']: k for k in lay['keys']}
    codes = [c for c in cal['keys'] if c in KEY]
    img = np.array([cal['keys'][c] for c in codes], float)
    mm = np.array([[KEY[c]['x'], KEY[c]['y']] for c in codes], float)
    H, _ = cv2.findHomography(mm, img, 0)
    res = np.linalg.norm(cv2.perspectiveTransform(mm.reshape(-1, 1, 2), H).reshape(-1, 2) - img, axis=1)
    size = tr['size']
    K, R, t, f, cands = camera(H, size)
    C = -R.T @ t
    print('keyboard fit: %d keys, %.1f px off on average (%.1f at most)' % (len(codes), res.mean(), res.max()))
    print('lens: f = %.0f px (the plane suggested %s); the phone %.0f mm over the keys, above (%.0f, %.0f)' % (f, [round(c) for c in cands], C[2], C[0], C[1]))
    Hi = np.linalg.inv(H)

    fps, off = tr['fps'], tr['offset']
    n = len(tr['frames'])
    Kinv, Rt = np.linalg.inv(K), R.T

    # the picture's points, each hand, smoothed a little over time (offline: no lag)
    pix = {s: np.full((n, 21, 2), np.nan) for s in 'LR'}
    for i, hands in enumerate(tr['frames']):
        for hd in hands:
            if np.isnan(pix[hd['side']][i, 0, 0]): pix[hd['side']][i] = np.array(hd['p'], float)[:, :2]
    seen = {s: ~np.isnan(pix[s][:, 0, 0]) for s in 'LR'}
    for s in 'LR':
        pix[s] = smooth_runs(np.nan_to_num(pix[s].reshape(n, 42)), seen[s], a.sigma).reshape(n, 21, 2)

    def rays(P):
        return (Rt @ (Kinv @ np.c_[P, np.ones(len(P))].T)).T
    def on_plane(P):
        """where the picture's points would be on the key tops' plane (z = 0): with the lens C, any height along each
        point's ray is C + (p0 - C) (1 - z / C.z)"""
        d = rays(P)
        return C + d * (-C[2] / d[:, 2:3])

    # the presses: each key down, the fingertip nearest its key in the picture (a fingertip on a key is on the plane,
    # so the homography finds where it is on the keyboard)
    presses = []
    downs = [k for k in take['keys'] if k['e'] == 'd' and not k.get('r')]
    ups = [k for k in take['keys'] if k['e'] == 'u']
    for kd in downs:
        code = kd['code']
        if code not in KEY: continue
        up = next((u['t'] for u in ups if u['code'] == code and u['t'] > kd['t']), kd['t'] + 0.1)
        i0 = int(round((kd['t'] - off) * fps))
        if i0 < 0 or i0 >= n: continue
        kc = np.array([KEY[code]['x'], KEY[code]['y']])
        best = None
        for i in range(max(0, i0 - 1), min(n, i0 + 3)):
            for s in 'LR':
                if not seen[s][i]: continue
                q = cv2.perspectiveTransform(pix[s][i, TIPS].reshape(-1, 1, 2), Hi).reshape(-1, 2)
                for j, tip in enumerate(TIPS):
                    dx = max(0, abs(q[j, 0] - kc[0]) - KEY[code]['w'] / 2); dy = max(0, abs(q[j, 1] - kc[1]) - KEY[code]['h'] / 2)
                    dd = np.hypot(dx, dy) + 0.15 * np.hypot(*(q[j] - kc))
                    if best is None or dd < best[0]: best = (dd, s, tip, i)
        if best is None: continue
        dd, s, tip, i = best
        presses.append({'t0': kd['t'], 't1': up, 'code': code, 'key': kd['key'], 'side': s, 'tip': tip, 'frame': i, 'miss': round(float(dd), 1)})
    print('presses: %d of %d key downs found a finger (%d more than 8 mm off their key)' % (len(presses), len(downs), sum(p['miss'] > 8 for p in presses)))

    out_frames = [[] for _ in range(n)]
    for s in 'LR':
        for i in range(n):
            if seen[s][i]: out_frames[i].append({'side': s, 'p0': np.round(on_plane(pix[s][i])[:, :2], 2).tolist()})
    for p in presses:
        p['at'] = np.round(on_plane(pix[p['side']][p['frame'], [p['tip']]])[0, :2], 1).tolist()
    json.dump({'fps': fps, 'offset': off, 'focal': f, 'camera': {'R': R.tolist(), 't': t.tolist(), 'C': C.tolist()}, 'size': size, 'H': H.tolist(),
               'presses': presses, 'frames': out_frames}, open(a.out, 'w'))
    print('wrote', os.path.relpath(a.out))

if __name__ == '__main__':
    main()

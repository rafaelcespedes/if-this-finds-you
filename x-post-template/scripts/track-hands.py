#!/usr/bin/env python3
# track-hands.py: the hands in the phone's video of a take, frame by frame (Google's MediaPipe hand landmarker: 21
# points per hand), and where the video sits on the take's clock (the recorder's beeps, heard in the phone's sound).
#
#   .venv-track/bin/python scripts/track-hands.py "<phone video>" [--turn 180] [--preview out/track-preview.mp4]
#
# Writes src/data/hand-track.json: fps, size, the offset (take time = video time + offset), and per frame each
# hand's 21 points (x, y in pixels of the turned video; z relative depth) and its world points (metres, about the
# hand's centre), with the side the tracker thinks it is and how sure it is. Stays out of git, like the take.
# Setup (once): python3.12 -m venv .venv-track && .venv-track/bin/pip install mediapipe opencv-python-headless numpy,
# and the model in .venv-track/models/hand_landmarker.task (see the README).
import argparse, json, os, subprocess, sys, tempfile, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FF_DIR = os.path.join(ROOT, 'node_modules/@remotion/compositor-darwin-arm64')

def ff(tool, args, **kw):
    env = dict(os.environ, DYLD_LIBRARY_PATH=FF_DIR)
    return subprocess.run([os.path.join(FF_DIR, tool), *args], env=env, **kw)

def probe(path):
    r = ff('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_side_data=rotation', '-of', 'json', path], capture_output=True, text=True, check=True)
    s = json.loads(r.stdout)['streams'][0]
    rot = 0
    for sd in s.get('side_data_list', []) or []:
        if 'rotation' in sd: rot = int(sd['rotation'])
    w, h = s['width'], s['height']
    return (h, w) if rot % 180 else (w, h)

# ---------- the beeps: where the video sits on the take's clock ----------
def tone_track(path, hz_list, sr=16000, hop=0.005, win=0.04):
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, 'sound.wav')
        ff('ffmpeg', ['-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', str(sr), '-c:a', 'pcm_s16le', wav], check=True)
        with wave.open(wav) as wf: x = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    n, h = int(win * sr), int(hop * sr)
    frames = np.lib.stride_tricks.sliding_window_view(x, n)[::h] * np.hanning(n)
    t = np.arange(len(frames)) * hop + win / 2
    spec = np.abs(np.fft.rfft(frames, axis=1))
    freqs = np.fft.rfftfreq(n, 1 / sr)
    total = spec.sum(axis=1) + 1e-9
    out = {}
    for hz in hz_list:
        band = (freqs > hz - 30) & (freqs < hz + 30)
        out[hz] = spec[:, band].sum(axis=1) / total  # how much of the sound is this tone
    return t, out

def onsets(t, v, thresh, min_len, gap=0.25):
    on = v > thresh
    res, i = [], 0
    while i < len(on):
        if on[i]:
            j = i
            while j < len(on) and on[j]: j += 1
            if t[j - 1] - t[i] >= min_len: res.append(float(t[i]))
            i = j + int(gap / (t[1] - t[0]))
        else:
            i += 1
    return res

def find_offset(path, beeps):
    hz = sorted({int(b['hz']) for b in beeps})
    t, tr = tone_track(path, hz)
    heard = []
    for f in hz:
        v = tr[f]
        # a beep is most of the sound at its pitch while it lasts: half the loudest, and never noise
        thresh = max(0.08, 0.5 * float(v.max()))
        for s in onsets(t, v, thresh, 0.05):
            heard.append((s, f))
    # every pairing of a heard beep with a logged one of the same pitch proposes an offset; the most agreed wins
    best = None
    for s, f in heard:
        for b in beeps:
            if int(b['hz']) != f: continue
            off = b['t'] - s
            agree = [(s2, f2) for s2, f2 in heard if any(int(b2['hz']) == f2 and abs(b2['t'] - (s2 + off)) < 0.04 for b2 in beeps)]
            if best is None or len(agree) > len(best[1]): best = (off, agree)
    if not best: return None, heard, []
    off, agree = best
    # refine: the mean of the matched pairs
    pairs = []
    for s2, f2 in agree:
        b2 = min((b for b in beeps if int(b['hz']) == f2), key=lambda b: abs(b['t'] - (s2 + off)))
        pairs.append(b2['t'] - s2)
    return float(np.mean(pairs)), heard, agree

# ---------- the hands ----------
def track(path, size, turn, fps, preview):
    import cv2, mediapipe as mp
    from mediapipe.tasks.python import vision, BaseOptions
    vf = {0: 'null', 90: 'transpose=1', 180: 'hflip,vflip', 270: 'transpose=2'}[turn]
    tmp = tempfile.mkdtemp()
    # turned, at a steady frame rate, as a plain video OpenCV reads (this ffmpeg can't stream raw frames)
    flat = os.path.join(tmp, 'flat.mp4')
    ff('ffmpeg', ['-v', 'error', '-y', '-i', path, '-vf', vf, '-fps_mode', 'cfr', '-r', str(fps), '-an', '-c:v', 'libx264', '-crf', '14', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', flat], check=True)
    cap = cv2.VideoCapture(flat)
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    opt = vision.HandLandmarkerOptions(base_options=BaseOptions(model_asset_path=os.path.join(ROOT, '.venv-track/models/hand_landmarker.task')),
                                       num_hands=2, min_hand_detection_confidence=0.3, min_hand_presence_confidence=0.3, min_tracking_confidence=0.3,
                                       running_mode=vision.RunningMode.VIDEO)
    lm = vision.HandLandmarker.create_from_options(opt)
    rough = os.path.join(tmp, 'preview.mp4')
    enc = cv2.VideoWriter(rough, cv2.VideoWriter_fourcc(*'mp4v'), fps, (w // 2, h // 2)) if preview else None
    CON = [(0,1),(1,2),(2,3),(3,4),(0,5),(5,6),(6,7),(7,8),(5,9),(9,10),(10,11),(11,12),(9,13),(13,14),(14,15),(15,16),(13,17),(17,18),(18,19),(19,20),(0,17)]
    frames, i = [], 0
    while True:
        ok, bgr = cap.read()
        if not ok: break
        img = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        r = lm.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=img), int(i * 1000 / fps))
        hands = []
        for k, hl in enumerate(r.hand_landmarks):
            hands.append({
                'side': r.handedness[k][0].category_name[0], 'score': round(r.handedness[k][0].score, 3),
                'p': [[round(q.x * w, 1), round(q.y * h, 1), round(q.z * w, 1)] for q in hl],
                'world': [[round(q.x, 4), round(q.y, 4), round(q.z, 4)] for q in r.hand_world_landmarks[k]],
            })
        frames.append(hands)
        if enc:
            out = cv2.resize(bgr, (w // 2, h // 2))
            for hd in hands:
                pts = [(int(q[0] / 2), int(q[1] / 2)) for q in hd['p']]
                col = (255, 170, 60) if hd['side'] == 'L' else (60, 200, 255)
                for a, b in CON: cv2.line(out, pts[a], pts[b], col, 2, cv2.LINE_AA)
                for q in pts: cv2.circle(out, q, 3, (40, 60, 230), -1, cv2.LINE_AA)
            cv2.putText(out, f'{i / fps:5.2f}s  hands: {len(hands)}', (16, 34), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)
            enc.write(out)
        i += 1
        if i % 300 == 0: print(f'  {i / fps:.0f} s', file=sys.stderr)
    cap.release()
    if enc:
        enc.release()
        ff('ffmpeg', ['-v', 'error', '-y', '-i', rough, '-c:v', 'libx264', '-crf', '24', '-pix_fmt', 'yuv420p', preview], check=True)
    return frames, (w, h)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('--turn', type=int, default=0, help='turn the video this many degrees clockwise first (0, 90, 180, 270)')
    ap.add_argument('--fps', type=float, default=30)
    ap.add_argument('--take', default=os.path.join(ROOT, 'src/data/take-session.json'))
    ap.add_argument('--preview', default=None, help='also write a half-size video with the tracked hands drawn on it')
    ap.add_argument('--out', default=os.path.join(ROOT, 'src/data/hand-track.json'))
    a = ap.parse_args()
    take = json.load(open(a.take))['take']
    off, heard, agree = find_offset(a.video, take['beeps'])
    print('beeps heard in the video (s, Hz):', [(round(s, 3), f) for s, f in heard])
    print('offset: take time = video time + %s s (%d beeps agree)' % (None if off is None else round(off, 3), len(agree)))
    frames, size = track(a.video, probe(a.video), a.turn, a.fps, a.preview)
    n = [len(f) for f in frames] or [0]
    print('frames %d · both hands in %d%% · one in %d%% · none in %d%%' % (len(frames), 100 * n.count(2) / len(n), 100 * n.count(1) / len(n), 100 * n.count(0) / len(n)))
    json.dump({'video': os.path.basename(a.video), 'fps': a.fps, 'size': size, 'turn': a.turn, 'offset': off, 'frames': frames}, open(a.out, 'w'))
    print('wrote', os.path.relpath(a.out))

if __name__ == '__main__':
    main()

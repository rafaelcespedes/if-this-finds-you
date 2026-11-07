#!/usr/bin/env python3
# take-keysound.py: the take's sound made again from its own clicks, with nothing else in it. Every key going down
# and up, and every click of the trackpad, is in the take's log to the millisecond; the phone heard each one. The
# cleanest of them (nothing else near, well above the room's hiss) are cut out, cleaned and evened out into a small
# bank by kind (letters, the space bar, the big keys, keys coming up, the trackpad), and one from the bank is laid
# down at every moment in the log. So the keys are heard loud and clear, exactly when they happen, over silence.
#   .venv-track/bin/python scripts/take-keysound.py "<phone video>" [--clip out/keysound-clip.wav]
# Writes public/take/keys.wav (on the phone video's clock: take time = its time + the tracker's offset).
import argparse, json, os, subprocess, tempfile, wave
import numpy as np
from scipy.signal import butter, sosfiltfilt, stft, istft

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
def ff(*args): subprocess.run(['npx', 'remotion', 'ffmpeg', '-v', 'error', '-y', *args], cwd=ROOT, check=True)
def read(path):
    w = wave.open(path); n = w.getnchannels()
    return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32).reshape(-1, n).mean(1) / 32768
def write(path, x):
    o = wave.open(path, 'wb'); o.setnchannels(2); o.setsampwidth(2); o.setframerate(SR)
    y = (np.clip(x, -1, 1) * 32767).astype(np.int16); o.writeframes(np.stack([y, y], 1).tobytes()); o.close()

BIG = {'Space': 'space', 'Enter': 'big', 'Backspace': 'big', 'ShiftLeft': 'big', 'ShiftRight': 'big', 'MetaLeft': 'big', 'MetaRight': 'big'}
def kind(e):
    if e['src'] == 'pad': return 'pad-' + e['e']
    if e['e'] == 'u': return 'up'
    return BIG.get(e['code'], 'key')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('--clip', help='also write a stretch of it to listen to (video seconds 8 to 30)')
    ap.add_argument('--seed', type=int, default=7)
    a = ap.parse_args()
    tmp = tempfile.mkdtemp(); raw = os.path.join(tmp, 'raw.wav')
    ff('-i', os.path.expanduser(a.video), '-vn', '-ac', '1', '-ar', str(SR), '-c:a', 'pcm_s16le', raw)
    x = read(raw)
    take = json.load(open(os.path.join(ROOT, 'src/data/take-session.json')))['take']
    off = json.load(open(os.path.join(ROOT, 'src/data/hand-track.json')))['offset']
    ev = [{'t': k['t'] - off, 'e': k['e'], 'code': k.get('code', ''), 'src': 'key', 'r': k.get('r')} for k in take['keys'] if not k.get('r')]
    ev += [{'t': p['t'] - off, 'e': p['e'], 'code': '', 'src': 'pad'} for p in take['pointer'] if p['e'] in ('d', 'u')]
    ev = [e for e in ev if 0.1 < e['t'] < len(x) / SR - 0.3]
    ev.sort(key=lambda e: e['t'])
    # the room's hiss, by pitch, from the stretches with no event near
    hp = sosfiltfilt(butter(4, 150, 'hp', fs=SR, output='sos'), x)
    f, _, X = stft(hp, SR, nperseg=1024, noverlap=768)
    mag = np.abs(X); tt = np.arange(mag.shape[1]) * 256 / SR
    times = np.array([e['t'] for e in ev])
    quiet = np.array([np.min(np.abs(times - t)) > 0.35 for t in tt])
    noise = np.median(mag[:, quiet], axis=1, keepdims=True)
    gain = np.clip(1 - 2.5 * noise / np.maximum(mag, 1e-9), 0, 1)
    _, clean = istft(X * gain, SR, nperseg=1024, noverlap=768); clean = clean[: len(x)]
    # each event's sound: from its onset (the first rise of its loudness near the logged moment), 140 ms
    env = np.sqrt(np.convolve(clean ** 2, np.ones(96) / 96, mode='same'))
    floor = np.median(env)
    L = int(0.075 * SR)  # a click is over in some 50 ms; the key's coming up is its own sound
    bank = {}
    for i, e in enumerate(ev):
        # nothing else near (its own press's other half aside, which comes a good 60 ms apart)
        near = min([abs(e['t'] - o['t']) for j, o in enumerate(ev) if j != i and not (o['src'] == e['src'] and o['code'] == e['code'] and abs(o['t'] - e['t']) < 0.4 and abs(o['t'] - e['t']) > 0.05)] or [9])
        if near < 0.1: continue
        c = int(e['t'] * SR); w0, w1 = c - int(0.04 * SR), c + int(0.045 * SR)
        seg = env[w0:w1]
        pk = int(np.argmax(seg)); peak = seg[pk]
        if peak < 4 * floor: continue
        on = w0 + int(np.argmax(seg[: pk + 1] > 0.2 * peak))
        s0 = on - int(0.004 * SR)
        snd = clean[s0:s0 + L].copy()
        fade = np.ones(L, np.float32); fade[-int(0.03 * SR):] = np.linspace(1, 0, int(0.03 * SR)) ** 2; fade[:48] = np.linspace(0, 1, 48)
        snd *= fade
        bank.setdefault(kind(e), []).append((peak / floor, snd, (on - c) / SR))
    for k in bank: bank[k] = sorted(bank[k], key=lambda q: -q[0])[:10]
    lat = np.median([q[2] for v in bank.values() for q in v])
    print('the bank:', {k: len(v) for k, v in bank.items()}, f'(sounds start {lat * 1000:.0f} ms from the logged moment)')
    # even them out: each kind at its own level, every sound in it at the same loudness
    LEVEL = {'key': 1.0, 'space': 1.05, 'big': 1.0, 'up': 0.4, 'pad-d': 0.8, 'pad-u': 0.55}
    for k, v in bank.items():
        bank[k] = [s / (np.sqrt(np.mean(s[: int(0.03 * SR)] ** 2)) + 1e-9) * LEVEL.get(k, 0.8) for _, s, _ in v]
    fallback = {'space': 'big', 'big': 'key', 'up': None, 'pad-d': 'key', 'pad-u': 'up'}
    rng = np.random.default_rng(a.seed)
    out = np.zeros(len(x) + L, np.float32)
    last = None
    for e in ev:
        k = kind(e)
        while k and k not in bank: k = fallback.get(k)
        if not k: continue
        opts = [s for s in range(len(bank[k])) if (k, s) != last] or [0]
        s = int(rng.choice(opts)); last = (k, s)
        at = int((e['t'] + lat) * SR) - int(0.004 * SR)
        if at < 0: continue
        out[at:at + L] += bank[k][s] * 10 ** (rng.normal(0, 1.2) / 20)
    out = out[: len(x)]
    # loud and even: the clicks' typical peak to -6 dB, the odd louder one rounded off rather than setting the level
    peaks = [np.max(np.abs(out[int((e['t'] + lat) * SR) - 200: int((e['t'] + lat) * SR) + L])) for e in ev if e['t'] + lat > 0.01]
    out *= 10 ** (-6 / 20) / (np.median(peaks) + 1e-9)
    out = np.tanh(out * 1.2) / 1.2
    dest = os.path.join(ROOT, 'public/take/keys.wav')
    write(dest, out)
    print(f'wrote {os.path.relpath(dest, ROOT)} ({len(ev)} sounds, {len(out) / SR:.1f} s)')
    if a.clip:
        write(os.path.join(ROOT, a.clip), out[8 * SR: 30 * SR])
        r = x[8 * SR: 30 * SR]; write(os.path.join(ROOT, a.clip.replace('.wav', '-original.wav')), r / (np.max(np.abs(r)) + 1e-9) * 0.89)
        print('wrote the clip', a.clip, 'and the same stretch as the phone heard it')

if __name__ == '__main__':
    main()

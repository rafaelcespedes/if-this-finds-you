#!/usr/bin/env python3
# take-keysound.py: the take's sound made again from its own clicks, with nothing else in it. Every key going down
# and up, and every click of the trackpad, is in the take's log to the millisecond; the phone heard each one. The
# cleanest of them (nothing else near, well above the room's hiss) are cut out, cleaned and evened out into a small
# bank by kind (letters, the space bar, the big keys, keys coming up, the trackpad), and one from the bank is laid
# down at every moment in the log. So the keys are heard loud and clear, exactly when they happen, over silence.
# Or, with --like and --pad, the bank comes from recordings of the same keyboard instead (Freesound, CC0: a 2021
# MacBook Pro's keys, "Typing on Laptop Keyboard #2" by justamudkip, 853602; a MacBook Pro's trackpad by neilraouf,
# 467490): their single clicks found by their onsets, sorted into keys going down (the deepest of them for the space
# bar and the big keys), keys coming up, and the trackpad's press and release.
#   .venv-track/bin/python scripts/take-keysound.py "<phone video>" [--like typing.mp3 --pad trackpad.mp3] [--clip out/keysound-clip.wav]
# Writes public/take/keys.wav (on the phone video's clock: take time = its time + the tracker's offset).
import argparse, json, os, subprocess, tempfile, wave
import numpy as np
from scipy.signal import butter, sosfiltfilt, stft, istft, find_peaks

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

def onsets(x, rel=8):
    """the clicks in a recording: each onset (sample), its loudness over the floor, and its brightness (Hz)"""
    h = sosfiltfilt(butter(4, 200, 'hp', fs=SR, output='sos'), x)
    env = np.sqrt(np.convolve(h ** 2, np.ones(48) / 48, 'same')); fl = np.median(env)
    pk, pr = find_peaks(env, height=rel * fl, distance=int(0.035 * SR))
    F = np.fft.rfftfreq(1200, 1 / SR); out = []
    for p, v in zip(pk, pr['peak_heights']):
        seg = env[max(0, p - int(0.02 * SR)):p + 1]
        on = max(0, p - len(seg) + 1 + int(np.argmax(seg > 0.2 * v)))
        m = np.abs(np.fft.rfft(x[on:on + 1200] * np.hanning(len(x[on:on + 1200])), 1200))
        out.append((on, v / fl, float((F * m).sum() / m.sum())))
    return out

def cut(x, on, until, L):
    """one click from its onset: up to L long, ending before the next one, faded out"""
    n = min(L, until - on + int(0.004 * SR) - int(0.003 * SR)) if until else L
    s = x[max(0, on - int(0.004 * SR)):max(0, on - int(0.004 * SR)) + n].astype(np.float32).copy()
    tail = min(len(s) // 2, int(0.025 * SR))
    s[-tail:] *= np.linspace(1, 0, tail) ** 2; s[:48] *= np.linspace(0, 1, 48)
    return np.pad(s, (0, L - len(s)))

def bank_like(like, pad, L, tmp):
    bank = {}
    def load(p):
        w = os.path.join(tmp, os.path.basename(p) + '.wav'); ff('-i', os.path.expanduser(p), '-ac', '1', '-ar', str(SR), '-c:a', 'pcm_s16le', w); return read(w)
    x = load(like); o = onsets(x)
    starts = [q[0] for q in o] + [len(x)]
    downs = [(i, q) for i, q in enumerate(o) if q[1] > 40]
    loud = sorted(q[1] for _, q in downs); top = loud[int(0.95 * len(loud))]
    clean = [(i, q) for i, q in downs if q[1] < top and starts[i + 1] - q[0] > int(0.06 * SR)]
    br = sorted(q[2] for _, q in clean); deep = br[int(0.2 * len(br))]
    bank['space'] = [cut(x, q[0], starts[i + 1], L) for i, q in clean if q[2] <= br[int(0.08 * len(br))]][:8]
    bank['big'] = [cut(x, q[0], starts[i + 1], L) for i, q in clean if br[int(0.08 * len(br))] < q[2] <= deep][:10]
    bank['key'] = [cut(x, q[0], starts[i + 1], L) for i, q in clean if q[2] > deep][::3][:14]
    ups = [(i, q) for i, q in enumerate(o) if 10 < q[1] < 25 and any(0.05 * SR < q[0] - d[0] < 0.16 * SR for _, d in downs)]
    bank['up'] = [cut(x, q[0], starts[i + 1], L) for i, q in ups if starts[i + 1] - q[0] > int(0.05 * SR)][::2][:12]
    y = load(pad); o = onsets(y); starts = [q[0] for q in o] + [len(y)]
    press = [i for i, q in enumerate(o) if q[1] > 400]
    bank['pad-d'] = [cut(y, o[i][0], starts[i + 1], L) for i in press]
    bank['pad-u'] = [cut(y, o[j][0], starts[j + 1], L) for i in press for j in range(i + 1, min(i + 4, len(o))) if 100 < o[j][1] < 400 and o[j][0] - o[i][0] < 0.25 * SR][:6]
    return bank

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('video')
    ap.add_argument('--clip', help='also write a stretch of it to listen to (video seconds 8 to 30)')
    ap.add_argument('--seed', type=int, default=7)
    ap.add_argument('--like', help="a recording of the keyboard's typing to take the keys' sounds from")
    ap.add_argument('--pad', help="a recording of the trackpad's clicks (with --like)")
    ap.add_argument('--room', type=float, default=-54, help="a quiet room under the clicks, dB (its loudness; 0 for none)")
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
    print('his own clicks:', {k: len(v) for k, v in bank.items()}, f'(sounds start {lat * 1000:.0f} ms from the logged moment)')
    if a.like:
        ref = bank_like(a.like, a.pad, L, tmp)
        bank = {k: [(1, s, 0) for s in v] for k, v in ref.items() if v}
        print('the bank, from the reference recordings:', {k: len(v) for k, v in bank.items()})
    # even them out: each kind at its own level, every sound in it at the same loudness
    LEVEL = {'key': 1.0, 'space': 1.1, 'big': 1.0, 'up': 0.35, 'pad-d': 0.9, 'pad-u': 0.6}
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
    if a.room:
        # a quiet room under it all, so the silence between clicks isn't dead: soft noise, warm (mostly low and
        # middle, none of the AC's rumble), breathing a little louder and softer over a few seconds
        n = rng.standard_normal(len(out) + SR).astype(np.float32)
        room = sosfiltfilt(butter(2, [120, 3500], 'bandpass', fs=SR, output='sos'), n)[: len(out)]
        t = np.arange(len(out)) / SR
        room *= 1 + 0.35 * np.sin(2 * np.pi * 0.07 * t + 1.3) + 0.2 * np.sin(2 * np.pi * 0.19 * t)
        room *= 10 ** (a.room / 20) / (np.sqrt(np.mean(room ** 2)) + 1e-9)
        out = out + room
    dest = os.path.join(ROOT, 'public/take/keys.wav')
    write(dest, out)
    print(f'wrote {os.path.relpath(dest, ROOT)} ({len(ev)} sounds, {len(out) / SR:.1f} s)')
    if a.clip:
        write(os.path.join(ROOT, a.clip), out[8 * SR: 30 * SR])
        r = x[8 * SR: 30 * SR]; write(os.path.join(ROOT, a.clip.replace('.wav', '-original.wav')), r / (np.max(np.abs(r)) + 1e-9) * 0.89)
        print('wrote the clip', a.clip, 'and the same stretch as the phone heard it')

if __name__ == '__main__':
    main()

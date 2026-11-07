#!/usr/bin/env python3
# take-denoise.py: the phone video's sound without the room's steady hiss (the laptop's fan, the air): a spectral gate.
# The hiss is the same all the way through, so its level at each pitch is read from the quieter moments (each
# pitch's 30th percentile over the whole take), and the low rumble under the keys' sound is rolled off; everything well above it (key clicks, the trackpad) passes, the rest
# is turned down to a floor (not to silence, which sounds like a gate). Writes the clean sound back into the video.
#   .venv-track/bin/python scripts/take-denoise.py public/take/hands.mp4
import os, subprocess, sys, tempfile, wave
import numpy as np
from scipy.signal import stft, istft
from scipy.ndimage import uniform_filter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def ff(*args): subprocess.run(['npx', 'remotion', 'ffmpeg', '-v', 'error', '-y', *args], cwd=ROOT, check=True)

def main(video, strength=2.4, floor=0.08, pct=30, low=(90, 160)):
    tmp = tempfile.mkdtemp()
    raw, clean, out = os.path.join(tmp, 'raw.wav'), os.path.join(tmp, 'clean.wav'), os.path.join(tmp, 'out.mp4')
    ff('-i', video, '-vn', '-ar', '48000', '-c:a', 'pcm_s16le', raw)
    w = wave.open(raw); ch, sr = w.getnchannels(), w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32).reshape(-1, ch) / 32768
    y = np.zeros_like(x)
    for c in range(ch):
        f, t, X = stft(x[:, c], sr, nperseg=2048, noverlap=1536)
        mag = np.abs(X)
        noise = np.percentile(mag, pct, axis=1, keepdims=True)
        gain = np.clip(1 - strength * noise / np.maximum(mag, 1e-9), 0, 1)
        # smoothed across pitch and a few frames, so the gate doesn't chirp
        gain = uniform_filter(gain, size=(5, 3))
        gain = floor + (1 - floor) * gain
        # the air is mostly a low rumble, under where the keys sound: rolled off below about 120 Hz
        gain *= np.clip((f[:, None] - low[0]) / (low[1] - low[0]), 0, 1)
        _, yc = istft(X * gain, sr, nperseg=2048, noverlap=1536)
        y[:, c] = yc[: len(x)]
    o = wave.open(clean, 'wb'); o.setnchannels(ch); o.setsampwidth(2); o.setframerate(sr)
    o.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes()); o.close()
    ff('-i', video, '-i', clean, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', out)
    os.replace(out, video)
    print(f'cleaned the sound of {video} ({ch} channel{"s" if ch > 1 else ""}, {len(x) / sr:.1f} s)')

if __name__ == '__main__':
    main(sys.argv[1])

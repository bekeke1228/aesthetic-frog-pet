#!/usr/bin/env python3
"""生成桌宠提示音（无版权，纯合成）。"""

import math
import os
import struct
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOUND_DIR = os.path.join(ROOT, "assets", "sounds")
RATE = 44100


def synth(notes, total, decay=0.12):
    """notes: [(freq_hz, start_s, dur_s), ...]，输出 PCM bytes。"""
    n = int(total * RATE)
    buf = [0.0] * n
    for freq, start, dur in notes:
        s0 = int(start * RATE)
        s1 = min(n, s0 + int(dur * RATE))
        for i in range(s0, s1):
            t = (i - s0) / RATE
            env = math.exp(-decay * t)
            buf[i] += 0.35 * env * math.sin(2 * math.pi * freq * t)
    peak = max(1.0, max(abs(v) for v in buf))
    data = bytearray()
    for v in buf:
        data += struct.pack("<h", int(32767 * 0.9 * v / peak))
    return bytes(data)


def write(name, pcm):
    path = os.path.join(SOUND_DIR, name)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(RATE)
        wf.writeframes(pcm)
    print("saved", os.path.relpath(path, ROOT))


def main():
    os.makedirs(SOUND_DIR, exist_ok=True)
    write("reminder.wav", synth([(880, 0.0, 0.16), (660, 0.18, 0.2)], 0.45, decay=10))
    write("done.wav", synth(
        [(523.25, 0.0, 0.14), (659.25, 0.13, 0.14), (783.99, 0.26, 0.14), (1046.5, 0.39, 0.3)],
        0.85, decay=5,
    ))
    write("pop.wav", synth([(1320, 0.0, 0.08)], 0.12, decay=28))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Generate a classic telephone-bell ringtone for PardonMe.

The old sound was a thin, quiet tone. A real bell ringer is two brass gongs
struck alternately by a clapper ~20x/sec, which is why it warbles. We model
that: two partials (dominant + fifth) gated by a fast square warble, with a
sharp attack and slight decay per strike, then the standard cadence
(2s ring / 4s silence, trimmed to a 6s loop).

Output is peak-normalised to -0.5 dBFS so the phone's ring stream has the
loudest signal it can legally play without clipping.
"""
import math
import struct
import wave

RATE = 44100
DURATION = 6.0          # full cadence: 2s ring + 4s pause, loops seamlessly
RING_LEN = 2.0
WARBLE_HZ = 20.0        # clapper strike rate
F1, F2 = 1000.0, 800.0  # the two gongs
PEAK = 0.945            # ~-0.5 dBFS


def sample(t: float) -> float:
    if t >= RING_LEN:
        return 0.0

    # Which gong is being struck right now.
    phase = (t * WARBLE_HZ) % 1.0
    freq = F1 if phase < 0.5 else F2

    # Per-strike envelope: instant attack, quick decay — gives the metallic
    # "brrring" rather than a flat buzz.
    strike = (phase % 0.5) / 0.5
    env = math.exp(-4.0 * strike)

    # Fundamental plus a metallic partial; bells are inharmonic, hence 2.7x.
    v = math.sin(2 * math.pi * freq * t)
    v += 0.35 * math.sin(2 * math.pi * freq * 2.7 * t)

    # Soft edges on the whole burst so it doesn't click on loop.
    fade = min(1.0, t / 0.01, (RING_LEN - t) / 0.05)

    return v * env * fade


def main() -> None:
    n = int(RATE * DURATION)
    raw = [sample(i / RATE) for i in range(n)]

    peak = max(abs(v) for v in raw) or 1.0
    gain = PEAK / peak

    frames = b"".join(
        struct.pack("<h", int(max(-1.0, min(1.0, v * gain)) * 32767)) for v in raw
    )

    for path in (
        "assets/ringtone.wav",
        "android/app/src/main/res/raw/ringtone.wav",
    ):
        with wave.open(path, "w") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(frames)
        print(f"wrote {path}: {DURATION}s, peak {PEAK:.3f}")


if __name__ == "__main__":
    main()

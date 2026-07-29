import wave, math, struct, os

OUT = r"C:\Users\david\PardonMe\assets\ringtone.wav"
sr = 44100
amp = int(0.4 * 32767)
freqs = (440.0, 480.0)  # classic North-American telephone ring dual-tone

def tone(t):
    return sum(math.sin(2 * math.pi * f * t) for f in freqs) / len(freqs)

ring, silence, total = 2.0, 4.0, 18.0  # 3 rings: ring 2s, pause 4s
frames = bytearray()
for i in range(int(sr * total)):
    t = i / sr
    phase = t % (ring + silence)
    s = amp * tone(t) if phase < ring else 0.0
    frames += struct.pack('<h', int(max(-32768, min(32767, s))))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with wave.open(OUT, 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(sr)
    w.writeframes(bytes(frames))

print("wrote", OUT, os.path.getsize(OUT), "bytes")

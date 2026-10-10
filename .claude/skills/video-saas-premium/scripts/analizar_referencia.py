#!/usr/bin/env python3
"""Study a reference video before designing: cuts, a frame sheet and the audio energy curve.

  python3 analizar_referencia.py ~/Downloads/referencia.mp4 referencias/analisis/

Writes:
  hoja.jpg       frames every 0.25 s in a grid (read it left→right: rhythm, one focus per shot?)
  cortes.txt     time of every visual cut / big change (scene score > 0.12)
  audio.txt      loudness every 0.25 s (hits = SFX accents; long steady stretches = music bed; speech-like
                 gaps every few hundred ms = voice-over → confirm by listening or transcribing)
  resumen.txt    duration, size, fps, number of cuts, average shot length
Then look at the sheet and answer: how many ideas per shot, what causes each transition, what the defining
gesture is, how fast it moves, where the logo appears. Translate the THINKING, never copy the structure.
Needs ffmpeg + numpy + Pillow.
"""
import os, re, subprocess, sys
import numpy as np
from PIL import Image

if len(sys.argv) < 3: sys.exit(__doc__)
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate", "-show_entries",
                        "format=duration", "-of", "compact", src], capture_output=True, text=True).stdout
dur = float(re.search(r"duration=([\d.]+)", probe).group(1))
w, h = map(int, re.search(r"width=(\d+)\|height=(\d+)", probe).groups())

# frames every 0.25 s → grid
step, cols = 0.25, 8
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-vf", f"fps={1 / step},scale=320:-2", "-f", "image2pipe", "-vcodec", "png", "-"],
                     capture_output=True).stdout
frames, i = [], 0
while True:
    j = raw.find(b"\x89PNG", i + 1)
    chunk = raw[i:j] if j != -1 else raw[i:]
    if chunk.startswith(b"\x89PNG"):
        import io
        frames.append(Image.open(io.BytesIO(chunk)).convert("RGB"))
    if j == -1: break
    i = j
if frames:
    fw, fh = frames[0].size; rows = (len(frames) + cols - 1) // cols
    sheet = Image.new("RGB", (fw * cols, fh * rows), "black")
    for k, f in enumerate(frames): sheet.paste(f, ((k % cols) * fw, (k // cols) * fh))
    sheet.save(os.path.join(out, "hoja.jpg"), quality=85)

# cuts
log = subprocess.run(["ffmpeg", "-v", "info", "-i", src, "-vf", "select='gt(scene,0.12)',showinfo", "-f", "null", "-"], capture_output=True, text=True).stderr
cuts = [float(x) for x in re.findall(r"pts_time:([\d.]+)", log)]
open(os.path.join(out, "cortes.txt"), "w").write("\n".join(f"{c:.2f}" for c in cuts) + "\n")

# audio energy
a = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], capture_output=True).stdout
lines = []
if a:
    x = np.frombuffer(a, dtype=np.float32); n = 4000
    for k in range(len(x) // n):
        r = 20 * np.log10(np.sqrt(np.mean(x[k * n:(k + 1) * n] ** 2)) + 1e-9)
        lines.append(f"{k * 0.25:6.2f}s {r:6.1f} dB " + "#" * int(max(0, r + 60)))
open(os.path.join(out, "audio.txt"), "w").write("\n".join(lines) + "\n")

shots = len(cuts) + 1
summary = (f"duración {dur:.2f} s · {w}×{h} · {len(frames)} cuadros en la hoja\n"
           f"cortes detectados: {len(cuts)} · plano medio ≈ {dur / shots:.2f} s\n"
           f"(muchos movimientos continuos no cuentan como corte: mira la hoja)\n")
open(os.path.join(out, "resumen.txt"), "w").write(summary)
print(summary + f"→ {out}/hoja.jpg, cortes.txt, audio.txt")

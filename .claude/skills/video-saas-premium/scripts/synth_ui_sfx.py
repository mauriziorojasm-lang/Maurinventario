#!/usr/bin/env python3
"""Natural UI / chat sound kit, synthesized (48 kHz stereo, deterministic, no licence issues: it is generated).

Fills what sample packs lack for product films: phone keyboard taps (key-0…7), message sent (send), a phone
vibrating on a table (buzz, buzz2),
message received (pop, pop-hi), notification (notify), success, clicks, ticks, soft swishes and airs.

  python3 synth_ui_sfx.py --out assets/sfx/ui

Chat recipe that sounds like the real thing: the patient/user TYPES (5–8 key taps with uneven gaps, ending
~0.14 s before the bubble) → "send" on the bubble · the other side's reply → "pop" · the typing indicator is silent.
Needs numpy.
"""
import argparse, numpy as np, wave, os
_ap = argparse.ArgumentParser(); _ap.add_argument("--out", default="assets/sfx/ui"); OUT = _ap.parse_args().out
os.makedirs(OUT, exist_ok=True)
SR = 48000
def t(d): return np.arange(int(SR * d)) / SR
def env(n, a=0.0008, d=0.03):
    x = np.arange(n) / SR; e = np.minimum(1, x / max(a, 1e-6)) * np.exp(-np.maximum(0, x - a) / d); return e
def bp(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); m = ((f > lo) & (f < hi)).astype(float)
    m = np.convolve(m, np.hanning(41) / np.hanning(41).sum(), "same"); return np.fft.irfft(X * m, len(x))
def noise(d, seed): return np.random.default_rng(seed).standard_normal(int(SR * d))
def tone(d, f0, f1=None, dec=0.05, harm=(1,), seed=0):
    x = t(d); f = f0 if f1 is None else f0 * (f1 / f0) ** (x / d); ph = 2 * np.pi * np.cumsum(f) / SR
    y = sum(np.sin(ph * h) / (i + 1) ** 1.5 for i, h in enumerate(harm)); return y * env(len(x), 0.001, dec)
def lp(x, hi): return bp(x, 20, hi)
def ir(seed, d=0.32, dec=0.07):
    n = np.random.default_rng(seed).standard_normal(int(SR * d)); x = np.arange(len(n)) / SR
    return lp(n * np.exp(-x / dec), 9000) * 0.06
IRL, IRR = ir(101), ir(202)
def save(name, y, gain=0.9, pad=0.05, wet=0.22, width=0.00035):
    y = lp(np.concatenate([y, np.zeros(int(SR * (pad + 0.3)))]), 15000)
    L = y + wet * np.convolve(y, IRL)[:len(y)]; R = np.roll(y, int(SR * width)) + wet * np.convolve(y, IRR)[:len(y)]
    st = np.stack([L, R], 1); st = st / (np.abs(st).max() + 1e-9) * gain
    st[-400:] *= np.linspace(1, 0, 400)[:, None]
    nz = np.where(np.abs(st).max(1) > 1e-3)[0]; st = st[: nz[-1] + 400] if len(nz) else st
    s16 = (st * 32767).astype("<i2")
    with wave.open(f"{OUT}/{name}.wav", "wb") as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(s16.tobytes())
def click(seed=1, f=3400, body=0.6, d=0.035):
    n = bp(noise(d, seed), 2500, 12000) * env(int(SR * d), 0.0003, 0.0025)
    return n + body * tone(d, f, f * 0.92, 0.012) + 0.35 * tone(d, 220, 180, 0.008)
save("click", click(1)); save("click-soft", click(2, 2600, 0.4) * 0.7, 0.6); save("click-hi", click(3, 4800, 0.8, 0.03))
for i, f in enumerate([5200, 5800, 6400, 7000]): save(f"tick-{i}", tone(0.04, f, f * 0.97, 0.006, (1, 2.7)) + 0.3 * bp(noise(0.04, 40 + i), 6000, 14000) * env(int(SR * 0.04), 0.0002, 0.0015), 0.5)
save("tick", tone(0.04, 6200, 6000, 0.006, (1, 2.7)) + 0.3 * bp(noise(0.04, 4), 6000, 14000) * env(int(SR * 0.04), 0.0002, 0.0015), 0.55)
for i in range(8):   # keyboard taps (mechanical, low-profile)
    d = 0.06; k = bp(noise(d, 10 + i), 1800, 7000) * env(int(SR * d), 0.0002, 0.004) + 0.8 * tone(d, 140 + i * 9, 110, 0.012) + 0.25 * bp(noise(d, 30 + i), 300, 900) * env(int(SR * d), 0.0005, 0.01)
    save(f"key-{i}", k, 0.5 + 0.06 * (i % 3), wet=0.12)
save("pop", tone(0.09, 950, 520, 0.03, (1, 2)) + 0.4 * click(5, 3000, 0.2, 0.09), 0.8)
save("pop-hi", tone(0.08, 1400, 820, 0.025, (1, 2)) + 0.35 * click(6, 4200, 0.2, 0.08), 0.75)
save("send", tone(0.12, 560, 1180, 0.045, (1, 2, 3)) + 0.3 * click(7, 3600, 0.2, 0.12), 0.75)
def bell(fs, gaps, d=0.6, dec=0.18):
    y = np.zeros(int(SR * (d + sum(gaps))))
    for f, g in zip(fs, [0] + list(np.cumsum(gaps))):
        s = int(SR * g); b = tone(d, f, None, dec, (1, 2.01, 3.98)) + 0.15 * tone(d, f * 5.4, None, dec / 4); y[s:s + len(b)] += b
    return y
save("notify", bell([1318.5, 1975.5], [0.085], 0.45, 0.12), 0.6)
save("success", bell([1046.5, 1318.5, 1568.0], [0.07, 0.07], 0.7, 0.2), 0.6)
save("snap", click(8, 2200, 0.5, 0.08) + 0.9 * tone(0.08, 160, 90, 0.025), 0.85)
def swish(d=0.22, lo=2500, hi=11000, seed=9, peak=0.45):
    x = t(d); e = np.exp(-((x - d * peak) / (d * 0.22)) ** 2); return bp(noise(d, seed), lo, hi) * e
def airy(d, f0, f1, seed, peak=0.5):
    x = t(d); e = np.exp(-((x - d * peak) / (d * 0.25)) ** 2); n = noise(d, seed)
    out = np.zeros_like(n)
    for k in range(6):
        seg = slice(int(len(n) * k / 6), int(len(n) * (k + 1) / 6)); fc = f0 * (f1 / f0) ** ((k + .5) / 6)
        out[seg] = bp(n, fc * 0.6, fc * 1.6)[seg]
    return out * e
save("air-up", airy(0.45, 900, 4200, 21), 0.42, wet=0.35); save("air-down", airy(0.45, 4200, 900, 22), 0.42, wet=0.35)
save("swish", swish(), 0.45); save("swish-low", swish(0.32, 700, 5000, 12, 0.5), 0.5); save("swish-fast", swish(0.14, 3500, 13000, 13, 0.4), 0.4)
save("thock", tone(0.12, 120, 70, 0.04) + 0.5 * click(14, 1800, 0.3, 0.12), 0.9)
g = bell([2637, 3951], [0.04], 0.5, 0.09); g[:24000] += 0.4 * tone(0.5, 5274, None, 0.03); save("glass", g, 0.45)
def buzz(d=0.32, f=172, seed=1):   # phone vibrating on a hard surface: motor hum + body rattle + grit, soft one-pole lowpass
    x = t(d); rng = np.random.default_rng(seed)
    y = (np.sign(np.sin(2 * np.pi * f * x)) * 0.3 + np.sin(2 * np.pi * f * x) * 0.6 + np.sin(2 * np.pi * f * 2 * x) * 0.5 + np.sin(2 * np.pi * f * 3.02 * x) * 0.35
         + rng.standard_normal(len(x)) * 0.18 * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * f * x))))
    y *= np.minimum(1, x / 0.012) * np.minimum(1, (d - x) / 0.03)
    out = np.zeros_like(y)
    for i in range(1, len(y)): out[i] = out[i - 1] + 0.18 * (y[i] - out[i - 1])
    return out
save("buzz", buzz(0.32, 172, 1), 0.75, wet=0.05)
save("buzz2", np.concatenate([buzz(0.26, 170, 2), np.zeros(int(SR * 0.12)), buzz(0.26, 174, 3)]), 0.75, wet=0.05)
print(sorted(os.listdir(OUT)))

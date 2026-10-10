#!/usr/bin/env python3
"""Audio post for motion pieces: VO track, music bed, SFX peak alignment, mix check. Needs ffmpeg + numpy.

  # word times on screen = start + align word time. Print them for sayIn():
  audio_tools.py words --align vo/align.json --key L1 --start 0.45 --idx 0,1,2,3,4
  # place VO lines on the timeline -> vo-mix.mp3 (-15 LUFS)
  audio_tools.py vo-mix --dir vo --starts starts.json --dur 37 --out vo-mix.mp3          # starts.json {"L1": 0.45, ...}
  # extend the APPROVED music sample by whole bars, low-pass it until the drop, dip at a freeze, open on a downbeat,
  # and sidechain-duck it under the VO -> music-mix.mp3 (about -20 LUFS before ducking)
  audio_tools.py music --sample musica.mp3 --vo vo-mix.mp3 --dur 37 --drop 12.98 --freeze 8.95 --out music-mix.mp3
  # a LONG generated track with its own intro → drop (e.g. 45 s): find its real drop + beat, trim it so the drop lands on
  # --at (the word that names the product), keep it continuous, duck it under the VO, print the beat grid for cutting
  audio_tools.py music-fit --sample musica.mp3 --vo vo-mix.mp3 --at 5.06 --dur 37 --out music-mix.mp3
  # when does each SFX peak? (start = event_time - peak)
  audio_tools.py peaks assets/sfx/premium/*.mp3
  # simulate the full mix from the composition's <audio> tags and list moments where SFX mask the VO
  audio_tools.py check index.html --vo assets/audio/vo-mix.mp3 --music assets/audio/music-mix.mp3
"""
import argparse, glob, json, os, re, subprocess, sys, tempfile
import numpy as np

os.environ["LC_ALL"] = "C"


def pcm(path, sr=8000, ch=1):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", str(ch), "-ar", str(sr), "-f", "f32le", "-"], capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    return x.reshape(-1, ch) if ch > 1 else x


def lufs(path):
    r = subprocess.run(["ffmpeg", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    s = r.split("Summary")[-1]
    return " ".join(l.strip() for l in s.splitlines() if l.strip().startswith(("I:", "Peak:")))


def bpm_phase(x, sr):
    hop = 256; n = len(x) // hop
    e = np.array([np.sum(x[i * hop:(i + 1) * hop] ** 2) for i in range(n)])
    env = np.maximum(0, np.diff(np.log(e + 1e-9))); fps = sr / hop; best = (0, 120)
    for b in np.arange(80, 160, 0.05):
        lag = fps * 60 / b; s = sum(np.sum(env[:-int(round(lag * k))] * env[int(round(lag * k)):]) for k in (1, 2, 4))
        if s > best[0]: best = (s, b)
    beat = 60 / best[1]
    ph = max((np.sum([env[int(round((o + k * beat) * fps))] for k in range(int((len(x) / sr - o) / beat) - 1)]), o) for o in np.arange(0, beat, 0.005))[1]
    return best[1], ph


def main():
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest="cmd", required=True)
    w = sub.add_parser("words"); w.add_argument("--align", required=True); w.add_argument("--key", required=True); w.add_argument("--start", type=float, required=True); w.add_argument("--idx")
    v = sub.add_parser("vo-mix"); v.add_argument("--dir", required=True); v.add_argument("--starts", required=True); v.add_argument("--dur", type=float, required=True); v.add_argument("--out", required=True)
    m = sub.add_parser("music"); m.add_argument("--sample", required=True); m.add_argument("--vo"); m.add_argument("--dur", type=float, required=True)
    m.add_argument("--drop", type=float, help="time where the full mix opens (lands on a downbeat)"); m.add_argument("--freeze", type=float); m.add_argument("--out", required=True)
    f = sub.add_parser("music-fit"); f.add_argument("--sample", required=True); f.add_argument("--vo"); f.add_argument("--at", type=float, required=True)
    f.add_argument("--dur", type=float, required=True); f.add_argument("--drop", type=float, help="drop time inside the sample (auto if omitted)"); f.add_argument("--out", required=True)
    p = sub.add_parser("peaks"); p.add_argument("files", nargs="+")
    c = sub.add_parser("check"); c.add_argument("html"); c.add_argument("--vo"); c.add_argument("--music"); c.add_argument("--dur", type=float, default=0)
    a = ap.parse_args()

    if a.cmd == "words":
        al = json.load(open(a.align))[a.key]; idx = [int(i) for i in a.idx.split(",")] if a.idx else range(len(al))
        print(json.dumps([round(a.start + al[i][1], 3) for i in idx]), "  # ", " ".join(al[i][0] for i in idx), "| line ends", round(a.start + al[-1][2], 2))

    elif a.cmd == "vo-mix":
        st = json.load(open(a.starts)); args, fc, mix = [], "", ""
        for i, (k, t) in enumerate(st.items()):
            args += ["-i", os.path.join(a.dir, k + ".mp3")]; ms = int(round(t * 1000)); fc += f"[{i}:a]adelay={ms}|{ms}[v{i}];"; mix += f"[v{i}]"
        fc += f"{mix}amix=inputs={len(st)}:normalize=0,apad=whole_dur={a.dur},atrim=0:{a.dur},loudnorm=I=-15:TP=-1.5:LRA=7,aresample=48000[o]"
        subprocess.run(["ffmpeg", "-v", "error", "-y", *args, "-filter_complex", fc, "-map", "[o]", "-c:a", "libmp3lame", "-b:a", "256k", a.out], check=True)
        print(a.out, lufs(a.out))

    elif a.cmd == "music":
        sr = 11025; x = pcm(a.sample, sr); dur = len(x) / sr; bpm, ph = bpm_phase(x, sr); bar = 60 / bpm * 4
        # groove region = before the sample's own fade (loudness drops > 6 dB vs median)
        sec = [20 * np.log10(np.sqrt(np.mean(x[i * sr:(i + 1) * sr] ** 2)) + 1e-9) for i in range(int(dur))]
        med = np.median(sec); gend = next((i for i, d in enumerate(sec) if d < med - 6), int(dur))
        nb = max(1, int((gend - ph) // bar)); B = ph + nb * bar
        reps = int(np.ceil((a.dur + 2) / (B - ph))) + 1
        delay = 0.0
        if a.drop is not None:   # shift so a downbeat lands exactly on the drop
            k = np.floor((a.drop - ph) / bar); delay = (a.drop - (ph + k * bar)) % bar
        print(f"bpm {bpm:.2f} bar {bar:.3f}s groove {ph:.2f}-{B:.2f}s, delay {delay:.3f}s")
        tmp = tempfile.mkdtemp(); ext = os.path.join(tmp, "ext.wav")
        n = reps + 1; fc = f"[0]asplit={n}" + "".join(f"[s{i}]" for i in range(n)) + ";"
        for i in range(reps): fc += f"[s{i}]atrim={ph:.4f}:{B:.4f},asetpts=PTS-STARTPTS[p{i}];"
        fc += f"[s{reps}]atrim={B - bar:.4f},asetpts=PTS-STARTPTS[p{reps}];"
        chain = "[p0]"
        for i in range(1, reps + 1): fc += f"{chain}[p{i}]acrossfade=d=0.03[q{i}];"; chain = f"[q{i}]"
        fc = fc[:-1]
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.sample, "-filter_complex", fc, "-map", chain, "-c:a", "pcm_s16le", ext], check=True)
        d = int(delay * 1000); drop = a.drop if a.drop is not None else 0; fr = a.freeze if a.freeze is not None else drop
        lp = f"volume='if(lt(t,{fr}),0.9,if(lt(t,{drop - 0.38}),0.35,if(lt(t,{drop}),0.35*({drop}-t)/0.38,0)))':eval=frame"
        full = f"volume='if(lt(t,{drop - 0.38}),0,if(lt(t,{drop}),(t-{drop - 0.38})/0.38,1))':eval=frame"
        g = (f"[0]adelay={d}|{d},apad=whole_dur={a.dur},atrim=0:{a.dur},aresample=48000,asplit[m1][m2];"
             f"[m1]lowpass=f=520,lowpass=f=520,{lp}[lp];[m2]{full}[full];"
             f"[lp][full]amix=inputs=2:normalize=0,afade=t=in:d=0.6,afade=t=out:st={a.dur - 1.4}:d=1.4,loudnorm=I=-20:TP=-2:LRA=9")
        ins = ["-i", ext]
        if a.vo: ins += ["-i", a.vo]; g += f"[m];[1]aresample=48000[sc];[m][sc]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=300,apad=whole_dur={a.dur},atrim=0:{a.dur}[o]"
        else: g += "[o]"
        subprocess.run(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", g, "-map", "[o]", "-c:a", "libmp3lame", "-b:a", "256k", a.out], check=True)
        print(a.out, lufs(a.out))

    elif a.cmd == "music-fit":
        sr = 22050; x = pcm(a.sample, sr); h = sr // 100
        env = np.array([np.sqrt(np.mean(x[i * h:(i + 1) * h] ** 2)) for i in range(len(x) // h)]); db = 20 * np.log10(env + 1e-9)
        sm = np.convolve(db, np.ones(25) / 25, "same")                              # 0.25 s smoothed loudness
        if a.drop is None:          # the drop = first moment the loudness jumps from well below to the sustained groove level
            groove = np.percentile(sm, 75); i = None
            for t in range(60, len(sm) - 60):
                if sm[t + 50] > groove - 3 and sm[t - 50] < groove - 8 and sm[t + 50] - sm[t - 50] > 6: i = t; break
            if i is None: sys.exit("could not find a drop: pass --drop <seconds in the sample>")
            on = np.maximum(0, np.diff(db)); w0 = max(0, i - 20); k = w0 + int(np.argmax(on[w0:i + 100]))
            drop = k / 100
        else: drop = a.drop
        on = np.maximum(0, np.diff(db)); seg = on[int(drop * 100):int(drop * 100) + 2000]; seg = seg - seg.mean()
        ac = np.correlate(seg, seg, "full")[len(seg) - 1:]; lags = np.arange(len(ac)) / 100; r = (lags > 0.35) & (lags < 0.8)
        beat = float(lags[r][np.argmax(ac[r])]) if r.any() else 0.5
        off = drop - a.at
        if off < 0: sys.exit(f"the drop ({drop:.2f}s) comes earlier in the sample than --at ({a.at}); pick a later --at or a sample with a longer intro")
        if off + a.dur > len(x) / sr: print(f"warning: sample ends at {len(x) / sr:.1f}s, the bed will be shorter than --dur", file=sys.stderr)
        fade = 0.6
        fc = f"[0:a]atrim=start={off:.3f}:duration={a.dur},asetpts=PTS-STARTPTS,afade=t=out:st={a.dur - fade:.3f}:d={fade},volume=0.9,aresample=48000[m]"
        cmd = ["ffmpeg", "-v", "error", "-y", "-i", a.sample]
        if a.vo:
            cmd += ["-i", a.vo]; fc += ";[1:a]aresample=48000[sc];[m][sc]sidechaincompress=threshold=0.04:ratio=5:attack=15:release=280:makeup=1[d]"; mp = "[d]"
        else: mp = "[m]"
        subprocess.run(cmd + ["-filter_complex", fc, "-map", mp, a.out], check=True)
        grid = [round(a.at + n * beat, 3) for n in range(0, int((a.dur - a.at) / beat) + 1)]
        print(f"drop in sample {drop:.2f}s → at {a.at}s (trim {off:.2f}s) · beat {beat:.3f}s ({60 / beat:.1f} BPM) · bar {4 * beat:.3f}s")
        print("bars at:", [g for k, g in enumerate(grid) if k % 4 == 0])
        print(a.out, "I:", lufs(a.out))

    elif a.cmd == "peaks":
        for f in sorted(set(sum([glob.glob(x) for x in a.files], []))):
            x = pcm(f); h = 80; e = np.array([np.sqrt(np.mean(x[i:i + h] ** 2)) for i in range(0, len(x) - h, h)])
            print(f"{os.path.basename(f):26} peak@{np.argmax(e) * h / 8000:.2f}s  dur {len(x) / 8000:.2f}s")

    elif a.cmd == "check":
        html = open(a.html).read(); base = os.path.dirname(os.path.abspath(a.html))
        tags = re.findall(r'<audio[^>]*data-start="([\d.]+)"[^>]*data-duration="([\d.]+)"[^>]*data-volume="([\d.]+)"[^>]*src="([^"]+)"', html)
        sfx = [t for t in tags if "sfx" in t[3]]
        dur = a.dur or max(float(s) + float(d) for s, d, _, _ in tags)
        tmp = tempfile.mkdtemp(); bus = os.path.join(tmp, "sfx.wav"); args, fc, mix = [], "", ""
        for i, (s, d, vol, src) in enumerate(sfx):
            args += ["-i", os.path.join(base, src)]; ms = int(float(s) * 1000)
            fc += f"[{i}:a]atrim=0:{d},volume={vol},adelay={ms}|{ms},aresample=48000[a{i}];"; mix += f"[a{i}]"
        fc += f"{mix}amix=inputs={len(sfx)}:normalize=0,apad=whole_dur={dur},atrim=0:{dur}[o]"
        subprocess.run(["ffmpeg", "-v", "error", "-y", *args, "-filter_complex", fc, "-map", "[o]", "-c:a", "pcm_s16le", bus], check=True)
        print("SFX bus", lufs(bus))
        if a.music: print("Music  ", lufs(a.music))
        if a.vo:
            print("VO     ", lufs(a.vo))
            def rms(p):
                x = pcm(p); return np.array([20 * np.log10(np.sqrt(np.mean(x[i:i + 4000] ** 2)) + 1e-9) for i in range(0, len(x) - 4000, 4000)])
            s, v = rms(bus), rms(a.vo)
            hits = [(i / 2, round(float(s[i]), 1), round(float(v[i]), 1)) for i in range(min(len(s), len(v))) if s[i] > v[i] - 3 and v[i] > -30]
            print("SFX masking VO (t, sfx dB, vo dB) — lower these:", hits or "none")


if __name__ == "__main__":
    main()

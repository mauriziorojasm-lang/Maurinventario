#!/usr/bin/env python3
"""ElevenLabs voice-over for motion pieces (word-level timestamps for on-screen sync).

Key: macOS Keychain item "elevenlabs-api-key" (default), or env ELEVENLABS_API_KEY, or --key-file PATH. Never in the project/skill.

  eleven_vo.py quota                      # plan + characters used
  eleven_vo.py voices                     # voices already on your account
  eleven_vo.py music --out musica-A.mp3 --seconds 22 --prompt "Elegant minimal deep house groove ... Instrumental, 120 BPM."
  # 1) find voices in the public library (Spanish narrators etc.)
  eleven_vo.py search --lang es --gender male --use narrative_story
  # 2) add library voices to the account (needs a free slot; starter tier = 10 custom voices)
  eleven_vo.py add VOICE_ID [VOICE_ID ...]
  # 3) let the USER pick by ear: same line, several voices -> samples/voz-<name>.mp3
  eleven_vo.py samples --out samples --text "Desde el primero de octubre, la ei pi ái de WhatsApp..." VOICE_ID ...
  # 4) final lines with timestamps -> out/L1.mp3 … + out/align.json {key: [[word, start, end], ...]}
  eleven_vo.py lines --voice VOICE_ID --script script.json --out assets/audio/vo

script.json: {"L1": "Desde el primero de octubre, la ei pi ái de WhatsApp cobra por tus mensajes.", "L2": "..."}
Write the VO exactly like the on-screen headline so words map 1:1, but spell acronyms phonetically:
"API" -> "ei pi ái", "IA" -> "i a". Model: eleven_multilingual_v2.
Starter tier limits: mp3_44100_128 max, 2 concurrent requests.
"""
import argparse, base64, json, os, sys, urllib.request, urllib.parse

API = "https://api.elevenlabs.io"


def key(args):
    """--key-file > $ELEVENLABS_API_KEY > macOS Keychain item "elevenlabs-api-key" (account = $USER).
    Store/rotate it with:  security add-generic-password -U -a "$USER" -s elevenlabs-api-key -w 'sk_...'"""
    if args.key_file:
        return open(args.key_file).read().strip()
    k = os.environ.get("ELEVENLABS_API_KEY")
    if not k:
        import subprocess
        r = subprocess.run(["security", "find-generic-password", "-a", os.environ.get("USER", ""), "-s", "elevenlabs-api-key", "-w"], capture_output=True, text=True)
        k = r.stdout.strip()
    if not k:
        sys.exit("No ElevenLabs key: add it to the Keychain (security add-generic-password -U -a \"$USER\" -s elevenlabs-api-key -w 'sk_...'), "
                 "or set ELEVENLABS_API_KEY / --key-file")
    return k


def call(k, path, body=None, method=None):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"xi-api-key": k, "Content-Type": "application/json"}, method=method)
    with urllib.request.urlopen(req) as r:
        data = r.read()
    try:
        return json.loads(data)
    except ValueError:
        return data


SETTINGS = {"stability": 0.5, "similarity_boost": 0.8, "style": 0.2, "use_speaker_boost": True}


def words_from_alignment(a):
    out, cur = [], None
    for ch, s0, e0 in zip(a["characters"], a["character_start_times_seconds"], a["character_end_times_seconds"]):
        if ch.isspace():
            if cur: out.append(cur); cur = None
        elif cur is None: cur = [ch, s0, e0]
        else: cur[0] += ch; cur[2] = e0
    if cur: out.append(cur)
    return [[w, round(s, 3), round(e, 3)] for w, s, e in out]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key-file")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search"); s.add_argument("--lang", default="es"); s.add_argument("--gender"); s.add_argument("--use"); s.add_argument("--q")
    a = sub.add_parser("add"); a.add_argument("ids", nargs="+")
    sub.add_parser("voices")
    sub.add_parser("quota")
    mu = sub.add_parser("music"); mu.add_argument("--out", required=True); mu.add_argument("--prompt", required=True); mu.add_argument("--seconds", type=float, default=22)
    m = sub.add_parser("samples"); m.add_argument("--out", required=True); m.add_argument("--text", required=True); m.add_argument("ids", nargs="+")
    l = sub.add_parser("lines"); l.add_argument("--voice", required=True); l.add_argument("--script", required=True); l.add_argument("--out", required=True)
    l.add_argument("--model", default="eleven_multilingual_v2"); l.add_argument("--lang", default="es")
    l.add_argument("--speed", type=float, help="0.7–1.2; <1 = slower read (e.g. 0.88)"); l.add_argument("--only", help="comma-separated keys to (re)generate")
    l.add_argument("--stability", type=float, help="eleven_v3: 0 creativa · 0.5 natural (por defecto) · 1 estable")
    args = ap.parse_args(); k = key(args)

    if args.cmd == "search":
        q = {"page_size": 20, "language": args.lang, "sort": "usage_character_count_1y"}
        if args.gender: q["gender"] = args.gender
        if args.use: q["use_cases"] = args.use
        if args.q: q["search"] = args.q
        for v in call(k, "/v1/shared-voices?" + urllib.parse.urlencode(q)).get("voices", []):
            print(v["voice_id"], "|", v["name"], "|", v.get("accent"), v.get("descriptive"), v.get("use_case"), "| uses", v.get("cloned_by_count"))
    elif args.cmd == "add":
        for vid in args.ids:
            hit = [v for v in call(k, "/v1/shared-voices?page_size=30&search=" + vid).get("voices", []) if v["voice_id"] == vid]
            if not hit: print("not found in library:", vid); continue
            v = hit[0]
            print(call(k, f"/v1/voices/add/{v['public_owner_id']}/{vid}", {"new_name": v["name"].split(" -")[0]}))
    elif args.cmd == "voices":
        for v in call(k, "/v2/voices?page_size=100").get("voices", []):
            print(v["voice_id"], "|", v["name"], "|", v.get("category"), (v.get("labels") or {}).get("accent", ""))
    elif args.cmd == "quota":
        d = call(k, "/v1/user/subscription"); print(d.get("tier"), d.get("character_count"), "/", d.get("character_limit"), "chars used")
    elif args.cmd == "music":   # instrumental style sample; no brand names in the prompt (ToS rejection)
        audio = call(k, "/v1/music?output_format=mp3_44100_128", {"model_id": "music_v1", "music_length_ms": int(args.seconds * 1000),
                                                                  "force_instrumental": True, "prompt": args.prompt})
        if isinstance(audio, dict): sys.exit(audio)
        open(args.out, "wb").write(audio); print("ok", args.out)
    elif args.cmd == "samples":
        os.makedirs(args.out, exist_ok=True)
        for vid in args.ids:
            info = call(k, f"/v1/voices/{vid}"); name = (info.get("name") if isinstance(info, dict) else vid) or vid
            audio = call(k, f"/v1/text-to-speech/{vid}?output_format=mp3_44100_128",
                         {"text": args.text, "model_id": "eleven_multilingual_v2", "language_code": "es", "voice_settings": SETTINGS})
            p = os.path.join(args.out, f"voz-{name.split(' ')[0]}.mp3"); open(p, "wb").write(audio); print("ok", p)
    elif args.cmd == "lines":
        os.makedirs(args.out, exist_ok=True)
        script = json.load(open(args.script)); keys = list(script)
        ap_ = os.path.join(args.out, "align.json"); align = json.load(open(ap_)) if os.path.exists(ap_) else {}
        only = set(args.only.split(",")) if args.only else None
        v3 = args.model.startswith("eleven_v3")   # v3: solo admite stability (0 / 0.5 / 1) y no usa previous/next_text
        vs = {"stability": args.stability if args.stability is not None else 0.5} if v3 else {**SETTINGS, **({"speed": args.speed} if args.speed else {})}
        for i, kk in enumerate(keys):
            if only and kk not in only: continue
            body = {"text": script[kk], "model_id": args.model, "language_code": args.lang, "voice_settings": vs}
            if not v3: body.update(previous_text=script[keys[i - 1]] if i else None, next_text=script[keys[i + 1]] if i + 1 < len(keys) else None)
            d = call(k, f"/v1/text-to-speech/{args.voice}/with-timestamps?output_format=mp3_44100_128", body)
            open(os.path.join(args.out, f"{kk}.mp3"), "wb").write(base64.b64decode(d["audio_base64"]))
            align[kk] = words_from_alignment(d["alignment"])
            print(kk, " ".join(f"{w}@{s:.2f}" for w, s, e in align[kk]), "| end", align[kk][-1][2])
        json.dump(align, open(os.path.join(args.out, "align.json"), "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()

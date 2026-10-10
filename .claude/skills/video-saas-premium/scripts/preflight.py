#!/usr/bin/env python3
"""Revisión previa: comprueba todo lo que la skill necesita ANTES de empezar un video y dice cómo arreglar lo que falte.

  python3 preflight.py            # imprime la lista ✓ / ✗ / ·  (sale con código 1 si falta algo obligatorio)

Solo usa la librería estándar (corre aunque falten numpy o Pillow). No imprime ninguna API key.
"""
import glob, os, platform, re, shutil, subprocess, sys

BOTANICA_URL = "https://mgulifes.gumroad.com/l/botanicafree"
MAC = platform.system() == "Darwin"
rows, missing = [], 0


def run(cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    except Exception:
        return None


def check(ok, name, detail, fix="", required=True):
    global missing
    mark = "✓" if ok else ("✗" if required else "·")
    if not ok and required: missing += 1
    rows.append(f"{mark} {name}: {detail}" + ("" if ok or not fix else f"\n    → {fix}"))


# Node 22+ (npx hyperframes). Also look inside nvm/fnm/volta folders: agents often run a non-login shell.
def find_node():
    cands = [shutil.which("node")] + sorted(glob.glob(os.path.expanduser("~/.nvm/versions/node/*/bin/node")), reverse=True) \
        + glob.glob(os.path.expanduser("~/.volta/bin/node")) + glob.glob(os.path.expanduser("~/.local/share/fnm/node-versions/*/installation/bin/node"))
    best = None
    for c in filter(None, cands):
        r = run([c, "-v"])
        m = r and re.match(r"v(\d+)", r.stdout.strip())
        if m and (best is None or int(m.group(1)) > best[1]): best = (c, int(m.group(1)))
    return best


node = find_node()
if node and node[1] >= 22:
    inpath = shutil.which("node") == node[0]
    check(True, "Node", f"v{node[1]} ({node[0]})" + ("" if inpath else f"  — no está en el PATH: usa  export PATH=\"{os.path.dirname(node[0])}:$PATH\""))
else:
    check(False, "Node 22+", f"encontrado v{node[1]}" if node else "no encontrado",
          "instala Node 22 o superior (https://nodejs.org o `nvm install 22`)")

for tool in ("ffmpeg", "ffprobe"):
    check(bool(shutil.which(tool)), tool, shutil.which(tool) or "no encontrado",
          "macOS: `brew install ffmpeg` · Linux: `sudo apt install ffmpeg` · Windows: `winget install ffmpeg`")

chrome = next((c for c in [os.environ.get("CHROME_PATH"), "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                           "/Applications/Chromium.app/Contents/MacOS/Chromium", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                           shutil.which("google-chrome"), shutil.which("google-chrome-stable"), shutil.which("chromium"), shutil.which("chromium-browser"),
                           r"C:\Program Files\Google\Chrome\Application\chrome.exe"] if c and os.path.exists(c)), None)
check(bool(chrome), "Chrome / Chromium", chrome or "no encontrado", "instala Google Chrome (para extraer la marca de la web) o define CHROME_PATH")

# A Python that has numpy + Pillow (the default python3 often doesn't, e.g. a fresh Homebrew Python).
pys = []
for c in [shutil.which("python3"), "/usr/bin/python3", sys.executable] + sorted(glob.glob("/opt/homebrew/bin/python3.*") + glob.glob("/usr/local/bin/python3.*")):
    if c and os.path.exists(c) and not c.endswith("-config") and os.path.realpath(c) not in [os.path.realpath(p) for p in pys]: pys.append(c)
good = next((p for p in pys if (r := run([p, "-c", "import numpy, PIL"])) and r.returncode == 0), None)
check(bool(good), "Python con numpy + Pillow", good or "ningún python3 tiene numpy y Pillow",
      f"`{shutil.which('python3') or 'python3'} -m pip install numpy pillow` (si pip se niega: añade --user o usa un venv)")
dflt = shutil.which("python3")
if good and (not dflt or os.path.realpath(good) != os.path.realpath(dflt)):
    rows.append(f"    (usa `{good}` para los scripts de la skill: el python3 por defecto no tiene numpy/Pillow)")

# Botanica: the sound library the skill uses FIRST.
bot = None
for base in ("~/Downloads", "~/Desktop", "~/Music", "~/Descargas", "~/Escritorio"):
    hits = [h for h in sorted(glob.glob(os.path.join(os.path.expanduser(base), "*otanica*"))) if os.path.isdir(h)]
    if hits: bot = hits[0]; break
nwav = len(glob.glob(os.path.join(bot, "**", "*.wav"), recursive=True)) if bot else 0
check(bool(bot) and nwav > 0, "Efectos de sonido Botanica (necesario para el resultado premium)", f"{bot} ({nwav} sonidos)" if bot else "no encontrado",
      f"descárgalo GRATIS en {BOTANICA_URL} (pon $0 si pide precio), descomprímelo en ~/Downloads y vuelve a correr esto. "
      "Sin Botanica los efectos de sonido quedan pobres (solo el kit sintetizado).")

# ElevenLabs (optional): only check that a key EXISTS, never print it.
has_key = bool(os.environ.get("ELEVENLABS_API_KEY"))
if not has_key and MAC:
    r = run(["security", "find-generic-password", "-a", os.environ.get("USER", ""), "-s", "elevenlabs-api-key"])
    has_key = bool(r and r.returncode == 0)
check(has_key, "ElevenLabs (voz en off y música)", "key guardada" if has_key else "sin key → NO habrá voz en off ni música generada",
      "crea una cuenta en elevenlabs.io y guarda tu API key en el llavero (nunca en el chat): "
      "security add-generic-password -U -a \"$USER\" -s elevenlabs-api-key -w 'sk_...'  · Linux/Windows: export ELEVENLABS_API_KEY=sk_... "
      "Sin ella el video va solo con texto y efectos, o con voz y música que tú traigas.",
      required=False)
# Apple emoji + SF Pro only exist on macOS
emoji_ok = MAC and os.path.exists("/System/Library/Fonts/Apple Color Emoji.ttc")
check(emoji_ok, "Emojis de Apple y SF Pro (macOS)", "disponibles" if emoji_ok else "no disponibles en este sistema",
      "los emojis se verán con la fuente de emojis de tu sistema y la tipografía será Inter o Geist en vez de SF Pro.", required=False)

print("Revisión de la skill video-saas-premium\n")
print("\n".join(rows))
print("\n" + ("Todo listo." if not missing else f"Faltan {missing} cosa(s) obligatoria(s): arréglalas antes de empezar."))
sys.exit(1 if missing else 0)

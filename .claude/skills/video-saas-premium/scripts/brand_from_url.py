"""Extract a brand kit from a website so the motion piece adapts to the project.

Usage:  python3 brand_from_url.py https://example.com <out_dir>
Writes  <out_dir>/brand.json  +  <out_dir>/fonts/*  +  <out_dir>/logo.*  +  <out_dir>/shot-desktop.png / shot-mobile.png

brand.json = {url, title, description, colors:{bg, fg, accent, accent2, muted, all:[...]},
              fonts:{display, body, files:[...]}, logo, shots:{desktop, mobile}, headlines:[...]}
Colour roles are a best guess (CSS custom properties first, then frequency) — ALWAYS eyeball the
screenshots and fix roles by hand if needed. Uses headless Chrome for screenshots (macOS path).
"""
import colorsys, json, os, re, subprocess, sys, urllib.parse, urllib.request
from collections import Counter

UA = {"User-Agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/124 Safari/537.36"}
import shutil
def _find_chrome():
    """$CHROME_PATH, then common Chrome/Chromium/Edge locations on macOS, Linux and Windows."""
    cands = [os.environ.get("CHROME_PATH"), "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
             "/Applications/Chromium.app/Contents/MacOS/Chromium", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
             shutil.which("google-chrome"), shutil.which("google-chrome-stable"), shutil.which("chromium"), shutil.which("chromium-browser"),
             r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"]
    for c in cands:
        if c and os.path.exists(c): return c
    sys.exit("Chrome/Chromium not found: install it or set CHROME_PATH")
CHROME = _find_chrome()

def get(url, binary=False):
    data = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read()
    return data if binary else data.decode("utf-8", "ignore")

def hex6(h):
    h = h.lstrip("#")
    return ("#" + "".join(c * 2 for c in h[:3])).lower() if len(h) in (3, 4) else ("#" + h[:6]).lower()

def lum(h):
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def sat(h):
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return colorsys.rgb_to_hls(r, g, b)[2]

def main(url, out):
    os.makedirs(os.path.join(out, "fonts"), exist_ok=True)
    html = get(url)
    try:  # SPA support: also read the DOM after JavaScript ran
        dom = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--virtual-time-budget=8000", "--dump-dom", url], capture_output=True, text=True, timeout=60).stdout
        if len(dom) > len(html) * 0.8:
            html = html + "\n" + dom
    except Exception:
        pass
    css_urls = [urllib.parse.urljoin(url, h) for h in re.findall(r'<link[^>]+href="([^"]+\.css[^"]*)"', html)]
    css = "\n".join(re.findall(r"<style[^>]*>(.*?)</style>", html, re.S))
    for cu in css_urls[:8]:
        try:
            css += "\n" + get(cu)
        except Exception:
            pass

    # ---- colours: custom properties first, then frequency
    props = dict((k.strip(), hex6(v)) for k, v in re.findall(r"(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b", css))
    freq = Counter(hex6(h) for h in re.findall(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b", css + html))
    allc = [c for c, _ in freq.most_common(24)]
    def pick(names, cond):
        for n, v in props.items():
            if any(k in n.lower() for k in names) and cond(v):
                return v
        return next((c for c in allc if cond(c)), None)
    bg = pick(["bg", "background", "paper", "base", "surface", "cream"], lambda c: lum(c) > 0.85) or "#ffffff"
    fg = pick(["ink", "text", "fg", "foreground", "dark", "black", "chocolate"], lambda c: lum(c) < 0.25) or "#111111"
    accent = pick(["accent", "primary", "brand", "main", "blue", "green", "rust", "coffee"], lambda c: sat(c) > 0.35 and 0.15 < lum(c) < 0.8) or "#2563eb"
    accent2 = next((c for c in allc if c not in (bg, fg, accent) and sat(c) > 0.3 and 0.15 < lum(c) < 0.9), accent)
    muted = pick(["muted", "gray", "grey", "secondary"], lambda c: 0.25 < lum(c) < 0.7 and sat(c) < 0.25) or "#6b7280"

    # ---- fonts
    fams = [f.strip(" '\"") for f in re.findall(r"font-family\s*:\s*([^;}{]+)", css)]
    fams = [f.split(",")[0].strip(" '\"") for f in fams if not f.startswith("var(")]
    ff = Counter(f for f in fams if f and f.lower() not in ("inherit", "sans-serif", "serif", "monospace", "system-ui"))
    files = []
    for face in re.findall(r"@font-face\s*{[^}]+}", css):
        fam = re.search(r"font-family\s*:\s*['\"]?([^;'\"]+)", face)
        src = re.search(r"url\(['\"]?([^)'\"]+\.(?:woff2|woff|ttf|otf))", face)
        wt = re.search(r"font-weight\s*:\s*(\d+)", face)
        st = re.search(r"font-style\s*:\s*(\w+)", face)
        if fam and src:
            fu = urllib.parse.urljoin(css_urls[0] if css_urls else url, src.group(1))
            name = re.sub(r"[^\w.-]", "_", f"{fam.group(1)}-{wt.group(1) if wt else '400'}-{st.group(1) if st else 'normal'}{os.path.splitext(src.group(1))[1]}")
            try:
                open(os.path.join(out, "fonts", name), "wb").write(get(fu, True))
                files.append({"family": fam.group(1).strip(), "weight": wt.group(1) if wt else "400", "style": st.group(1) if st else "normal", "file": f"fonts/{name}"})
            except Exception:
                pass
    gurls = re.findall(r"(https://fonts\.googleapis\.com/css2?\?[^\"')\s]+)", html + css)
    if not files:
        for gu in gurls[:2]:
            try:
                gcss = get(gu.replace("&amp;", "&"))
                for fam, wt, st, fu in re.findall(r"font-family:\s*'([^']+)';\s*font-style:\s*(\w+);\s*font-weight:\s*(\d+)[^}]*?src:\s*url\(([^)]+)\)", gcss.replace("\n", " ")):
                    pass
                for block in re.findall(r"@font-face\s*{[^}]+}", gcss):
                    fam = re.search(r"font-family:\s*'([^']+)'", block).group(1)
                    st = re.search(r"font-style:\s*(\w+)", block).group(1)
                    wt = re.search(r"font-weight:\s*(\d+)", block).group(1)
                    fu = re.search(r"url\(([^)]+)\)", block).group(1)
                    name = f"{fam.replace(' ', '_')}-{wt}-{st}.woff2"
                    if any(f["file"].endswith(name) for f in files):
                        continue  # keep the first (latin) subset per weight
                    open(os.path.join(out, "fonts", name), "wb").write(get(fu, True))
                    files.append({"family": fam, "weight": wt, "style": st, "file": f"fonts/{name}"})
            except Exception:
                pass
    gfonts = re.findall(r"fonts\.googleapis\.com/css2?\?family=([^\"&]+)", html)
    names = [f for f, _ in ff.most_common(4)] or [urllib.parse.unquote(g).split(":")[0].replace("+", " ") for g in gfonts]
    heading_font = None
    m = re.search(r"h1[^{]*{[^}]*font-family\s*:\s*([^;}]+)", css)
    if m and not m.group(1).strip().startswith("var("):
        heading_font = m.group(1).split(",")[0].strip(" '\"")
    display = heading_font or (names[0] if names else "Inter")
    body = next((n for n in names if n != display), display)

    # ---- logo
    logo = None
    cands = re.findall(r'<img[^>]+src="([^"]+)"[^>]*>', html)
    cands = [c for c in cands if re.search(r"logo|brand|mark", c, re.I)] + re.findall(r'rel="(?:apple-touch-)?icon"[^>]+href="([^"]+)"', html) + re.findall(r'property="og:image"[^>]+content="([^"]+)"', html)
    for c in cands:
        try:
            u = urllib.parse.urljoin(url, c)
            ext = os.path.splitext(urllib.parse.urlparse(u).path)[1] or ".png"
            open(os.path.join(out, "logo" + ext), "wb").write(get(u, True)); logo = "logo" + ext; break
        except Exception:
            continue

    # ---- copy
    title = (re.search(r"<title>(.*?)</title>", html, re.S) or [None, ""])[1].strip() if re.search(r"<title>", html) else ""
    desc = (re.search(r'name="description"[^>]+content="([^"]+)"', html) or [None, ""])[1] if re.search(r'name="description"', html) else ""
    heads = [re.sub(r"<[^>]+>", " ", h).strip() for h in re.findall(r"<h[12][^>]*>(.*?)</h[12]>", html, re.S)][:8]

    # ---- screenshots
    shots = {}
    for name, size, dpr in (("desktop", "1440,4000", "1"), ("mobile", "390,4000", "2")):
        p = os.path.abspath(os.path.join(out, f"shot-{name}.png"))
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-prefers-reduced-motion",
                        f"--force-device-scale-factor={dpr}", f"--window-size={size}", "--virtual-time-budget=8000", f"--screenshot={p}", url],
                       capture_output=True)
        if os.path.exists(p):
            shots[name] = f"shot-{name}.png"

    brand = {"url": url, "title": title, "description": desc, "headlines": heads,
             "colors": {"bg": bg, "fg": fg, "accent": accent, "accent2": accent2, "muted": muted, "props": props, "all": allc},
             "fonts": {"display": display, "body": body, "files": files}, "logo": logo, "shots": shots}
    json.dump(brand, open(os.path.join(out, "brand.json"), "w"), indent=2, ensure_ascii=False)
    print(json.dumps({k: brand[k] for k in ("title", "headlines", "logo", "shots")}, ensure_ascii=False, indent=1))
    print("colors", {k: v for k, v in brand["colors"].items() if k not in ("props", "all")})
    print("fonts", brand["fonts"]["display"], "/", brand["fonts"]["body"], f"({len(files)} files)")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "brand")

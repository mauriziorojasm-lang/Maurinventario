#!/usr/bin/env python3
"""Genera los 6 vídeos verticales de la serie a partir de la voz (audio/vN/vo/align.json).

  python3 build.py            → tiempos, vo.js, mezcla de voz y música, y vN.html
  python3 build.py v4         → solo un vídeo

Cada vídeo: la voz manda. Las líneas se colocan una detrás de otra con un respiro,
el cierre dura 3,4 s y los efectos se anclan a palabras concretas.
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(HERE, "../../.claude/skills/video-saas-premium/scripts/audio_tools.py")
MUSIC = os.path.join(HERE, "audio/music-track.mp3")   # la pista de 80 s del estilo elegido (B); su drop está en 19 s
URL = "maurinventario.vercel.app"

# ---------------------------------------------------------------- utilidades
CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="#04191b" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'

CHAOS = """
<div class="nt" id="n1" style="left:160px;top:620px"><div class="ic v">V</div><div style="flex:1"><div class="top"><span>VINTED</span><span>ahora</span></div><div class="tt">¡Has vendido un artículo!</div><div class="bd">Adidas Samba OG · 89,00 €</div></div></div>
<div class="nt" id="n2" style="left:160px;top:790px"><div class="ic wl">W</div><div style="flex:1"><div class="top"><span>WALLAPOP</span><span>hace 3 min</span></div><div class="tt">Has hecho una nueva venta</div><div class="bd">Oakley Encoder · 62,00 €</div></div></div>
<div class="nt" id="n3" style="left:160px;top:960px"><div class="ic m"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg></div><div style="flex:1"><div class="top"><span>CORREO</span><span>ahora</span></div><div class="tt">Correos sin leer</div><div class="bd">Ventas · etiquetas · envíos…</div></div></div>
<div class="xls" id="xls" style="left:160px;top:1020px">
  <div class="bar">▦ INVENTARIO.xlsx</div>
  <table>
    <tr><td>Producto</td><td>Stock</td><td>Coste</td><td>Precio</td><td>Ganancia</td></tr>
    <tr><td>Samba OG 42</td><td>6</td><td>48,00</td><td>89,00</td><td>41,00</td></tr>
    <tr><td>Oakley HSTN</td><td class="c1">23</td><td>19,50</td><td>55,00</td><td>35,50</td></tr>
    <tr><td>Nuptse M</td><td>2</td><td>92,00</td><td>?</td><td class="c2">#¡VALOR!</td></tr>
    <tr><td>Stanley Rosa</td><td class="c3">¿7?</td><td>16,00</td><td>34,00</td><td>18,00</td></tr>
  </table>
</div>
<div class="note" id="note" style="left:560px;top:1390px;transform:rotate(4deg)">43,00 − 19,50 − envío…<b>¿Cuánto gano?</b></div>
"""


def words_of(text):
    return text.split(" ")


def accent(text, idx):
    """data-w con *acentos* en las palabras de idx (mismo reparto en palabras que la voz)."""
    ws = words_of(text)
    return " ".join(f"*{w}*" if i in idx else w for i, w in enumerate(ws))


# ---------------------------------------------------------------- vídeos
V = {}

V["v1"] = dict(
    title="¿Vendes en Vinted o Wallapop? Necesitas esto",
    cover=("Serie · 1/6", "¿Aún lo apuntas *todo en Excel?*"),
    fin="Vende con *más control.*", cta="Entra en MaurInventario y descubre cómo organizar tu negocio.",
    pages=["inicio", "inventario", "venta-nueva", "compra", "mas"],
    gaps={"L2": 0.45},
    hook_acc=[3, 5, 12],
    html=CHAOS + """
<div class="ttl sm" id="t1" data-w="Todo en *un mismo sitio*"></div>
<div class="ttl sm" id="t2" data-w="Sin notas, *sin Excel*"></div>
<div class="ttl sm" id="t3" data-w="Tus números, *bajo control*"></div>
""",
    js="""
  // gancho: notificaciones y Excel mientras se dice
  tl.set("#n1", { top: 560 }, 0); tl.set("#n2", { top: 720 }, 0); tl.set("#n3", { top: 880 }, 0); tl.set("#xls", { top: 1040 }, 0); tl.set("#note", { top: 250, left: 330 }, 0);
  S.pop("#n1", S.V("H", 3), { x: -60, r1: -2 });
  S.pop("#n2", S.V("H", 5), { x: 60, r1: 1.5 });
  S.pop("#xls", S.V("H", 12), { y: 90, rotation: -6, r1: -3 });
  tl.to("#xls", { scale: 1.06, duration: 0.12, yoyo: true, repeat: 1 }, S.V("H", 15));
  // el problema crece
  S.pop("#n3", S.V("L2", 13), { x: -60, r1: 2 });
  [".c1", ".c2", ".c3"].forEach((c, i) => tl.set(`#xls ${c}`, { className: "bad " + c.slice(1) }, S.V("L2", 15) + i * 0.1));
  S.pop("#note", S.V("L2", 17), { y: 90, rotation: -10, r1: 4 });
  tl.to(["#n1", "#n2", "#n3", "#xls", "#note"], { x: "+=6", duration: 0.05, yoyo: true, repeat: 5 }, S.V("L2", 20));
  // la solución: todo cae dentro del móvil
  const L3 = S.V("L3", 0);
  tl.to(["#n1", "#n2", "#n3", "#xls", "#note"], { y: 900, x: 0, scale: 0.2, rotation: 0, autoAlpha: 0, duration: 0.55, ease: "power3.in", stagger: 0.04 }, L3 - 0.35);
  S.page(L3 - 0.1, "inicio", { x: 0 });
  S.phoneIn(L3 - 0.05);
  S.title("#t1", L3 + 0.2, S.V("L4", 0) - 0.3);
  S.page(S.V("L3", 2), "inventario");                       // organizas tu inventario
  S.ring(S.V("L3", 3), "inventario", [16, 310, 358, 270], S.V("L3", 4));
  S.page(S.V("L3", 5), "venta-nueva");                      // registras tus ventas
  S.ring(S.V("L3", 6), "venta-nueva", [16, 255, 358, 150], S.V("L3", 8));
  S.page(S.V("L3", 8), "compra");                           // lo que te cuesta cada compra
  S.ring(S.V("L3", 12), "compra", [16, 465, 358, 150], S.V("L3", 15));
  S.page(S.V("L3", 15), "inicio", { y: 0 });                 // cómo va tu negocio
  S.scroll(S.V("L3", 16), "inicio", 800, 0.9);
  S.ring(S.V("L3", 17) + 0.2, "inicio", [16, 840, 358, 290], S.V("L4", 0));
  // sin notas ni Excel: todo eso se tacha y sale
  S.cam(S.V("L4", 0) - 0.2, { ...S.HOME, s: 0.86, fy: 1230 }, 0.6);
  S.title("#t2", S.V("L4", 0), S.V("L5", 0) - 0.3);
  S.page(S.V("L4", 0), "mas");                              // todo está en la app
  S.ring(S.V("L4", 3), "mas", [16, 185, 358, 640], S.V("L5", 0));
  // números bajo control
  S.page(S.V("L5", 0) - 0.1, "inicio", { y: 800 });
  S.cam(S.V("L5", 0), { px: 195, py: 300, s: 1.18, fy: 1050 }, 0.8);
  S.title("#t3", S.V("L5", 9), null);
  S.ring(S.V("L5", 11), "inicio", [16, 840, 358, 290], END);
  S.ring(S.V("L5", 12), "inicio", [16, 1040, 358, 190], END);
""",
    sfx=[("notify", ("H", 3), .35), ("notify", ("H", 5), .3), ("pop-hi", ("H", 12), .35), ("notify", ("L2", 13), .3),
         ("snap", ("L2", 17), .35), ("swish-low", ("L3", 0, -0.4), .45), ("click-soft", ("L3", 2), .4), ("click-soft", ("L3", 5), .4),
         ("click-soft", ("L3", 8), .4), ("click-soft", ("L3", 15), .4), ("click-soft", ("L4", 0), .4), ("tick", ("L5", 11), .35), ("air-up", "END", .4)],
)

V["v2"] = dict(
    title="¿Sabes cuánto ganas realmente con cada venta?",
    cover=("Serie · 2/6", "¿Cuánto te *queda* de cada venta?"),
    fin="Controla tus números, *no vendas a ciegas.*", cta="Descubre MaurInventario.",
    pages=["ventas", "compra", "inicio"],
    gaps={},
    hook_acc=[4, 5, 10, 11],
    html="""
<div class="card" id="calc" style="left:150px;top:560px;width:780px;padding:40px 46px">
  <div style="font:700 24px 'BC';letter-spacing:.18em;color:#8f877f">EJEMPLO</div>
  <div class="row r1" style="display:flex;justify-content:space-between;font:600 44px 'PS';margin-top:26px"><span>Venta</span><span>35,00 €</span></div>
  <div class="row r2" style="display:flex;justify-content:space-between;font:600 44px 'PS';margin-top:18px;color:#ddd6ce"><span>Compra</span><span>− 20,00 €</span></div>
  <div style="height:2px;background:#3a3531;margin:26px 0"></div>
  <div class="row r3" style="display:flex;justify-content:space-between;align-items:center;font:700 64px 'BC'"><span>Beneficio</span><span><span class="q" style="color:#6cc070">15,00 €</span></span></div>
  <div class="row r4" style="display:flex;justify-content:space-between;font:600 38px 'PS';margin-top:28px;color:#ffb020"><span>¿Transporte?</span><span>?</span></div>
  <div class="row r5" style="display:flex;justify-content:space-between;font:600 38px 'PS';margin-top:14px;color:#ffb020"><span>¿Aduanas?</span><span>?</span></div>
</div>
<div class="card" id="dsk" style="left:40px;top:700px;width:1000px;height:286px;overflow:hidden;padding:0;border-radius:18px">
  <img src="assets/ui/venta.png" style="position:absolute;left:-1518px;top:-429px;width:3432px" alt="" />
  <div class="ring" id="dr1" style="left:4px;top:8px;width:236px;height:270px;opacity:0"></div>
  <div class="ring" id="dr2" style="left:416px;top:8px;width:236px;height:270px;opacity:0"></div>
  <div class="ring" id="dr3" style="left:660px;top:8px;width:244px;height:270px;opacity:0"></div>
</div>
<div class="card" id="dskl" style="left:40px;top:610px;width:1000px;padding:0;background:none;border:0;box-shadow:none;font:700 26px 'BC';letter-spacing:.12em;color:#8f877f">VENTA V-000152 · OAKLEY HSTN · VISTA DE ORDENADOR</div>
<div class="ttl sm" id="t1" data-w="El *coste real* de cada lote"></div>
<div class="ttl sm" id="t2" data-w="Precio, coste y *lo que te queda*"></div>
<div class="ttl sm" id="t3" data-w="Beneficio *bruto*, sin trampas"></div>
<div class="ttl" id="t4" data-w="No es cuánto vendes. *Es cuánto te queda.*"></div>
""",
    js="""
  // gancho: muchas ventas pasando… ¿y cuánto te queda?
  S.page(0, "ventas", { x: 0, y: 450 });
  S.phoneIn(0.1, { ...S.HOME, fy: 1420 });
  S.cam(S.V("L2", 0) - 0.5, S.HOME, 0.7);
  S.scroll(0.4, "ventas", 2600, S.V("H", 6) - 0.4, "power1.in");
  S.scroll(S.V("H", 6), "ventas", 0, 0.7, "expo.out");
  S.ring(S.V("H", 10), "ventas", [16, 385, 358, 70], S.V("L2", 0));
  // el ejemplo (ilustrativo)
  gsap.set("#calc .row", { autoAlpha: 0 });
  tl.to("#dev", { autoAlpha: 0.18, filter: "blur(6px)", duration: 0.5 }, S.V("L2", 0) - 0.3);
  tl.fromTo("#calc", { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: S.sp.duration, ease: S.sp.ease, immediateRender: false }, S.V("L2", 0) - 0.2);
  tl.fromTo("#calc .r2", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, immediateRender: false }, S.V("L2", 3));
  tl.fromTo("#calc .r1", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, immediateRender: false }, S.V("L2", 9));
  tl.fromTo("#calc .r3", { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(2)", immediateRender: false }, S.V("L2", 12));
  tl.to("#calc .q", { color: "#ffb020", duration: 0.2 }, S.V("L2", 16));
  tl.fromTo("#calc .r4", { autoAlpha: 0, x: -30 }, { autoAlpha: 1, x: 0, duration: 0.35, immediateRender: false }, S.V("L2", 20));
  tl.fromTo("#calc .r5", { autoAlpha: 0, x: -30 }, { autoAlpha: 1, x: 0, duration: 0.35, immediateRender: false }, S.V("L2", 22));
  tl.to("#calc", { autoAlpha: 0, y: -40, duration: 0.35, ease: "power2.in" }, S.V("L3", 0) - 0.3);
  tl.to("#dev", { autoAlpha: 1, filter: "blur(0px)", duration: 0.4 }, S.V("L3", 0) - 0.2);
  // coste real del lote: pedido con sus costes
  S.page(S.V("L3", 0) - 0.2, "compra", { y: 380 });
  S.title("#t1", S.V("L3", 0), S.V("L4", 0) - 0.3);
  S.ring(S.V("L3", 9), "compra", [16, 465, 358, 150], S.V("L3", 15));
  S.ring(S.V("L3", 19), "compra", [196, 465, 178, 75], S.V("L4", 0));
  S.scroll(S.V("L3", 22), "compra", 850, 0.8);
  S.ring(S.V("L3", 23), "compra", [16, 1100, 358, 190], S.V("L4", 0));
  // en cada venta: precio, coste y beneficio (vista de ordenador, mismo dato)
  S.title("#t2", S.V("L4", 0), S.V("L5", 0) - 0.3);
  S.page(S.V("L4", 0) - 0.1, "ventas", { y: 450 });
  tl.to("#dev", { autoAlpha: 0.25, duration: 0.3 }, S.V("L4", 0));
  tl.fromTo("#dskl", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, immediateRender: false }, S.V("L4", 0));
  tl.to("#dskl", { autoAlpha: 0, duration: 0.2 }, S.V("L4", 12) - 0.3);
  tl.fromTo("#dsk", { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: S.sp.duration, ease: S.sp.ease, immediateRender: false }, S.V("L4", 0));
  tl.fromTo("#dr1", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, immediateRender: false }, S.V("L4", 4));
  tl.fromTo("#dr2", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, immediateRender: false }, S.V("L4", 7));
  tl.fromTo("#dr3", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, immediateRender: false }, S.V("L4", 9));
  tl.to("#dsk", { autoAlpha: 0, y: -30, duration: 0.3 }, S.V("L4", 12) - 0.3);
  tl.to("#dev", { autoAlpha: 1, duration: 0.3 }, S.V("L4", 12) - 0.2);
  S.page(S.V("L4", 12) - 0.2, "inicio", { y: 2640 });         // rentabilidad por artículo
  S.ring(S.V("L4", 18), "inicio", [16, 2690, 358, 440], S.V("L5", 0));
  // beneficio bruto, sin gastos del negocio
  S.title("#t3", S.V("L5", 0), S.V("L6", 0) - 0.3);
  S.scroll(S.V("L5", 0), "inicio", 880, 0.9);
  S.cam(S.V("L5", 3), { px: 110, py: 280, s: 1.5, fy: 1000 }, 0.8);
  S.ring(S.V("L5", 7), "inicio", [16, 1040, 176, 190], S.V("L6", 0));
  S.ring(S.V("L5", 11), "inicio", [26, 1168, 156, 50], S.V("L6", 0), 3);
  // cierre con la idea
  S.cam(S.V("L6", 0) - 0.2, S.HOME, 0.7);
  tl.to("#dev", { autoAlpha: 0.2, filter: "blur(6px)", duration: 0.5 }, S.V("L6", 0) - 0.2);
  S.say("#t4", "L6", 3, null);
""",
    sfx=[("whoosh", ("H", 0, 0.3), 0), ("tick", ("H", 10), .35), ("pop-hi", ("L2", 3), .3), ("pop-hi", ("L2", 9), .3), ("snap", ("L2", 12), .35),
         ("tick", ("L2", 20), .3), ("tick", ("L2", 22), .3), ("swish-low", ("L3", 0, -0.3), .4), ("click-soft", ("L4", 0), .4),
         ("click-soft", ("L4", 12), .4), ("tick", ("L5", 11), .35), ("swish-low", ("L6", 0, -0.2), .4), ("air-up", "END", .4)],
)

V["v3"] = dict(
    title="Tu inventario puede estar costándote dinero",
    cover=("Serie · 3/6", "¿Sabes qué tienes en *stock?*"),
    fin="Cada producto *bajo control.*", cta="Organiza tu stock con MaurInventario.",
    pages=["productos", "productos-buscar", "producto", "inventario", "compras", "compra"],
    gaps={},
    hook_acc=[9, 10, 11, 12, 13],
    html="""
<div class="note" id="note" style="left:300px;top:760px;transform:rotate(-3deg);width:480px;font-size:36px">Oakley HSTN… ¿me quedan?<b>¿5? ¿10? ¿ninguna?</b></div>
<div class="ttl sm" id="t1" data-w="Busca y *lo sabes al momento*"></div>
<div class="ttl sm" id="t2" data-w="Todo tu almacén, *en euros*"></div>
<div class="ttl sm" id="t3" data-w="Pedidos *pendientes* de llegar"></div>
<div class="ttl" id="t4" data-w="Menos desorden. *Más control.*"></div>
""",
    js="""
  S.pop("#note", S.V("H", 4), { y: 60, rotation: -10, r1: -3 });
  tl.to("#note", { x: "+=6", duration: 0.05, yoyo: true, repeat: 5 }, S.V("H", 12));
  tl.to("#note", { autoAlpha: 0, y: 200, rotation: 8, duration: 0.45, ease: "power3.in" }, S.V("L2", 0) - 0.3);
  // muchos productos
  S.page(S.V("L2", 0) - 0.3, "productos", { x: 0, y: 0 });
  S.phoneIn(S.V("L2", 0) - 0.3);
  S.scroll(S.V("L2", 1), "productos", 980, S.E("L2") - S.V("L2", 1), "sine.inOut");
  // buscar → ficha del producto
  S.title("#t1", S.V("L3", 0), S.V("L4", 0) - 0.3);
  S.page(S.V("L3", 2), "productos-buscar", { y: 0 });
  S.ring(S.V("L3", 3), "productos-buscar", [16, 290, 358, 100], S.V("L3", 7));
  S.tap(S.V("L3", 6), "productos-buscar", 200, 330);
  S.page(S.V("L3", 7), "producto", { y: 0 });
  S.ring(S.V("L3", 10), "producto", [16, 210, 180, 90], S.V("L3", 14));
  S.ring(S.V("L3", 12), "producto", [196, 210, 178, 90], S.V("L3", 14));
  S.scroll(S.V("L3", 14), "producto", 1330, 0.9);
  S.ring(S.V("L3", 17), "producto", [16, 1395, 358, 205], S.V("L4", 0));
  // todo el almacén y el dinero invertido
  S.title("#t2", S.V("L4", 0), S.V("L5", 0) - 0.3);
  S.page(S.V("L4", 0) - 0.1, "inventario", { y: 220 });
  S.cam(S.V("L4", 2), { px: 195, py: 260, s: 1.25, fy: 1080 }, 0.8);
  S.ring(S.V("L4", 9), "inventario", [16, 312, 180, 85], S.V("L5", 0));
  S.ring(S.V("L4", 14), "inventario", [16, 400, 180, 90], S.V("L5", 0));
  // pedidos pendientes
  S.cam(S.V("L5", 0) - 0.2, S.HOME, 0.7);
  S.title("#t3", S.V("L5", 0), S.V("L6", 0) - 0.3);
  S.page(S.V("L5", 0), "compras", { y: 0 });
  S.ring(S.V("L5", 2), "compras", [16, 345, 358, 75], S.V("L5", 7));
  S.tap(S.V("L5", 6), "compras", 120, 370);
  S.page(S.V("L5", 7), "compra", { y: 0 });
  S.ring(S.V("L5", 11), "compra", [12, 143, 76, 26], S.E("L5") + 0.3, 3);
  S.ring(S.V("L5", 15), "compra", [16, 307, 127, 44], S.E("L5") + 0.3, 4);
  // menos desorden
  tl.to("#dev", { autoAlpha: 0.2, filter: "blur(6px)", duration: 0.5 }, S.V("L6", 0) - 0.2);
  S.title("#t4", S.V("L6", 0), null);
""",
    sfx=[("snap", ("H", 4), .35), ("swish-low", ("L2", 0, -0.3), .4), ("click-soft", ("L3", 2), .4), ("click", ("L3", 6), .5),
         ("tick", ("L3", 10), .3), ("tick", ("L3", 12), .3), ("click-soft", ("L4", 0), .4), ("tick", ("L4", 14), .3),
         ("click-soft", ("L5", 0), .4), ("click", ("L5", 6), .5), ("swish-low", ("L6", 0, -0.2), .4), ("air-up", "END", .4)],
)

V["v4"] = dict(
    title="¿Y si tus ventas se apuntaran solas?",
    cover=("Serie · 4/6", "Ventas que se *apuntan solas*"),
    cover_page="detectadas",
    fin="Menos tareas manuales. *Más tiempo para vender.*", cta="Descubre la automatización de MaurInventario.",
    pages=["correos", "detectadas", "detectadas-ok", "venta"],
    gaps={"L7": 0.5},
    hook_acc=[3, 9, 10, 11, 12],
    html="""
<div class="nt" id="n1" style="left:160px;top:640px"><div class="ic v">V</div><div style="flex:1"><div class="top"><span>VINTED</span><span>ahora</span></div><div class="tt">¡Has vendido un artículo!</div><div class="bd">Nike Air Force 1 '07 · 79,00 €</div></div></div>
<div class="card" id="man" style="left:130px;top:560px;width:820px;padding:36px 42px">
  <div style="font:700 26px 'BC';letter-spacing:.18em;color:#8f877f">A MANO, EN CADA VENTA</div>
  <div class="mk" style="font:600 40px 'PS';margin-top:24px">✉️&nbsp; Abrir el correo</div>
  <div class="mk" style="font:600 40px 'PS';margin-top:16px">✍️&nbsp; Apuntar el artículo</div>
  <div class="mk" style="font:600 40px 'PS';margin-top:16px">🔍&nbsp; Comprobar el precio</div>
  <div class="mk" style="font:600 40px 'PS';margin-top:16px">📦&nbsp; Preparar el envío</div>
</div>
<div class="mail" id="mail1" style="top:600px"><span class="demo">Ejemplo</span>
  <div class="hd"><div class="av">V</div><div><div class="from">Vinted</div><div class="to">a tu Gmail · 20:12</div></div></div>
  <div class="sub">Has vendido un artículo en Vinted</div>
  <div class="bd">Nike Air Force 1 '07 · <b>79,00 €</b> · Comprador: alba.k</div>
</div>
<div class="mail" id="mail2" style="top:600px"><span class="demo">Ejemplo</span>
  <div class="hd"><div class="av">V</div><div><div class="from">Vinted</div><div class="to">a tu Gmail · 18:47</div></div></div>
  <div class="sub">Tu etiqueta de envío</div>
  <div class="att"><div class="pdf">PDF</div>etiqueta-vinted.pdf</div>
</div>
<div class="card" id="dup" style="left:250px;top:1230px;width:580px;padding:18px 26px;border-radius:999px;background:#15291a;border-color:#2f5a33;color:#9ad89c;font:750 32px 'PS';text-align:center">✓ Misma venta · sin duplicar</div>
<div class="card" id="cmp" style="left:60px;top:520px;width:960px;padding:36px 36px;display:grid;grid-template-columns:1fr 1fr;gap:26px">
  <div><div style="font:700 26px 'BC';letter-spacing:.16em;color:#ff8a7a">A MANO</div>
    <div class="c1" style="font:600 34px/1.4 'PS';margin-top:18px;color:#b9b1a8">Abrir el correo<br />Apuntar la venta<br />Comprobar precio<br />Descontar stock<br />Subir la etiqueta</div></div>
  <div style="border-left:2px solid #2d2926;padding-left:26px"><div style="font:700 26px 'BC';letter-spacing:.16em;color:var(--brand)">CON MAURINVENTARIO</div>
    <div class="c2" style="font:650 34px/1.4 'PS';margin-top:18px">✓ Venta detectada<br />✓ Confirmas con un toque<br />✓ Stock descontado<br />✓ Etiqueta de Vinted vinculada</div></div>
</div>
<div class="ttl sm" id="t1" data-w="Lee tus *correos de venta*"></div>
<div class="ttl sm" id="t2" data-w="Detectada. *Confirmas con un toque.*"></div>
<div class="ttl sm" id="t3" data-w="La etiqueta, *a su venta*"></div>
<div class="ttl sm" id="t4" data-w="Wallapop: *etiqueta a mano*"></div>
""",
    js="""
  S.pop("#n1", S.V("H", 3), { y: -80 });
  tl.to("#n1", { autoAlpha: 0, y: -60, duration: 0.3 }, S.V("L2", 0) - 0.3);
  // el trabajo manual, paso a paso
  gsap.set(["#man .mk", "#cmp .c2"], { autoAlpha: 0 });
  tl.fromTo("#man", { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: S.sp.duration, ease: S.sp.ease, immediateRender: false }, S.V("L2", 0) - 0.2);
  [4, 7, 10, 14].forEach((w, i) => tl.fromTo(`#man .mk:nth-of-type(${i + 2})`, { autoAlpha: 0, x: -30 }, { autoAlpha: 1, x: 0, duration: 0.3, immediateRender: false }, S.V("L2", w) - 0.05));
  tl.to("#man", { autoAlpha: 0, y: -40, duration: 0.35, ease: "power2.in" }, S.V("L3", 0) - 0.3);
  // se conecta a tu Gmail
  S.page(S.V("L3", 0) - 0.3, "correos", { x: 0, y: 150 });
  S.phoneIn(S.V("L3", 0) - 0.3);
  S.title("#t1", S.V("L3", 0), S.V("L4", 0) - 0.3);
  S.ring(S.V("L3", 5), "correos", [16, 214, 358, 120], S.V("L4", 0));
  // llega un correo de venta → Ventas detectadas
  tl.to("#dev", { autoAlpha: 0.25, duration: 0.3 }, S.V("L4", 0) - 0.2);
  tl.fromTo("#mail1", { autoAlpha: 0, y: -60 }, { autoAlpha: 1, y: 0, duration: S.sp.duration, ease: S.sp.ease, immediateRender: false }, S.V("L4", 0) - 0.1);
  tl.to("#mail1", { y: 600, scale: 0.35, autoAlpha: 0, duration: 0.55, ease: "power3.in" }, S.V("L4", 5) - 0.1);
  tl.to("#dev", { autoAlpha: 1, duration: 0.3 }, S.V("L4", 5));
  S.page(S.V("L4", 5), "detectadas", { y: 160 });
  S.title("#t2", S.V("L4", 5), S.V("L5", 0) - 0.3);
  S.cam(S.V("L4", 6), { px: 195, py: 300, s: 1.2, fy: 1090 }, 0.8);
  S.ring(S.V("L4", 11), "detectadas", [24, 315, 250, 30], S.V("L4", 21));
  S.ring(S.V("L4", 13), "detectadas", [265, 300, 105, 50], S.V("L4", 21));
  S.ring(S.V("L4", 16), "detectadas", [24, 345, 200, 22], S.V("L4", 21));
  S.ring(S.V("L4", 21), "detectadas", [33, 481, 157, 44], S.V("L4", 26) + 0.2, 4);
  S.tap(S.V("L4", 26), "detectadas", 111, 503);
  S.page(S.V("L4", 26) + 0.12, "detectadas-ok", { y: 160, x: 0 });
  S.toast(S.V("L4", 26) + 0.15, "Venta registrada.", S.V("L5", 0) - 0.2);
  // la etiqueta en PDF se asocia a su venta
  S.cam(S.V("L5", 0) - 0.3, S.HOME, 0.6);
  tl.to("#dev", { autoAlpha: 0.25, duration: 0.3 }, S.V("L5", 0) - 0.2);
  tl.fromTo("#mail2", { autoAlpha: 0, y: -60 }, { autoAlpha: 1, y: 0, duration: S.sp.duration, ease: S.sp.ease, immediateRender: false }, S.V("L5", 0) - 0.1);
  tl.to("#mail2", { y: 600, scale: 0.35, autoAlpha: 0, duration: 0.55, ease: "power3.in" }, S.V("L5", 10) - 0.15);
  tl.to("#dev", { autoAlpha: 1, duration: 0.3 }, S.V("L5", 10));
  S.page(S.V("L5", 10) - 0.1, "venta", { y: 740 });
  S.title("#t3", S.V("L5", 10), S.V("L6", 0) - 0.3);
  S.ring(S.V("L5", 11), "venta", [16, 835, 358, 90], S.V("L5", 15));
  S.scroll(S.V("L5", 15), "venta", 1200, 0.8);
  S.ring(S.V("L5", 16), "venta", [16, 1275, 358, 30], S.V("L6", 0));
  S.ring(S.V("L5", 18), "venta", [16, 1395, 358, 95], S.V("L6", 0));
  tl.fromTo("#dup", { autoAlpha: 0, scale: 0.8 }, { autoAlpha: 1, scale: 1, duration: S.sp.duration, ease: S.sp.ease, immediateRender: false }, S.V("L5", 20));
  tl.to("#dup", { autoAlpha: 0, duration: 0.25 }, S.V("L6", 0) - 0.2);
  // Wallapop: la etiqueta la subes tú
  S.title("#t4", S.V("L6", 0), S.V("L7", 0) - 0.3);
  S.scroll(S.V("L6", 0), "venta", 740, 0.8);
  S.ring(S.V("L6", 7), "venta", [16, 925, 358, 75], S.V("L7", 0));
  // comparación
  tl.to("#dev", { autoAlpha: 0.15, filter: "blur(6px)", duration: 0.5 }, S.V("L7", 0) - 0.3);
  tl.fromTo("#cmp", { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: S.sp.duration, ease: S.sp.ease, immediateRender: false }, S.V("L7", 0) - 0.25);
  tl.fromTo("#cmp .c2", { autoAlpha: 0, x: 30 }, { autoAlpha: 1, x: 0, duration: 0.4, immediateRender: false }, S.V("L7", 3));
""",
    sfx=[("notify", ("H", 3), .4), ("tick", ("L2", 4), .3), ("tick", ("L2", 7), .3), ("tick", ("L2", 10), .3), ("tick", ("L2", 14), .3),
         ("swish-low", ("L3", 0, -0.3), .4), ("notify", ("L4", 0), .4), ("swish", ("L4", 5), .35), ("click", ("L4", 26), .55),
         ("success", ("L4", 26, 0.12), .35), ("notify", ("L5", 0), .4), ("swish", ("L5", 10), .35), ("pop-hi", ("L5", 20), .35),
         ("click-soft", ("L6", 0), .4), ("swish-low", ("L7", 0, -0.3), .4), ("air-up", "END", .4)],
)

V["v5"] = dict(
    title="Deja de adivinar qué productos funcionan mejor",
    cover=("Serie · 5/6", "¿Qué producto te da *más beneficio?*"),
    fin="Entiende tu negocio. *Mejora tus decisiones.*", cta="Consulta tus números con MaurInventario.",
    pages=["inicio", "panel"],
    gaps={},
    hook_acc=[6, 7, 11, 12],
    html="""
<div class="ttl sm" id="t1" data-w="Tu negocio *de un vistazo*"></div>
<div class="ttl sm" id="t2" data-w="Qué funciona *y qué no*"></div>
<div class="ttl sm" id="t3" data-w="Tu panel, *a tu manera*"></div>
<div class="ttl" id="t4" data-w="Menos intuición. *Más datos.*"></div>
""",
    js="""
  // a ciegas: la rentabilidad, borrosa
  S.page(0, "inicio", { x: 0, y: 2640 });
  S.phoneIn(0.1, { ...S.HOME, fy: 1420 });
  S.cam(S.V("L2", 0) - 0.4, S.HOME, 0.7);
  tl.fromTo("#scr", { filter: "blur(10px)" }, { filter: "blur(10px)", duration: 0.01, immediateRender: true }, 0);
  tl.to("#scr", { filter: "blur(0px)", duration: 0.6 }, S.V("L2", 0) - 0.2);
  S.scroll(S.V("L2", 0) - 0.2, "inicio", 0, 0.9, "expo.inOut");
  // métricas principales
  S.title("#t1", S.V("L3", 0), S.V("L4", 0) - 0.3);
  S.scroll(S.V("L3", 0), "inicio", 800, 0.9);
  S.ring(S.V("L3", 7), "inicio", [16, 840, 358, 290], S.V("L3", 11));
  S.scroll(S.V("L3", 9), "inicio", 980, 0.6);
  S.ring(S.V("L3", 10), "inicio", [16, 1040, 176, 190], S.V("L3", 14));
  S.ring(S.V("L3", 12), "inicio", [202, 1040, 172, 190], S.V("L3", 16));
  S.scroll(S.V("L3", 13), "inicio", 1270, 0.6);
  S.ring(S.V("L3", 15), "inicio", [16, 1425, 176, 165], S.V("L3", 17));
  S.scroll(S.V("L3", 16), "inicio", 600, 0.6);
  S.ring(S.V("L3", 17), "inicio", [16, 727, 316, 42], S.V("L4", 0));
  S.tap(S.V("L3", 18), "inicio", 211, 748);
  // análisis: evolución, más vendidos, plataformas, rentabilidad
  S.title("#t2", S.V("L4", 0), S.V("L5", 0) - 0.3);
  S.scroll(S.V("L4", 0), "inicio", 1500, 0.8);
  S.ring(S.V("L4", 2), "inicio", [16, 1585, 358, 300], S.V("L4", 6));
  S.scroll(S.V("L4", 6), "inicio", 1830, 0.7);
  S.ring(S.V("L4", 8), "inicio", [16, 1890, 358, 455], S.V("L4", 11));
  S.scroll(S.V("L4", 11), "inicio", 2290, 0.7);
  S.ring(S.V("L4", 14), "inicio", [16, 2365, 358, 145], S.V("L4", 16));
  S.scroll(S.V("L4", 15), "inicio", 2640, 0.7);
  S.ring(S.V("L4", 17), "inicio", [16, 2690, 358, 450], S.V("L5", 0));
  // personalizable
  S.title("#t3", S.V("L5", 0), S.V("L6", 0) - 0.3);
  S.page(S.V("L5", 0), "panel", { y: 140 });
  S.ring(S.V("L5", 4), "panel", [16, 200, 358, 700], S.V("L5", 7));
  S.scroll(S.V("L5", 7), "panel", 930, 0.8);
  S.ring(S.V("L5", 8), "panel", [16, 1010, 358, 330], S.V("L6", 0));
  // menos intuición
  tl.to("#dev", { autoAlpha: 0.2, filter: "blur(6px)", duration: 0.5 }, S.V("L6", 0) - 0.2);
  S.title("#t4", S.V("L6", 0), null);
""",
    sfx=[("swish-low", ("L2", 0, -0.2), .4), ("tick", ("L3", 7), .3), ("tick", ("L3", 10), .3), ("tick", ("L3", 12), .3), ("tick", ("L3", 15), .3),
         ("click", ("L3", 18), .5), ("tick", ("L4", 2), .3), ("tick", ("L4", 8), .3), ("tick", ("L4", 14), .3), ("tick", ("L4", 17), .3),
         ("click-soft", ("L5", 0), .4), ("swish-low", ("L6", 0, -0.2), .4), ("air-up", "END", .4)],
)

V["v6"] = dict(
    title="Tu negocio merece algo mejor que mil hojas de cálculo",
    cover=("Serie · 6/6", "Más que *mil hojas de cálculo*"),
    fin="MaurInventario. *Tu negocio, bajo control.*", cta="Visita la web y descubre la aplicación.",
    pages=["inventario", "ventas", "compras", "inicio", "productos-buscar"],
    gaps={},
    hook_acc=[3, 11],
    html=CHAOS + """
<div class="card" id="desk" style="left:60px;top:560px;width:960px;height:540px;overflow:hidden;padding:0;border-radius:18px">
  <img src="assets/ui/inicio.png" style="width:960px;display:block" alt="" />
</div>
<div class="ttl sm" id="t1" data-w="Todo en *un solo sitio*"></div>
<div class="ttl sm" id="t2" data-w="*Ordenador* y *móvil*"></div>
<div class="ttl sm" id="t3" data-w="Sabes *cómo va tu negocio*"></div>
<div class="ttl" id="t4" data-w="Gestiona *como un profesional*"></div>
""",
    js="""
  // la hoja de cálculo crece hasta saturarse
  S.pop("#xls", S.V("H", 3), { y: 80, rotation: -4, r1: -2 });
  tl.set("#xls", { top: 640 }, 0);
  tl.to("#xls", { scale: 1.08, duration: 0.15, yoyo: true, repeat: 1 }, S.V("H", 11));
  [".c1", ".c2", ".c3"].forEach((c, i) => tl.set(`#xls ${c}`, { className: "bad " + c.slice(1) }, S.V("L2", 9) + i * 0.1));
  S.pop("#n1", S.V("L2", 10), { x: -60, r1: -3 });
  tl.set("#n1", { top: 1050 }, 0);
  S.pop("#n2", S.V("L2", 12), { x: 60, r1: 2 });
  tl.set("#n2", { top: 1210 }, 0);
  S.pop("#note", S.V("L2", 15), { y: 90, rotation: -10, r1: 5 });
  tl.set("#note", { top: 520, left: 600 }, 0);
  tl.to(["#xls", "#n1", "#n2", "#note"], { x: "+=6", duration: 0.05, yoyo: true, repeat: 5 }, S.V("L2", 18));
  // todo en un solo sitio
  const L3 = S.V("L3", 0);
  tl.to(["#xls", "#n1", "#n2", "#note"], { y: 900, scale: 0.2, rotation: 0, autoAlpha: 0, duration: 0.55, ease: "power3.in", stagger: 0.04 }, L3 - 0.35);
  S.page(L3 - 0.1, "inventario", { x: 0, y: 0 });
  S.phoneIn(L3 - 0.05);
  S.title("#t1", L3 + 0.2, S.V("L4", 0) - 0.3);
  S.page(S.V("L3", 9), "ventas", { y: 0 });
  S.page(S.V("L3", 11), "compras", { y: 0 });
  S.page(S.V("L3", 13), "inicio", { y: 800 });
  S.ring(S.V("L3", 14), "inicio", [16, 840, 358, 390], S.V("L4", 0));
  // ordenador y móvil
  S.title("#t2", S.V("L4", 0), S.V("L5", 0) - 0.3);
  tl.fromTo("#desk", { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: S.sp.duration, ease: S.sp.ease, immediateRender: false }, S.V("L4", 4));
  S.cam(S.V("L4", 4), { px: 195, py: 422, s: 0.62, fx: 760, fy: 1300 }, 0.8);
  S.page(S.V("L4", 10), "productos-buscar", { y: 0 });
  S.ring(S.V("L4", 13), "productos-buscar", [16, 290, 358, 215], S.V("L5", 0));
  // sabes cómo va tu negocio
  tl.to("#desk", { autoAlpha: 0, y: -40, duration: 0.35 }, S.V("L5", 0) - 0.2);
  S.cam(S.V("L5", 0) - 0.2, S.HOME, 0.8);
  S.title("#t3", S.V("L5", 0), S.V("L6", 0) - 0.3);
  S.page(S.V("L5", 0), "inicio", { y: 800 });
  S.ring(S.V("L5", 10), "inicio", [16, 840, 358, 590], S.V("L6", 0));
  // como un profesional
  tl.to("#dev", { autoAlpha: 0.2, filter: "blur(6px)", duration: 0.5 }, S.V("L6", 0) - 0.2);
  S.title("#t4", S.V("L6", 0), null);
""",
    sfx=[("pop-hi", ("H", 3), .35), ("snap", ("H", 11), .35), ("notify", ("L2", 10), .3), ("notify", ("L2", 12), .3), ("snap", ("L2", 15), .3),
         ("swish-low", ("L3", 0, -0.4), .45), ("click-soft", ("L3", 9), .4), ("click-soft", ("L3", 11), .4), ("click-soft", ("L3", 13), .4),
         ("swish", ("L4", 4), .35), ("click-soft", ("L4", 10), .4), ("click-soft", ("L5", 0), .4), ("swish-low", ("L6", 0, -0.2), .4), ("air-up", "END", .4)],
)

SFX_DUR = {"notify": .885, "buzz": .631, "swish": .488, "click": .385, "success": 1.19, "tick": .341, "pop-hi": .38, "click-soft": .385,
           "thock": .47, "snap": .43, "glass": .89, "swish-low": .561, "air-up": .718}


# ---------------------------------------------------------------- construcción
def build(vid):
    spec = V[vid]
    d = os.path.join(HERE, "audio", vid)
    align = json.load(open(os.path.join(d, "vo/align.json")))
    script = json.load(open(os.path.join(d, "script.json")))
    keys = list(script)
    starts, t = {}, 0.2
    for i, k in enumerate(keys):
        if i:
            t += spec["gaps"].get(k, 0.55 if i == 1 else 0.38)
        starts[k] = round(t, 3)
        t += align[k][-1][2]
    end_t = round(t + 0.35, 3)
    dur = round(end_t + 3.4, 2)
    vo = {k: [[w.replace("...", "…"), round(starts[k] + s, 3), round(starts[k] + e, 3)] for w, s, e in align[k]] for k in keys}
    json.dump(starts, open(os.path.join(d, "starts.json"), "w"))
    open(os.path.join(d, "vo.js"), "w").write(f"// generado por build.py\nwindow.VO = {json.dumps(vo, ensure_ascii=False)};\nwindow.END = {end_t};\n")
    run = lambda *a: subprocess.run(["python3", TOOLS, *a], check=True, capture_output=True, text=True).stdout.strip().splitlines()[-1]
    print(vid, "vo ", run("vo-mix", "--dir", os.path.join(d, "vo"), "--starts", os.path.join(d, "starts.json"), "--dur", str(dur), "--out", os.path.join(d, "vo-mix.mp3")))
    print(vid, "mus", run("music-fit", "--sample", MUSIC, "--vo", os.path.join(d, "vo-mix.mp3"), "--at", "1.6", "--drop", "19.0", "--dur", str(dur), "--out", os.path.join(d, "music-mix.mp3")))

    def at(ref):
        if ref == "END":
            return end_t
        k, i, *off = ref
        return vo[k][i][1] + (off[0] if off else 0)

    sfx, track = [], 2
    for n, (name, ref, vol) in enumerate(spec["sfx"]):
        if name == "whoosh" or vol == 0:
            continue
        sfx.append(f'  <audio id="fx{n}" src="assets/sfx/ui/{name}.wav" data-start="{at(ref):.3f}" data-duration="{SFX_DUR[name]}" data-volume="{vol}" data-track-index="{track}"></audio>')
        track = 2 + (track - 1) % 4
    pages = "\n".join(f'          <div class="pg" id="pg-{p}"><img src="assets/ui-m/{p}.png" alt="" /></div>' for p in spec["pages"])
    hook = accent(script["H"], set(spec["hook_acc"]))
    fin = spec["fin"]
    kick, head = spec["cover"]
    html = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1080, height=1920" />
<title>MaurInventario · {spec['title']}</title>
<script src="kit/vendor/gsap.min.js"></script>
<script src="kit/vendor/motion.js"></script>
<script src="kit/premium.js"></script>
<script src="kit/serie.js"></script>
<script src="audio/{vid}/vo.js"></script>
<link rel="stylesheet" href="kit/serie.css" />
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{dur}" data-width="1080" data-height="1920">
  <div id="scene" class="clip stage" data-start="0" data-duration="{dur}" data-track-index="0">
    <div id="bg" class="stage"></div>
    <div class="ttl hook" id="hook" data-w="{hook}"></div>
{spec['html']}
    <div id="dev"><div id="scrwrap"><div id="scr">
{pages}
          <img id="hdr" src="assets/ui-m/hdr.png" alt="" />
          <img id="nav" src="assets/ui-m/nav.png" alt="" />
    </div></div></div>
    <div id="subs"></div>
    <div id="cov"><div class="k">{kick}</div><div class="h" data-w="{head}"></div></div>
    <div id="end">
      <div class="tile">MI</div>
      <div class="wm"><span class="w"><b>MAUR</b>INVENTARIO</span></div>
      <div class="fin" data-w="{fin}"></div>
      <div class="cta">{spec['cta']}</div>
      <div class="url">{URL}</div>
    </div>
    <div id="grain" class="stage"></div>
  </div>
  <audio id="vo" src="audio/{vid}/vo-mix.mp3" data-start="0" data-duration="{dur}" data-volume="1" data-track-index="6"></audio>
  <audio id="music" src="audio/{vid}/music-mix.mp3" data-start="0" data-duration="{dur}" data-volume="0.9" data-track-index="7"></audio>
{chr(10).join(sfx)}
</div>
<script>
document.fonts.ready.then(() => {{
  const tl = gsap.timeline({{ paused: true }});
  MKP.words();
  const S = Serie(tl);
  if (SerieCover(() => {{ gsap.set("#dev", {{ autoAlpha: 1, x: 187, y: 700, scale: 1 }}); gsap.set("#pg-{spec.get('cover_page', spec['pages'][0])}", {{ autoAlpha: 1 }}); gsap.set(".ttl, .nt, .xls, .note, .card, .mail", {{ autoAlpha: 0 }}); }})) return;
  // gancho: el titular entra palabra a palabra con la voz
  S.say("#hook", "H", 0, S.V("L2", 0) - 0.35);
{spec['js']}
  S.subs({json.dumps(keys[1:])}, {{ hl: ["MaurInventario"] }});
  S.end(END);
  window.__timelines = window.__timelines || {{}};
  window.__timelines["main"] = tl;
  tl.seek(0);
}});
</script>
</body>
</html>
"""
    open(os.path.join(HERE, "proj", vid, "index.html"), "w").write(html)
    print(vid, f"dur {dur}s · fin voz {end_t}s · {len(sfx)} efectos")


if __name__ == "__main__":
    for vid in (sys.argv[1:] or list(V)):
        build(vid)

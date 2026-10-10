# Capturas de UI (paso obligatorio)

Lo que más delata un video hecho por IA es una interfaz inventada. Por eso, **antes de construir**, pide capturas de referencia de cada interfaz que aparecerá y recréalas fielmente. La persona **no** tiene que grabar nada: solo tomar pantallazos para que tú los estudies.

## Qué pedir (adáptalo al producto)
1. **Las 3–6 pantallas clave del producto**, incluida la del "momento wow" (el resultado) y el paso de conexión u onboarding.
2. **Las herramientas de terceros que salen en la historia** (Claude Code, Codex, Cursor, n8n, Slack…), idealmente a mitad de una tarea.
3. **El teléfono o la app donde llega el resultado** (WhatsApp, notificación, email…), en el modo que usará el video (claro u oscuro).
4. **Pruebas de lo que afirma el video**: página de precios, comparativa, límites.
5. El **logo en SVG** (o el PNG más grande) y la guía de marca si existe.

Cómo: **⌘⇧4 + Espacio** sobre la ventana (macOS), o la captura de pantalla del teléfono. Datos de prueba o tapados; nunca uses contenido personal que aparezca en ellas.

Toma tú lo público (la web, la documentación) a 2× con `scripts/brand_from_url.py` o un navegador headless, y dile a la persona qué ya tienes.

## Cómo estudiarlas antes de codificar
- **Mide** en pt (la captura suele estar a 2×): anchos de sidebar, tarjetas, radios, paddings, tamaños de fuente.
- **Muestrea colores** con PIL, la moda de un recorte limpio:
  ```python
  from PIL import Image; from collections import Counter
  im = Image.open("captura.png").convert("RGB").crop((x0, y0, x1, y1))
  print(Counter(im.getdata()).most_common(4))
  ```
- **Identifica la tipografía** (SF, Inter, Geist, Söhne, mono…) y el set de íconos (lucide, SF Symbols, Material).
- **Copia los textos exactos**: recorta y amplía para leer comandos, labels y estados. No los escribas de memoria.
- Anota los **estados**: hover, seleccionado, cargando, éxito, error.

## Cómo recrearlas
- HTML/CSS en coordenadas propias de la captura (pt) dentro de un contenedor escalado (`transform: scale(k)`), así las medidas se copian 1:1.
- Íconos como SVG inline; fuentes reales con `@font-face`.
- La UI vive en el mundo de la cámara (`#cam`): la cámara hace zoom a cualquier punto de la UI convirtiendo pt → px del mundo.
- Las pantallas de teléfono se dibujan en el canvas de la textura del iPhone 3D (fondo, header, burbujas, compositor), muestreando los colores de la captura.
- Opcional: la captura misma como plato de fondo desenfocado detrás de las capas animadas.

## Ejemplo de especificaciones extraídas (portal SaaS oscuro tipo shadcn)
| Elemento | Valor medido |
|---|---|
| Fondo / sidebar y tarjetas / bordes | `#0c0c0e` / `#18181b` / `#27272a` |
| Sidebar · tarjetas | 198 pt · 180 × 101 pt, radio 12 |
| Tipografía | Geist 12.5 (nav), 25/600 (cifras), 10.5 (subtítulos) |
| Íconos | lucide, trazo 2 |
| Botón flotante | `#255851`, 50 pt |

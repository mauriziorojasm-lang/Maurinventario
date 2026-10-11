# MaurInventario · Serie de 6 vídeos para TikTok, Reels y Shorts

## Enfoque elegido (cuestionario)

| | Elección | Qué cambia en los vídeos |
|---|---|---|
| Objetivo | Darse a conocer | Ganchos que se entienden sin conocer la app; CTA para comentar |
| Público | Mezcla (principiantes y revendedores) | Ejemplos sencillos (gafas, zapatillas), sin jerga |
| Red | TikTok primero | 9:16, 30 fps, subtítulos grandes por encima de los botones de TikTok |
| Tono | Cercano y directo | Tuteo, frases cortas |
| Voz | Lydia (ElevenLabs v3, español de España) | La misma en los 6 |
| Duración | 25–35 s | Todos entre 32,6 y 34,2 s |
| Gancho | Pregunta directa | Los 6 empiezan con una pregunta |
| Persona | Solo la app | Capturas reales animadas; sin cámara |
| Ritmo | Premium y limpio | Zooms suaves, anillos y titulares |
| CTA | Comentar | «Comenta CORREO / STOCK / APP… y te paso el enlace» + la web en pequeño |
| Precio | No mencionar | No aparece en ningún vídeo |
| Funciones estrella | Ventas por correo, y stock y lotes | Abren la serie |
| Orden | Ventas por correo primero | Ver calendario |
| Frecuencia | 1 al día | 6 días seguidos |
| Sonido | Como está | Voz, música propia, efectos y subtítulos |

### Calendario (1 al día)

| Día | Vídeo | Portada | Palabra del CTA |
|---|---|---|---|
| 1 | **4** · Ventas por correo | Serie 1/6 · «Ventas que se apuntan solas» | CORREO |
| 2 | **3** · Stock e inventario | Serie 2/6 · «¿Sabes qué tienes en stock?» | STOCK |
| 3 | **1** · Presentación | Serie 3/6 · «¿Aún lo apuntas todo en Excel?» | APP |
| 4 | **2** · Beneficio real | Serie 4/6 · «¿Cuánto te queda de cada venta?» | BENEFICIO |
| 5 | **6** · Adiós a las hojas de cálculo | Serie 5/6 · «Más que mil hojas de cálculo» | ORDEN |
| 6 | **5** · Panel | Serie 6/6 · «¿Qué producto te da más beneficio?» | PANEL |

**Hora:** la tarde-noche (19:00–22:00) suele ir mejor para este público.

**Comentarios:** contesta a quien escriba la palabra y mándale el enlace por privado. Ese diálogo es lo que más ayuda al alcance.

**Archivos:**
- Vídeos: `render/vN.mp4` (1080 × 1920, 30 fps, audio a −15 LUFS).
- Portadas: `portadas/vN-portada.png`.

---

## 0. Qué se puede enseñar y qué no (revisado en el código)

| Función | Estado | Cómo se cuenta |
|---|---|---|
| Productos, variantes y lotes (cada unidad sabe de qué pedido vino y cuánto costó) | ✅ | «de qué pedido vino cada unidad» |
| Valor del almacén a coste medio («Capital invertido») | ✅ | «cuánto dinero tienes invertido» |
| Costes extra de cada compra (transporte, aduanas, aranceles, comisiones de compra, gestión), repartidos en proporción al valor | ✅ | «incluidos los costes de la compra» |
| Beneficio de cada venta = precio − coste real del lote | ✅ | Vídeo 2 |
| Gastos generales del negocio, y comisiones o envíos de Vinted y Wallapop | ❌ | No se dice que se descuenten. La app avisa «no es beneficio neto», y el vídeo lo enseña |
| Panel: ingresos, beneficio bruto, margen, ventas, ticket medio, stock, valor, evolución, más vendidos, ventas por plataforma, rentabilidad por artículo, más tiempo en stock | ✅ | Vídeo 5 |
| Personalizar el panel (`/configuracion/panel`) | ✅ | Vídeo 5 |
| Conexión con **un** Gmail; lee las ventas de Vinted y la confirmación de venta de Wallapop | ✅ | Vídeo 4 |
| Las ventas del correo **no se registran solas**: van a «Ventas detectadas» y tú confirmas | ✅ | «tú la confirmas con un toque» |
| La etiqueta en PDF de **Vinted** se asocia sola a su venta, sin duplicar | ✅ | Vídeo 4 |
| La etiqueta de **Wallapop** se sube a mano | ✅ | Vídeo 4 lo dice |
| Revisión del correo cada 5 min (Supabase Cron) o con «Revisar ahora» | ✅ si el cron está activo | «cada pocos minutos» |
| Pedidos de compra pendientes («Recibir pedido») | ✅ | Vídeo 3 |
| Recepción parcial | ❌ (se recibe el pedido entero) | No se menciona |
| Móvil (web instalable) y ordenador | ✅ | Vídeo 6 |
| Precio o prueba gratis | Solo en la rama SaaS | No aparece |

**Datos de pantalla:** todo es ficticio. La app real se ejecutó en local con datos de demostración: productos, 154 ventas, compradores como `alba.k`. No se usó tu Supabase, ni correos, ni etiquetas reales. Los correos de Vinted del vídeo 4 llevan la marca «Ejemplo».

## 1. Identidad común

- **Fondo:** negro verdoso con brillo turquesa abajo y grano fino.
- **Tipografía:** Barlow Condensed 700 en mayúsculas para los titulares; Public Sans para los subtítulos. Son las fuentes de la app.
- **Color:** turquesa `#2bb3bd` para las palabras clave y los anillos. Verde `#6cc070` para los beneficios. Ámbar `#ffb020` para las dudas. Amarillo de etiqueta `#f5d547` para la palabra del CTA.
- **Composición:**
  - Titular arriba (y 170–480).
  - Móvil con la app real (707 × 1501 px) en el centro.
  - Subtítulos en una píldora oscura a y ≈ 1400, cada palabra encendida al decirse.
- **Movimiento:**
  - Titulares con barrido.
  - Anillos sobre el dato del que se habla.
  - Toques con un círculo.
  - Zooms suaves y cambios de pantalla con fundido.
- **Cierre (3,4 s):** logo MI + MAURINVENTARIO + texto final + «Comenta PALABRA y te paso el enlace» + `maurinventario.vercel.app`.
- **Sonido:**
  - Música a −22 LUFS con sidechain bajo la voz.
  - Efectos de interfaz:
    - **Clic:** al cambiar de pantalla.
    - **Toque:** al pulsar.
    - **Notificación:** cuando llegan correos.
    - **Tic:** en cada anillo.
    - **Éxito:** al registrar.
    - **Aire:** en el logo.

---

## VÍDEO 4 — «¿Y si tus ventas se apuntaran solas?» · 34 s · Día 1 ⭐

**Gancho A:** «¿Y si no tuvieras que apuntar a mano cada venta de Vinted?»
**Gancho B:** «¿Sabías que tu correo de Vinted puede rellenar tu inventario por ti?»

**Voz**
1. ¿Y si no tuvieras que apuntar a mano cada venta de Vinted?
2. Abrir el correo, apuntar la venta, comprobar el precio…
3. MaurInventario se conecta a tu Gmail y lee los correos de venta de Vinted y de Wallapop.
4. Cada pocos minutos revisa lo nuevo, detecta la venta con su producto, precio y comprador… y tú la confirmas con un toque.
5. Y la etiqueta en PDF de Vinted se asocia sola a su venta, sin duplicarla.
6. La de Wallapop, de momento, la subes tú.
7. Menos tareas repetitivas. Más tiempo para vender.

| Tiempo | Pantalla | Texto | Sonido |
|---|---|---|---|
| 0,2–3,2 | Titular palabra a palabra; notificación «¡Has vendido un artículo! Nike Air Force 1 '07 · 79,00 €» | APUNTAR A MANO, VINTED en turquesa | notificación |
| 3,8–7,1 | Tarjeta «A MANO, EN CADA VENTA»: los 3 pasos aparecen al decirse | — | tic ×3 |
| 7,5–11,9 | Móvil: Ventas por correo, Gmail «Conectado» (anillo) | LEE TUS CORREOS DE VENTA | aire |
| 12,3–19,0 | Correo de venta (EJEMPLO) que cae dentro del móvil → Ventas detectadas: anillos en producto, precio y comprador → toque en «Sí, es una venta» → «Venta registrada.» | DETECTADA. CONFIRMAS CON UN TOQUE. | notificación, barrido, toque, éxito |
| 19,4–24,3 | Correo «Tu etiqueta de envío» con PDF (EJEMPLO) → venta V-000152: «Ver etiqueta», Seguimiento y «Origen: Automática, desde el correo de Vinted» | LA ETIQUETA, A SU VENTA · ✓ Misma venta · sin duplicar | notificación, barrido, pop |
| 24,7–27,1 | Anillo en «Cambiar por otra / subir archivo» | WALLAPOP: ETIQUETA A MANO | clic |
| 27,6–30,4 | Comparación A MANO / CON MAURINVENTARIO | — | — |
| 30,7–34,1 | Cierre | MENOS TAREAS MANUALES. MÁS TIEMPO PARA VENDER. · Comenta **CORREO** | aire |

**Grabación:** `/correos` (Gmail conectado) → `/detectadas` → **Sí, es una venta** → `/ventas/<venta con etiqueta que llegó por correo>`.

**Copy:**
> ¿Sigues apuntando cada venta de Vinted a mano? 📩 MaurInventario lee el correo, detecta la venta y tú solo la confirmas. Y la etiqueta en PDF de Vinted se pega sola a su venta. Comenta CORREO y te paso el enlace 👇
> #vinted #wallapop #revender #automatizacion #productividad #ventasonline #segundamano #emprendedores #negocioonline #maurinventario

---

## VÍDEO 3 — «Tu inventario puede estar costándote dinero» · 33 s · Día 2

**Gancho A:** «¿Te ha pasado comprar algo y no recordar si todavía lo tienes en stock?»
**Gancho B:** «¿Cuántas unidades te quedan de lo que más vendes? ¿Seguro?»

**Voz**
1. ¿Te ha pasado comprar algo y no recordar si todavía lo tienes en stock?
2. Cuando tienes muchos productos, la memoria deja de funcionar.
3. En MaurInventario buscas un producto y ves al momento sus unidades, su coste medio y de qué pedido vino cada unidad.
4. En inventario y lotes tienes todo el almacén: cuántas unidades te quedan y cuánto dinero tienes invertido en mercancía.
5. Y los pedidos que aún no han llegado se quedan como pendientes hasta que los recibes.
6. Menos desorden, menos confusiones y más control sobre tu almacén.

| Tiempo | Pantalla | Texto | Sonido |
|---|---|---|---|
| 0,2–3,7 | Titular; nota «Oakley HSTN… ¿me quedan? ¿5? ¿10? ¿ninguna?» | TODAVÍA LO TIENES EN STOCK | golpe |
| 4,3–7,3 | Móvil: Productos bajando | — | aire |
| 7,7–14,0 | Búsqueda «Oakley» → toque → ficha: Stock 23, Coste medio 19,43 € → «Pedidos / lotes de procedencia» | BUSCA Y LO SABES AL MOMENTO | clic, toque, tic ×2 |
| 14,4–20,7 | Inventario y lotes con zoom: Unidades 176 y Valor del almacén 5136,71 € | TODO TU ALMACÉN, EN EUROS | tic |
| 21,1–25,2 | Compras → Pedido #25 → PENDIENTE y «Recibir pedido» | PEDIDOS PENDIENTES DE LLEGAR | clic, toque |
| 25,6–29,5 | Móvil desenfocado | MENOS DESORDEN. MÁS CONTROL. | — |
| 29,8–33,2 | Cierre | CADA PRODUCTO BAJO CONTROL. · Comenta **STOCK** | aire |

**Grabación:** `/productos?search=Oakley` → `/productos/<id>` → `/inventario` → `/compras` → `/compras/<pedido pendiente>`.

**Copy:**
> ¿Te ha pasado no saber si aún te queda algo en stock? 📦 Busca un producto y mira al momento cuántas unidades tienes, cuánto te costó y de qué pedido salió. Comenta STOCK y te paso el enlace 👇
> #vinted #wallapop #stock #inventario #revender #segundamano #almacen #emprendedores #reventa #maurinventario

---

## VÍDEO 1 — «¿Vendes en Vinted o Wallapop? Necesitas esto» · 33 s · Día 3

**Gancho A:** «¿Vendes en Vinted o Wallapop y todavía lo apuntas todo en Excel?»
**Gancho B:** «¿Llevas tus ventas de Vinted en notas del móvil? Mira esto.»

**Voz**
1. ¿Vendes en Vinted o Wallapop y todavía lo apuntas todo en Excel?
2. Al principio, controlas tus productos de memoria. Pero cuando se acumulan las ventas, los costes y los envíos, la cosa cambia.
3. Con MaurInventario organizas tu inventario, registras tus ventas, controlas lo que te cuesta cada compra y ves cómo va tu negocio, desde un mismo sitio.
4. Nada de notas sueltas, hojas de cálculo y correos por todas partes.
5. Si quieres tomarte tus ventas en serio, empieza por tener tus números bajo control.

| Tiempo | Pantalla | Texto | Sonido |
|---|---|---|---|
| 0,2–3,7 | Titular; con «Vinted», «Wallapop» y «Excel» entran dos notificaciones y la hoja `INVENTARIO.xlsx` | VINTED, WALLAPOP, EXCEL | notificación ×2, pop |
| 4,2–11,4 | Correo sin leer, celdas en rojo, nota «¿Cuánto gano?»; todo tiembla | — | notificación, golpe |
| 11,8–20,2 | Todo cae dentro del móvil: Inicio → Inventario → Nueva venta → Pedido de compra → Ingresos | TODO EN UN MISMO SITIO | clic ×4 |
| 20,6–24,3 | Menú «Más» con todas las secciones | SIN NOTAS, SIN EXCEL | clic |
| 24,7–29,1 | Zoom: Ingresos y Beneficio bruto | TUS NÚMEROS, BAJO CONTROL | tic |
| 29,5–32,9 | Cierre | VENDE CON MÁS CONTROL. · Comenta **APP** | aire |

**Grabación:** `/` → `/inventario` → `/ventas/nueva` → `/compras/<pedido>` → `/`, y el botón **Más**.

**Copy:**
> ¿Todavía llevas tus ventas de Vinted y Wallapop en Excel? 📒 Inventario, ventas, costes y números en un solo sitio. Comenta APP y te paso el enlace 👇
> #vinted #wallapop #revender #excel #segundamano #inventario #emprendedores #negocioonline #reventa #maurinventario

---

## VÍDEO 2 — «¿Sabes cuánto ganas realmente con cada venta?» · 33 s · Día 4

**Gancho A:** «¿Sabes cuánto te queda de verdad de cada venta?»
**Gancho B:** «¿Vendiste por 35 algo que te costó 20? No has ganado 15.»

**Voz**
1. ¿Sabes cuánto te queda de verdad de cada venta?
2. Vendes por treinta y cinco lo que te costó veinte. ¿Quince de beneficio? ¿Y el transporte o las aduanas de esa compra?
3. MaurInventario calcula cada venta con el coste real de su lote, incluidos los costes de la compra.
4. Ves el precio, el coste y lo que te queda. Y la rentabilidad de cada artículo.
5. Es beneficio bruto, antes de los gastos generales, y la app te lo dice claro.
6. Lo importante no es cuánto vendes. Es cuánto te queda.

| Tiempo | Pantalla | Texto | Sonido |
|---|---|---|---|
| 0,2–2,4 | Móvil: Ventas bajando rápido; anillo en «Beneficio 5418,19 €» | CUÁNTO TE QUEDA DE VERDAD | tic |
| 3,0–9,6 | Tarjeta EJEMPLO: Venta 35 € → Compra −20 € → Beneficio 15 € (pasa a ámbar) → ¿Transporte? ¿Aduanas? | — | pop ×2, golpe, tic ×2 |
| 10,0–15,2 | Pedido #25: Mercancía / Costes adicionales 14,90 € / Coste total → «Costes del pedido… se reparten en proporción» | EL COSTE REAL DE CADA LOTE | aire |
| 15,6–20,6 | Venta V-000152 en el ordenador: Precio 52 € · Coste lote 21,46 € · Beneficio 30,54 € → «Rentabilidad por artículo» en el móvil | PRECIO, COSTE Y LO QUE TE QUEDA | clic ×2 |
| 21,0–25,5 | Zoom en Beneficio bruto y en el aviso «Sin gastos del negocio: no es beneficio neto» | BENEFICIO BRUTO, SIN TRAMPAS | tic |
| 25,9–28,8 | Móvil desenfocado | NO ES CUÁNTO VENDES. ES CUÁNTO TE QUEDA. | — |
| 29,2–32,6 | Cierre | CONTROLA TUS NÚMEROS, NO VENDAS A CIEGAS. · Comenta **BENEFICIO** | aire |

**Grabación:** `/ventas`, `/compras/<pedido con costes>`, `/ventas/<id>` en el ordenador y `/` hasta «Rentabilidad por artículo».

**No digas en el copy** que descuenta comisiones de Vinted o Wallapop, envíos o impuestos.

**Copy:**
> Vender por 35 € algo que te costó 20 € no son 15 € limpios 👀 Mira cuánto te queda de verdad en cada venta. Comenta BENEFICIO y te paso el enlace 👇
> #vinted #wallapop #revender #beneficio #margen #negocioonline #segundamano #emprendedores #reventa #maurinventario

---

## VÍDEO 6 — «Tu negocio merece algo mejor que mil hojas de cálculo» · 34 s · Día 5

**Gancho A:** «¿Tu negocio está creciendo y lo sigues llevando en hojas de cálculo?»
**Gancho B:** «¿Cuántas pestañas tiene ya tu Excel de ventas?»

**Voz**
1. ¿Tu negocio está creciendo y lo sigues llevando en hojas de cálculo?
2. Al principio, una hoja de cálculo basta. Pero con más productos, más ventas y más envíos, necesitas algo más ordenado.
3. MaurInventario reúne en un solo sitio tu inventario, tus ventas, tus compras y los números de tu negocio.
4. Lo usas desde el ordenador o desde el móvil, y encuentras lo que buscas al momento.
5. Es la diferencia entre ir apagando fuegos y saber exactamente cómo va tu negocio.
6. Empieza a gestionar tus ventas como un profesional.

| Tiempo | Pantalla | Texto | Sonido |
|---|---|---|---|
| 0,2–3,3 | Titular; la hoja `INVENTARIO.xlsx` entra con «hojas de cálculo» | CRECIENDO, HOJAS DE CÁLCULO | pop, golpe |
| 3,9–11,5 | Celdas en rojo, notificaciones y nota; todo tiembla | — | notificación ×2, golpe |
| 11,8–17,9 | Todo cae dentro del móvil: Inventario → Ventas → Compras → Inicio | TODO EN UN SOLO SITIO | clic ×3 |
| 18,2–22,4 | Inicio real en el ordenador con el móvil delante; búsqueda «Oakley» | ORDENADOR Y MÓVIL | barrido, clic |
| 22,8–27,2 | Inicio en el móvil, anillo en los widgets | SABES CÓMO VA TU NEGOCIO | clic |
| 27,6–30,4 | Móvil desenfocado | GESTIONA COMO UN PROFESIONAL | — |
| 30,8–34,2 | Cierre | MAURINVENTARIO. TU NEGOCIO, BAJO CONTROL. · Comenta **ORDEN** | aire |

**Copy:**
> Del Excel infinito a tenerlo todo en orden 💼 Inventario, ventas, compras y números, en el móvil y en el ordenador. Comenta ORDEN y te paso el enlace 👇
> #vinted #wallapop #excel #organizacion #revender #emprendedores #negocioonline #segundamano #reventa #maurinventario

---

## VÍDEO 5 — «Deja de adivinar qué productos funcionan mejor» · 33 s · Día 6

**Gancho A:** «¿Sabes qué productos te dan más beneficio?»
**Gancho B:** «¿Cuál es tu producto más rentable? Si has dudado, mira esto.»

**Voz**
1. ¿Sabes qué productos te dan más beneficio?
2. No basta con vender. Necesitas entender qué está pasando en tu negocio.
3. El panel de MaurInventario te enseña tus ingresos, tu beneficio bruto, el margen y tu stock, del periodo que elijas.
4. Ves la evolución de tus ventas, los artículos más vendidos, cuánto vendes en cada plataforma y la rentabilidad de cada artículo.
5. Y puedes personalizarlo: eliges qué ver, en qué orden y con qué tamaño.
6. Menos intuición. Más decisiones con datos.

| Tiempo | Pantalla | Texto | Sonido |
|---|---|---|---|
| 0,2–2,5 | «Rentabilidad por artículo» desenfocado | MÁS BENEFICIO | — |
| 3,1–7,3 | Se enfoca; Inicio | — | aire |
| 7,7–13,8 | Anillos: Ingresos → Beneficio bruto → Margen → Stock → selector de periodo (toque) | TU NEGOCIO DE UN VISTAZO | tic ×4, toque |
| 14,2–21,2 | Evolución → Más vendidos → Por plataforma → Rentabilidad | QUÉ FUNCIONA Y QUÉ NO | tic ×4 |
| 21,6–26,1 | Personalizar panel: vista previa y tamaños | TU PANEL, A TU MANERA | clic |
| 26,4–29,1 | Móvil desenfocado | MENOS INTUICIÓN. MÁS DATOS. | — |
| 29,5–32,9 | Cierre | ENTIENDE TU NEGOCIO. MEJORA TUS DECISIONES. · Comenta **PANEL** | aire |

**Grabación:** `/` bajando por todos los widgets; `/configuracion/panel` (solo administrador).

**Copy:**
> ¿Sabes qué artículo te deja más margen y en qué plataforma vendes más? 📊 Tu panel te lo enseña de un vistazo. Comenta PANEL y te paso el enlace 👇
> #vinted #wallapop #datos #dashboard #revender #negocioonline #emprendedores #segundamano #reventa #maurinventario

---

## 2. Subtítulos

- **Texto:** dicen exactamente la voz, en trozos de unas 24 letras. Cada palabra se enciende al decirse. «MaurInventario» va en turquesa.
- **Gancho:** es el titular grande y no lleva subtítulo.
- **Palabras destacadas:** son las que van en turquesa en cada tabla.

## 3. Prompts para recursos visuales (sin inventar pantallas)

- **Fondo de serie:** «Fondo vertical 1080×1920, negro con un toque verde azulado muy oscuro, brillo turquesa suave (#2bb3bd) desde abajo, grano fino, sin objetos ni texto, minimalista y tecnológico.»
- **Escena del problema:** «Escritorio visto desde arriba con portátil mostrando una hoja de cálculo genérica sin marca, notas adhesivas con números tachados, bolsas de envío y un móvil con notificaciones borrosas; luz fría, limpio, sin logotipos ni texto legible.»
- **Portada alternativa:** «Mano sujetando un móvil en vertical sobre fondo oscuro, pantalla vacía (se sustituye por una captura real), luz de contorno turquesa, sin texto.»

## 4. Regenerar

```bash
cd video/serie
python3 build.py      # voz → tiempos → mezcla → proj/vN/index.html
./render.sh           # 1080×1920, 30 fps, audio a −15 LUFS → render/vN.mp4
```

- **Guion:** `audio/vN/script.json`.
- **Voz:** `eleven_vo.py lines --model eleven_v3 --voice SDVJaMLoJa7wc3s2sn7d`.
- **Capturas:** `assets/ui-m/`, sacadas con `video/demo-app/` (la app real con datos ficticios).

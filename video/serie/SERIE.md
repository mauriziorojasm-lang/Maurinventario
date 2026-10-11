# MaurInventario · Serie de 6 vídeos para TikTok, Reels y Shorts

Formato 9:16 · 1080 × 1920 · 30 fps · audio a −15 LUFS · voz de Lydia (ElevenLabs v3, español de España) · música: la pista del estilo B que elegiste, la misma en los seis para que suenen a serie.

Los seis vídeos ya están montados y renderizados (`video/serie/render/v1.mp4` … `v6.mp4`), con sus portadas en `video/serie/portadas/`. Este documento sirve para publicarlos, para repetirlos y para grabar otras versiones.

---

## 0. Qué se puede enseñar y qué no (revisado en el código)

| Función | Estado | Cómo se cuenta en los vídeos |
|---|---|---|
| Inventario por productos, variantes y lotes (cada unidad sabe de qué pedido vino y cuánto costó) | ✅ Implementado | «ves de qué pedido vino cada unidad» |
| Valor del almacén a coste medio («Capital invertido») | ✅ | «cuánto dinero tienes invertido en mercancía» |
| Pedidos de compra con costes extra (transporte, aduanas, aranceles, comisiones de compra, gestión) repartidos en proporción al valor | ✅ | «más los costes de la compra repartidos entre las unidades» |
| Beneficio de cada venta = precio − coste real del lote | ✅ | V2 |
| Gastos generales del negocio y comisiones de venta de Vinted/Wallapop | ❌ No existen | **No se dice** que se descuenten. La app avisa: «Sin gastos del negocio: no es beneficio neto», y el vídeo 2 lo enseña |
| Panel con ingresos, beneficio bruto, margen, ventas, ticket medio, stock, valor del inventario, evolución, más vendidos, ventas por plataforma, rentabilidad por artículo, más tiempo en stock | ✅ | V5 |
| Personalizar el panel (qué widgets, orden y tamaño) | ✅ `/configuracion/panel` | V5 |
| Ventas por correo: se conecta a **un Gmail**; lee «Has vendido» de Vinted y la confirmación de venta de Wallapop | ✅ | «lee los correos de venta de Vinted y de Wallapop» |
| Las ventas del correo **no se registran solas**: quedan en «Ventas detectadas» y **tú confirmas** | ✅ | «te la deja lista para confirmar con un toque» (nunca «se registra sola») |
| Etiqueta en PDF de **Vinted**: se asocia sola a su venta, sin duplicar | ✅ | V4 |
| Etiqueta de **Wallapop**: no se automatiza; se sube a mano desde la ficha de la venta | ✅ (manual) | V4 lo dice expresamente |
| Revisión del correo cada 5 min (Supabase Cron) o al momento con «Revisar ahora» | ✅ si el cron está activo | «cada pocos minutos»; nunca «al instante» |
| Móvil (web instalable, barra inferior) y ordenador | ✅ | V6 |
| Precio / prueba gratis | Solo en la rama SaaS | **No aparece** (maurinventario.vercel.app es la versión main) |

**Datos que se ven:** todo es de demostración. La app real (rama main) se ejecutó en local con productos, compras, 154 ventas, compradores (`alba.k`, `mecias8`…) y etiquetas **inventados**. No se usó tu base de datos de Supabase, ni correos, ni etiquetas reales. Los correos de Vinted del vídeo 4 llevan la etiqueta «Ejemplo».

---

## 1. Identidad común

- **Fondo:** negro verdoso con brillo turquesa abajo y grano fino.
- **Tipografía:** Barlow Condensed 700 en mayúsculas para los titulares; Public Sans para los subtítulos y el texto. Son las mismas fuentes de la app.
- **Color:** turquesa de marca `#2bb3bd` para las palabras clave y los anillos de foco. Verde `#6cc070` para los beneficios. Ámbar `#ffb020` para las dudas.
- **Estructura de pantalla:**
  - Titular arriba (y 170–480 px).
  - Móvil con la app real en el centro: 707 × 1501 px, pantalla al 175 %.
  - Subtítulos en una píldora oscura a y ≈ 1400 px, por encima de los botones de TikTok.
- **Movimiento:**
  - Titulares que entran con un barrido.
  - Anillos turquesa sobre el dato del que se habla.
  - Toques con un círculo que se expande.
  - Zooms de cámara suaves (expo in/out) y cambios de pantalla con fundido y desplazamiento corto.
- **Cierre (3,4 s):** logotipo MI + MAURINVENTARIO + texto final + CTA + `maurinventario.vercel.app`.
- **Sonido:**
  - Música a −22 LUFS con sidechain bajo la voz.
  - Efectos sintetizados de interfaz:
    - **Clic:** al cambiar de pantalla.
    - **Toque:** al pulsar.
    - **Notificación:** cuando llegan correos.
    - **Tic:** en cada anillo.
    - **Éxito:** al registrar la venta.
    - **Aire:** en el logo.

---

## VÍDEO 1 — «¿Vendes en Vinted o Wallapop? Necesitas esto» · 34 s

**Gancho (A):** «Si vendes en Vinted o Wallapop y todavía lo apuntas todo en Excel, tienes que ver esto.»
**Gancho alternativo (B):** «Esto es lo que pasa cuando llevas tus ventas de Vinted en una hoja de Excel.»

### Guion de voz
1. Si vendes en Vinted o Wallapop y todavía lo apuntas todo en Excel, tienes que ver esto.
2. Al principio, controlas tus productos de memoria. Pero cuando se acumulan las ventas, los costes y los envíos, la cosa cambia.
3. Con MaurInventario organizas tu inventario, registras tus ventas, controlas lo que te cuesta cada compra y ves cómo va tu negocio, desde un mismo sitio.
4. Nada de notas sueltas, hojas de cálculo y correos por todas partes.
5. Si quieres tomarte tus ventas en serio, empieza por tener tus números bajo control.

### Storyboard
| Tiempo | Pantalla | Texto en pantalla | Sonido |
|---|---|---|---|
| 0,2–5,0 | Titular palabra a palabra. Con «Vinted» entra la notificación de Vinted; con «Wallapop», la de Wallapop; con «Excel», una hoja `INVENTARIO.xlsx` | Gancho completo (VINTED, WALLAPOP, EXCEL en turquesa) | notificación ×2, pop |
| 5,5–12,7 | Se suman un correo «sin leer», celdas en rojo (`#¡VALOR!`) y una nota «¿Cuánto gano?». Todo tiembla en «cambia» | Subtítulos | notificación, golpe |
| 13,0–21,5 | Todo cae dentro del móvil. App real: Inicio → Inventario y lotes (anillo en KPI) → Nueva venta («¿Qué vendes?») → Pedido de compra #25 (mercancía y costes) → Inicio, que baja hasta Ingresos | TODO EN UN MISMO SITIO | clic en cada pantalla |
| 21,9–25,6 | Menú «Más» con todas las secciones; anillo sobre el menú | SIN NOTAS, SIN EXCEL | clic |
| 25,9–30,4 | Zoom al panel: anillos en Ingresos y Beneficio bruto | TUS NÚMEROS, BAJO CONTROL | tic |
| 30,8–34,2 | Cierre | VENDE CON MÁS CONTROL · CTA · URL | aire |

**Grabación (si quieres regrabar):** móvil 390 × 844 con sesión iniciada. Rutas: `/` → `/inventario` → `/ventas/nueva` → `/compras/<pedido>` → `/`, y el botón **Más** de la barra inferior.

**Portada:** «¿Aún lo apuntas todo en Excel?» · `portadas/v1-portada.png`

**Copy:**
> ¿Sigues llevando tus ventas de Vinted y Wallapop en Excel? 📒 Te enseño cómo organizar inventario, ventas y costes en un solo sitio. Pruébalo en maurinventario.vercel.app (enlace en el perfil).
> #vinted #wallapop #revender #vendermasonline #segundamano #inventario #emprendedores #negocioonline #reventa #maurinventario

---

## VÍDEO 2 — «¿Sabes cuánto ganas realmente con cada venta?» · 42 s

**Gancho (A):** «Vender mucho no significa ganar mucho. ¿Sabes cuánto te queda de verdad?»
**Gancho alternativo (B):** «Vendiste por 35 algo que te costó 20. ¿Has ganado 15? Casi seguro que no.»

### Guion de voz
1. Vender mucho no significa ganar mucho. ¿Sabes cuánto te queda de verdad?
2. Compras algo por veinte euros y lo vendes por treinta y cinco. Quince de beneficio… ¿o no? ¿Y el transporte o las aduanas de esa compra?
3. MaurInventario calcula el beneficio de cada venta con el coste real de su lote: lo que pagaste, más los costes de la compra repartidos entre las unidades.
4. En cada venta ves el precio, el coste y lo que te queda. Y en el panel, la rentabilidad de cada artículo.
5. Además, te lo dice claro: es beneficio bruto, antes de los gastos generales del negocio.
6. Porque lo importante no es cuánto vendes. Es cuánto te queda.

### Storyboard
| Tiempo | Pantalla | Texto en pantalla | Sonido |
|---|---|---|---|
| 0,2–4,2 | Móvil: la lista de Ventas baja rápido (muchas ventas) y vuelve arriba; anillo en «Beneficio 5418,19 €» | Gancho (GANAR MUCHO, QUEDA DE VERDAD en turquesa) | tic |
| 4,8–13,3 | Móvil desenfocado detrás. Tarjeta «EJEMPLO»: Compra −20 € («veinte»), Venta 35 € («treinta y cinco»), Beneficio 15 € («quince»). El 15 pasa a ámbar en «¿o no?»; aparecen «¿Transporte? ?» y «¿Aduanas? ?» | Subtítulos | pop, pop, golpe, tic, tic |
| 13,7–22,2 | Pedido de compra #25: anillo en Mercancía / Costes adicionales / Coste total, después en «Costes adicionales 14,90 €». Baja a «Costes del pedido: Transporte / porte · se reparten en proporción…» | EL COSTE REAL DE CADA LOTE | — |
| 22,6–28,9 | Detalle real de la venta V-000152 en el ordenador (Precio 52,00 € · Coste lote 21,46 € · Beneficio 30,54 €, con anillos al decirlo). Después, en el móvil, el widget «Rentabilidad por artículo» | PRECIO, COSTE Y LO QUE TE QUEDA | clic |
| 29,2–34,5 | Zoom en «Beneficio bruto 440,57 €» y anillo en la nota de la app «Sin gastos del negocio: no es beneficio neto» | BENEFICIO BRUTO, SIN TRAMPAS | tic |
| 34,8–38,4 | Móvil desenfocado; titular palabra a palabra | NO ES CUÁNTO VENDES. ES CUÁNTO TE QUEDA. | — |
| 38,7–42,1 | Cierre | CONTROLA TUS NÚMEROS, NO VENDAS A CIEGAS · CTA · URL | aire |

**Grabación:** `/ventas`, `/compras/<id de un pedido con costes>`, `/ventas/<id>` en ordenador (la tabla de productos con Coste lote y Beneficio) y `/` hasta «Rentabilidad por artículo». El ejemplo de 20/35 € es ilustrativo y lo dice en pantalla.

**Aviso legal en el vídeo:** se habla de **beneficio bruto**. La app no descuenta comisiones de venta, envíos pagados por ti ni impuestos: no lo digas en el copy.

**Portada:** «¿Cuánto te queda de cada venta?» · `portadas/v2-portada.png`

**Copy:**
> Vender por 35 € algo que te costó 20 € no siempre son 15 € de beneficio 👀 Mira cómo calcular lo que te queda de verdad en cada venta. maurinventario.vercel.app
> #vinted #wallapop #revender #beneficio #margen #finanzaspersonales #negocioonline #segundamano #reventa #maurinventario

---

## VÍDEO 3 — «Tu inventario puede estar costándote dinero» · 33 s

**Gancho (A):** «¿Te ha pasado comprar algo y no recordar si todavía lo tienes en stock?»
**Gancho alternativo (B):** «Si tienes que abrir el armario para saber si te quedan unas gafas, mira esto.»

### Guion de voz
1. ¿Te ha pasado comprar algo y no recordar si todavía lo tienes en stock?
2. Cuando tienes muchos productos, la memoria deja de funcionar.
3. En MaurInventario buscas un producto y ves al momento sus unidades, su coste medio y de qué pedido vino cada unidad.
4. En inventario y lotes tienes todo el almacén: cuántas unidades te quedan y cuánto dinero tienes invertido en mercancía.
5. Y los pedidos que aún no han llegado se quedan como pendientes hasta que los recibes.
6. Menos desorden, menos confusiones y más control sobre tu almacén.

### Storyboard
| Tiempo | Pantalla | Texto en pantalla | Sonido |
|---|---|---|---|
| 0,2–3,7 | Titular; nota amarilla «Oakley HSTN… ¿me quedan? ¿5? ¿10? ¿ninguna?», que tiembla | Gancho (TODAVÍA LO TIENES EN STOCK en turquesa) | golpe |
| 4,3–7,3 | La nota cae; entra el móvil con Productos bajando lentamente | Subtítulos | aire |
| 7,7–14,0 | Búsqueda «Oakley» (2 resultados) → toque en Oakley HSTN → ficha: anillos en Stock 23 y Coste medio 19,43 € → baja a «Pedidos / lotes de procedencia» (Pedido #2 y #1) | BUSCA Y LO SABES AL MOMENTO | clic, toque, tic, tic |
| 14,4–20,7 | Inventario y lotes, con zoom: anillos en Unidades 176 y Valor del almacén 5136,71 € | TODO TU ALMACÉN, EN EUROS | tic |
| 21,1–25,2 | Compras → toque en Pedido #25 → ficha con la etiqueta PENDIENTE y el botón «Recibir pedido» | PEDIDOS PENDIENTES DE LLEGAR | clic, toque |
| 25,6–29,5 | Móvil desenfocado | MENOS DESORDEN. MÁS CONTROL. | — |
| 29,8–33,2 | Cierre | CADA PRODUCTO BAJO CONTROL · CTA · URL | aire |

**Grabación:** `/productos?search=Oakley` → `/productos/<id>` → `/inventario` → `/compras` → `/compras/<id de un pedido pendiente>`.

> **Nota:** la app recibe cada pedido de una vez, con la cantidad de cada línea. No hay un estado «parcialmente recibido», así que el vídeo solo habla de pedidos **pendientes**.

**Portada:** «¿Sabes qué tienes en stock?» · `portadas/v3-portada.png`

**Copy:**
> ¿Cuántas unidades te quedan de verdad? 📦 Busca un producto y mira su stock, su coste y de qué pedido salió cada unidad. maurinventario.vercel.app
> #vinted #wallapop #stock #inventario #almacen #revender #segundamano #emprendedores #reventa #maurinventario

---

## VÍDEO 4 — «¿Y si tus ventas se apuntaran solas?» · 42 s ⭐ prioritario

**Gancho (A):** «Imagina vender en Vinted y no tener que apuntar cada venta a mano.»
**Gancho alternativo (B):** «Así lee MaurInventario el correo de tus ventas de Vinted.»

### Guion de voz
1. Imagina vender en Vinted y no tener que apuntar cada venta a mano.
2. Cada venta trae trabajo: abrir el correo, apuntar el artículo, comprobar el precio y preparar el envío.
3. MaurInventario se conecta a tu Gmail y lee los correos de venta de Vinted y de Wallapop.
4. Cada pocos minutos revisa lo nuevo, detecta la venta con su producto, su precio y el comprador… y te la deja lista para confirmar con un toque.
5. Y cuando Vinted te manda la etiqueta en PDF, se asocia sola a su venta. Sin crear una venta duplicada.
6. La etiqueta de Wallapop, de momento, la subes tú desde el móvil.
7. Menos tareas repetitivas. Más tiempo para vender.

### Storyboard
| Tiempo | Pantalla | Texto en pantalla | Sonido |
|---|---|---|---|
| 0,2–3,8 | Titular; notificación «¡Has vendido un artículo! Nike Air Force 1 '07 · 79,00 €» | Gancho (VINTED, CADA VENTA A MANO en turquesa) | notificación |
| 4,3–11,0 | Tarjeta «A MANO, EN CADA VENTA»: los 4 pasos aparecen cuando se dicen | Subtítulos | tic ×4 |
| 11,4–16,0 | Móvil: Ventas por correo, Gmail «Conectado» (anillo) | LEE TUS CORREOS DE VENTA | aire |
| 16,4–24,1 | Correo «Has vendido un artículo en Vinted» (EJEMPLO) que cae dentro del móvil → Ventas detectadas con zoom: anillos en producto, precio y comprador → anillo y toque en «Sí, es una venta» → la tarjeta desaparece y sale «Venta registrada.» | DETECTADA. CONFIRMAS CON UN TOQUE. | notificación, barrido, toque, éxito |
| 24,5–31,0 | Correo «Tu etiqueta de envío» con `etiqueta-vinted.pdf` (EJEMPLO) → ficha de la venta V-000152: «Etiqueta de envío · Ver etiqueta» (anillo), después Seguimiento y «Origen: Automática, desde el correo de Vinted» | LA ETIQUETA, A SU VENTA · ✓ Misma venta · sin duplicar | notificación, barrido, pop |
| 31,4–34,8 | Misma ficha: anillo en «Cambiar por otra / Choose File» (subir a mano) | WALLAPOP: ETIQUETA A MANO | clic |
| 35,3–38,2 | Comparación: A MANO (5 pasos) frente a CON MAURINVENTARIO (✓ detectada, ✓ un toque, ✓ stock descontado, ✓ etiqueta de Vinted) | Subtítulos | — |
| 38,6–42,0 | Cierre | MENOS TAREAS MANUALES. MÁS TIEMPO PARA VENDER. · CTA · URL | aire |

**Grabación:**
1. `/correos`: Gmail conectado.
2. `/detectadas`: con una venta pendiente.
3. Pulsar **Sí, es una venta**.
4. `/ventas/<id de una venta con etiqueta que llegó por correo>`.
5. `/correos` → pestaña **Historial**, para la versión larga.

**Reglas que respeta:**
- No dice que la venta se registre sola: la deja lista para confirmar.
- No dice que sea instantáneo: «cada pocos minutos».
- No dice que Wallapop tenga la etiqueta automática.
- No enseña datos de compradores reales.

**Portada:** «Ventas que se apuntan solas» · `portadas/v4-portada.png`

**Copy:**
> Vendes en Vinted ➜ te llega el correo ➜ MaurInventario detecta la venta y tú solo la confirmas ✅ Y la etiqueta en PDF de Vinted se pega sola a su venta. maurinventario.vercel.app
> #vinted #wallapop #automatizacion #productividad #revender #ventasonline #gmail #segundamano #emprendedores #maurinventario

---

## VÍDEO 5 — «Deja de adivinar qué productos funcionan mejor» · 35 s

**Gancho (A):** «Si no sabes qué productos te dan más beneficio, estás decidiendo a ciegas.»
**Gancho alternativo (B):** «¿Cuál es tu producto más rentable? Si has dudado, mira esto.»

### Guion de voz
1. Si no sabes qué productos te dan más beneficio, estás decidiendo a ciegas.
2. No basta con vender. Necesitas entender qué está pasando en tu negocio.
3. El panel de MaurInventario te enseña tus ingresos, tu beneficio bruto, el margen y tu stock, del periodo que elijas.
4. Ves la evolución de tus ventas, los artículos más vendidos, cuánto vendes en cada plataforma y la rentabilidad de cada artículo.
5. Y puedes personalizarlo: eliges qué ver, en qué orden y con qué tamaño.
6. Menos intuición. Más decisiones con datos.

### Storyboard
| Tiempo | Pantalla | Texto en pantalla | Sonido |
|---|---|---|---|
| 0,2–4,3 | Móvil con «Rentabilidad por artículo» desenfocado (a ciegas) | Gancho (DAN MÁS, A CIEGAS en turquesa) | — |
| 4,8–9,1 | Se enfoca y sube al principio del Inicio | Subtítulos | aire |
| 9,4–15,6 | Anillos, uno por cada dato dicho: Ingresos → Beneficio bruto → Margen → Stock → selector «Hoy / Esta semana / Este mes / Este año» (toque en «Este mes») | TU NEGOCIO DE UN VISTAZO | tic ×4, toque |
| 16,0–22,9 | Evolución de las ventas → Artículos más vendidos → Ventas por plataforma (Vinted / Wallapop) → Rentabilidad por artículo | QUÉ FUNCIONA Y QUÉ NO | tic ×4 |
| 23,3–27,8 | Personalizar panel: vista previa de widgets y lista con tamaños (Pequeño / Ancho / Grande) y orden | TU PANEL, A TU MANERA | clic |
| 28,2–30,9 | Móvil desenfocado | MENOS INTUICIÓN. MÁS DATOS. | — |
| 31,3–34,7 | Cierre | ENTIENDE TU NEGOCIO. MEJORA TUS DECISIONES. · CTA · URL | aire |

**Grabación:** `/` con el periodo «Este mes» y bajando por todos los widgets; `/configuracion/panel` (solo administrador).

**Portada:** «¿Qué producto te da más beneficio?» · `portadas/v5-portada.png`

**Copy:**
> ¿Sabes qué artículo te deja más margen y en qué plataforma vendes más? 📊 Tu panel de MaurInventario te lo enseña de un vistazo. maurinventario.vercel.app
> #vinted #wallapop #dashboard #datos #revender #negocioonline #emprendedores #segundamano #reventa #maurinventario

---

## VÍDEO 6 — «Tu negocio merece algo mejor que mil hojas de cálculo» · 35 s

**Gancho (A):** «Si tu negocio está creciendo, tu forma de gestionarlo también debería crecer.»
**Gancho alternativo (B):** «Tu Excel de ventas ya no da más de sí. Y lo sabes.»

### Guion de voz
1. Si tu negocio está creciendo, tu forma de gestionarlo también debería crecer.
2. Al principio, una hoja de cálculo basta. Pero con más productos, más ventas y más envíos, necesitas algo más ordenado.
3. MaurInventario reúne en un solo sitio tu inventario, tus ventas, tus compras y los números de tu negocio.
4. Lo usas desde el ordenador o desde el móvil, y encuentras lo que buscas al momento.
5. Es la diferencia entre ir apagando fuegos y saber exactamente cómo va tu negocio.
6. Empieza a gestionar tus ventas como un profesional.

### Storyboard
| Tiempo | Pantalla | Texto en pantalla | Sonido |
|---|---|---|---|
| 0,2–4,4 | Titular; la hoja `INVENTARIO.xlsx` entra y da un golpe en «crecer» | Gancho (ESTÁ, CRECER en turquesa) | pop, golpe |
| 4,9–12,5 | Celdas en rojo, notificaciones de Vinted y Wallapop y la nota «¿Cuánto gano?»; todo tiembla | Subtítulos | notificación ×2, golpe |
| 12,9–18,9 | Todo cae dentro del móvil: Inventario y lotes → Ventas → Compras → Inicio (anillo) | TODO EN UN SOLO SITIO | clic ×3 |
| 19,3–23,4 | Aparece la versión de ordenador (Inicio real) y el móvil se coloca delante; búsqueda «Oakley» con anillo | ORDENADOR Y MÓVIL | barrido, clic |
| 23,8–28,3 | Inicio en el móvil, anillo en los widgets | SABES CÓMO VA TU NEGOCIO | clic |
| 28,7–31,5 | Móvil desenfocado | GESTIONA COMO UN PROFESIONAL | — |
| 31,8–35,2 | Cierre | MAURINVENTARIO. TU NEGOCIO, BAJO CONTROL. · CTA · URL | aire |

**Grabación:** `/inventario`, `/ventas`, `/compras`, `/`, `/productos?search=…` en móvil, y `/` en ordenador (1560 × 878).

**Portada:** «Más que mil hojas de cálculo» · `portadas/v6-portada.png`

**Copy:**
> Del Excel infinito a tenerlo todo en orden: inventario, ventas, compras y números, en el móvil y en el ordenador 💼 maurinventario.vercel.app
> #vinted #wallapop #excel #organizacion #revender #emprendedores #negocioonline #segundamano #reventa #maurinventario

---

## 2. Subtítulos

- **Texto:** dicen exactamente la voz, en trozos de unas 24 letras. Cada palabra se enciende cuando se pronuncia. «MaurInventario» va en turquesa.
- **Gancho:** no lleva subtítulo; el titular grande hace de subtítulo.
- **Palabras destacadas en los titulares:** son las que van en turquesa en cada storyboard.

## 3. Prompts para recursos visuales (sin inventar pantallas)

Solo hacen falta para fondos y elementos del «problema». La interfaz siempre es una captura real.

- **Fondo de serie:** «Fondo vertical 1080×1920, negro con un toque verde azulado muy oscuro, brillo turquesa suave (#2bb3bd) saliendo de la parte inferior, grano fino de película, sin objetos, sin texto, minimalista, tecnológico.»
- **Problema / caos (alternativa a las tarjetas animadas):** «Escritorio visto desde arriba con un portátil mostrando una hoja de cálculo genérica sin marca, notas adhesivas amarillas con números tachados, bolsas de envío y un móvil con notificaciones borrosas; luz fría, estética limpia, sin logotipos ni texto legible.»
- **Portada alternativa:** «Mano sujetando un móvil en vertical sobre fondo oscuro, pantalla en blanco (se sustituye por una captura real), luz de contorno turquesa, sin texto.»

## 4. Cómo regenerarlos

```bash
cd video/serie
python3 build.py            # voz → tiempos → mezcla → proj/vN/index.html
./render.sh                 # render 1080×1920 30 fps + audio a −15 LUFS → render/vN.mp4
```

- **Guion:** `audio/vN/script.json`.
- **Voz:** `eleven_vo.py lines --model eleven_v3 --voice SDVJaMLoJa7wc3s2sn7d`.
- **Capturas:** `assets/ui-m/`, sacadas con `video/demo-app/` (app real con datos ficticios).

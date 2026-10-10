# Proceso creativo (anti plantilla, anti "AI slop")

Es una forma de pensar, no un estilo ni una estructura. No copies colores, layouts, efectos **ni la forma** de un video anterior: copia **cómo se llegó a la decisión**.

El "AI slop" aparece cuando eliges componentes porque "los videos SaaS los tienen" y no porque **este** producto los necesita. La versión estructural del slop es usar siempre la misma secuencia (gancho oscuro → solución → UI → teléfono → logo) con otro logo.

## Mentalidad
- **Decoración no es creatividad.** Creatividad es una observación verdadera sobre el producto convertida en experiencia.
- **La forma también se diseña.** Duración, estructura, formato, ritmo, voz o silencio: todo sale del concepto, nada viene por defecto.
- **Cada elemento debe poder defenderse** en una frase sobre *este* producto. Si no, fuera.
- **Ambición sí**: 3D, cámara, física, personajes, interacciones reales. Quedarse corto también es un error.
- **Solo hechos.**

## A. Del dossier a las verdades

Con `investigacion/dossier.md` (ver [Investigación](investigacion.md)), escribe **10–15 observaciones** como hechos simples, con fuente:
> "se conecta escaneando un QR" · "en sus reels siempre aparece la mano de alguien usando el teléfono" · "la pregunta más repetida en comentarios es si funciona sin internet" · "su logo es una gota que también es un pin de mapa"

Marca en cada una:
- **V**: visual o de comportamiento (puede moverse, construirse, transformarse, reaccionar);
- **P**: propia (ningún competidor la puede decir);
- **A**: la marca ya la ama (la repite en la web o las redes);
- **D**: resuelve una duda real de los clientes.

Las mejores tienen 3–4 marcas.

Busca también **tensiones**: lo que la marca dice frente a lo que la gente pregunta, o lo complejo que es por dentro frente a lo simple que se ve por fuera. Una tensión es un concepto esperando.

## B. El trabajo del video (`investigacion/brief.md`)

```markdown
- Dónde vive: (reel IG/TikTok · hero de la web · anuncio · lanzamiento en X/LinkedIn · pitch · App Store)
- Quién lo ve y en qué estado: (scrolleando sin sonido · ya está en la web decidiendo · inversor con atención)
- En 1,5 s tiene que: (frenar el scroll · dejar claro qué es · …)
- Al terminar debe entender: (una sola cosa)
- Debe sentir: (una palabra)
- Debe hacer: (seguir, descargar, registrarse, escribir…)
- Lo que el movimiento hace aquí y una captura no: (ver abajo)
- Restricciones: (duración máxima, formato, idioma, con o sin sonido, plazos)
```

**¿Qué puede hacer el movimiento que una captura no puede?** Elige lo que sea verdad para este producto:
- **Hacer visible lo invisible**: datos que viajan, una automatización trabajando, un agente decidiendo, dinero que se ordena solo.
- **Comprimir tiempo**: una hora de trabajo en 6 s; un mes de resultados en un gesto.
- **Explicar un sistema**: cómo se conectan las piezas y qué pasa cuando una se mueve.
- **Demostrar simplicidad o velocidad**: la acción real, sin cortes, en tiempo real.
- **Mostrar un antes y un después** en el mismo plano.
- **Dar personalidad**: la mascota, el tono, el humor de la marca.
- **Probar**: el resultado real llegando (la notificación, el pago, el mensaje).

## C. Diverge: 3 conceptos

Cada concepto es una ficha:

```markdown
### <Nombre>
- Observación: "Vi que ___, así que en el video ___."
- Mecanismo: (qué pasa: conectar, construir, transformar, seguir un objeto, que un agente lo haga, reaccionar, contar…)
- Forma: (ver catálogo) + por qué ESTA forma sirve al brief
- Duración · formato · ritmo
- Voz: sí/no (y qué tipo) · Música: sí/no (y qué personalidad) · Sonido Botanica: qué familias (UI gratonal, granular, glitch, texturas…)
- Herramientas: (GSAP / Three.js / Motion / Rive / Lottie / footage) y por qué
- Detalles: emojis, tipeo con cursor, vidrio, celebración… o ninguno, y por qué (ver C4)
- Lo que necesito de la persona: (capturas, activos, código)
- Prueba del intercambio: por qué no funcionaría con el logo de un competidor
- Riesgo: qué puede salir mal y cómo lo controlo
```

**Reglas para los 3:**
1. Difieren en **mecanismo Y en forma**, no solo en color o tipografía.
2. **Al menos uno es arriesgado**: la idea que da un poco de miedo proponer.
3. **Ninguno repite** la forma ni el mecanismo de los últimos 3 videos de `~/.video-saas-premium/historial.md`, salvo que la persona lo pida.
4. Ninguno se apoya en un activo que no existe (por ejemplo, una mascota en Rive que la marca no tiene). Si el concepto lo necesita, dilo como requisito.

### Catálogo de formas (inspiración, no plantillas)
Combínalas, rómpelas o inventa otra. El brief manda.

| Forma | Cuándo sirve |
|---|---|
| **Plano secuencia**: una cámara que nunca corta, viaja por la UI y el mundo | productos con un flujo continuo; transmite "todo conectado" |
| **Loop perfecto** (6–12 s, sin principio ni fin) | hero de la web, fondo de landing, sin sonido |
| **Demo en tiempo real**, sin cortes, a velocidad real | cuando la promesa es velocidad o simplicidad |
| **Antes / después** en el mismo plano (split, barrido, máscara) | productos que reemplazan un proceso manual |
| **Objeto protagonista que se transforma** (el logo, el producto, un ícono) | marcas con un símbolo fuerte |
| **Tipografía cinética pura**, sin UI | ideas, manifiestos, lanzamientos de concepto |
| **Personaje o mascota que guía** | marcas con personaje propio (Rive / Lottie / 3D) |
| **Sistema que se arma pieza por pieza** | integraciones, plataformas, APIs |
| **Zoom de potencias**: de lo macro a lo micro o al revés | del impacto global al detalle que lo causa |
| **Cuenta regresiva / cronómetro** | ahorro de tiempo, lanzamientos con fecha |
| **Interfaz como paisaje**: la UI es el escenario 3D | productos visuales, dashboards, editores |
| **Formato nativo**: parece un post, story, chat o notificación real | reels, anuncios; frena el scroll |
| **Contraste de ritmo**: caos rápido → silencio y calma | herramientas que ordenan o simplifican |
| **Problema → solución** (gancho oscuro, llega el producto, prueba, remate) | cuando el problema es real, verificable y la marca lo dice |

### Recomienda y deja elegir
Recomienda uno **con el brief en la mano** ("para un reel que se ve sin sonido, el loop de formato nativo frena el scroll mejor que…"). La persona elige; si mezcla dos, haz una ficha nueva de la mezcla antes de construir.

## C2. Cómo piensa un video premium (no es estructura, es criterio)
Aplica a cualquier forma que elijas:
- **Un solo foco por plano.** Fondo limpio, mucho aire, una cosa a la vez (un logo, una tecla, un mensaje, una lista). Si en un cuadro compiten dos ideas, sepáralas en dos planos.
- **Cada transición tiene una causa.** Un clic, un mensaje que llega o una palabra que se dice mueve la cámara hacia lo siguiente: entrar por el texto que se acaba de leer, una tecla que se aprieta y abre el input, una marca que se convierte en el wordmark. Nada aparece con un fade porque sí.
- **Muestra el gesto que define el producto,** no un tour del dashboard. Hay una interacción que lo resume (apretar una tecla y hablar, un WhatsApp que se agenda solo); dale el plano protagonista.
- **Amplitud en un golpe.** Para decir "hace muchas cosas", una lista corta de pastillas con íconos reales que sube en 1–2 s, en vez de explicar cada función.
- **Rápido pero legible.** El ritmo puede ser alto si cada momento es UNA idea de 2–6 palabras. Rápido *y* cargado = no se entiende. Lento *y* sin energía = aburre. Referencia que funcionó: ~2 s para leer un chat corto, ~1,5 s para ver su resultado, y transiciones de zoom de ~0,4 s entre ellos, todo cortado a tempo de la música.
- **El gesto, repetido con resultados distintos.** Si el producto hace varias cosas con el mismo gesto (un mensaje, un prompt, un clic), repítelo 3–5 veces seguidas, cada vez con un resultado diferente (agenda → la cita cae; reprograma → se mueve; cancela → se tacha). Es la prueba de amplitud más clara que existe.
- **El mundo físico, aunque no haya video.** Si el producto vive en el mundo real (una recepción, un mostrador, un teléfono que vibra) y no hay grabaciones, recréalo con objetos en 3D: luz, sombras, materiales reales. **Nunca personas falsas en 3D**: se ven a IA al instante.
- **Macros y palabras gigantes.** Un detalle de la UI real en extremo primer plano (una nota del sistema que prueba lo que hizo el producto) o una palabra clave de la voz a pantalla completa y cortada vuelven protagonista lo que de otra forma se pierde.
- **Personalidad (atrevido).** Un garabato a mano que encierra lo importante, un tono de voz humano ("Tranqui."), el cursor o la notificación como personaje, el contexto real del sistema (barra de menú, notificaciones de iOS).
- **El logo se arma en movimiento** al final: la marca se dibuja o se transforma en el wordmark; nunca aparece pegado.
- **Con voz en off:** el guion dice exactamente el texto en pantalla, una frase por plano, y cada palabra aparece cuando se pronuncia.

## C3. Cuando te pasan una referencia
Una referencia enseña **cómo piensa** un video, no su estructura. Antes de cambiar nada:
1. Analízala: `python3 <skill>/scripts/analizar_referencia.py referencia.mp4 referencias/analisis/` (hoja de cuadros, cortes, curva de audio). Mira la hoja entera.
2. Escribe en 5–8 puntos **qué la hace funcionar**: cuántas ideas por plano, qué causa cada transición, cuál es el gesto protagonista, el ritmo, el tono, cómo suena, cómo aparece el logo.
3. Propón **cómo se traduce a este producto**: qué se queda de lo que ya funcionaba, qué cambia y un borrador del guion si va con voz.
4. **Coméntaselo a la persona y espera su ok.** Nunca copies sus planos, su marca ni su orden.

## C4. Detalles Apple (emojis, tipeo, vidrio): cuándo sí y cuándo no
Bien usados, hacen que un video SaaS se sienta nativo y humano; puestos por moda, son slop. Suelen funcionar en la mayoría de los videos de producto, pero **cada uno se decide en el concepto** respondiendo sus preguntas. Herramientas en `kit/apple.js` ([Kit](kit.md#mka--detalles-apple-kitapplejs--applecss)).

| Detalle | Úsalo si… | No lo uses si… |
|---|---|---|
| **Emoji de Apple** (con resorte, flota y se va) | sale de **algo que pasa**: el 🎉 que ya está en el mensaje real y revienta, un 😵‍💫 junto al celular que no para, un 😌 en el alivio, ✨ en la palabra que brilla | decora una frase cualquiera, aparece en cada plano, o la marca es seria (legal, salud crítica, finanzas institucionales) y el tono no lo aguanta |
| **Tipeo con cursor** (`│` que parpadea) | alguien **escribe de verdad** en el producto (un chat, un prompt, un buscador) o una frase clave se "escribe" mientras la voz la dice | el texto no lo escribe nadie (títulos que solo aparecen), o ya hay tres cosas animándose en el plano |
| **Burbuja que golpea** (iMessage) | un mensaje se envía y lo que importa es la acción | el mensaje es un dato a leer con calma |
| **Celebración / confeti** | el momento de éxito real del producto (cita confirmada, pago hecho, deploy listo), **una vez** en el video | se usa para "dar energía" sin un éxito detrás, o más de una vez |
| **Vidrio esmerilado (glassmorphism)** | algo **flota sobre contenido**: etiquetas sobre la UI, notificaciones, alertas, como en iOS | lo pones en tarjetas, fondos o paneles enteros: es el cliché más reconocible del diseño hecho con IA |

**Reglas de dosis:**
- Emojis: 3–5 en un video de 30–40 s, cada uno con su causa. Si no puedes decir *qué los provoca*, sácalos.
- Un solo tipo de celebración por video.
- El vidrio, solo sobre contenido que se ve borroso detrás; si detrás hay un color plano, es una tarjeta normal.
- Los emojis hablan el idioma del canal: en WhatsApp, Instagram o iMessage están en casa; en un dashboard B2B serio, casi nunca.

**Preguntas para cada detalle** (dentro de la sección E):
1. ¿Qué en la pantalla o en la voz lo provoca?
2. ¿Refuerza lo que se dice o compite con ello?
3. ¿Lo usaría esta marca en sus propias redes?
4. Bórralo mentalmente: ¿el momento pierde emoción o claridad? Si no, fuera.

## D. Animatic

Con el concepto elegido (y las capturas si hay UI), arma **6–8 cuadros fijos** de los momentos clave: el primer cuadro, cada cambio de idea y el final. Usa `npx hyperframes snapshot`. Muéstralos con una línea por cuadro. Si algo no se entiende en un cuadro fijo, no se entenderá en movimiento.

## E. Interroga cada componente

Antes de mostrar (animatic y versión final), lista cada elemento de cada momento y pregúntale:
1. ¿Por qué existe? (una frase sobre *este* producto)
2. ¿Es suyo o de una plantilla? ¿Aparecería igual en cualquier video SaaS?
3. ¿Qué información o acción aporta?
4. ¿Es honesto? Un contador sin dato real, un "en vivo" que no lo es o una cifra inventada → fuera.
5. ¿Podría hacer este trabajo el motivo del concepto?
6. Bórralo mentalmente: ¿el video empeora? Si no, bórralo de verdad.

### Catálogo de slop en video (culpables hasta que se demuestre lo contrario)
- **UI inventada** en vez de la real (terminales, chats, dashboards genéricos).
- **La misma estructura de siempre** con otro logo.
- **Órbitas** de íconos alrededor de un logo, **triadas de tarjetas** idénticas de features.
- **Medidores, gráficos o contadores sin datos reales.**
- **Flashes blancos**, cúpulas de luz, fades planos, blur genérico como transición.
- **Titulares gigantes** + subtítulo + dos botones; texto que llena la pantalla.
- **Cualquier cosa estática** más de 1 segundo (salvo una pausa elegida a propósito).
- **Herramienta por moda**: 3D, Rive, resortes, emojis o vidrio metidos porque sí y no porque el concepto los pide.
- **Contadores y etiquetas decorativas** ("PENDIENTES 05", "01 / SECCIÓN", numeraciones tipo ⁰¹): parecen diseño, pero no dicen nada.
- **Un panel cortado por el borde del cuadro.** Si aparece la UI, se ve completa; si quieres un detalle, haz un zoom claro e intencional.
- **Demasiadas cosas a la vez**: notas, UI, contador y texto compitiendo en el mismo plano.

Si te descubres metiendo uno, vuelve a la pregunta 1.

## F. Historial (`~/.video-saas-premium/historial.md`)

Al terminar cada video, añade una línea:

```
2026-10-10 · <producto> · forma: plano secuencia · mecanismo: un pedido viaja del chat al panel · herramientas: GSAP + Three.js · 34 s 16:9 · voz sí · críticas: "texto muy grande"
```

Léelo antes del paso C. Sirve para no repetirte y para no repetir los errores que ya te criticaron.

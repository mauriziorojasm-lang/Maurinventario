# MaurInventario · Mejora integral (seguridad, fallos, rapidez y visual)

Fecha: 10/10/2026 · Estado: pendiente de aprobación

## 1. Objetivo

Dejar MaurInventario más segura, sin fallos, más rápida y con una visual pulida y coherente en iPhone, iPad y ordenador, quitando lo que sobra, **sin perder ni un dato** y sin cambiar cómo se trabaja con ella.

**Éxito =**
- Ningún hallazgo de seguridad medio o alto abierto.
- Cada toque en el menú muestra algo al instante (silueta + barra de carga).
- Las listas con fotos cargan miniaturas ligeras.
- Ninguna pantalla muestra tablas vacías por un error oculto.
- Todas las pruebas automáticas (base de datos, lectura de correos, recorridos en iPhone/iPad/ordenador) en verde antes de cada publicación.

## 2. Decisiones del usuario (cuestionario)

| Tema | Decisión |
|---|---|
| Estilo | Mantener y pulir. **Cambiar el naranja por el verde de Vinted `#007782`** |
| iPhone | Barra inferior igual: Inicio · Ventas · «+» · Envíos · Más |
| iPad | Como el ordenador: menú lateral siempre visible |
| Ordenador | Densidad equilibrada (como ahora) |
| Animaciones | Suaves y discretas |
| Mientras carga | Silueta de la página **y** barra fina arriba |
| Inicio iPhone | Facturación y beneficio + tareas pendientes + accesos rápidos |
| Orden | Seguridad → fallos y limpieza → rapidez → visual |
| Limpieza | Quitar código y piezas de base de datos que no se usan |

**Supuestos aceptados:** «quitar lo que sobra de la base de datos» = objetos sin uso (funciones, vistas, columnas, tablas vacías). **Nunca** datos (ventas, productos, compras, lotes, movimientos, auditoría). Lo dudoso se le enseña al usuario antes de borrarlo.

## 3. Entregas

Cuatro entregas independientes. Cada una se prueba entera en la copia local y se publica (Supabase + Vercel) antes de empezar la siguiente.

### Entrega 1 · Seguridad

1. **`product_price_history`** (migración nueva): `avg_cost` solo si `is_admin()`. Para el vendedor, solo sus propias ventas (`responsible_id = current_responsible_id()`).
2. **Correos falsos de Vinted**:
   - Remitente real con dominio `vinted.<tld>`, comprobado en la dirección y no solo en el texto.
   - Cabecera `Authentication-Results` con `dkim=pass` para ese dominio.
   - Si no se verifica, la etiqueta **no se pega sola**: pasa a «Revisar» con el aviso «remitente no verificado».
   - Igual para Wallapop en ventas detectadas, donde quedará marcado como no verificado.
   - La búsqueda de Gmail se limita a `from:` de esos dominios.
3. **Redirección del login**: `next` solo se acepta si, resuelto con `new URL(next, origin)`, mantiene el mismo origen y empieza por `/` sin `\`.
4. **Cabeceras de seguridad** en `next.config.ts`:
   - `Content-Security-Policy`, como mínimo `frame-ancestors 'none'`, con `img-src`/`connect-src`/`frame-src` que permitan Supabase.
   - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
   - `Permissions-Policy` restrictiva.
   - `poweredByHeader: false`.
5. **Bajas**:
   - Celdas CSV que empiezan por `= + - @` con prefijo `'`.
   - Límite de uso del generador: 60 generaciones por usuario y día, contado en la base de datos.
   - Variables de prueba (`GMAIL_API_BASE`, `GOOGLE_OAUTH_*`, `GEMINI_BASE_URL`) ignoradas cuando `VERCEL_ENV=production`.
   - `saveListItem` con lista cerrada de tablas.
   - `REPORTS` con `Object.hasOwn`.
6. **Comprobación manual**: guía para que el usuario confirme en Supabase que el registro público está desactivado.
7. **Clave propia para cifrar Gmail** (`GMAIL_TOKEN_KEY`): queda **fuera** de esta entrega. Exigiría reconectar Gmail y el riesgo es informativo.

### Entrega 2 · Fallos y limpieza

1. **Bucle de usuario desactivado**:
   - `requireUser` envía a `/auth/salir?error=inactivo`, que cierra la sesión y lleva al login con el aviso.
   - Un error al leer `profiles` lanza una excepción en vez de devolver `null`.
2. **`(app)/error.tsx`**: pantalla de error con «Reintentar» y «Ir al inicio». También `not-found.tsx` con el mismo estilo.
3. **Errores de Supabase visibles**: helper `must()` en las cargas de página. Si falla una consulta, se ve el error (y se puede reintentar), nunca una tabla vacía.
4. **Límite de 1000 filas**: los recuentos y agrupaciones de Anuncios, Informes, Responsables y Envíos se calculan en la base de datos o se leen por bloques.
5. **Venta sin duplicados con mala cobertura**:
   - `sale-form`: `try/finally` para que el botón nunca se quede bloqueado.
   - Se comprueba el resultado de guardar la etiqueta.
   - `create_sale` acepta un identificador de petición (`client_request_id`, único). Repetir el envío devuelve la misma venta.
6. **Reordenar fotos**: RPC atómico `reorder_product_photos(ids)`. En el cliente, cola de peticiones para que dos toques seguidos no se pisen.
7. **`CountUp`**: anima desde el valor anterior cuando cambia la cifra. Sin salto al cargar.
8. **Fechas en el navegador**: siempre con `lib/format` y zona Europe/Madrid.
9. **iPhone**:
   - Zonas táctiles de al menos 44 px (botones pequeños, casillas, cerrar ventanas, controles de la galería).
   - Campos a 16 px como mínimo, para que no haya zoom.
   - La hoja «Más» pasa a `<dialog>`: foco y scroll de fondo bloqueados.
10. **Limpieza de código**:
    - Quitar `setProductPhoto` y otras exportaciones sin uso (se buscan con herramienta).
    - Unir `signLabels` y `signedPhotoUrls` en `signUrls(bucket, paths)`.
    - Separar `listing-studio.tsx` y `photo-gallery.tsx` en piezas más pequeñas.
    - Tipos generados de Supabase para quitar los `as unknown as`.
11. **Limpieza de base de datos**:
    - Inventario de funciones, vistas, columnas y tablas sin referencias en el código ni en otras funciones.
    - Lista al usuario con lo que se propone borrar.
    - Tras su visto bueno: migración que guarda la definición en el propio archivo (para poder restaurarla) y borra solo objetos sin datos.
    - Nada que contenga filas se borra.

### Entrega 3 · Rapidez

1. **`loading.tsx`** con silueta para `(app)`, listas (ventas, productos, envíos, anuncios, detectadas) y fichas (venta, producto).
2. **Barra de carga fina arriba** (verde) en cada navegación.
3. **Consultas en paralelo** (`Promise.all`):
   - ficha de venta (de 8 viajes a 2);
   - ficha de producto;
   - lista de productos;
   - ventas (el vendedor no carga opciones que no usa);
   - `getCurrentUser` (`profiles` + `responsibles` a la vez).
4. **Avisos del menú**: un único RPC `nav_badges()` en lugar de 5 recuentos.
5. **Miniaturas**:
   - Al subir una foto se genera también una miniatura de 320 px (unos 20 KB) en `…/thumb/`.
   - Las listas usan la miniatura.
   - Las fotos antiguas sin miniatura la generan al verse por primera vez desde el navegador del admin.
6. **Enlaces firmados en caché**: unos 50 minutos por ruta, para que el navegador reutilice las imágenes.
7. **Filtros sin recarga**: `next/form` en `FilterBar`.
8. **Menos recargas dobles**: `useServerAction` deja de llamar a `router.refresh()` cuando la acción ya revalida. `revalidatePath` con rutas concretas.
9. **Buscador de productos**: pasa de acción de servidor a ruta GET, para que no espere detrás de otros guardados.

### Entrega 4 · Visual

1. **Color**: el naranja pasa a verde Vinted en tokens, logo (`MAUR` verde), icono de la app, iconos PWA, gráficos y textos («barra naranja» → «barra verde»).

   | Token | Claro | Oscuro |
   |---|---|---|
   | `--brand` | `#007782` | `#2bb3bd` |
   | `--brand-strong` | `#00626b` | `#4cc4cd` |
   | `--brand-ink` (texto/enlaces) | `#005a62` | `#7dd6dc` |
   | `--brand-soft` | `#dff1f2` | `#0d2a2d` |
   | `--on-brand` | `#ffffff` | `#04191b` |

   - El amarillo de las etiquetas de lote y los colores de estado se mantienen.
   - El verde de «bien» (`--good`) se ajusta para no confundirse con la marca: verde más amarillento, `#2f7d32`.
   - Todo contraste de texto ≥ 4.5:1, comprobado con un script.
2. **Animaciones suaves**:
   - Apertura **y cierre** de ventanas, hoja «Más» y visor de fotos (`@starting-style` / `allow-discrete`).
   - Entrada de página solo con opacidad corta, sin volver a montar la página entera (se quita `key={pathname}`).
   - Las barras animan con `transform`.
   - Se mantiene `prefers-reduced-motion`.
3. **Inicio en el iPhone**:
   - Arriba, facturación y beneficio (como ahora).
   - Debajo, **Tareas**: ventas por confirmar, envíos pendientes, anuncios por quitar y correos a revisar. Solo las que tengan algo, con número y enlace.
   - Después, **Accesos rápidos**: Nueva venta, Preparar anuncio, Buscar stock.
   - El vendedor ve solo lo suyo.
   - En iPad y ordenador, las tareas aparecen como una franja bajo las cifras.
4. **Repaso pantalla por pantalla** con capturas en iPhone (390), iPad (820/1180) y ordenador (1440), en claro y oscuro:
   - espaciados, alineaciones y cortes de texto;
   - tablas en móvil (tarjetas);
   - estados vacíos;
   - consistencia de botones y títulos.
5. **iPad = ordenador**: el menú lateral se ve desde 768 px de ancho, también en vertical, y los contenidos se adaptan a ese ancho.

## 4. Cómo se prueba

- **Por entrega**:
  - `tsc`, `eslint` y `vitest`, incluidas las pruebas de base de datos.
  - Recorridos E2E existentes: `run`, `seller`, `ops`, `filtros-envios`, `envios`, `movil-venta`, `correo`, `fotos`.
  - Pruebas nuevas para lo añadido (seguridad del historial de precios, redirección del login, correo no verificado, venta idempotente, error.tsx, loading, miniaturas, `nav_badges`).
- **Seguridad**:
  - Prueba de base de datos de que el vendedor no recibe `avg_cost` ni ventas ajenas.
  - Prueba E2E de que `/login?next=/%5Cevil.com` se queda en la app.
  - Comprobación de cabeceras con `curl` sobre la build local.
- **Visual**: capturas de cada pantalla en los 3 tamaños y 2 temas, revisadas antes de publicar; script de contraste.
- **Base de datos**:
  - Cada migración se aplica primero a la copia local.
  - Las migraciones que borran objetos guardan su definición y se enseñan al usuario.
  - Si Supabase cancela la aplicación directa, se le da al usuario el archivo para pegarlo en el SQL Editor (como en la migración 12).

## 5. Fuera de alcance

- Cambiar la forma de trabajar, las secciones existentes o las reglas de stock y beneficio.
- Doble factor de autenticación y clave propia de cifrado de Gmail (se pueden hacer después).
- Borrar datos.

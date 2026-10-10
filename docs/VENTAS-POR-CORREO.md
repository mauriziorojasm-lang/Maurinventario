# Ventas por correo (Vinted y Wallapop)

MaurInventario lee los correos que llegan a **maurinventario@gmail.com** y registra las ventas solo. Esta guía explica qué hace y cómo dejarlo funcionando. No hace falta saber programar.

---

## 1. Qué hace, en pocas palabras

| Correo que llega | Qué hace la app |
|---|---|
| Vinted · «Has vendido un artículo en Vinted» | La **detecta** (producto, precio, comprador y fecha) y la deja en **Ventas detectadas** para que la confirmes. Al confirmar se registra, se descuenta 1 unidad del lote más antiguo y queda con envío «pendiente», sin etiqueta. |
| Vinted · correo con la **etiqueta en PDF** | **No crea ninguna venta.** Busca la venta que ya existe y le añade el PDF, el nº de seguimiento, el nº de transacción, la fecha límite y la paquetería. |
| Wallapop · «Has hecho una nueva venta. Selecciona un método de envío» | **Nada.** Se ignora (no trae el importe). |
| Wallapop · «aquí tienes la confirmación de tu venta» | La **detecta** con el precio del artículo (no el total), comprador y fecha de compra, y espera tu confirmación en **Ventas detectadas**. |
| Etiqueta de Wallapop | No se automatiza. La subes tú desde el móvil, en la ficha de la venta («Subir etiqueta»). |
| Cualquier otro correo | Se ignora y no se guarda nada de él. |

**Tú confirmas cada venta.** Nada cuenta (ni ventas ni stock) hasta que pulsas «Sí, es una venta» en **Ventas detectadas**. Si ya la habías apuntada a mano, pulsa «Ya estaba apuntada»: no se crea otra y la etiqueta de Vinted irá a la tuya. La app te avisa cuando una venta detectada se parece a una que ya tienes.

**Nunca duplica.** Cada correo de Gmail tiene un número único: si se lee dos veces, la segunda no hace nada. La etiqueta de Vinted solo se pone si hay **una** venta posible; si hay dudas, la deja para que elijas tú.

**Nunca inventa.** Si el producto no se reconoce, si los importes no cuadran o si el PDF está dañado, el correo queda en **Ventas por correo → Revisar** con el motivo.

**Solo correos nuevos.** Al conectar Gmail, la app lee solo lo que llegue a partir de ese momento. Las ventas que ya tenías no se tocan.

---

## 2. Cómo se reconoce el producto

1. Nombre **exacto** del producto en tu inventario.
2. Un **nombre recordado** (alias): cuando eliges a mano el producto de un correo y dejas marcada «Recordar», la próxima vez se reconoce solo.
3. El mismo nombre sin tener en cuenta mayúsculas, acentos, guiones o espacios.

Si no hay una única coincidencia, **no se elige nada solo**: el correo va a «Revisar» con sugerencias de productos parecidos y tú eliges con un toque.

> Consejo: la primera vez que vendas cada artículo, seguramente tengas que elegirlo a mano (el título del anuncio no suele ser igual que el nombre del inventario). Deja marcado «Recordar» y a partir de ahí será automático.

---

## 3. Pasos que tienes que hacer tú (una sola vez)

Necesitas unos 15 minutos. Hazlo desde un ordenador o iPad.

### Paso A · Google Cloud (crear el permiso para leer Gmail)

Usa la cuenta **maurinventario@gmail.com** en todo este paso.

1. Entra en **console.cloud.google.com** con maurinventario@gmail.com. Si te pide aceptar condiciones, acéptalas.
2. Arriba, junto al logo, pulsa el selector de proyectos → **Proyecto nuevo** → nombre `MaurInventario` → **Crear**. Espera unos segundos y comprueba que arriba aparece «MaurInventario» seleccionado.
3. Activa la API de Gmail: en el buscador de arriba escribe **Gmail API** → ábrela → botón **Habilitar**.
4. Menú ☰ → **APIs y servicios** → **Pantalla de consentimiento de OAuth** (en algunas cuentas se llama **Google Auth Platform**). Pulsa **Comenzar**:
   - Nombre de la aplicación: `MaurInventario`
   - Correo de asistencia: maurinventario@gmail.com
   - Público / Tipo de usuario: **Externo**
   - Información de contacto: maurinventario@gmail.com
   - Acepta la política y pulsa **Crear**.
5. Ve a **Acceso a los datos** (o «Permisos / Scopes») → **Agregar o quitar permisos** → en el filtro escribe `gmail.readonly` → marca **…/auth/gmail.readonly** («Ver tus mensajes de correo y tu configuración») → **Actualizar** → **Guardar**.
   - Solo lectura: la app nunca podrá enviar, borrar ni cambiar correos.
6. Ve a **Público** (Audience) → en «Usuarios de prueba» añade **maurinventario@gmail.com** → Guardar.
7. En esa misma pantalla, pulsa **Publicar la aplicación** → **Confirmar**. Debe quedar en estado **«En producción»**.
   - Esto es importante: en estado «Prueba» Google caduca el permiso cada 7 días.
   - No hace falta que Google verifique la app: es solo para ti. Al conectar verás un aviso de «aplicación no verificada»; es normal (ver paso D).
8. Ve a **Clientes** (o «Credenciales» → **Crear credenciales** → **ID de cliente de OAuth**):
   - Tipo de aplicación: **Aplicación web**
   - Nombre: `MaurInventario web`
   - **URIs de redireccionamiento autorizados** → Agregar URI → pega exactamente:
     `https://maurinventario.vercel.app/api/correo/oauth`
   - Pulsa **Crear**.
9. Aparecen dos datos: **ID de cliente** (termina en `.apps.googleusercontent.com`) y **Secreto del cliente**. Cópialos en un sitio seguro. **No los compartas ni los pegues en GitHub.**

### Paso B · Vercel (guardar las dos claves)

1. Entra en **vercel.com** → proyecto **maurinventario** → **Settings** → **Environment Variables**.
2. Añade dos variables (marca Production, Preview y Development):
   | Nombre | Valor |
   |---|---|
   | `GOOGLE_CLIENT_ID` | el ID de cliente del paso A.9 |
   | `GOOGLE_CLIENT_SECRET` | el secreto del cliente del paso A.9 |
3. Ve a **Deployments** → en el último, menú **⋯** → **Redeploy** → **Redeploy**. Espera a que diga «Ready».

### Paso C · Supabase

**No tienes que hacer nada.** Ya está aplicado:

- Las tablas nuevas (correos, cuentas, nombres recordados) y las columnas nuevas de ventas.
- La revisión automática **cada 5 minutos** (Supabase Cron). Si quieres verla: Supabase → tu proyecto → **Integrations → Cron** → tarea `maurinventario-correo`.
- Las etiquetas se guardan en el almacén **privado** `shipping-labels` y solo se ven con enlaces temporales.

### Paso D · Conectar Gmail en la app

1. Abre **maurinventario.vercel.app** con tu usuario de administrador.
2. Menú → **Ventas por correo** → **Conectar Gmail**.
3. Elige la cuenta **maurinventario@gmail.com** (si eliges otra, la app no la acepta).
4. Google avisa: «Google no ha verificado esta aplicación». Pulsa **Configuración avanzada** → **Ir a MaurInventario (no seguro)**. Es tu propia app; el aviso sale porque no se ha pasado la verificación pública de Google.
5. Marca la casilla de **leer tus correos** y pulsa **Continuar**.
6. Vuelves a la app con el mensaje «Gmail conectado».
7. En esa pantalla elige el **Responsable por defecto** (a quién se apuntan las ventas si no se sabe de quién son).
8. Cuando lleguen los primeros correos, en la pestaña **Cuentas** aparecerán tus usuarios de Vinted/Wallapop (el «Hola, usuario» del correo). Asigna a cada uno su responsable y su móvil.

¡Listo! A partir de aquí no tienes que abrir la app para que se registren las ventas.

---

## 4. El día a día

- **Ventas detectadas** (menú, con número naranja): las ventas que han llegado al correo.
  - **Sí, es una venta**: la registra (si el producto está reconocido y no hay dudas, de un toque). Con «Confirmar las N sin dudas» confirmas varias a la vez.
  - **Revisar y confirmar / Cambiar producto o precio**: eliges otro producto o corriges el precio antes de registrarla.
  - **Ya estaba apuntada**: eliges la venta que ya tenías; no se crea otra ni se toca el stock.
  - **No es una venta**: la descarta.
  - ¿Te equivocaste con «Ya estaba apuntada» o «No es una venta»? En **Ventas por correo → Historial**, «Volver a detectadas».

- **Ventas por correo → Revisar**: lo que necesita que decidas. El número naranja del menú te avisa.
  - **Elegir producto**: el producto no se reconoció. Toca uno de los sugeridos o búscalo. Deja «Recordar» marcado.
  - **Elegir la venta**: hay varias ventas posibles para una etiqueta. Elige la buena (número · fecha · comprador).
  - **Registrar a mano**: los importes del correo de Wallapop no cuadran. Regístrala tú y luego pulsa **Descartar** en el correo.
  - **Reintentar**: vuelve a intentarlo sin riesgo de duplicar.
  - **Descartar**: no hace nada con ese correo (por ejemplo, si ya registraste la venta a mano).
- **Etiqueta esperando**: si la etiqueta llega antes de que exista la venta (por ejemplo, porque está en «Revisar»), espera sola y se pone en cuanto la venta exista. Si pasan 7 días, pasa a «Revisar».
- **Historial**: los últimos correos leídos y qué se hizo con cada uno.
- **Revisar ahora**: hace la revisión en el momento, sin esperar los 5 minutos.

### Si sale «Permiso caducado»

Google retiró el permiso (cambiaste la contraseña de Gmail, quitaste el acceso, etc.). Pulsa **Volver a conectar** y repite el paso D. No se pierde nada: los correos que llegaron mientras tanto se leen al reconectar.

---

## 5. Seguridad y privacidad

- Permiso de **solo lectura** de Gmail, con OAuth oficial de Google. No se usa tu contraseña.
- El permiso de Google se guarda **cifrado** y solo lo puede leer el servidor. El navegador nunca lo ve.
- Del correo **no se guarda el texto**: solo los datos de la venta (artículo, precio, comprador, seguimiento…). De los correos que no son de ventas no se guarda nada.
- Las etiquetas están en un almacén **privado** y se abren con enlaces que caducan en 1 hora.
- La revisión automática llama a la app con una clave interna que solo conocen la base de datos y el servidor.
- Solo los administradores ven «Ventas por correo».

---

## 6. Para quien mantenga el código

| Pieza | Archivo |
|---|---|
| Base de datos (tablas, funciones idempotentes, cron) | `supabase/migrations/20261010090000_ventas_por_correo.sql` |
| Lectura de correos (sin red, con pruebas) | `src/lib/email/parse.ts` · `tests/email/parse.test.ts` |
| Gmail API y OAuth | `src/lib/email/gmail.ts` |
| Cifrado del permiso | `src/lib/email/secret.ts` (AES-256-GCM, clave derivada de `SUPABASE_SECRET_KEY`) |
| Sincronización | `src/lib/email/sync.ts` |
| Rutas | `src/app/api/correo/{conectar,oauth,sincronizar}/route.ts` |
| Pantalla | `src/app/(app)/correos/` |
| Pruebas de base de datos | `tests/db/correo.test.ts` |

- Las ventas se crean con la misma función `create_sale` de siempre (stock por lote, sin negativos, movimientos y auditoría), en nombre del administrador que conectó Gmail.
- Si se cambia `SUPABASE_SECRET_KEY`, el permiso guardado deja de poder leerse: hay que volver a conectar Gmail.
- Variables solo para pruebas: `GMAIL_API_BASE`, `GOOGLE_OAUTH_TOKEN_URL`, `GOOGLE_OAUTH_AUTH_URL`. En Vercel producción se ignoran siempre.

# Instalar MaurInventario desde un iPad

Todo se hace en **Safari**, sin terminal ni ordenador. Lo que en el README se hace con comandos aquí lo sustituyen dos cosas:

- **El código lo sube Claude a tu GitHub.** Tú solo creas el repositorio vacío.
- **La base de datos se crea pegando un archivo** (`supabase/instalar-todo.sql`) en el SQL Editor de Supabase.

Tiempo aproximado: 30-40 minutos.

---

## Paso 1 · GitHub: crear el repositorio vacío

En Safari, entra en **github.com** (crea la cuenta si no la tienes).

1. Pulsa tu foto (arriba a la derecha) → **Your repositories** → **New**.
2. **Repository name:** `maurinventario`
3. Marca **Private**.
4. **No** marques «Add a README file», ni «.gitignore», ni licencia.
5. Pulsa **Create repository**.
6. Dile a Claude tu usuario de GitHub: «es `TU-USUARIO/maurinventario`». Claude sube el código.

✅ Sabrás que está hecho cuando, al recargar la página del repositorio, veas las carpetas `src`, `supabase` y `docs`.

---

## Paso 2 · Supabase: crear la base de datos de producción

En Safari, entra en **supabase.com/dashboard** (crea la cuenta con «Continue with GitHub»).

### 2.1 Crear el proyecto

1. **New project**.
2. **Name:** `maurinventario`.
3. **Database Password:** pulsa «Generate a password» y guárdala en tus contraseñas de iCloud. Aquí no la vas a usar, pero no la pierdas.
4. **Region:** una de Europa.
5. **Create new project** y espera a que termine (1-2 minutos).

### 2.2 Pegar la base de datos

1. En **otra pestaña**, abre tu repositorio de GitHub → carpeta `supabase` → archivo **`instalar-todo.sql`**.
2. Arriba a la derecha del archivo, pulsa el botón **Copy raw file** (icono de dos hojas). Si no lo ves, pulsa **Raw**, mantén pulsado el texto → **Seleccionar todo** → **Copiar**.
3. Vuelve a Supabase → menú izquierdo **SQL Editor** → **New query**.
4. Mantén pulsado dentro del editor → **Pegar**. Es un texto largo (unas 3.900 líneas); espera a que aparezca entero.
5. Pulsa **Run**. Si pregunta por operaciones «destructive», confirma: el archivo borra y crea permisos, no datos.
6. Debe salir **«Success. No rows returned»**.

✅ Comprueba en **Table Editor** que aparecen tablas como `products`, `sales`, `inventory_lots` o `purchase_orders`. Y en **Storage**, los buckets `product-photos` y `shipping-labels`.

> Si sale un error, no se ha guardado nada (todo va en una sola operación). Haz una captura del mensaje y enséñasela a Claude.

### 2.3 Ajustes de inicio de sesión

1. **Authentication → Sign In / Providers**:
   - **Email**: activado.
   - **Allow new users to sign up**: **desactivado**.
2. **Authentication → Users → Add user → Create new user**:
   - Tu email y una contraseña segura.
   - Marca **Auto Confirm User** → **Create user**.

   Este primer usuario es el **administrador**.

### 2.4 Copiar las claves (las necesitarás en el paso 3)

Pulsa **Connect** (arriba) o ve a **Project Settings → API Keys** y apunta en Notas:

| Dato | Se parece a |
|---|---|
| Project URL | `https://xxxx.supabase.co` |
| Publishable key | `sb_publishable_…` |
| Secret key (pulsa para mostrarla) | `sb_secret_…` 🔴 **secreta** |

---

## Paso 3 · Vercel: publicar la web

En Safari, entra en **vercel.com** → **Continue with GitHub**.

1. **Add New… → Project**.
2. Busca `maurinventario` → **Import**. Si no aparece, pulsa «Adjust GitHub App Permissions» y dale acceso a ese repositorio.
3. Vercel detecta **Next.js** solo. No toques Build, Output ni Install.
4. Abre **Environment Variables** y añade estas tres (nombre exacto, valor del paso 2.4):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | la Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la Publishable key |
   | `SUPABASE_SECRET_KEY` | la Secret key |

5. Pulsa **Deploy** y espera 1-3 minutos.
6. Copia la dirección que te da Vercel, por ejemplo `https://maurinventario.vercel.app`.

### 3.1 Avisar a Supabase de tu dirección

Supabase → **Authentication → URL Configuration**:

- **Site URL:** tu dirección de Vercel.
- **Redirect URLs** → Add URL: tu dirección + `/**`, por ejemplo `https://maurinventario.vercel.app/**`.

---

## Paso 4 · Entrar e importar el Excel

1. Abre tu dirección de Vercel → entra con el usuario del paso 2.3.
2. Guarda `INVENTARIO.xlsx` en la app **Archivos** del iPad (desde el correo, Drive…).
3. En MaurInventario → **Importar Excel** → elige el archivo en Archivos.
4. Sigue los pasos:
   - Hojas y columnas → Validar datos → **Simular importación**.
   - Comprueba que pone «Correcto» en el coste real (106 de 106) y en el stock (40 de 40).
   - Marca «He revisado…» → **Importar definitivamente**.
5. Revisa **Inicio**, **Ventas** e **Inventario**. Después completa **Pendientes de revisar**: los proveedores de los 7 pedidos y el motivo de 4 salidas.

### Crear el usuario de Francesca

**Usuarios → Nuevo usuario**:

- Rol: **Vendedor**.
- Responsable: «Vincular a «Francesca Grossale»».
- Contraseña inicial: la que tú elijas. Pásasela; ella puede cambiarla en **Mi cuenta**.

---

## Paso 5 · Proyecto de pruebas (antes de hacer cambios)

Para no probar nunca sobre tus datos reales:

1. Repite el **paso 2** con un proyecto llamado `maurinventario-dev`: pega el mismo `instalar-todo.sql` y crea tu usuario.
2. En Vercel → **Settings → Environment Variables**, añade las tres variables otra vez, con los valores de **dev**, marcando solo **Preview**.
3. En las tres variables de producción, deja marcado solo **Production**.

Así, cuando Claude te prepare un cambio en una rama, Vercel crea una dirección de prueba que usa la base de datos de pruebas.

---

## Cómo funcionarán los cambios a partir de ahora

- **Cambios de pantallas o funciones:**
  1. Se los pides a Claude.
  2. Claude los sube a GitHub, a una rama de prueba.
  3. Vercel crea una dirección **Preview**.
  4. Si te gusta, en GitHub pulsas **Pull request → Merge** y se publica en tu web en 1-3 minutos.
- **Cambios de base de datos:** Claude te dará un archivo SQL nuevo y corto. Lo pegas en el SQL Editor, **primero en `maurinventario-dev`** y, cuando todo funcione, **en producción**.
- **Si cambias una variable en Vercel:** Deployments → el último → **Redeploy**. Si no, no se aplica.

---

## Si algo falla

| Lo que ves | Qué hacer |
|---|---|
| «MaurInventario no está configurado: faltan…» | Faltan variables en Vercel, o están mal escritas. Añádelas y haz **Redeploy**. |
| «El email o la contraseña no son correctos» | Revisa en Supabase → Authentication → Users que el usuario existe. |
| «Tu usuario está desactivado» | Actívalo en MaurInventario → Usuarios → Gestionar. Si eres tú y no puedes entrar, en Supabase → SQL Editor: `update public.profiles set role = 'admin', active = true where email = 'TU@EMAIL';` |
| «Has entrado, pero no se puede leer tu perfil» | El paso 2.2 no se completó en ese proyecto. Repítelo. |
| Error al pegar el SQL | Captura del mensaje para Claude. No se ha guardado nada. |
| La web abre pero tras entrar vuelve al login | Revisa el paso 3.1 (Site URL). |

El resto de la explicación técnica (permisos, seguridad, informes) está en el `README.md`.

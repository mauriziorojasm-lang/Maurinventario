# MaurInventario

Mini ERP de inventario, ventas, compras y rentabilidad, preparado para sustituir el Excel `INVENTARIO.xlsx`.

Esta guía te lleva desde el código en tu ordenador hasta la aplicación funcionando en internet:

```
Código en tu ordenador → GitHub → Supabase (base de datos) → Vercel (web) → aplicación online
```

Cada paso indica **dónde** se hace:

| Icono | Dónde |
|---|---|
| 💻 | En tu ordenador (terminal dentro de la carpeta del proyecto) |
| 🐙 | En GitHub (github.com) |
| 🟩 | En Supabase (supabase.com/dashboard) |
| ▲ | En Vercel (vercel.com) |
| 📦 | Dentro de MaurInventario (la aplicación ya abierta en el navegador) |

---

## Índice

1. [Prerrequisitos](#1-prerrequisitos)
2. [Estructura del proyecto](#2-estructura-del-proyecto)
3. [Crear el repositorio de GitHub](#3-crear-el-repositorio-de-github)
4. [Configurar Supabase](#4-configurar-supabase)
5. [Base de datos](#5-base-de-datos)
6. [Migraciones de base de datos](#6-migraciones-de-base-de-datos)
7. [Variables de entorno](#7-variables-de-entorno)
8. [Supabase Storage](#8-supabase-storage)
9. [Autenticación](#9-autenticación)
10. [Conectar GitHub con Vercel](#10-conectar-github-con-vercel)
11. [Variables en Vercel](#11-variables-en-vercel)
12. [Primer deploy](#12-primer-deploy)
13. [Importar el Excel](#13-importar-el-excel)
14. [Flujo de trabajo a partir de ahora](#14-flujo-de-trabajo-a-partir-de-ahora)
15. [Desarrollo vs Producción](#15-desarrollo-vs-producción)
16. [Seguridad](#16-seguridad)
17. [Tests](#17-tests)
18. [Problemas frecuentes](#18-problemas-frecuentes)
19. [Pendientes antes de dar por cerrado](#19-pendientes-antes-de-dar-por-cerrado)
20. [Checklist final](#20-checklist-final)

---

## 1. Prerrequisitos

| Qué | Versión | Para qué sirve |
|---|---|---|
| **Node.js** | 22 LTS (mínimo 20.9) | Ejecuta la aplicación en tu ordenador. Descárgalo en nodejs.org (versión «LTS»). |
| **npm** | La que viene con Node | Instala las librerías del proyecto. |
| **Git** | Cualquiera reciente | Guarda el historial del código y lo sube a GitHub. En Windows instala «Git for Windows». |
| **Cuenta de GitHub** | — | Guarda el código en internet. Vercel lo lee de ahí. |
| **Cuenta de Supabase** | Plan gratuito vale | Base de datos PostgreSQL, usuarios (login) y archivos (fotos y etiquetas). |
| **Cuenta de Vercel** | Plan Hobby vale | Publica la web. Entra en Vercel con tu cuenta de GitHub. |
| **Editor de código** | Visual Studio Code | Para abrir y mirar el proyecto. |
| **El proyecto** | Carpeta `maurinventario` | El código que te he entregado. |

Comprueba que lo tienes instalado:

💻
```bash
node -v    # debe mostrar v22.x (o v20.9 o superior)
npm -v
git --version
```

> No necesitas instalar Docker ni PostgreSQL. La base de datos vive en Supabase.

---

## 2. Estructura del proyecto

Esto es lo que hay realmente en el proyecto:

| Elemento | Qué usa MaurInventario |
|---|---|
| Framework | **Next.js 16** (App Router), con **React 19** |
| Lenguaje | **TypeScript** |
| Estilos | **Tailwind CSS 4** y tipografía Public Sans (incluida en el proyecto, sin Google Fonts) |
| Gestor de paquetes | **npm** (`package-lock.json`) |
| Base de datos | **PostgreSQL de Supabase** |
| ORM | **No hay ORM** (ni Prisma ni Drizzle). La lógica de negocio está en funciones SQL de la base de datos, que la app llama con `supabase-js`. |
| Migraciones | **Supabase CLI**, carpeta `supabase/migrations/` (7 archivos SQL) |
| Autenticación | **Supabase Auth**, solo email y contraseña. Los usuarios los crea el administrador; no hay registro público. |
| Permisos | **Row Level Security** y funciones SQL que comprueban si el usuario es `admin` o `vendedor` |
| Storage | **Supabase Storage**, 2 buckets privados: `product-photos` y `shipping-labels` (los crea una migración) |
| Lectura de Excel | `exceljs`. El Excel se lee **en tu navegador** y no se sube a ningún servidor. |
| Tests | `vitest` (importador y base de datos) |

```
maurinventario/
├── src/
│   ├── app/
│   │   ├── (app)/             ← pantallas con sesión: ventas, productos, compras…
│   │   ├── login/             ← inicio de sesión
│   │   ├── api/exportar/      ← exportación a Excel/CSV
│   │   └── auth/salir/        ← cerrar sesión
│   ├── components/            ← piezas visuales reutilizables
│   ├── lib/
│   │   ├── import/            ← lector y validador del Excel
│   │   ├── supabase/          ← conexión con Supabase (navegador, servidor, admin)
│   │   └── …                  ← formatos, informes, permisos
│   └── proxy.ts               ← renueva la sesión y protege las páginas
├── supabase/
│   ├── config.toml            ← configuración del proyecto Supabase
│   └── migrations/            ← TODA la base de datos, en orden
├── tests/                     ← tests (datos ficticios, nunca los reales)
├── scripts/comprobar-excel.ts ← revisa un Excel sin tocar la base de datos
├── .env.example               ← plantilla de variables de entorno
└── README.md
```

**Las migraciones, en orden:**

| Archivo | Qué crea |
|---|---|
| `…100000_esquema_base.sql` | Tablas, relaciones, índices y opciones de referencia: Vinted, Wallapop, En persona, transportistas y Móvil 1 a 6. |
| `…100100_seguridad_y_auditoria.sql` | Permisos (RLS), perfiles de usuario, protección del último admin y auditoría automática. |
| `…100200_logica_de_negocio.sql` | Ventas, compras, recepción, lotes, devoluciones, salidas sin venta y ajustes, todos con transacciones. |
| `…100300_informes.sql` | Vistas e informes: beneficio por lote, coste medio ponderado, responsables, reparto, dashboard e integridad. |
| `…100400_storage.sql` | Buckets de fotos y etiquetas, con sus políticas. |
| `…100500_importacion.sql` | Importación segura del Excel, con modo simulación. |
| `…100600_permisos_funciones.sql` | Quién puede llamar a cada función. |

> ⚠️ **No hay datos de demostración.** La base de datos empieza vacía, salvo las listas de plataformas, transportistas y móviles. Tus datos reales entran con el importador (paso 13).

---

## 3. Crear el repositorio de GitHub

### 3.1 Crear el repositorio

🐙 En github.com:

1. Arriba a la derecha pulsa **+** y luego **New repository**.
2. **Repository name:** `maurinventario`.
3. Marca **Private**. Es tu negocio: nadie más debe ver el código ni su historial.
4. **No** marques «Add a README», «.gitignore» ni «license». El proyecto ya los trae.
5. Pulsa **Create repository** y deja la página abierta: verás la URL del repositorio, del tipo `https://github.com/TU-USUARIO/maurinventario.git`.

### 3.2 Qué NO se sube nunca

El archivo `.gitignore` del proyecto ya excluye:

| Archivo / carpeta | Por qué |
|---|---|
| `.env`, `.env.local`, `.env.*` | Contienen tus claves. |
| `*.xlsx`, `*.xls`, `*.csv`, `/data/` | Tus datos reales del negocio (clientes, costes, correos). |
| `node_modules/`, `.next/` | Se regeneran solos. |
| `supabase/.temp/`, `supabase/.branches/` | Archivos locales de la CLI de Supabase. |
| `*.pem` | Claves privadas. |

Sí se sube `.env.example`: solo tiene los **nombres** de las variables, sin valores.

### 3.3 Conectar el proyecto y hacer el primer push

💻 Abre una terminal **dentro de la carpeta `maurinventario`**:

```bash
# 1. El proyecto ya trae git inicializado con su historial. Comprueba que .env.local NO aparece:
git status

# 2. Instala las dependencias (solo la primera vez)
npm install

# 3. Conecta con tu repositorio de GitHub (pon tu URL del paso 3.1)
git remote add origin https://github.com/TU-USUARIO/maurinventario.git
git branch -M main

# 4. Guarda cualquier cambio pendiente y súbelo
git add .
git commit -m "Primera versión de MaurInventario"   # si dice "nothing to commit", no pasa nada
git push -u origin main
```

La primera vez, GitHub te pedirá iniciar sesión en el navegador. Hazlo con tu cuenta.

✅ Comprueba en GitHub que ves las carpetas `src` y `supabase`, y que **no** hay ningún `.env.local` ni `.xlsx`.

---

## 4. Configurar Supabase

**Decisión recomendada:** usa **dos proyectos de Supabase**.

- `maurinventario-dev`: para probar. Puedes romperlo sin miedo.
- `maurinventario`: producción, con tus datos reales.

Así nunca pruebas nada sobre los datos de verdad. El plan gratuito permite dos proyectos. Repite este paso 4 para cada uno.

### 4.1 Crear el proyecto

🟩 En supabase.com/dashboard:

1. **New project**.
2. **Name:** `maurinventario-dev` (o `maurinventario` para producción).
3. **Database Password:** pulsa «Generate a password» y **guárdala en un gestor de contraseñas**. La necesitarás para las migraciones.
4. **Region:** la más cercana a España, por ejemplo una de Europa (Frankfurt o París, según lo que aparezca).
5. **Create new project** y espera a que termine (1-2 minutos).

### 4.2 Dónde está cada dato

🟩 Dentro del proyecto, pulsa **Connect** (arriba) o ve a **Project Settings → API Keys**:

| Dato | Dónde | Formato | ¿Lo usa MaurInventario? |
|---|---|---|---|
| **Project URL** | Connect, o Project Settings → Data API | `https://xxxx.supabase.co` | Sí, `NEXT_PUBLIC_SUPABASE_URL` |
| **Publishable key** | Project Settings → API Keys | `sb_publishable_…` | Sí, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| **Secret key** | Project Settings → API Keys (pulsa para revelar) | `sb_secret_…` | Sí, `SUPABASE_SECRET_KEY` (solo servidor) |
| **Project ref** | Project Settings → General («Project ID») | `xxxx` | Sí, solo para la CLI al migrar (no es variable de entorno) |
| **Database password** | La que guardaste en 4.1 | — | Sí, solo para la CLI al migrar (no es variable de entorno) |
| Database URL | Connect | `postgresql://…` | **No.** La app no se conecta directamente a PostgreSQL. |

> Si tu proyecto muestra las claves antiguas **anon** y **service_role** (pestaña «Legacy API Keys»), también funcionan: `anon` va en lugar de la publishable y `service_role` en lugar de la secret. Supabase las está retirando, así que usa las nuevas.

### 4.3 Públicas y secretas

| Variable | Tipo | ¿Puede ir al navegador? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 🟢 Pública | Sí. Es la dirección del proyecto. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 🟢 Pública | Sí. Por sí sola no da acceso a nada: cada consulta pasa por los permisos (RLS) del usuario con sesión. |
| `SUPABASE_SECRET_KEY` | 🔴 **Secreta** | **Nunca.** Salta todos los permisos. Solo la usa el servidor en la pantalla Usuarios. |

En Next.js, todo lo que empieza por `NEXT_PUBLIC_` se incluye en el código del navegador. Por eso la secret key **no** lleva ese prefijo.

---

## 5. Base de datos

MaurInventario se conecta a PostgreSQL **a través de la API de Supabase**: lecturas con permisos (RLS) y funciones SQL para todo lo que mueve stock o dinero. No hay ORM ni conexión directa.

Toda la estructura está en `supabase/migrations/`. **No se crea nada a mano** en el panel de Supabase.

### Desarrollo (crear la base de datos en `maurinventario-dev`)

💻
```bash
npx supabase login                              # se abre el navegador para autorizar
npx supabase link --project-ref REF_DE_DEV      # te pide la Database Password de dev
npx supabase db push                            # aplica las 7 migraciones
```

### Producción (la base de datos que usará Vercel)

Es lo mismo, enlazando el proyecto de producción:

💻
```bash
npx supabase link --project-ref REF_DE_PRODUCCION
npx supabase db push
npx supabase link --project-ref REF_DE_DEV      # vuelve a dejar enlazado dev para trabajar
```

> `npx supabase link` decide a qué proyecto se aplicará el siguiente `db push`. Antes de hacer push, **mira siempre a cuál estás enlazado**.

### Comprobar que las tablas existen

🟩 En **Table Editor** deben aparecer, entre otras: `products`, `product_variants`, `purchase_orders`, `purchase_order_items`, `inventory_lots`, `inventory_movements`, `sales`, `sale_items`, `returns`, `stock_exits`, `responsibles`, `profiles` y `audit_log`.

🟩 Y en **SQL Editor** puedes lanzar:

```sql
select count(*) as tablas from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE';
-- Debe dar 26
select name from public.platforms order by sort_order;
-- Vinted, Wallapop, En persona
```

---

## 6. Migraciones de base de datos

**Qué es una migración:** un archivo SQL con un cambio de la base de datos (una tabla nueva, una columna, una función…). Se aplican en orden y quedan registradas, así dev y producción tienen exactamente la misma estructura.

**Cuándo crear una:** cuando cambie **la estructura** de la base de datos: tablas, columnas, funciones, permisos o buckets. Cambiar textos, colores o pantallas **no** necesita migración.

**Cómo crear y aplicar una:**

💻
```bash
npm run db:new -- nombre_del_cambio
# crea supabase/migrations/AAAAMMDDHHMMSS_nombre_del_cambio.sql → escribe ahí el SQL

npx supabase link --project-ref REF_DE_DEV
npx supabase db push            # 1º en desarrollo: prueba la app
# …cuando todo funcione en dev:
npx supabase link --project-ref REF_DE_PRODUCCION
npx supabase db push            # 2º en producción
```

**Comprobar que se aplicó:**

💻
```bash
npx supabase migration list     # columnas Local y Remote: deben coincidir
```

**Si una migración falla:**

1. Lee el error: indica el archivo y la línea.
2. Una migración que falla **no se aplica a medias**: Supabase la deshace entera.
3. Corrige el archivo **que falló** (todavía no se ha aplicado) y repite `npx supabase db push`.
4. **Nunca edites una migración que ya está aplicada en producción.** Crea otra nueva que corrija la anterior.

**Cómo evitar tocar producción sin control:**

- No cambies tablas a mano en el Table Editor de producción. Todo cambio va en una migración.
- Siempre primero en `maurinventario-dev` y después en producción.
- Antes de un `db push` a producción, haz una copia de seguridad (🟩 Database → Backups; o `npx supabase db dump -f copia.sql`).

---

## 7. Variables de entorno

Estas son **todas** las variables que usa MaurInventario. No hay más.

| Variable | Local (`.env.local`) | Vercel | Pública/Secreta | Para qué sirve |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ (la de **dev**) | ✅ | 🟢 Pública | Dirección del proyecto de Supabase. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ (la de **dev**) | ✅ | 🟢 Pública | Conectar como el usuario con sesión, con sus permisos. |
| `SUPABASE_SECRET_KEY` | ✅ (la de **dev**) | ✅ | 🔴 Secreta | Solo pantalla Usuarios: crear usuarios, desactivarlos y cambiar contraseñas. |

> Sin `SUPABASE_SECRET_KEY` la app funciona, pero la pantalla Usuarios no puede crear usuarios. Lo avisa en pantalla.

### Crear `.env.local` (tu ordenador)

💻
```bash
cp .env.example .env.local      # en Windows: copy .env.example .env.local
```

Abre `.env.local` con el editor y pega los valores del proyecto **de desarrollo** (paso 4.2):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxdev.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx
SUPABASE_SECRET_KEY=sb_secret_xxxx
```

Arranca la app en tu ordenador:

💻
```bash
npm run dev
# abre http://localhost:3000
```

Las mismas tres variables, con los valores de cada proyecto, van en Vercel (paso 11).

---

## 8. Supabase Storage

MaurInventario usa archivos para dos cosas, y **los buckets ya los crea la migración** `…100400_storage.sql`. No hay que crearlos a mano.

| Bucket | Público | Qué guarda | Límite |
|---|---|---|---|
| `product-photos` | **No** (privado) | Fotos de productos. Se ven con enlaces temporales de 1 hora. | 5 MB, imágenes |
| `shipping-labels` | **No** (privado) | Etiquetas de envío de Vinted/Wallapop. Ruta: `<id de la venta>/<archivo>`. | 10 MB, PDF o imagen |

**Permisos (ya incluidos en la migración):**

| Bucket | Subir | Ver | Borrar |
|---|---|---|---|
| `product-photos` | Solo admin | Cualquier usuario activo | Solo admin |
| `shipping-labels` | Admin, o el vendedor de **esa** venta | Admin, o el vendedor de esa venta | Admin, o el vendedor de esa venta |

**Comprobar:** 🟩 en **Storage** deben aparecer los dos buckets y ninguno debe ser «Public».

**Subir, leer y eliminar:**

- 📦 Para subir una foto: Productos → abre un producto → «Editar producto» → Foto.
- 📦 Para subir una etiqueta: abre una venta de Vinted/Wallapop → Envío → Etiqueta de envío → Guardar envío. Después «Ver etiqueta» la abre.
- Para borrar un archivo suelto: 🟩 Storage → bucket → archivo → Delete. Al sustituir una foto o una etiqueta, la anterior se queda en el bucket. Como mucho ocupa espacio, no es un riesgo.

> **Seguridad:** no marques nunca un bucket como público. Las etiquetas llevan nombres y direcciones de tus clientes.

---

## 9. Autenticación

MaurInventario usa **Supabase Auth** con **email y contraseña**:

- No hay registro público.
- El primer usuario del proyecto es administrador automáticamente.
- Los siguientes los crea el administrador desde 📦 Usuarios.
- Cualquier usuario creado por otra vía (por ejemplo desde el panel de Supabase) entra **desactivado** hasta que un admin lo active en 📦 Usuarios → Gestionar.

### 9.1 Configurar Auth (en cada proyecto de Supabase)

🟩 **Authentication → Sign In / Providers**:

1. **Email**: activado. Es el único método que usa la app.
2. **Allow new users to sign up** (o «Enable sign ups»): **desactivado**. Los usuarios solo los crea el admin.

🟩 **Authentication → URL Configuration**:

| Campo | Desarrollo | Producción |
|---|---|---|
| **Site URL** | `http://localhost:3000` | `https://maurinventario.vercel.app` (tu dominio de Vercel, paso 12) |
| **Redirect URLs** | `http://localhost:3000/**` | `https://maurinventario.vercel.app/**` y `https://*-TU-USUARIO.vercel.app/**` (para los Preview) |

> La app no envía emails de confirmación ni de recuperación: el admin pone y cambia las contraseñas desde 📦 Usuarios. Por eso no necesitas configurar un servidor de correo.

### 9.2 Crear el primer usuario administrador

🟩 **Authentication → Users → Add user → Create new user**:

1. Email: el tuyo.
2. Password: una segura (mínimo 8 caracteres).
3. Marca **Auto Confirm User**.
4. **Create user**.

Como es el primer usuario del proyecto, la base de datos le da el rol **admin**. Compruébalo:

🟩 **SQL Editor**
```sql
select email, role, active from public.profiles;
-- tu email | admin | true
```

Si por lo que sea no saliera como admin, arréglalo así:

```sql
update public.profiles set role = 'admin', active = true where email = 'TU@EMAIL';
```

### 9.3 Crear vendedores

📦 **Usuarios → Nuevo usuario**:

1. Rellena nombre, email y contraseña inicial.
2. Rol: **Vendedor**.
3. Responsable: «Vincular a…» el responsable que ya existe (por ejemplo Francesca Grossale, creada al importar el Excel) o «Crear un responsable nuevo».

Lo que puede hacer cada rol (lo aplica la base de datos, no solo la pantalla):

| | Admin | Vendedor |
|---|---|---|
| Registrar ventas | Para cualquier responsable | Solo a su nombre |
| Ver ventas | Todas | Solo las suyas |
| Ver productos y stock | Sí, con costes | Sí, **sin costes** |
| Compras, proveedores, lotes, costes | Sí | No |
| Ajustes, salidas sin venta, devoluciones | Sí | No |
| Informes, exportar, reparto, auditoría, importar | Sí | No |
| Cambiar el envío y la etiqueta de su venta | Sí | Sí (solo las suyas) |

---

## 10. Conectar GitHub con Vercel

▲ En vercel.com:

1. Entra con **Continue with GitHub**.
2. **Add New… → Project**.
3. En «Import Git Repository», busca `maurinventario` y pulsa **Import**. Si no aparece, pulsa «Adjust GitHub App Permissions» y da acceso a ese repositorio.
4. **Framework Preset:** Vercel detecta **Next.js** solo. No toques nada.
5. **Build Command:** déjalo por defecto (`next build`).
6. **Output Directory:** por defecto. No lo cambies.
7. **Install Command:** por defecto (`npm install`).
8. **Root Directory:** `./`, por defecto.
9. **Environment Variables:** despliega la sección y añade las tres variables de **producción** (paso 11).
10. Pulsa **Deploy** y espera 1-3 minutos.
11. Abre la URL que te da Vercel. Debe aparecer la pantalla «Entrar».

> Si haces **Deploy** sin las variables, la web mostrará «MaurInventario no está configurado: faltan…». Añádelas (paso 11) y vuelve a desplegar.

---

## 11. Variables en Vercel

▲ **Project → Settings → Environment Variables**. Añade cada variable y elige en qué entorno se usa:

| Entorno de Vercel | Cuándo se usa | Qué valores poner |
|---|---|---|
| **Production** | La web real (`maurinventario.vercel.app`), cada push a `main` | Los del proyecto Supabase de **producción** |
| **Preview** | Las URL de prueba que Vercel crea para cada rama distinta de `main` | Los del proyecto Supabase de **desarrollo** |
| **Development** | Solo si usas `vercel dev` o `vercel env pull` en tu ordenador | Los de **desarrollo** (opcional; con `.env.local` basta) |

Por cada variable:

1. **Key:** el nombre exacto, por ejemplo `NEXT_PUBLIC_SUPABASE_URL`.
2. **Value:** el valor.
3. Marca el entorno: añade la variable dos veces, una con el valor de producción marcando «Production» y otra con el de desarrollo marcando «Preview».
4. Para `SUPABASE_SECRET_KEY`, activa **Sensitive**.
5. **Save**.

> ⚠️ **Cambiar una variable no cambia la web que ya está publicada.** Después de añadir o cambiar variables, ve a ▲ **Deployments → … (el último) → Redeploy**. Las `NEXT_PUBLIC_` se incluyen al construir la web, así que sin redeploy no se aplican.

---

## 12. Primer deploy

### Antes de Deploy

- [ ] GitHub conectado (el código está en `github.com/TU-USUARIO/maurinventario`, privado)
- [ ] Supabase creado (proyecto de producción, y uno de desarrollo)
- [ ] Base de datos preparada (`npx supabase db push` a producción)
- [ ] Migraciones aplicadas (`npx supabase migration list`: Local = Remote)
- [ ] Variables configuradas en Vercel (3 variables, Production y Preview)
- [ ] Storage configurado (los 2 buckets privados existen; los crea la migración)
- [ ] Auth configurada: registro público desactivado, Site URL y Redirect URLs, primer usuario admin creado
- [ ] `.env` y `.env.local` fuera de Git (no aparecen en GitHub)
- [ ] Build local correcto: 💻 `npm run build` termina sin errores

### Después de Deploy

- [ ] La web abre y muestra «Entrar»
- [ ] Login funciona con tu usuario admin
- [ ] Base de datos responde: Inicio muestra cifras (a cero) sin errores
- [ ] Se pueden crear registros: crea un proveedor de prueba en 📦 Proveedores (en el proyecto de **desarrollo**)
- [ ] Las imágenes funcionan: sube la foto de un producto y se ve
- [ ] Las operaciones importantes funcionan: importa el Excel (paso 13) y revisa Inicio, Ventas e Inventario
- [ ] No aparecen errores críticos (▲ Deployments → el último → Runtime Logs)

Tu dominio de Vercel será algo como `https://maurinventario.vercel.app`. Ponlo como **Site URL** en Supabase (paso 9.1). Si más adelante compras un dominio propio: ▲ Settings → Domains → Add, sigue las instrucciones de DNS y actualiza la Site URL y las Redirect URLs en Supabase.

---

## 13. Importar el Excel

**Primero prueba en desarrollo y después en producción.**

### 13.1 Revisar el Excel desde tu ordenador (opcional, no toca ninguna base de datos)

💻
```bash
npm run import:check -- ruta/a/INVENTARIO.xlsx
```

Muestra:

- qué hojas detecta,
- el resumen,
- los errores y avisos,
- si el stock calculado cuadra con tu hoja Almacen.

### 13.2 Importar desde la aplicación

📦 **Importar Excel**:

1. **Archivo:** elige `INVENTARIO.xlsx`. Se lee en tu navegador.
2. **Hojas y columnas:** revisa el tipo de cada hoja y, con «Columnas», qué columna corresponde a cada campo (vienen sugeridas). Las hojas de cálculos (Analisis, Beneficios, Reparto movil…) se quedan en «No importar».
3. **Productos que podrían ser el mismo:** «Oakley - Encoder 1 es Oakley - Encoder» ya viene marcado, porque lo confirmaste.
4. **Validar datos:** errores, avisos y resumen (filas válidas, productos nuevos, pedidos, ventas, salidas sin venta…).
5. **Simular importación:** la base de datos lo hace todo y lo deshace. Comprueba que pone «Correcto» en:
   - el coste real por unidad (106 de 106 líneas),
   - el stock por producto (40 de 40).
6. Marca «He revisado…» y pulsa **Importar definitivamente**.

Con tu Excel actual el resultado es:

- 113 productos.
- 7 pedidos de compra con 106 líneas.
- 187 ventas, que suman 9.204,70 €.
- 7 salidas sin venta (las ventas a 0 €).
- 80 unidades en stock.
- 11 pendientes de revisar: los 7 pedidos sin proveedor y 4 salidas sin motivo.

**Reglas que aplica (las que confirmaste):**

| Regla | Qué hace |
|---|---|
| Pedido 1 | 12 unidades a 19,16 €/ud., lo que ya calcula tu Excel. |
| «Oakley - Encoder 1» = «Oakley - Encoder» | Un solo producto con 4 lotes. |
| Ventas a 0 € | Se importan como **salidas sin venta**: no cuentan como ventas y su coste es pérdida. |
| Total frente a precio unitario (fila 78) | Si no cuadran, manda el **total** (45 €). |
| Reparto | Total vendido entre los socios a partes iguales, sin el 15 %. |

**Volver a importar es seguro:** lo que ya existe se omite. No se duplican pedidos (por número), ventas (por huella de la fila) ni productos (por nombre).

### 13.3 Una diferencia con tu Excel que es correcta

El valor del almacén puede salir algo distinto al de tu hoja Almacen. Con tus datos: 956,38 € frente a 935,43 €.

- Tu Excel valora el stock con el coste medio de **todo lo comprado alguna vez**.
- MaurInventario lo valora con el coste medio ponderado de **las unidades que quedan**, que salen de lotes concretos.

Así cuadra la cuenta completa: compras = coste de lo vendido + pérdidas + almacén.

---

## 14. Flujo de trabajo a partir de ahora

### Cambios normales (pantallas, textos, colores…): sin migración

```
Modificar código → probar en local (npm run dev, contra Supabase dev)
      ↓
git add . && git commit -m "Qué he cambiado"
      ↓
git push
      ↓
GitHub recibe el cambio → Vercel lo detecta solo → Build → Deploy
      ↓
En 1-3 minutos está online
```

💻
```bash
npm run dev           # probar
npm run lint          # revisar el código
npm run build         # comprobar que compila
git add .
git commit -m "Descripción del cambio"
git push
```

> Recomendado: trabaja en una rama (`git switch -c mi-cambio`) y haz push de esa rama. Vercel crea una **Preview** (URL de prueba, contra Supabase **dev**). Si está bien, únela a `main` (en GitHub: Pull request → Merge) y se publica en producción.

### Cambios de base de datos: con migración

```
Crear migración (npm run db:new -- nombre)
      ↓
Escribir el SQL
      ↓
Aplicar en DEV (link dev + db push) y probar la app en local
      ↓
git add, commit y push (el SQL queda guardado en GitHub)
      ↓
Aplicar en PRODUCCIÓN (link producción + db push)   ← ANTES de que Vercel publique código que lo necesite
      ↓
Vercel despliega
```

**¿Necesita migración?**

| Cambio | ¿Migración? |
|---|---|
| Textos, colores, orden de columnas, una pantalla nueva que lee datos que ya existen | No |
| Una columna o tabla nueva, cambiar un cálculo de un informe, permisos, una función de ventas o compras | **Sí** |
| Añadir una plataforma, un transportista o una categoría | No: se hace desde 📦 Listas y ajustes |

---

## 15. Desarrollo vs Producción

| | Desarrollo | Producción |
|---|---|---|
| **Código** | Tu ordenador, o una rama distinta de `main` | Rama `main` en GitHub |
| **Base de datos** | Proyecto Supabase `maurinventario-dev` | Proyecto Supabase `maurinventario` |
| **Variables** | `.env.local` y Vercel «Preview» con los valores de **dev** | Vercel «Production» con los valores de **producción** |
| **URL** | `http://localhost:3000` y las URL Preview de Vercel | `https://maurinventario.vercel.app` (o tu dominio) |
| **Deploy** | `npm run dev`, o push a una rama → Preview | Push o merge a `main` → Production |
| **Migraciones** | Primero aquí: `link` dev + `db push` | Después, cuando todo funcione en dev |
| **Datos** | De prueba; puedes importar el Excel tantas veces como quieras (o crear el proyecto de nuevo) | Los reales: no se prueban cosas aquí |

> Truco para no equivocarte: en el panel de Supabase, mira **siempre el nombre del proyecto** arriba antes de tocar nada.

---

## 16. Seguridad

**Claves que jamás deben subirse a GitHub:**

- `SUPABASE_SECRET_KEY` (o la antigua `service_role`).
- La contraseña de la base de datos.
- Cualquier `.env*` con valores.
- Tus Excel con datos reales.

**Claves que pueden estar en el frontend:** `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Sin una sesión de usuario no pueden leer nada: el rol anónimo no tiene ningún permiso en la base de datos.

**Uso correcto de `.env`:**

- Los valores reales van solo en `.env.local` (tu ordenador) y en Vercel.
- `.env.example` solo lleva nombres.
- Si una clave secreta se filtra: 🟩 Project Settings → API Keys → crea una nueva y elimina la filtrada. Después actualízala en Vercel y haz Redeploy.

**La secret key** solo se usa en `src/lib/supabase/admin.ts`, que marca `server-only` (no puede llegar al navegador). Además, solo se usa después de comprobar que quien lo pide es administrador.

**Row Level Security:** está activada en **todas** las tablas.

- Los vendedores solo leen sus ventas y el catálogo sin costes.
- Las tablas que mueven stock o dinero no tienen permisos de escritura directa. Solo se cambian mediante las funciones de negocio, que comprueban el rol y usan transacciones.
- El stock nunca puede ser negativo: lo impide una restricción de la base de datos.
- Los movimientos de stock no se pueden modificar ni borrar.

**Políticas de Storage:** buckets privados. Las fotos las sube solo el admin y las etiquetas solo su vendedor o el admin (sección 8).

**Permisos de usuarios:**

- Siempre queda al menos un administrador activo: la base de datos impide quitar el último.
- Nadie puede darse a sí mismo el rol de admin.
- Las altas que no hace el admin entran desactivadas.

**Protección de rutas:**

- `src/proxy.ts` manda al login a quien no tiene sesión.
- Las páginas de administración comprueban el rol en el servidor.
- La base de datos vuelve a comprobarlo en cada operación (no basta con ocultar botones).

**Auditoría:** cada alta, cambio y anulación queda registrada con usuario y fecha (📦 Auditoría). Nadie puede escribir ni borrar entradas a mano.

**Errores comunes que debes evitar:**

| ❌ No hagas | ✅ Haz |
|---|---|
| Poner la secret key en una variable `NEXT_PUBLIC_…` | Llamarla exactamente `SUPABASE_SECRET_KEY` |
| Activar «Allow new users to sign up» | Crear los usuarios desde 📦 Usuarios |
| Marcar un bucket como público | Dejarlos privados |
| Desactivar RLS de una tabla «para probar» | Probar en el proyecto de dev |
| Hacer el repositorio público | Dejarlo privado |
| Editar tablas a mano en producción | Usar migraciones o la aplicación |

**Configuración insegura detectada:** no he encontrado ninguna en el proyecto.

⚠️ **PENDIENTE:** comprueba en 🟩 Authentication que el registro público está **desactivado** en tus dos proyectos. Es un ajuste del panel, no del código.

---

## 17. Tests

💻
```bash
npm test          # tests del importador; los de base de datos se saltan si no hay PostgreSQL de pruebas
npm run lint
npm run typecheck
npm run build
```

Los tests de base de datos (`tests/db/`) crean una base de datos **temporal y vacía**, aplican todas las migraciones y prueban:

- lotes, coste medio ponderado y beneficio por lote (el ejemplo de 10 € y 15 €),
- reparto de costes, stock nunca negativo y ventas a 0 €,
- permisos de vendedor, devoluciones, sustituciones y anulaciones,
- etiquetas, auditoría e importación.

Necesitan un PostgreSQL **local** (nunca el de Supabase):

💻
```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
```

> Todos los datos de los tests son ficticios («Prueba Encoder», «Persona Uno»…). Viven solo en esa base temporal, que se borra al terminar, y nunca llegan a la aplicación.

---

## 18. Problemas frecuentes

**«Build failed» en Vercel**
- ▲ Deployments → el deploy fallido → Build Logs: busca la primera línea con «Error».
- Ejecuta 💻 `npm run build` en local: si falla igual, corrígelo antes de hacer push.
- Comprueba que `package-lock.json` está subido a GitHub.
- Versión de Node: ▲ Settings → General → Node.js Version: 20.x o superior (recomendado 22.x).

**«Missing environment variable» / «MaurInventario no está configurado: faltan…»**
- ▲ Settings → Environment Variables: están las 3, con el nombre exacto (mayúsculas incluidas) y en el entorno correcto (Production o Preview).
- Después de añadirlas: **Redeploy**.
- En local: el archivo se llama exactamente `.env.local` y está en la raíz del proyecto. Reinicia `npm run dev` tras cambiarlo.

**«Supabase connection failed» / «No se puede conectar con la base de datos»**
- `NEXT_PUBLIC_SUPABASE_URL` empieza por `https://` y termina en `.supabase.co`, sin `/` final.
- La publishable key es del **mismo** proyecto que la URL.
- 🟩 El proyecto no está en pausa: los gratuitos se pausan tras un tiempo sin uso; pulsa «Restore».

**«Database table does not exist» / «relation … does not exist» / «Could not find the function…»**
- Faltan migraciones en ese proyecto: 💻 `npx supabase migration list`, y después `link` al proyecto correcto y `npx supabase db push`.
- Comprueba que no has aplicado las migraciones en dev y la web apunta a producción (o al revés).

**«Authentication doesn't work»**
- «El email o la contraseña no son correctos»: revisa en 🟩 Authentication → Users que el usuario existe; el admin puede poner otra contraseña desde 📦 Usuarios → Gestionar.
- «Tu usuario está desactivado»: actívalo en 📦 Usuarios → Gestionar → Activo. Si eres el único admin y estás bloqueado, usa el SQL de la sección 9.2.
- Entra y te devuelve al login: 🟩 Authentication → URL Configuration → Site URL debe ser tu dominio actual.
- «Has entrado, pero no se puede leer tu perfil»: faltan migraciones (ver arriba).

**«Images don't load»**
- 🟩 Storage: existen `product-photos` y `shipping-labels`. Si no, faltan migraciones.
- Las fotos usan enlaces temporales de 1 hora: recarga la página.
- Solo el admin puede subir fotos; el vendedor solo etiquetas de sus ventas.
- Tamaño máximo: 5 MB para fotos y 10 MB para etiquetas.

**«Works locally but not on Vercel»**
- En local usas Supabase dev y en Vercel producción: ¿están las migraciones aplicadas también en producción?
- Las variables de Vercel son las de producción y has hecho Redeploy tras cambiarlas.
- 🟩 Producción → Authentication → URL Configuration con el dominio de Vercel.
- ¿Existe tu usuario admin en el proyecto de producción? Los usuarios no se copian entre proyectos.

**«Migration failed»**
- Lee el archivo y la línea del error. La migración no se aplicó (se deshace entera).
- Corrige ese archivo y repite `npx supabase db push`.
- «already exists»: alguien creó ese objeto a mano. Mira qué hay en 🟩 Table Editor antes de seguir.
- Nunca edites una migración ya aplicada en producción: crea una nueva.

**«Git push rejected»**
- `rejected (fetch first)`: hay cambios en GitHub que no tienes. 💻 `git pull --rebase` y luego `git push`.
- `Authentication failed`: vuelve a iniciar sesión (GitHub ya no acepta la contraseña: usa el navegador o un token personal).
- `remote origin already exists`: 💻 `git remote set-url origin https://github.com/TU-USUARIO/maurinventario.git`.
- «File too large»: estás intentando subir algo pesado (un Excel, `node_modules`). Revisa `git status` y el `.gitignore`.

**«No hay stock suficiente» al vender**
- El lote elegido no tiene esas unidades. Elige otro lote o registra la compra o recepción.

---

## 19. Pendientes antes de dar por cerrado

- ⚠️ **PENDIENTE: proveedores.** El Excel no indica de quién era cada pedido. Los 7 pedidos tienen «Proveedor pendiente de identificar». Crea los proveedores reales en 📦 Proveedores y asígnalos en cada pedido con «Proveedor y datos».
- ⚠️ **PENDIENTE: motivo de 4 salidas sin venta.** Son las ventas a 0 € de las filas 18, 56, 70 y 75 de Ventas. Indica regalo, pérdida u otro en 📦 Salidas y ajustes.
- ⚠️ **PENDIENTE: precio normal de venta.** El Excel no lo tenía. Mientras no lo pongas, el «valor potencial» usa el precio medio de venta, y los productos que nunca se vendieron salen «sin precio».
- ⚠️ **PENDIENTE: marca y SKU** de los productos que no siguen el patrón «Marca - Modelo» (Lego, perfumes, G-Shock, AirPods). Filtra en 📦 Productos → «Con datos pendientes».
- ⚠️ **PENDIENTE: variantes.** Las unidades importadas están en la variante «Sin especificar», porque el Excel no registraba el color en las compras. Las compras nuevas pueden ir ya a cada variante (Negro, Blanco…).
- ⚠️ **PENDIENTE: datos de las cuentas de los móviles.** Se importaron el correo y el teléfono de la hoja Moviles. Solo los ve el admin, en 📦 Listas y ajustes.
- ⚠️ **PENDIENTE: copias de seguridad.** En el plan gratuito de Supabase las copias son limitadas. Exporta tus informes a Excel de vez en cuando o haz 💻 `npx supabase db dump -f copia.sql` enlazado a producción.

---

## 20. Checklist final

MaurInventario está correctamente desplegado cuando:

- [ ] GitHub funciona (repositorio privado con el código, sin `.env` ni Excel)
- [ ] Supabase funciona (proyectos de dev y producción activos)
- [ ] PostgreSQL funciona (Table Editor muestra las tablas)
- [ ] Migraciones funcionan (`npx supabase migration list`: Local = Remote en los dos)
- [ ] Storage funciona (2 buckets privados; puedes subir una foto)
- [ ] Auth funciona (registro público desactivado, Site URL correcta, primer admin creado)
- [ ] Variables de entorno están configuradas (3 en `.env.local` y 3 en Vercel Production y Preview)
- [ ] Vercel está conectado a GitHub (un push a `main` despliega solo)
- [ ] Production deploy funciona (la URL de producción abre y deja entrar)
- [ ] Preview deployments funcionan (un push a otra rama crea una URL Preview contra dev)
- [ ] La aplicación puede leer/escribir datos (crear un proveedor o una venta funciona)
- [ ] No hay secretos en GitHub
- [ ] El login funciona (admin y vendedor)
- [ ] Las imágenes funcionan (foto de producto y etiqueta de envío)
- [ ] Las operaciones principales funcionan:
  - [ ] el Excel está importado,
  - [ ] la comprobación de integridad sale «Correcto»,
  - [ ] puedes registrar una venta,
  - [ ] puedes recibir un pedido,
  - [ ] puedes registrar una devolución,
  - [ ] exportar un informe descarga un Excel.

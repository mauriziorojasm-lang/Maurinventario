# Entrega 1 · Seguridad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los hallazgos de seguridad M1–M4 y B2–B4 de la auditoría sin cambiar el uso normal de la app.

**Architecture:**
- Una migración nueva (14) corrige `product_price_history` y añade el contador del generador.
- La verificación del remitente de los correos es una función pura en `parse.ts`; `gmail.ts` solo aporta las cabeceras `Authentication-Results`.
- La redirección del login y las celdas CSV pasan a helpers puros con pruebas unitarias.
- Las cabeceras de seguridad van en `next.config.ts`.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`), React 19, Supabase (Postgres + RLS + RPC), zod 4, vitest, Playwright (E2E en `/home/claude/e2e`).

**Spec:** `docs/superpowers/specs/2026-10-10-mejora-integral-design.md` (sección 3, «Entrega 1»).

## Global Constraints

- **Datos:** no se borra ni modifica ningún dato existente. Las migraciones solo añaden o reemplazan funciones y tablas nuevas.
- **Producción:** cada migración se aplica primero a la BD local `mi_e2e` y a las pruebas `tests/db`. Después se aplica en Supabase (proyecto `tjstcjtuqubejlktvnyg`) y se corrige la versión en `supabase_migrations.schema_migrations`. Si la aplicación se cancela, se le da al usuario el archivo para el SQL Editor.
- **Idioma:** textos visibles en español de España, lenguaje sencillo.
- **Estilo de código:** `.prettierrc` con printWidth 160; zod v4 (`z.uuid()`).
- **Plataformas:** solo correos de remitentes verificados de `vinted.<tld>` o `wallapop.<tld>` pueden pegar etiquetas automáticamente.
- **Límite del generador:** 60 generaciones por usuario y día (día de Europe/Madrid).

## Review Focus

1. **Correo reenviado a mano** (`Fwd:` desde la cuenta de Mauri, sin DKIM de Vinted): no se pierde.
   - La venta se detecta igual, marcada «no verificado».
   - La etiqueta va a «Revisar» con el motivo y el administrador puede vincularla a mano.
2. **DKIM de un subdominio** (`header.d=mail.vinted.com`, `header.i=@vinted.es`): cuenta como verificado.
   - `notvinted.com` o `vinted.es.evil.com` no cuentan.
3. **Varias cabeceras `Authentication-Results` y `ARC-Authentication-Results`**: basta con que una diga `dkim=pass` para el dominio correcto.
   - Una con `dkim=fail` no anula a otra con `pass` del mismo dominio.
4. **Vendedor sin responsable vinculado** que abre la ayuda de precio: la función devuelve `count 0`, sin error y sin `avg_cost`.
5. **Contador del generador al cambiar de día en Madrid**: a las 00:30 hora de Madrid (22:30 UTC del día anterior) el contador ya es el del día nuevo.

---

### Task 1: Migración 14 — historial de precios restringido y contador del generador

**Files:**
- Create: `supabase/migrations/20261010200000_seguridad.sql`
- Test: `tests/db/seguridad.test.ts`

**Interfaces:**
- Produces:
  - `public.product_price_history(p_product_id uuid) returns jsonb`: misma forma que ahora. `avg_cost` es `null` si no es admin. Si no es admin, solo cuenta ventas con `responsible_id = public.current_responsible_id()`.
  - Tabla `public.ai_usage(user_id uuid, day date, uses integer, primary key(user_id, day))` con RLS activada y sin políticas (solo la toca la función).
  - `public.ai_usage_take(p_units integer, p_limit integer default 60) returns boolean`:
    - security definer, `require_active_user()`;
    - el día es `(now() at time zone 'Europe/Madrid')::date`;
    - suma `p_units` solo si `uses + p_units <= p_limit` y devuelve si lo ha sumado.
  - Grants: las dos funciones `to authenticated`; revoke a `public, anon`.

- [ ] **Step 1: Escribir las pruebas que fallan** en `tests/db/seguridad.test.ts`. Los datos de partida son los de `tests/db/anuncios.test.ts`:
  - admin y vendedor, el vendedor vinculado a su propio responsable;
  - un producto con coste 20;
  - ventas: 2 del admin (60 y 50) y 1 del vendedor (55).

  Pruebas:
  - `"historial de precios: el admin ve coste y todas las ventas"` → `count == 3`, `Number(avg_cost) == 20`.
  - `"historial de precios: el vendedor no ve el coste ni ventas ajenas"` → `avg_cost === null`, `count == 1`, `Number(avg) == 55`.
  - `"historial de precios: vendedor sin responsable"` → con un tercer usuario vendedor sin responsable: `count == 0`, `avg_cost === null`.
  - `"generador: límite diario por usuario"` → `ai_usage_take(50, 60)` es true; `ai_usage_take(11, 60)` es false; `ai_usage_take(10, 60)` es true; para otro usuario, `ai_usage_take(60, 60)` es true.
  - `"generador: el día es el de Madrid"` → inserta a mano `(user, (now() at time zone 'Europe/Madrid')::date - 1, 60)`; `ai_usage_take(1, 60)` sigue siendo true.

- [ ] **Step 2: Comprobar que fallan.**
  Run: `TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npx vitest run tests/db/seguridad.test.ts`
  Expected: FAIL (`avg_cost` no es null para el vendedor; `ai_usage_take` no existe).

- [ ] **Step 3: Escribir la migración.**
  - `create or replace function public.product_price_history` con un filtro en el CTE: `and (public.is_admin() or s.responsible_id = public.current_responsible_id())`. `avg_cost` envuelto en `case when public.is_admin() then … end`.
  - Tabla `ai_usage` y función `ai_usage_take` con `insert … on conflict (user_id, day) do update set uses = ai_usage.uses + excluded.uses where ai_usage.uses + excluded.uses <= p_limit returning true`. Si no devuelve fila, false. Si `p_units > p_limit`, false.
  - Solo `create`/`create or replace`, sin `drop`.

- [ ] **Step 4: Aplicarla en local y pasar las pruebas.**
  Run: `psql -h localhost -U postgres -d mi_e2e -v ON_ERROR_STOP=1 -f supabase/migrations/20261010200000_seguridad.sql && TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npx vitest run tests/db`
  Expected: todas PASS, incluidas `anuncios.test.ts` y `correo.test.ts`.

- [ ] **Step 5: Commit.** `git add supabase/migrations/20261010200000_seguridad.sql tests/db/seguridad.test.ts && git commit -m "Seguridad: historial de precios sin coste para vendedores y límite diario del generador"`

---

### Task 2: Solo remitentes verificados de Vinted/Wallapop pegan etiquetas

**Files:**
- Modify: `src/lib/email/gmail.ts` (`MailMessage`, `toMail`)
- Modify: `src/lib/email/parse.ts` (nueva función `verifiedPlatform`)
- Modify: `src/lib/email/sync.ts` (`SEARCH`, `storeEmail`, `processLabel`)
- Modify: `src/app/(app)/detectadas/data.ts` y `src/app/(app)/detectadas/page.tsx` (marca «No verificado»)
- Modify: `/home/claude/e2e/fake-gmail.mjs`, `/home/claude/e2e/correo.mjs`
- Test: `tests/email/parse.test.ts`

**Interfaces:**
- Consumes: nada de la Task 1.
- Produces:
  - `MailMessage.authResults: string[]`: valores de todas las cabeceras `Authentication-Results` y `ARC-Authentication-Results`.
  - `verifiedPlatform(fromHeader: string, authResults: string[]): Platform | null` en `parse.ts`.
    1. Saca la dirección real de `From` (la de `<…>`, o la cadena entera).
    2. Su dominio debe ser `vinted.<tld>` o `wallapop.<tld>`, o un subdominio de ellos. Patrón: `/(^|\.)(vinted|wallapop)\.[a-z]{2,}(\.[a-z]{2,})?$/`.
    3. En alguna cabecera debe haber `dkim=pass` con `header.d=` o `header.i=@` de un dominio que cumpla el mismo patrón y la misma plataforma.
    4. Si se cumple, devuelve esa plataforma; si no, `null`.
  - `parsed.verified: boolean` en cada `email_messages` de venta o etiqueta.

- [ ] **Step 1: Pruebas que fallan** en `tests/email/parse.test.ts`, bloque `describe("remitente verificado")`:
  - `verifiedPlatform("Vinted <no-reply@vinted.es>", ["mx.google.com; dkim=pass header.i=@vinted.es header.s=s1; spf=pass"])` → `"vinted"`
  - Subdominio: from `no-reply@mail.vinted.com`, `dkim=pass header.d=mail.vinted.com` → `"vinted"`
  - Wallapop: from `noreply@wallapop.com`, `dkim=pass header.d=wallapop.com` → `"wallapop"`
  - Sin cabeceras → `null`
  - `dkim=fail header.d=vinted.es` → `null`
  - Una cabecera ARC con `dkim=pass header.d=vinted.es` y otra con `dkim=fail` → `"vinted"`
  - Dominios falsos: from `no-reply@vinted.es.evil.com`, y DKIM pass de `evil.com` → `null`
  - From `no-reply@notvinted.com` con `dkim=pass header.d=notvinted.com` → `null`
  - Reenviado a mano: from `Mauri <cuenta@gmail.com>` con `dkim=pass header.d=gmail.com` → `null`
  - DKIM de Wallapop en un correo con From de Vinted → `null`

- [ ] **Step 2: Comprobar que fallan.** Run: `npx vitest run tests/email` → FAIL (`verifiedPlatform` no existe).

- [ ] **Step 3: Implementar `verifiedPlatform`** en `parse.ts` (función pura, sin red).

- [ ] **Step 4: Pasar las cabeceras de Gmail.**
  - En `toMail`, `authResults` = valores de las cabeceras cuyo nombre (en minúsculas) es `authentication-results` o `arc-authentication-results`.
  - En `sync.ts`:
    - `SEARCH = "{from:vinted from:wallapop}"`;
    - `storeEmail` guarda `parsed.verified = verifiedPlatform(mail.from, mail.authResults) === platform`;
    - en `processLabel`, si `e.parsed.verified !== true`, antes de buscar la venta: `toReview(db, e.id, "Remitente no verificado: no parece un correo auténtico de Vinted. Revisa la etiqueta antes de vincularla a mano.", await recentVintedSales(db))`.
  - `attachLabel` hecho a mano por el administrador (`linkLabel`) no cambia: el administrador decide.

- [ ] **Step 5: Marca en Ventas detectadas.**
  - En `DetectedSale` se añade `verified: boolean`, que viene de `parsed.verified === true`.
  - Si es false, la tarjeta muestra `<Badge tone="warn">No verificado</Badge>` y la nota «Este correo no se ha podido verificar como enviado por {Vinted|Wallapop}. Confírmala solo si la venta es real.».
  - Una venta no verificada **no** entra en «Confirmar las N sin dudas».

- [ ] **Step 6: Pasar las pruebas unitarias.** Run: `npx vitest run tests/email && npx tsc --noEmit -p . && npx eslint src` → PASS, sin errores.

- [ ] **Step 7: Ajustar la prueba E2E.**
  - `fake-gmail.mjs`: cada mensaje lleva la cabecera `Authentication-Results: mx.google.com; dkim=pass header.i=@<dominio del From>`, salvo si el mensaje tiene `unverified: true`.
  - `correo.mjs`, caso nuevo «etiqueta de remitente no verificado»:
    - una venta Vinted confirmada de «Gafas Holbrook»;
    - una etiqueta con `unverified: true` y `from: "Vinted <no-reply@vinted.es.evil.com>"`;
    - tras `cronSync`: `status === "revision"`, el motivo contiene «no verificado» y la venta sigue sin etiqueta.
  - Otro caso: una venta Wallapop con `unverified: true` sale en `/detectadas` con «No verificado» y no aparece el botón «Confirmar las N sin dudas» para ella.
  - Run: reiniciar la BD con `reset-all.sh` + `correo-setup.sql`, `next build`, `bash next-correo.sh`, `node correo.mjs`.
  - Expected: 0 FALLO.

- [ ] **Step 8: Commit.** `git commit -am "Seguridad: solo los correos verificados de Vinted pegan etiquetas automáticamente"` (con las pruebas incluidas).

---

### Task 3: Redirección segura después del login

**Files:**
- Create: `src/lib/safe-redirect.ts`
- Modify: `src/app/login/actions.ts:39`
- Test: `tests/unit/safe-redirect.test.ts`

**Interfaces:**
- Produces: `safeNext(next: string | null | undefined): string`. Devuelve `next` solo si:
  - es una ruta del propio sitio: empieza por `/`;
  - no empieza por `//`;
  - no contiene `\` ni caracteres de control;
  - `new URL(next, "https://app.local").origin === "https://app.local"`.

  En cualquier otro caso devuelve `"/"`.

- [ ] **Step 1: Pruebas que fallan** (`tests/unit/safe-redirect.test.ts`):
  - `safeNext("/ventas?x=1")` → `"/ventas?x=1"`
  - `safeNext("/\\evil.com")` → `"/"`
  - `safeNext("//evil.com")` → `"/"`
  - `safeNext("https://evil.com")` → `"/"`
  - `safeNext("/%5Cevil.com")` → `"/"` (el `\` codificado también)
  - `safeNext("/\tevil")` → `"/"`
  - `safeNext("")`, `safeNext(null)` → `"/"`
- [ ] **Step 2:** Run `npx vitest run tests/unit` → FAIL.
- [ ] **Step 3:** Implementar `safeNext` (comprobar también `decodeURIComponent(next)`, dentro de un try). Usarlo en `login/actions.ts`: `redirect(safeNext(next))`.
- [ ] **Step 4:** Run `npx vitest run tests/unit && npx tsc --noEmit -p .` → PASS.
- [ ] **Step 5: Commit** `"Seguridad: el login ya no redirige a otras webs"`.

---

### Task 4: Cabeceras de seguridad

**Files:**
- Modify: `next.config.ts`
- Test: comprobación con `curl` sobre la build local (no hay prueba unitaria posible)

**Interfaces:**
- Produces: en todas las rutas (`source: "/:path*"`):
  - `Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=()`
  - `poweredByHeader: false`
- Se deja `script-src` sin restringir a propósito (Next usa scripts en línea; restringirlo sin nonce rompería la app). Va anotado en un comentario.

- [ ] **Step 1:** Añadir `async headers()` y `poweredByHeader: false`.
- [ ] **Step 2: Comprobar en la build local.**
  Run: `npx next build && bash /home/claude/e2e/next-correo.sh && curl -sI localhost:3000/login`
  Expected:
  - aparecen `content-security-policy: frame-ancestors 'none'…`, `x-frame-options: DENY`, `x-content-type-options: nosniff` y `referrer-policy`;
  - no aparece `x-powered-by`.
- [ ] **Step 3: Regresión de lo que podría romper.**
  Run: `node movil-venta.mjs && node fotos.mjs` (usan visor de etiquetas en `<iframe>` del propio dominio y cámara/fotos).
  Expected: 0 FALLO. Si el visor de etiquetas (iframe con URL firmada de Supabase) fallara, añadir `frame-src 'self' https://*.supabase.co http://localhost:54321` y repetir.
- [ ] **Step 4: Commit** `"Seguridad: cabeceras que impiden meter la app dentro de otra web"`.

---

### Task 5: Endurecimientos pequeños (CSV, listas, informes, variables de prueba, límite del generador)

**Files:**
- Create: `src/lib/csv.ts`, `src/lib/test-env.ts`
- Modify:
  - `src/app/api/exportar/route.ts` (`toCsv`, `REPORTS[type]`)
  - `src/app/(app)/ajustes/actions.ts:9`
  - `src/lib/email/gmail.ts:14-16`
  - `src/app/(app)/descripciones/actions.ts` (constante `GEMINI_URL` y `generateDescriptions`)
- Test: `tests/unit/csv.test.ts`, `tests/unit/test-env.test.ts`

**Interfaces:**
- Consumes: `ai_usage_take(p_units, p_limit)` de la Task 1.
- Produces:
  - `csvCell(value: string): string`: neutraliza fórmulas (prefijo `'` si empieza por `=`, `+`, `-`, `@`, tabulador o retorno de carro) y escapa `;`, `"` y saltos de línea. Los importes y fechas no pasan por aquí.
  - `testOnlyEnv(name: string): string | undefined`: devuelve `undefined` si `process.env.VERCEL_ENV === "production"`; si no, `process.env[name]?.trim() || undefined`.

- [ ] **Step 1: Pruebas que fallan.**
  - `csvCell("=HYPERLINK(\"x\")")` → `"'=HYPERLINK(\"\"x\"\")"` entre comillas.
  - `csvCell("+34 600")` → empieza por `'`.
  - `csvCell("Gafas; rosas")` → `"\"Gafas; rosas\""`.
  - `csvCell("normal")` → `"normal"`.
  - `testOnlyEnv`: con `VERCEL_ENV="production"` y `GMAIL_API_BASE="http://x"` → `undefined`; sin `VERCEL_ENV` → `"http://x"`.
- [ ] **Step 2:** Run `npx vitest run tests/unit` → FAIL.
- [ ] **Step 3: Implementar y aplicar.**
  - `toCsv` usa `csvCell` para textos.
  - `const report = Object.hasOwn(REPORTS, type) ? REPORTS[type] : undefined`.
  - `saveListItem` valida `list` con `z.enum(["platforms","carriers","categories","brands","mobile_devices"])` antes de tocar la base y devuelve `{ ok:false, error:"Lista no válida." }` si no pasa.
  - `gmail.ts` y `descripciones/actions.ts` leen `GOOGLE_OAUTH_AUTH_URL`, `GOOGLE_OAUTH_TOKEN_URL`, `GMAIL_API_BASE` y `GEMINI_BASE_URL` con `testOnlyEnv`.
  - En `generateDescriptions`, tras validar y antes de llamar a Gemini: `rpc("ai_usage_take", { p_units: items.length, p_limit: 60 })`. Si devuelve false: `{ ok:false, error:"Has llegado al límite de 60 descripciones de hoy. Mañana podrás generar más." }`.
- [ ] **Step 4: Comprobar.**
  Run: `npx vitest run && npx tsc --noEmit -p . && npx eslint src`, y luego los E2E `node generador.mjs conclave`, `node fotos.mjs` y `node ops.mjs` (la exportación CSV).
  Expected: todo PASS, 0 FALLO.
- [ ] **Step 5: Commit** `"Seguridad: CSV sin fórmulas, listas validadas, variables de prueba fuera de producción y límite diario del generador"`.

---

### Task 6: Publicar y comprobar en producción

**Files:**
- Modify: `supabase/instalar-todo.sql` (con `npm run db:instalador`)
- Modify: `README.md`: nota sobre `VERCEL_ENV`, límite del generador y la comprobación del registro público

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Regresión completa en local.** `vitest run` (todo) y los E2E `run`, `seller`, `ops`, `filtros-envios`, `envios`, `movil-venta`, `correo`, `fotos`, `generador` → 0 FALLO.
- [ ] **Step 2: Aplicar la migración 14 en Supabase.**
  - Con `apply_migration` y después `update supabase_migrations.schema_migrations set version='20261010200000' where name='seguridad'`.
  - Si se cancela, dar al usuario el enlace del archivo en GitHub para el SQL Editor, igual que con la migración 12.
  - Comprobar con `select pg_get_functiondef('public.ai_usage_take(integer,integer)'::regprocedure)`.
- [ ] **Step 3: Publicar.** `git push origin main`, luego Vercel `list_deployments` hasta `READY` con el commit nuevo.
- [ ] **Step 4: Comprobar en producción.**
  - `web_fetch_vercel_url` sobre `/login` para ver las cabeceras, si la herramienta las devuelve. Si no, pedir al usuario una captura de la consola o dejarlo anotado.
  - En los registros de Supabase: después del siguiente cron, `email_integration.last_error` es null.
- [ ] **Step 5: Guiar al usuario** para comprobar el registro público: Supabase → Authentication → Sign In / Providers → Email → «Allow new users to sign up» desactivado.

# MaurInventario SaaS (varias empresas)

Rama `saas`. La app personal (rama `main`, proyecto Supabase actual) no se toca.

## Cómo funciona

- **Espacios (organizaciones).** Cada cliente tiene su espacio. Todas las tablas de negocio llevan `organization_id`.
- **Aislamiento en la base de datos**, no solo en pantalla:
  - Política RLS *restrictiva* en cada tabla: solo filas de la organización activa (`current_org_id()`, que sale de las membresías del usuario; el navegador no puede elegir una ajena).
  - Las funciones de negocio se ejecutan con el rol `mi_definer` (sin privilegios especiales), así que RLS también se aplica dentro.
  - Claves foráneas compuestas `(organization_id, id)`: no se puede apuntar a un lote, producto o venta de otro cliente aunque se conozca su id.
  - Archivos (fotos, etiquetas): solo si el producto o la venta son del espacio.
  - Numeración de ventas y pedidos por espacio.
- **Roles:** administrador (todo), vendedor (sus ventas, sin costes), almacén (stock y envíos, sin costes ni ventas nuevas).
- **Suscripción:** 7 días de prueba sin tarjeta y después 4,99 €/mes con Stripe. Sin prueba ni pago al día → **solo lectura** (se puede consultar y exportar, no modificar). Cancelar nunca borra datos.
- **Eliminación:** el administrador la pide (escribiendo el nombre del espacio), hay 30 días para anularla y exportar; después el dueño de la plataforma la ejecuta desde *Plataforma* (borra archivos y datos).
- **Panel de plataforma** (`/plataforma`): solo cifras y estados (espacios, pruebas, pagos). No hay acceso al contenido de ningún cliente ni suplantación. No existe acceso de soporte.

## Puesta en marcha (orden)

1. **Supabase: proyecto NUEVO** (no el actual). El plan gratuito permite 2 proyectos activos y ya los tienes ocupados: hace falta pausar uno o pasar a Pro (25 $/mes, recomendado para clientes de pago: copias diarias y sin pausas).
   - SQL Editor → pega `supabase/instalar-todo.sql` entero → Run. Si algo falla no se aplica nada.
   - Authentication → Sign In / Providers → Email: *Confirm email* activado.
   - Authentication → URL Configuration: *Site URL* = tu dirección de Vercel; en *Redirect URLs* añade `https://TU-WEB/auth/confirmar`.
   - Authentication → SMTP: configura un proveedor (p. ej. Resend, gratis hasta 3.000 correos/mes). El SMTP de prueba de Supabase solo envía unos pocos correos por hora.
2. **Vercel: proyecto nuevo** desde este repositorio, rama de producción `saas`. Variables (ver `.env.example`):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (del proyecto nuevo), `NEXT_PUBLIC_SITE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `LEGAL_NAME`, `LEGAL_TAX_ID`, `LEGAL_ADDRESS`, `LEGAL_EMAIL`. Opcionales: `RESEND_API_KEY` + `MAIL_FROM` (invitaciones por email), `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.
3. **Stripe** (empieza en modo prueba):
   - Producto «MaurInventario» con precio recurrente mensual de 4,99 € → copia el `price_…` a `STRIPE_PRICE_ID`.
   - Developers → Webhooks → endpoint `https://TU-WEB/api/stripe/webhook` con los eventos `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` → copia el `whsec_…` a `STRIPE_WEBHOOK_SECRET`.
   - Settings → Billing → Customer portal: activa cambiar tarjeta, ver facturas y cancelar (al final del periodo).
   - Prueba con la tarjeta 4242 4242 4242 4242. Para cobrar de verdad, cambia a claves `sk_live_…` y repite precio y webhook en modo real.
4. **Tu cuenta de plataforma:** regístrate en la web, confirma el email y luego en Supabase → SQL Editor:
   `insert into platform_admins (user_id) select id from profiles where email = 'TU-EMAIL';`
5. **Ventas por correo (opcional):** cada cliente conecta su propio Gmail. El permiso de Gmail (solo lectura) es «restringido» para Google: para clientes externos hace falta la verificación de Google (incluye una auditoría de seguridad de pago). Hasta entonces, déjalo solo para cuentas de prueba añadidas en Google Cloud.

## Costes externos aproximados

- Supabase Pro: 25 $/mes (el gratuito no sirve para clientes de pago: se pausa y no tiene copias).
- Vercel: Hobby gratis no admite uso comercial; Pro 20 $/mes.
- Stripe: ~1,5 % + 0,25 € por cobro en tarjetas europeas (≈ 0,32 € de cada 4,99 €). Stripe Tax opcional: 0,5 % por transacción.
- Correo (Resend): gratis hasta 3.000/mes.
- Dominio: 10–15 €/año (opcional).

## Pruebas

- `npm run test:db` (con `TEST_DATABASE_URL`): 114 pruebas, incluidas las de aislamiento entre dos espacios (`tests/db/multiinquilino.test.ts`).
- Prueba de extremo a extremo con registro, invitación, ataques por la API, pagos simulados y plataforma: `e2e/saas.mjs` del entorno local.

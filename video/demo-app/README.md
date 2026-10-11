# App de demostración para las capturas del vídeo

Las capturas de `video/motion/assets/ui/` salen de la app real (rama main, la de maurinventario.vercel.app) ejecutada en local con **datos ficticios**. No toca Supabase de producción.

1. PostgreSQL 16 local en el puerto 5433 → base `mi` con `tests/db/supabase_stub.sql` + todas las migraciones + rol `authenticator` (password `auth`) con `anon`, `authenticated` y `service_role`.
2. Usuario: `insert into auth.users …` (el primero es administrador). `seed.sql` y después `seed2.sql` (productos, compras, 151 ventas, correos detectados y etiquetas).
3. `postgrest pgrst.conf` (PostgREST 12) y `DEMO_USER_ID=<id> node gateway.mjs` (Supabase falso en :54321: login, REST y storage en disco).
4. `.env.local`: `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321`, claves `sb_publishable_demo` / `sb_secret_demo`, y `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY` con cualquier valor (solo para que no salgan avisos de configuración). `npx next dev -p 3000`.
5. `node shot2.cjs spec.json <carpeta>` → capturas a 2× y `marks.json` con las cajas de los elementos.

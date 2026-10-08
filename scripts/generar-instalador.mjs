// Regenera supabase/instalar-todo.sql a partir de supabase/migrations/.
// Uso: npm run db:instalador
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const dir = join(root, "supabase", "migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

let out = `-- =====================================================================
-- MaurInventario · INSTALACIÓN COMPLETA DE LA BASE DE DATOS
-- Pégalo ENTERO en Supabase → SQL Editor → New query → Run.
-- Solo una vez por proyecto, en un proyecto NUEVO y vacío.
-- Contiene, en orden, las ${files.length} migraciones de supabase/migrations/ (este
-- archivo se genera a partir de ellas con «npm run db:instalador»).
-- Si algo falla, no se guarda nada: todo va en una sola transacción.
-- =====================================================================

begin;
`;
for (const f of files) {
  out += `\n-- >>> ${f}\n${readFileSync(join(dir, f), "utf8").trimEnd()}\n`;
}
const rows = files.map((f) => {
  const m = f.match(/^(\d+)_(.+)\.sql$/);
  return `  ('${m[1]}', '${m[2]}')`;
});
out += `
-- Registro de migraciones aplicadas (para que la CLI de Supabase sepa que ya están)
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
${rows.join(",\n")}
on conflict (version) do nothing;

commit;

-- Si ves «Success. No rows returned», la base de datos está lista.
`;
writeFileSync(join(root, "supabase", "instalar-todo.sql"), out);
console.log(`instalar-todo.sql regenerado con ${files.length} migraciones.`);

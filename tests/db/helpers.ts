/**
 * Utilidades para los tests de base de datos.
 *
 * Crean una base de datos PostgreSQL nueva y vacía, simulan el entorno
 * mínimo de Supabase (tests/db/supabase_stub.sql) y aplican TODAS las
 * migraciones de supabase/migrations en orden. Así se prueba exactamente
 * el mismo SQL que se despliega en producción.
 *
 * Requiere la variable TEST_DATABASE_URL apuntando a un PostgreSQL
 * local con un usuario que pueda crear bases de datos, por ejemplo:
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
 * Nunca la apuntes a tu base de datos de Supabase.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const root = join(__dirname, "..", "..");

export type TestDb = {
  client: Client;
  name: string;
  close: () => Promise<void>;
};

/** Aplica las migraciones en orden. Con `stopBefore`, se detiene antes de esa (y la devuelve para aplicarla luego). */
export async function applyMigration(db: TestDb, file: string) {
  await db.client.query(readFileSync(join(root, "supabase/migrations", file), "utf8"));
}

export async function createTestDatabase(opts: { stopBefore?: string } = {}): Promise<TestDb> {
  if (!TEST_DATABASE_URL) throw new Error("Falta TEST_DATABASE_URL");
  const name = `mi_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = new Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  await client.query("set client_min_messages = warning");

  await client.query(readFileSync(join(root, "tests/db/supabase_stub.sql"), "utf8"));
  const dir = join(root, "supabase/migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (opts.stopBefore && file >= opts.stopBefore) break;
    await client.query(readFileSync(join(dir, file), "utf8"));
  }

  return {
    client,
    name,
    close: async () => {
      await client.end();
      const a = new Client({ connectionString: TEST_DATABASE_URL });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}

/**
 * Crea un usuario de Supabase Auth (el trigger crea su perfil) y lo añade a
 * la organización de pruebas. El primero que se crea sin rol es su
 * administrador (como al registrarse); los demás sin rol quedan FUERA de
 * la organización (como alguien que se registra y no ha sido invitado).
 */
export async function createUser(db: TestDb, email: string, role?: "admin" | "vendedor" | "almacen", orgName = "Prueba"): Promise<string> {
  const res = await db.client.query(`insert into auth.users (email) values ($1) returning id`, [email]);
  const id = res.rows[0].id as string;
  let org = (await db.client.query(`select id from organizations where name = $1`, [orgName])).rows[0]?.id as string | undefined;
  if (!org) {
    if (role && role !== "admin") return id;
    org = await createOrg(db, orgName, id);
    role = "admin";
  }
  if (role) {
    await db.client.query(`insert into memberships (organization_id, user_id, role) values ($1, $2, $3)`, [org, id, role]);
    await db.client.query(`update profiles set active_org_id = $1 where id = $2`, [org, id]);
  }
  return id;
}

/** Organización de pruebas con sus listas iniciales y acceso concedido (sin pruebas de pago). */
export async function createOrg(db: TestDb, name: string, owner: string): Promise<string> {
  const c = db.client;
  const org = (await c.query(`insert into organizations (name, created_by) values ($1, $2) returning id`, [name, owner])).rows[0].id as string;
  await c.query(`insert into subscriptions (organization_id, status, comped) values ($1, 'active', true)`, [org]);
  await c.query(`insert into platforms (organization_id, name, requires_shipping, sort_order) values ($1, 'Vinted', true, 10), ($1, 'Wallapop', true, 20), ($1, 'En persona', false, 30)`, [org]);
  await c.query(`insert into carriers (organization_id, name) values ($1, 'InPost'), ($1, 'Seur'), ($1, 'Correos'), ($1, 'DHL'), ($1, 'Vinted Go')`, [org]);
  await c.query(`insert into mobile_devices (organization_id, number, name) select $1, n, 'Móvil ' || n from generate_series(1, 6) n`, [org]);
  await c.query(`insert into email_integration (organization_id) values ($1)`, [org]);
  return org;
}

/**
 * Ejecuta una función como si fuera una petición de ese usuario a través
 * de la API de Supabase (rol "authenticated", sin privilegios especiales).
 */
export async function asUser<T>(db: TestDb, userId: string | null, fn: (q: Client["query"]) => Promise<T>): Promise<T> {
  const c = db.client;
  await c.query("begin");
  try {
    await c.query(`set local role ${userId ? "authenticated" : "anon"}`);
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    const result = await fn(c.query.bind(c) as Client["query"]);
    await c.query("commit");
    return result;
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}

/** Llama a una función RPC como un usuario y devuelve la primera columna. */
export async function rpc<T = unknown>(db: TestDb, userId: string | null, fn: string, ...args: unknown[]): Promise<T> {
  return asUser(db, userId, async (q) => {
    const params = args.map((_, i) => `$${i + 1}`).join(", ");
    const res = await q(`select public.${fn}(${params}) as r`, args.map((a) => (typeof a === "object" && a !== null && !Array.isArray(a) ? JSON.stringify(a) : a)));
    return res.rows[0]?.r as T;
  });
}

export async function selectAs<T = Record<string, unknown>>(db: TestDb, userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  return asUser(db, userId, async (q) => (await q(sql, params)).rows as T[]);
}

/** Ejecuta como el servidor (clave secreta, sin usuario): rol service_role. */
export async function asService<T>(db: TestDb, fn: (q: Client["query"]) => Promise<T>): Promise<T> {
  const c = db.client;
  await c.query("begin");
  try {
    await c.query("set local role service_role");
    await c.query(`select set_config('request.jwt.claim.sub', '', true)`);
    const result = await fn(c.query.bind(c) as Client["query"]);
    await c.query("commit");
    return result;
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}

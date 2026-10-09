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

export async function createTestDatabase(): Promise<TestDb> {
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

/** Crea un usuario de Supabase Auth (el trigger crea su perfil). */
export async function createUser(db: TestDb, email: string, role?: "admin" | "vendedor"): Promise<string> {
  const res = await db.client.query(
    `insert into auth.users (email, raw_app_meta_data) values ($1, $2) returning id`,
    [email, role ? { role } : {}],
  );
  return res.rows[0].id as string;
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

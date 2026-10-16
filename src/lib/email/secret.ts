import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Cifrado del permiso de Google (refresh token) antes de guardarlo en la
 * base de datos. La clave sale de SUPABASE_SECRET_KEY, que solo existe en
 * el servidor: aunque alguien viera la tabla, no podría usar el permiso.
 */
function key(prefix = "resellap-gmail"): Buffer {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Falta la variable de entorno SUPABASE_SECRET_KEY (solo servidor)");
  return createHash("sha256").update(`${prefix}:${secret}`).digest();
}

const LEGACY_PREFIX = "maurinventario-gmail";

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptSecret(stored: string): string {
  const [v, iv, tag, data] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Formato de permiso desconocido");
  const open = (k: Buffer) => {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  };
  try {
    return open(key());
  } catch {
    // Permisos guardados antes del cambio de marca: se siguen pudiendo leer
    return open(key(LEGACY_PREFIX));
  }
}

/** Comparación que tarda lo mismo acierte o no (para el token del cron). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Cifrado del permiso de Gmail: lo nuevo se cifra con la clave de Resellap y
 * lo guardado antes del cambio de marca (MaurInventario) se sigue leyendo.
 */
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("permiso de Gmail cifrado", () => {
  beforeAll(() => {
    process.env.SUPABASE_SECRET_KEY = "sb_secret_prueba";
  });

  it("cifra y descifra con la clave nueva", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/email/secret");
    expect(decryptSecret(encryptSecret("token-123"))).toBe("token-123");
  });

  it("lee un permiso guardado con la clave antigua (MaurInventario)", async () => {
    const { decryptSecret } = await import("@/lib/email/secret");
    const key = createHash("sha256").update("maurinventario-gmail:sb_secret_prueba").digest();
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([c.update("token-antiguo", "utf8"), c.final()]);
    const stored = ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
    expect(decryptSecret(stored)).toBe("token-antiguo");
  });
});

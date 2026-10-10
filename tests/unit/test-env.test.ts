import { afterEach, describe, expect, it } from "vitest";
import { testOnlyEnv } from "@/lib/test-env";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("testOnlyEnv: ajustes de prueba desactivados en la web real", () => {
  it("en producción (Vercel) se ignoran", () => {
    process.env.VERCEL_ENV = "production";
    process.env.GMAIL_API_BASE = "http://x";
    expect(testOnlyEnv("GMAIL_API_BASE")).toBeUndefined();
  });
  it("fuera de producción se usan", () => {
    delete process.env.VERCEL_ENV;
    process.env.GMAIL_API_BASE = " http://x ";
    expect(testOnlyEnv("GMAIL_API_BASE")).toBe("http://x");
  });
  it("vacía → undefined", () => {
    delete process.env.VERCEL_ENV;
    process.env.GMAIL_API_BASE = "";
    expect(testOnlyEnv("GMAIL_API_BASE")).toBeUndefined();
  });
});

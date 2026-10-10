import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-redirect";

describe("safeNext: solo rutas de la propia app", () => {
  it("acepta rutas internas con parámetros", () => {
    expect(safeNext("/ventas?x=1")).toBe("/ventas?x=1");
  });
  it("rechaza la barra invertida que el navegador convierte en otra web", () => {
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("/%5Cevil.com")).toBe("/");
  });
  it("rechaza dominios externos", () => {
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
  });
  it("rechaza caracteres de control", () => {
    expect(safeNext("/\tevil")).toBe("/");
  });
  it("vacío o ausente → inicio", () => {
    expect(safeNext("")).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, appearanceCookieValue, cleanWidgets, parseAppearanceCookie, prefsSchema, resolvePrefs } from "@/lib/preferences";

describe("preferencias", () => {
  it("sin nada guardado, valores por defecto", () => {
    expect(resolvePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(resolvePrefs({})).toEqual(DEFAULT_PREFS);
  });
  it("algo inválido no rompe: se usan los valores por defecto", () => {
    expect(resolvePrefs({ appearance: { mode: "fucsia" } })).toEqual(DEFAULT_PREFS);
    expect(resolvePrefs("texto")).toEqual(DEFAULT_PREFS);
  });
  it("widgets: sin repetir, sin los no disponibles, sin desconocidos y con tamaño permitido", () => {
    const w = cleanWidgets([
      { id: "ventas", size: "2x2" },
      { id: "ventas", size: "1x1" },
      { id: "beneficio_neto", size: "1x1" },
      { id: "gastos", size: "1x1" },
      { id: "inventado", size: "1x1" },
      { id: "evolucion", size: "2x2" },
    ]);
    expect(w).toEqual([
      { id: "ventas", size: "1x1" },
      { id: "evolucion", size: "2x2" },
    ]);
    expect(cleanWidgets([])).toEqual([]);
  });
  it("columnas: respeta el orden guardado, añade las nuevas y nunca oculta la principal", () => {
    const p = resolvePrefs({ tables: { ventas: { columns: [{ key: "importe", visible: true }, { key: "venta", visible: false }, { key: "fecha", visible: false }] } } });
    const cols = p.tables.ventas.columns;
    expect(cols.slice(0, 3)).toEqual([
      { key: "importe", visible: true },
      { key: "venta", visible: true },
      { key: "fecha", visible: false },
    ]);
    expect(cols).toHaveLength(11);
  });
  it("filas por página solo de las opciones permitidas", () => {
    expect(resolvePrefs({ tables: { productos: { pageSize: 100 } } }).tables.productos.pageSize).toBe(100);
    expect(resolvePrefs({ tables: { productos: { pageSize: 7 } } }).tables.productos.pageSize).toBe(50);
  });
  it("el esquema rechaza datos raros", () => {
    expect(prefsSchema.safeParse({ notifications: { lowStockThreshold: 0 } }).success).toBe(false);
    expect(prefsSchema.safeParse({ sales: { defaultPlatformId: "no-es-uuid" } }).success).toBe(false);
  });
  it("cookie de aspecto: ida y vuelta, y valores raros → por defecto", () => {
    const a = { mode: "dark" as const, palette: "oceano" as const, reduceMotion: true };
    expect(parseAppearanceCookie(appearanceCookieValue(a))).toEqual(a);
    expect(parseAppearanceCookie("x.<script>.9")).toEqual(DEFAULT_PREFS.appearance);
    expect(parseAppearanceCookie(undefined)).toEqual(DEFAULT_PREFS.appearance);
  });
});

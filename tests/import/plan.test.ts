/**
 * Tests del importador con un Excel de prueba generado en memoria.
 * (Son datos de prueba: no se usan nunca en la aplicación.)
 */
import { describe, expect, it } from "vitest";
import { detectSheet } from "@/lib/import/detect";
import { buildPlan, collectProductNames, suggestMerges } from "@/lib/import/plan";
import { brandFromName, splitShippingMethod, toDate, toNumber } from "@/lib/import/normalize";
import { makeWorkbook } from "../fixtures/libro-prueba";

describe("normalización", () => {
  it("lee números, fechas, marcas y métodos de envío", () => {
    expect(toNumber("12,5")).toBe(12.5);
    expect(toNumber("1.234,56 €")).toBe(1234.56);
    expect(toNumber("abc")).toBeNull();
    expect(toDate("08/10/2026")).toBe("2026-10-08");
    expect(toDate("31/02/2026")).toBeNull();
    expect(toDate(46303)).toBe("2026-10-08");
    expect(brandFromName("Oakley - Encoder")).toBe("Oakley");
    expect(brandFromName("75159 Death Star")).toBeNull();
    expect(splitShippingMethod("Vinted - Vinted Go")).toEqual({ platform: "Vinted", carrier: "Vinted Go" });
    expect(splitShippingMethod("En persona")).toEqual({ platform: "En persona", carrier: null });
  });
});

describe("importador de Excel", () => {
  it("detecta las hojas, aplica las reglas y no inventa datos", async () => {
    const wb = await makeWorkbook();
    const configs = wb.sheets.map(detectSheet);
    const types = Object.fromEntries(configs.map((c) => [c.sheetName, c.type]));
    expect(types).toEqual({ Almacen: "productos", Gastos: "compras", Ventas: "ventas", Responsables: "responsables", Analisis: "ignorar" });
    expect(configs.find((c) => c.sheetName === "Almacen")!.headerRow).toBe(4);

    const suggestions = suggestMerges(collectProductNames(wb, configs), [{ from: "Marca X - Modelo A 1", to: "Marca X - Modelo A" }]);
    expect(suggestions[0]).toMatchObject({ from: "Marca X - Modelo A 1", to: "Marca X - Modelo A", preset: true });

    const plan = buildPlan(wb, configs, { zeroPriceAsExit: true, merges: suggestions.filter((s) => s.preset) });
    const p = plan.payload;

    // Productos: los dos nombres se unifican; los datos son los del producto destino
    expect(p.products.map((x) => x.name).sort()).toEqual(["Marca X - Modelo A", "Producto sin ventas"]);
    const a = p.products.find((x) => x.name === "Marca X - Modelo A")!;
    expect(a).toMatchObject({ brand: "Marca X", category: "Gafas", description: "desc A", normal_sale_price: null });
    expect(p.products.find((x) => x.name === "Producto sin ventas")!.category).toBe("Perfumes");

    // Compras: la línea con 0 unidades se omite; el envío es un coste del pedido
    expect(p.purchase_orders).toHaveLength(1);
    expect(p.purchase_orders[0].items).toHaveLength(2);
    expect(p.purchase_orders[0].costs).toEqual([{ cost_type: "transporte", amount: 10 }]);
    expect(p.purchase_orders[0].supplier_name).toBeNull();
    expect(p.review_items.some((r) => r.kind === "proveedor_pendiente")).toBe(true);

    // Ventas: manda el total; venta sin lote → revisión; venta sin stock en su lote → revisión
    expect(p.sales).toHaveLength(1);
    expect(p.sales[0]).toMatchObject({ platform: "Vinted", carrier: "InPost", shipping_status: "enviado", mobile_number: 2 });
    expect(p.sales[0].items[0]).toMatchObject({ unit_price: 45, purchase_order_number: 1, notes: "negras" });
    expect(plan.issues.some((i) => /no cuadra con el total/.test(i.message))).toBe(true);
    expect(p.review_items.some((r) => r.kind === "venta_sin_lote")).toBe(true);
    expect(p.review_items.some((r) => r.kind === "venta_no_importada" && /Sin stock en su lote/.test(r.details ?? ""))).toBe(true);

    // Ventas a 0 € → salidas sin venta (con motivo cuando se puede deducir)
    expect(p.stock_exits.map((e) => e.reason)).toEqual(["regalo", "pendiente"]);
    expect(p.review_items.filter((r) => r.kind === "motivo_pendiente")).toHaveLength(1);

    // Responsables y socios
    expect(p.responsibles).toEqual([
      { name: "Persona Uno", is_partner: true },
      { name: "Persona Dos", is_partner: true },
    ]);

    // Comprobación del stock que indicaba el Excel: 4 comprados − 1 vendido − 2 salidas = 1, pero el Excel decía 2
    const check = plan.stockCheck.find((s) => s.product === "Marca X - Modelo A")!;
    expect(check).toEqual({ product: "Marca X - Modelo A", expected: 2, computed: 1 });
  });

  it("las huellas son estables: reimportar el mismo Excel no duplica", async () => {
    const wb = await makeWorkbook();
    const configs = wb.sheets.map(detectSheet);
    const opts = { zeroPriceAsExit: true, merges: [{ from: "Marca X - Modelo A 1", to: "Marca X - Modelo A" }] };
    const first = buildPlan(wb, configs, opts);
    const second = buildPlan(wb, configs, opts, {
      productNames: first.payload.products.map((p) => p.name),
      purchaseOrderNumbers: first.payload.purchase_orders.map((p) => p.order_number),
      saleFingerprints: first.payload.sales.map((s) => s.fingerprint),
      exitFingerprints: first.payload.stock_exits.map((s) => s.fingerprint),
      responsibles: first.payload.responsibles.map((r) => r.name),
      mobileNumbers: [1, 2, 3, 4, 5, 6],
      platforms: [
        { name: "Vinted", requires_shipping: true },
        { name: "Wallapop", requires_shipping: true },
        { name: "En persona", requires_shipping: false },
      ],
      carriers: ["InPost", "Correos"],
    });
    expect(second.payload.purchase_orders).toHaveLength(0);
    expect(second.summary.purchaseOrders.duplicated).toBe(1);
    expect(second.summary.products.existing).toBe(2);
    expect(second.summary.responsibles.new).toEqual([]);
    // Solo queda la venta que no tenía stock en su lote: como el pedido ya está en
    // la base de datos, es la base de datos quien vuelve a comprobarlo (y la rechaza).
    expect(second.payload.sales.map((s) => s.items[0].quantity)).toEqual([5]);
    expect(second.summary.sales.duplicated).toBe(1);
    expect(second.summary.exits.duplicated).toBe(2);
  });
});

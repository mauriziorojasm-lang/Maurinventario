/**
 * Importación contra un PostgreSQL real con el Excel de prueba.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectSheet } from "../../src/lib/import/detect";
import { buildPlan } from "../../src/lib/import/plan";
import { makeWorkbook } from "../fixtures/libro-prueba";
import { TEST_DATABASE_URL, TestDb, createTestDatabase, createUser, rpc, selectAs } from "./helpers";

const run = TEST_DATABASE_URL ? describe : describe.skip;

run("Importación de Excel en la base de datos", () => {
  let db: TestDb;
  let admin: string;
  let seller: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    admin = await createUser(db, "admin@prueba.local");
    seller = await createUser(db, "vendedor@prueba.local", "vendedor");
  }, 60_000);
  afterAll(async () => db?.close());

  async function plan() {
    const wb = await makeWorkbook();
    return buildPlan(wb, wb.sheets.map(detectSheet), { zeroPriceAsExit: true, merges: [{ from: "Marca X - Modelo A 1", to: "Marca X - Modelo A" }] });
  }

  it("solo el administrador puede importar", async () => {
    await expect(rpc(db, seller, "import_data", (await plan()).payload, true)).rejects.toThrow(/permisos/);
  });

  it("la simulación no deja nada guardado", async () => {
    const res = await rpc<{ counts: Record<string, number>; dry_run: boolean }>(db, admin, "import_data", (await plan()).payload, true);
    expect(res.dry_run).toBe(true);
    expect(res.counts.sales_created).toBe(1);
    const left = await selectAs<{ n: string }>(db, admin, "select (select count(*) from products) + (select count(*) from sales) + (select count(*) from import_batches) + (select count(*) from review_items) as n");
    expect(Number(left[0].n)).toBe(0);
  });

  it("importa, comprueba la integridad y no duplica al repetir", async () => {
    const p = (await plan()).payload;
    const res = await rpc<{ counts: Record<string, number>; integrity: { check: string; ok: boolean }[]; totals: Record<string, number> }>(db, admin, "import_data", p, false);
    expect(res.counts).toMatchObject({ products_created: 2, purchase_orders_created: 1, purchase_items_created: 2, sales_created: 1, stock_exits_created: 2, responsibles_created: 2 });
    expect(res.integrity.filter((i) => !i.ok).map((i) => i.check)).toEqual(["Pedidos recibidos con proveedor identificado"]);
    // 4 unidades compradas − 1 vendida − 2 salidas sin venta = 1
    expect(Number(res.totals.stock_units)).toBe(1);
    // Coste real: mercancía 60 € + 10 € de envío → +16,67 %
    const lots = await selectAs<{ unit_cost: string }>(db, admin, "select unit_cost from inventory_lots order by unit_cost");
    expect(Number(lots[0].unit_cost)).toBeCloseTo(10 * (70 / 60), 5);
    expect(Number(lots[1].unit_cost)).toBeCloseTo(20 * (70 / 60), 5);
    const sale = await selectAs<{ sale_number: string; unit_price: string; profit: string }>(db, admin, "select sale_number, unit_price, profit from v_sale_lines");
    expect(sale[0].sale_number).toBe("V-000001");
    expect(Number(sale[0].unit_price)).toBe(45);
    const partners = await selectAs<{ name: string }>(db, admin, "select name from responsibles where is_partner order by name");
    expect(partners.map((p) => p.name)).toEqual(["Persona Dos", "Persona Uno"]);

    const again = await rpc<{ counts: Record<string, number> }>(db, admin, "import_data", p, false);
    expect(again.counts).toMatchObject({ products_created: 0, purchase_orders_duplicated: 1, sales_duplicated: 1, stock_exits_duplicated: 2, review_items_created: 0 });

    // La siguiente venta normal continúa la numeración
    const next = await db.client.query("select value::text as v from org_counters where kind = 'venta'");
    expect(next.rows[0].v).toBe("1");
  });
});

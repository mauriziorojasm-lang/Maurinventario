/**
 * Seguridad (migración 14): historial de precios sin datos ajenos para el
 * vendedor y límite diario del generador de descripciones.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, TestDb, asService, createTestDatabase, createUser, rpc, selectAs } from "./helpers";

const run = TEST_DATABASE_URL ? describe : describe.skip;

type History = { count: number; avg: number | null; avg_cost: number | null };

run("Seguridad", () => {
  let db: TestDb;
  let admin: string;
  let seller: string;
  let orphan: string;
  let product: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    admin = await createUser(db, "admin@prueba.local");
    seller = await createUser(db, "vendedor@prueba.local", "vendedor");
    orphan = await createUser(db, "sinresponsable@prueba.local", "vendedor");
    const respA = (await selectAs<{ id: string }>(db, admin, "insert into responsibles (name, profile_id, is_partner) values ('Admin', $1, true) returning id", [admin]))[0].id;
    const respS = (await selectAs<{ id: string }>(db, admin, "insert into responsibles (name, profile_id) values ('Vendedor', $1) returning id", [seller]))[0].id;
    const vinted = (await selectAs<{ id: string }>(db, admin, "select id from platforms where name = 'Vinted'"))[0].id;
    const supplier = (await selectAs<{ id: string }>(db, admin, "insert into suppliers (name) values ('Prov') returning id"))[0].id;
    product = await rpc<string>(db, admin, "create_product", { name: "Lego 75159", variants: [{ name: "Única" }] });
    const variant = (await selectAs<{ id: string }>(db, admin, "select id from product_variants where product_id = $1", [product]))[0].id;
    const po = await rpc<string>(db, admin, "save_purchase_order", {
      order_number: 1,
      supplier_id: supplier,
      order_date: "2026-09-01",
      items: [{ variant_id: variant, quantity: 5, unit_cost: 20 }],
    });
    const items = await selectAs<{ id: string }>(db, admin, "select id from purchase_order_items where purchase_order_id = $1", [po]);
    await rpc(db, admin, "receive_purchase_order", { purchase_order_id: po, received_at: "2026-09-01", lines: [{ item_id: items[0].id, quantity_received: 5 }] });
    const lot = (await selectAs<{ id: string }>(db, admin, "select id from inventory_lots where variant_id = $1", [variant]))[0].id;
    const sale = (u: string, resp: string, price: number) =>
      rpc(db, u, "create_sale", { responsible_id: resp, platform_id: vinted, items: [{ variant_id: variant, lot_id: lot, quantity: 1, unit_price: price }] });
    await sale(admin, respA, 60);
    await sale(admin, respA, 50);
    await sale(seller, respS, 55);
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("historial de precios: el admin ve coste y todas las ventas", async () => {
    const h = await rpc<History>(db, admin, "product_price_history", product);
    expect(h.count).toBe(3);
    expect(Number(h.avg_cost)).toBe(20);
  });

  it("historial de precios: el vendedor no ve el coste ni ventas ajenas", async () => {
    const h = await rpc<History>(db, seller, "product_price_history", product);
    expect(h.avg_cost).toBeNull();
    expect(h.count).toBe(1);
    expect(Number(h.avg)).toBe(55);
  });

  it("historial de precios: vendedor sin responsable", async () => {
    await db.client.query("update profiles set active = true where id = $1", [orphan]);
    const h = await rpc<History>(db, orphan, "product_price_history", product);
    expect(h.count).toBe(0);
    expect(h.avg_cost).toBeNull();
  });

  it("generador: límite diario por usuario", async () => {
    expect(await rpc<boolean>(db, admin, "ai_usage_take", 50, 60)).toBe(true);
    expect(await rpc<boolean>(db, admin, "ai_usage_take", 11, 60)).toBe(false);
    expect(await rpc<boolean>(db, admin, "ai_usage_take", 10, 60)).toBe(true);
    expect(await rpc<boolean>(db, seller, "ai_usage_take", 60, 60)).toBe(true);
  });

  it("generador: si la IA falla se devuelve el cupo (sin bajar de 0) y no se toca el de otros", async () => {
    await db.client.query("delete from ai_usage");
    expect(await rpc<boolean>(db, admin, "ai_usage_take", 60, 60)).toBe(true);
    await asService(db, (q) => q("select ai_usage_refund($1, 5)", [admin]));
    expect(await rpc<boolean>(db, admin, "ai_usage_take", 5, 60)).toBe(true);
    expect(await rpc<boolean>(db, admin, "ai_usage_take", 1, 60)).toBe(false);
    await asService(db, (q) => q("select ai_usage_refund($1, 100)", [seller]));
    // El usuario no puede devolverse cupo a sí mismo (se saltaría el límite)
    await expect(rpc(db, admin, "ai_usage_refund", admin, 5)).rejects.toThrow();
    const rows = await db.client.query("select user_id, uses from ai_usage order by uses");
    expect(rows.rows.every((r: { uses: number }) => r.uses >= 0)).toBe(true);
    expect(rows.rows.find((r: { user_id: string }) => r.user_id === admin).uses).toBe(60);
  });

  it("generador: la tabla del contador no se puede leer ni escribir directamente", async () => {
    await expect(selectAs(db, admin, "select * from ai_usage")).rejects.toThrow();
    await expect(selectAs(db, seller, "insert into ai_usage (user_id, day, uses) values ($1, current_date, 0)", [seller])).rejects.toThrow();
    expect(await rpc<boolean>(db, seller, "ai_usage_take", 0, 60)).toBe(false);
    expect(await rpc<boolean>(db, seller, "ai_usage_take", 61, 60)).toBe(false);
  });

  it("generador: el día es el de Madrid", async () => {
    await db.client.query("insert into ai_usage (user_id, day, uses) values ($1, (now() at time zone 'Europe/Madrid')::date - 1, 60)", [orphan]);
    expect(await rpc<boolean>(db, orphan, "ai_usage_take", 1, 60)).toBe(true);
  });
});

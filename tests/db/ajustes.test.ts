/**
 * Preferencias por usuario, datos del panel por widgets e historial propio (migración 16).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, TestDb, createTestDatabase, createUser, rpc, selectAs } from "./helpers";

const run = TEST_DATABASE_URL ? describe : describe.skip;

run("Ajustes y widgets", () => {
  let db: TestDb;
  let admin: string;
  let seller: string;
  let variant: string;
  let lot: string;
  let resp: string;
  let vinted: string;
  let wallapop: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    admin = await createUser(db, "admin@prueba.local");
    seller = await createUser(db, "vendedor@prueba.local", "vendedor");
    resp = (await selectAs<{ id: string }>(db, admin, "insert into responsibles (name, profile_id, is_partner) values ('Resp', $1, true) returning id", [admin]))[0].id;
    await selectAs(db, admin, "insert into responsibles (name, profile_id) values ('Vend', $1)", [seller]);
    vinted = (await selectAs<{ id: string }>(db, admin, "select id from platforms where name = 'Vinted'"))[0].id;
    wallapop = (await selectAs<{ id: string }>(db, admin, "select id from platforms where name = 'Wallapop'"))[0].id;
    const supplier = (await selectAs<{ id: string }>(db, admin, "insert into suppliers (name) values ('Prov') returning id"))[0].id;
    const product = await rpc<string>(db, admin, "create_product", { name: "Gafas", variants: [{ name: "Única" }] });
    variant = (await selectAs<{ id: string }>(db, admin, "select id from product_variants where product_id = $1", [product]))[0].id;
    const po = await rpc<string>(db, admin, "save_purchase_order", {
      order_number: 1,
      supplier_id: supplier,
      order_date: "2026-01-01",
      items: [{ variant_id: variant, quantity: 4, unit_cost: 10 }],
    });
    const items = await selectAs<{ id: string }>(db, admin, "select id from purchase_order_items where purchase_order_id = $1", [po]);
    await rpc(db, admin, "receive_purchase_order", { purchase_order_id: po, received_at: "2026-01-01", lines: [{ item_id: items[0].id, quantity_received: 4 }] });
    lot = (await selectAs<{ id: string }>(db, admin, "select id from inventory_lots where variant_id = $1", [variant]))[0].id;
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("cada usuario solo ve y cambia sus preferencias", async () => {
    await selectAs(db, admin, "insert into user_preferences (user_id, prefs) values ($1, $2)", [admin, { appearance: { mode: "dark" } }]);
    await selectAs(db, seller, "insert into user_preferences (user_id, prefs) values ($1, $2)", [seller, { appearance: { mode: "light" } }]);
    expect(await selectAs(db, seller, "select user_id from user_preferences")).toEqual([{ user_id: seller }]);
    // No puede escribir las de otro
    await expect(selectAs(db, seller, "insert into user_preferences (user_id, prefs) values ($1, '{}')", [admin])).rejects.toThrow();
    expect(await selectAs(db, seller, "update user_preferences set prefs = '{}' where user_id = $1 returning user_id", [admin])).toHaveLength(0);
    expect(await selectAs(db, seller, "delete from user_preferences where user_id = $1 returning user_id", [admin])).toHaveLength(0);
    const a = await selectAs<{ prefs: { appearance: { mode: string } } }>(db, admin, "select prefs from user_preferences where user_id = $1", [admin]);
    expect(a[0].prefs.appearance.mode).toBe("dark");
    // Sin sesión, ni siquiera se puede consultar
    await expect(selectAs(db, null, "select user_id from user_preferences")).rejects.toThrow(/permission denied/);
  });

  it("panel por widgets: cifras reales por periodo y plataforma; solo administrador", async () => {
    await rpc(db, admin, "create_sale", { responsible_id: resp, platform_id: vinted, items: [{ variant_id: variant, lot_id: lot, quantity: 1, unit_price: 30 }] });
    await rpc(db, admin, "create_sale", { responsible_id: resp, platform_id: wallapop, items: [{ variant_id: variant, lot_id: lot, quantity: 2, unit_price: 25 }] });
    type W = {
      current: { revenue: number; profit: number; orders: number; units: number; cost: number };
      platforms: { platform_name: string; revenue: number }[];
      top_units: { units: number }[];
      series: { dia: { revenue: number }[]; semana: unknown[]; mes: unknown[] };
      inventory: { units: number };
    };
    const all = await rpc<W>(db, admin, "dashboard_widgets", "dia", null);
    expect(Number(all.current.revenue)).toBe(80);
    expect(Number(all.current.cost)).toBe(30);
    expect(Number(all.current.profit)).toBe(50);
    expect(all.current.orders).toBe(2);
    expect(Number(all.current.units)).toBe(3);
    expect(all.platforms.map((p) => p.platform_name).sort()).toEqual(["Vinted", "Wallapop"]);
    expect(all.series.dia).toHaveLength(30);
    expect(all.series.semana).toHaveLength(12);
    expect(all.series.mes).toHaveLength(12);
    expect(Number(all.series.dia.at(-1)!.revenue)).toBe(80);
    expect(Number(all.inventory.units)).toBe(1);
    const v = await rpc<W>(db, admin, "dashboard_widgets", "anio", vinted);
    expect(Number(v.current.revenue)).toBe(30);
    expect(v.platforms).toHaveLength(1);
    await expect(rpc(db, seller, "dashboard_widgets", "mes", null)).rejects.toThrow();
  });

  it("stock bajo: cuenta productos con 1..umbral unidades; el vendedor recibe 0", async () => {
    expect(await rpc<number>(db, admin, "low_stock_count", 1)).toBe(1);
    expect(await rpc<number>(db, admin, "low_stock_count", 5)).toBe(1);
    expect(await rpc<number>(db, seller, "low_stock_count", 5)).toBe(0);
  });

  it("historial: solo operaciones permitidas y cada uno ve solo las suyas, sin datos internos", async () => {
    await rpc(db, admin, "log_user_event", "copia_seguridad", "Copia de seguridad descargada");
    await rpc(db, seller, "log_user_event", "preferencias", "Aspecto cambiado");
    await expect(rpc(db, seller, "log_user_event", "borrar_todo", "x")).rejects.toThrow(/no válida/);
    const mine = await selectAs<{ action: string }>(db, seller, "select * from my_activity(50)");
    expect(mine.map((r) => r.action)).toEqual(["preferencias"]);
    expect(Object.keys(mine[0]).sort()).toEqual(["action", "entity", "occurred_at", "summary"]);
    const adminRows = await selectAs<{ action: string }>(db, admin, "select * from my_activity(50)");
    expect(adminRows.some((r) => r.action === "copia_seguridad")).toBe(true);
    expect(adminRows.some((r) => r.action === "preferencias")).toBe(false);
  });
});

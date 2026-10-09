/**
 * Fotos por producto, anuncios e historial de precios (migración 13).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, TestDb, createTestDatabase, createUser, rpc, selectAs } from "./helpers";

const run = TEST_DATABASE_URL ? describe : describe.skip;

run("Fotos y anuncios", () => {
  let db: TestDb;
  let admin: string;
  let seller: string;
  let product: string;
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
    vinted = (await selectAs<{ id: string }>(db, admin, "select id from platforms where name = 'Vinted'"))[0].id;
    wallapop = (await selectAs<{ id: string }>(db, admin, "select id from platforms where name = 'Wallapop'"))[0].id;
    const supplier = (await selectAs<{ id: string }>(db, admin, "insert into suppliers (name) values ('Prov') returning id"))[0].id;
    product = await rpc<string>(db, admin, "create_product", { name: "Lego 75159", variants: [{ name: "Única" }] });
    variant = (await selectAs<{ id: string }>(db, admin, "select id from product_variants where product_id = $1", [product]))[0].id;
    const po = await rpc<string>(db, admin, "save_purchase_order", {
      order_number: 1,
      supplier_id: supplier,
      order_date: "2026-09-01",
      items: [{ variant_id: variant, quantity: 3, unit_cost: 20 }],
    });
    const items = await selectAs<{ id: string }>(db, admin, "select id from purchase_order_items where purchase_order_id = $1", [po]);
    await rpc(db, admin, "receive_purchase_order", { purchase_order_id: po, received_at: "2026-09-01", lines: [{ item_id: items[0].id, quantity_received: 3 }] });
    lot = (await selectAs<{ id: string }>(db, admin, "select id from inventory_lots where variant_id = $1", [variant]))[0].id;
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("galería: el administrador añade fotos; el vendedor las ve pero no puede tocarlas", async () => {
    await selectAs(db, admin, "insert into product_photos (product_id, path, position) values ($1, $2, 0), ($1, $3, 1)", [product, `${product}/a.jpg`, `${product}/b.jpg`]);
    expect(await selectAs(db, seller, "select id from product_photos where product_id = $1", [product])).toHaveLength(2);
    await expect(selectAs(db, seller, "insert into product_photos (product_id, path) values ($1, 'x')", [product])).rejects.toThrow();
    const ph = (await selectAs<{ id: string }>(db, admin, "select id from product_photos where path = $1", [`${product}/a.jpg`]))[0].id;
    await selectAs(db, admin, "insert into photo_uses (photo_id, platform) values ($1, 'vinted')", [ph]);
    await expect(selectAs(db, seller, "insert into photo_uses (photo_id, platform) values ($1, 'wallapop')", [ph])).rejects.toThrow();
    // Una ruta de foto no puede repetirse
    await expect(selectAs(db, admin, "insert into product_photos (product_id, path) values ($1, $2)", [product, `${product}/a.jpg`])).rejects.toThrow();
  });

  it("anuncios: uno por producto y plataforma; el vendedor solo los ve", async () => {
    await selectAs(db, admin, "insert into listings (product_id, platform, status, price) values ($1, 'vinted', 'publicado', 60), ($1, 'wallapop', 'borrador', 58)", [product]);
    await expect(selectAs(db, admin, "insert into listings (product_id, platform) values ($1, 'vinted')", [product])).rejects.toThrow();
    await expect(selectAs(db, admin, "insert into listings (product_id, platform, url) values ($1, 'wallapop', 'javascript:alert(1)')", [product])).rejects.toThrow();
    expect(await selectAs(db, seller, "select id from listings where product_id = $1", [product])).toHaveLength(2);
    await expect(selectAs(db, seller, "update listings set status = 'retirado' where product_id = $1 returning id", [product])).resolves.toHaveLength(0);
  });

  it("historial de precios con ventas reales y anuncios por quitar cuando se acaba el stock", async () => {
    let h: { count: number; avg_cost?: number; avg?: number; min?: number; max?: number; by_platform?: Record<string, { count: number; avg: number }> } = await rpc(db, admin, "product_price_history", product);
    expect(h.count).toBe(0);
    expect(Number(h.avg_cost)).toBe(20);
    expect(await selectAs(db, admin, "select * from v_listings_to_remove")).toHaveLength(0);

    for (const [platform, price] of [
      [vinted, 60],
      [wallapop, 50],
      [vinted, 55],
    ] as const) {
      await rpc(db, admin, "create_sale", { responsible_id: resp, platform_id: platform, items: [{ variant_id: variant, lot_id: lot, quantity: 1, unit_price: price }] });
    }
    h = await rpc(db, admin, "product_price_history", product);
    expect(h.count).toBe(3);
    expect(Number(h.avg)).toBe(55);
    expect(Number(h.min)).toBe(50);
    expect(Number(h.max)).toBe(60);
    expect(h.by_platform!.Vinted.count).toBe(2);
    expect(Number(h.by_platform!.Vinted.avg)).toBe(57.5);

    // Sin stock y con el anuncio de Vinted publicado → hay que quitarlo (el borrador de Wallapop no)
    const rem = await selectAs<{ platform: string }>(db, admin, "select platform from v_listings_to_remove where product_id = $1", [product]);
    expect(rem.map((r) => r.platform)).toEqual(["vinted"]);
    await selectAs(db, admin, "update listings set status = 'retirado' where product_id = $1 and platform = 'vinted'", [product]);
    expect(await selectAs(db, admin, "select * from v_listings_to_remove")).toHaveLength(0);
  });
});

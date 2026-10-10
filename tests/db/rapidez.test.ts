/**
 * Ventas sin duplicados, orden de fotos, contadores del menú y resumen de
 * anuncios (migración 15).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, TestDb, createTestDatabase, createUser, rpc, selectAs } from "./helpers";

const run = TEST_DATABASE_URL ? describe : describe.skip;

run("Fallos y rapidez", () => {
  let db: TestDb;
  let admin: string;
  let seller: string;
  let product: string;
  let variant: string;
  let lot: string;
  let resp: string;
  let sellerResp: string;
  let vinted: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    admin = await createUser(db, "admin@prueba.local");
    seller = await createUser(db, "vendedor@prueba.local", "vendedor");
    resp = (await selectAs<{ id: string }>(db, admin, "insert into responsibles (name, profile_id, is_partner) values ('Resp', $1, true) returning id", [admin]))[0].id;
    sellerResp = (await selectAs<{ id: string }>(db, admin, "insert into responsibles (name, profile_id) values ('Vend', $1) returning id", [seller]))[0].id;
    vinted = (await selectAs<{ id: string }>(db, admin, "select id from platforms where name = 'Vinted'"))[0].id;
    const supplier = (await selectAs<{ id: string }>(db, admin, "insert into suppliers (name) values ('Prov') returning id"))[0].id;
    product = await rpc<string>(db, admin, "create_product", { name: "Gafas", variants: [{ name: "Única" }] });
    variant = (await selectAs<{ id: string }>(db, admin, "select id from product_variants where product_id = $1", [product]))[0].id;
    const po = await rpc<string>(db, admin, "save_purchase_order", {
      order_number: 1,
      supplier_id: supplier,
      order_date: "2026-09-01",
      items: [{ variant_id: variant, quantity: 5, unit_cost: 10 }],
    });
    const items = await selectAs<{ id: string }>(db, admin, "select id from purchase_order_items where purchase_order_id = $1", [po]);
    await rpc(db, admin, "receive_purchase_order", { purchase_order_id: po, received_at: "2026-09-01", lines: [{ item_id: items[0].id, quantity_received: 5 }] });
    lot = (await selectAs<{ id: string }>(db, admin, "select id from inventory_lots where variant_id = $1", [variant]))[0].id;
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("la misma venta enviada dos veces se registra una sola vez", async () => {
    const req = "6f1c2b9e-0d7a-4f5e-9c1a-2b3c4d5e6f70";
    const sale = { responsible_id: resp, platform_id: vinted, client_request_id: req, items: [{ variant_id: variant, lot_id: lot, quantity: 1, unit_price: 30 }] };
    const a = await rpc<string>(db, admin, "create_sale", sale);
    const b = await rpc<string>(db, admin, "create_sale", sale);
    expect(b).toBe(a);
    expect(await selectAs(db, admin, "select id from sales where client_request_id = $1", [req])).toHaveLength(1);
    const stock = await selectAs<{ q: number }>(db, admin, "select quantity_available q from inventory_lots where id = $1", [lot]);
    expect(stock[0].q).toBe(4);
    // Sin identificador, cada llamada es una venta nueva (como las del correo)
    const c = await rpc<string>(db, admin, "create_sale", { ...sale, client_request_id: undefined });
    expect(c).not.toBe(a);
  });

  it("reordenar fotos es de una vez y actualiza la portada; el vendedor no puede", async () => {
    await selectAs(db, admin, "insert into product_photos (product_id, path, position) values ($1, $2, 0), ($1, $3, 1), ($1, $4, 2)", [
      product,
      `${product}/a.jpg`,
      `${product}/b.jpg`,
      `${product}/c.jpg`,
    ]);
    const ids = await selectAs<{ id: string; path: string }>(db, admin, "select id, path from product_photos where product_id = $1 order by position", [product]);
    await rpc(db, admin, "reorder_product_photos", product, [ids[2].id, ids[0].id, ids[1].id]);
    const after = await selectAs<{ path: string }>(db, admin, "select path from product_photos where product_id = $1 order by position", [product]);
    expect(after.map((r) => r.path)).toEqual([`${product}/c.jpg`, `${product}/a.jpg`, `${product}/b.jpg`]);
    const cover = await selectAs<{ photo_path: string }>(db, admin, "select photo_path from products where id = $1", [product]);
    expect(cover[0].photo_path).toBe(`${product}/c.jpg`);
    await expect(rpc(db, seller, "reorder_product_photos", product, [ids[0].id])).rejects.toThrow();
    // Una foto de otro producto: no se toca nada
    const other = await rpc<string>(db, admin, "create_product", { name: "Otro", variants: [{ name: "Única" }] });
    await selectAs(db, admin, "insert into product_photos (product_id, path) values ($1, $2)", [other, `${other}/z.jpg`]);
    const z = (await selectAs<{ id: string }>(db, admin, "select id from product_photos where product_id = $1", [other]))[0].id;
    await expect(rpc(db, admin, "reorder_product_photos", product, [z])).rejects.toThrow(/no pertenece/);
  });

  it("contadores del menú: el vendedor solo ve sus envíos", async () => {
    await rpc(db, seller, "create_sale", { platform_id: vinted, items: [{ variant_id: variant, lot_id: lot, quantity: 1, unit_price: 25 }] });
    const a = await rpc<Record<string, number>>(db, admin, "nav_badges");
    const s = await rpc<Record<string, number>>(db, seller, "nav_badges");
    expect(a.shipments).toBe(3);
    expect(s.shipments).toBe(1);
    expect(s.reviews + s.emails + s.detected + s.listings).toBe(0);
    expect(sellerResp).toBeTruthy();
  });

  it("resumen de anuncios: contadores y filas de la pestaña", async () => {
    await selectAs(db, admin, "insert into listings (product_id, platform, status) values ($1, 'vinted', 'publicado')", [product]);
    const o = await rpc<{ view: string; counts: Record<string, number>; rows: { id: string; vinted: string | null }[] }>(db, admin, "listings_overview", null);
    expect(o.view).toBe("sin-anunciar");
    expect(o.counts.publicados).toBe(1);
    expect(o.counts.todos).toBe(1);
    expect(o.counts["por-retirar"]).toBe(0);
    const p = await rpc<{ rows: { id: string; vinted: string | null }[] }>(db, admin, "listings_overview", "publicados");
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0].vinted).toBe("publicado");
    await expect(rpc(db, seller, "listings_overview", "todos")).rejects.toThrow();
  });
});

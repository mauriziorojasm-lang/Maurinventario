/**
 * Seguimiento de envíos: hora de «enviado», historial, entregado, alertas,
 * estadísticas por transportista, permisos y aislamiento entre espacios.
 * Datos solo de prueba.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, TestDb, asService, createTestDatabase, createUser, rpc, selectAs } from "./helpers";

const run = TEST_DATABASE_URL ? describe : describe.skip;

run("Seguimiento de envíos", () => {
  let db: TestDb;
  let admin: string;
  let seller: string;
  let other: string;
  let respAdmin: string;
  let respSeller: string;
  let vinted: string;
  let inpost: string;
  let correos: string;
  let variant: string;
  let lot: string;

  const svc = <T>(sql: string, params: unknown[] = []) => asService(db, async (q) => (await q(sql, params)).rows as T[]);

  async function sale(resp: string, carrier: string, user = admin) {
    return rpc<string>(db, user, "create_sale", {
      sale_date: "2026-10-10",
      responsible_id: resp,
      platform_id: vinted,
      carrier_id: carrier,
      shipping_status: "pendiente",
      items: [{ variant_id: variant, lot_id: lot, quantity: 1, unit_price: 50 }],
    });
  }
  const row = async (id: string) =>
    (await db.client.query("select shipping_status, shipped_at, delivered_at, tracking_status, tracking_number, tracking_last_event from sales where id = $1", [id])).rows[0];

  beforeAll(async () => {
    db = await createTestDatabase();
    admin = await createUser(db, "admin@seg.local");
    seller = await createUser(db, "vendedor@seg.local", "vendedor");
    other = await createUser(db, "otra@seg.local", undefined, "Otra empresa");
    respAdmin = (await selectAs<{ id: string }>(db, admin, "insert into responsibles (name, profile_id) values ('Admin', $1) returning id", [admin]))[0].id;
    respSeller = (await selectAs<{ id: string }>(db, admin, "insert into responsibles (name, profile_id) values ('Vendedor', $1) returning id", [seller]))[0].id;
    vinted = (await selectAs<{ id: string }>(db, admin, "select id from platforms where name = 'Vinted'"))[0].id;
    inpost = (await selectAs<{ id: string }>(db, admin, "select id from carriers where name = 'InPost'"))[0].id;
    correos = (await selectAs<{ id: string }>(db, admin, "select id from carriers where name = 'Correos'"))[0].id;
    const supplier = (await selectAs<{ id: string }>(db, admin, "insert into suppliers (name) values ('Prov') returning id"))[0].id;
    const p = await rpc<string>(db, admin, "create_product", { name: "Oakley HSTN", variants: [{ name: "Única" }] });
    variant = (await selectAs<{ id: string }>(db, admin, "select id from product_variants where product_id = $1", [p]))[0].id;
    const po = await rpc<string>(db, admin, "save_purchase_order", {
      order_number: 1,
      supplier_id: supplier,
      order_date: "2026-09-01",
      items: [{ variant_id: variant, quantity: 20, unit_cost: 30 }],
    });
    const items = await selectAs<{ id: string; quantity_ordered: number }>(db, admin, "select id, quantity_ordered from purchase_order_items where purchase_order_id = $1", [po]);
    await rpc(db, admin, "receive_purchase_order", {
      purchase_order_id: po,
      received_at: "2026-09-02",
      lines: items.map((i) => ({ item_id: i.id, quantity_received: i.quantity_ordered })),
    });
    lot = (await selectAs<{ id: string }>(db, admin, "select id from inventory_lots where variant_id = $1", [variant]))[0].id;
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("al marcar «enviado» se guarda la hora exacta, empieza el seguimiento y queda el primer movimiento", async () => {
    const id = await sale(respAdmin, inpost);
    expect((await row(id)).tracking_status).toBe("pendiente");
    const before = Date.now();
    await rpc(db, admin, "set_sales_shipping_status", [id], "enviado");
    const r = await row(id);
    expect(r.shipping_status).toBe("enviado");
    expect(r.tracking_status).toBe("enviado");
    expect(new Date(r.shipped_at).getTime()).toBeGreaterThanOrEqual(before - 5000);
    const ev = await selectAs<{ status: string; source: string }>(db, admin, "select status, source from tracking_events where sale_id = $1", [id]);
    expect(ev).toEqual([{ status: "enviado", source: "resellap" }]);
    // Deshacer: vuelve a pendiente y se borra la hora de envío
    await rpc(db, admin, "set_sales_shipping_status", [id], "pendiente");
    expect((await row(id)).shipped_at).toBeNull();
    expect((await row(id)).tracking_status).toBe("pendiente");
  });

  it("código de seguimiento: se valida y se guarda sin espacios; estado manual «entregado» fija la hora de entrega y avisa", async () => {
    const id = await sale(respAdmin, correos);
    await expect(rpc(db, admin, "update_tracking", { id, status: "entregado" })).rejects.toThrow(/Primero marca/);
    await expect(rpc(db, admin, "update_tracking", { id, tracking_number: "AB 1" })).rejects.toThrow(/de 4 a 40/);
    await rpc(db, admin, "update_tracking", { id, tracking_number: "pq 1234 5678 es" });
    const withCode = await row(id);
    expect(withCode.tracking_number).toBe("PQ12345678ES");
    // Con código, la venta pasa a enviada y entra en «Seguimiento»
    expect(withCode.shipping_status).toBe("enviado");
    expect(withCode.shipped_at).not.toBeNull();
    expect(withCode.tracking_status).toBe("enviado");
    await rpc(db, admin, "update_tracking", { id, status: "entregado", note: "Recogido en el punto" });
    const r = await row(id);
    expect(r.tracking_status).toBe("entregado");
    expect(r.delivered_at).not.toBeNull();
    expect(r.tracking_last_event).toBe("Recogido en el punto");
    const alerts = await selectAs<{ kind: string }>(db, admin, "select kind from shipment_alerts where sale_id = $1", [id]);
    expect(alerts.map((a) => a.kind)).toEqual(["entregado"]);
    const badges = await rpc<{ alerts: number }>(db, admin, "nav_badges");
    expect(badges.alerts).toBeGreaterThanOrEqual(1);
    expect(await rpc<number>(db, admin, "mark_shipment_alerts_read", null)).toBeGreaterThanOrEqual(1);
    expect((await rpc<{ alerts: number }>(db, admin, "nav_badges")).alerts).toBe(0);
  });

  it("código añadido a una venta ya marcada como enviada sin hora de envío: entra en «Seguimiento» con su primer movimiento", async () => {
    const id = await sale(respAdmin, inpost);
    await rpc(db, admin, "set_sales_shipping_status", [id], "enviado");
    // Venta antigua: enviada pero sin hora (como las de antes del seguimiento)
    await db.client.query("update sales set shipped_at = null, tracking_status = null where id = $1", [id]);
    await db.client.query("delete from tracking_events where sale_id = $1", [id]);
    await rpc(db, admin, "update_tracking", { id, tracking_number: "QR1234567ES" });
    const r = await row(id);
    expect(r.shipping_status).toBe("enviado");
    expect(r.shipped_at).not.toBeNull();
    expect(r.tracking_status).toBe("enviado");
    const ev = await svc<{ description: string }>("select description from tracking_events where sale_id = $1", [id]);
    expect(ev.map((e) => e.description)).toEqual(["Marcado como enviado en Resellap"]);
  });

  it("el servicio de seguimiento aplica los movimientos en orden, detecta intentos de entrega y no duplica", async () => {
    const id = await sale(respAdmin, inpost);
    await rpc(db, admin, "set_sales_shipping_status", [id], "enviado");
    const payload = {
      provider: "17track",
      registered: true,
      eta: "2026-10-20",
      events: [
        { at: "2026-10-12T08:00:00Z", status: "en_transito", description: "En tránsito", location: "Madrid" },
        { at: "2026-10-13T09:00:00Z", status: "incidencia", description: "Destinatario ausente: intento de entrega" },
        { at: "2026-10-11T16:00:00Z", status: "enviado", description: "Admitido" },
      ],
    };
    await svc("select public.tracking_apply($1, $2)", [id, payload]);
    await svc("select public.tracking_apply($1, $2)", [id, payload]); // repetir no duplica
    const r = await row(id);
    expect(r.tracking_status).toBe("incidencia");
    const n = (await svc<{ n: number }>("select count(*)::int n from tracking_events where sale_id = $1", [id]))[0].n;
    expect(n).toBe(4); // enviado (Resellap) + 3 del transportista
    const alerts = await svc<{ kind: string }>("select kind from shipment_alerts where sale_id = $1", [id]);
    expect(alerts.map((a) => a.kind)).toEqual(["intento"]);
    // Un usuario no puede llamar a la función del servidor
    await expect(rpc(db, admin, "tracking_apply", id, payload)).rejects.toThrow(/permission denied/);
  });

  it("estadísticas por transportista: tiempo medio y mediana desde «enviado» hasta «entregado»", async () => {
    const a = await sale(respAdmin, correos);
    const b = await sale(respAdmin, correos);
    for (const id of [a, b]) await rpc(db, admin, "set_sales_shipping_status", [id], "enviado");
    // 2 y 4 días después de enviarlas
    await db.client.query("update sales set shipped_at = now() - interval '6 days' where id in ($1, $2)", [a, b]);
    await svc("select public.tracking_apply($1, $2)", [a, { events: [{ at: new Date(Date.now() - 4 * 86400_000).toISOString(), status: "entregado", description: "Entregado" }] }]);
    await svc("select public.tracking_apply($1, $2)", [b, { events: [{ at: new Date(Date.now() - 2 * 86400_000).toISOString(), status: "entregado", description: "Entregado" }] }]);
    const st = await rpc<{ carriers: { carrier: string; delivered: number; avg_days: number; median_days: number }[] }>(db, admin, "shipping_stats", null, null);
    const c = st.carriers.find((x) => x.carrier === "Correos")!;
    expect(c.delivered).toBeGreaterThanOrEqual(2);
    expect(Number(c.median_days)).toBeGreaterThan(0);
  });

  it("alertas por tiempo: retraso a los 5 días sin entregar", async () => {
    const id = await sale(respAdmin, inpost);
    await rpc(db, admin, "set_sales_shipping_status", [id], "enviado");
    await db.client.query("update sales set shipped_at = now() - interval '7 days', tracking_status_at = now() - interval '7 days' where id = $1", [id]);
    await svc("select public.tracking_check_stale()");
    const alerts = await svc<{ kind: string }>("select kind from shipment_alerts where sale_id = $1", [id]);
    expect(alerts.map((x) => x.kind)).toContain("retraso");
  });

  it("permisos: el vendedor gestiona solo sus envíos y ve solo su seguimiento; otra empresa no ve nada", async () => {
    const mine = await sale(respSeller, inpost);
    const notMine = await sale(respAdmin, inpost);
    await rpc(db, seller, "update_tracking", { id: mine, tracking_number: "ABCD1234" });
    await expect(rpc(db, seller, "update_tracking", { id: notMine, tracking_number: "ABCD9999" })).rejects.toThrow(/tus ventas/);
    await rpc(db, admin, "set_sales_shipping_status", [mine, notMine], "enviado");
    const seen = await selectAs<{ sale_id: string }>(db, seller, "select distinct sale_id from tracking_events");
    expect(seen.map((s) => s.sale_id)).toEqual([mine]);
    expect(await selectAs(db, other, "select * from tracking_events")).toEqual([]);
    expect(await selectAs(db, other, "select * from shipment_alerts")).toEqual([]);
    // Nadie escribe directamente en el historial
    await expect(selectAs(db, admin, "insert into tracking_events (sale_id, occurred_at, status, description, source, dedupe_key) values ($1, now(), 'entregado', 'x', 'manual', 'x')", [mine])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("listas habituales: añade las que faltan sin duplicar", async () => {
    const r1 = await rpc<{ platforms: number; carriers: number }>(db, admin, "add_standard_lists");
    expect(r1.carriers).toBeGreaterThan(5);
    const r2 = await rpc<{ platforms: number; carriers: number }>(db, admin, "add_standard_lists");
    expect(r2).toEqual({ platforms: 0, carriers: 0 });
    await expect(rpc(db, seller, "add_standard_lists")).rejects.toThrow();
  });
});

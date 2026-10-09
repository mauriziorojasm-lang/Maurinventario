/**
 * Tests de la lógica de negocio contra un PostgreSQL real.
 * Los datos de aquí son SOLO de prueba: viven en una base de datos
 * temporal que se borra al terminar. Nunca llegan a la aplicación.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, TestDb, asUser, createTestDatabase, createUser, rpc, selectAs } from "./helpers";

const run = TEST_DATABASE_URL ? describe : describe.skip;

run("Lógica de negocio de MaurInventario", () => {
  let db: TestDb;
  let admin: string;
  let seller: string;
  let respAdmin: string;
  let respSeller: string;
  let supplier: string;
  let vinted: string;
  let enPersona: string;
  let inpost: string;

  const variantOf = async (productId: string) =>
    (await selectAs<{ id: string }>(db, admin, "select id from product_variants where product_id = $1 order by created_at", [productId]))[0].id;

  const lotOf = async (variantId: string, orderNumber: number) =>
    (
      await selectAs<{ id: string }>(
        db,
        admin,
        "select l.id from inventory_lots l join purchase_orders po on po.id = l.purchase_order_id where l.variant_id = $1 and po.order_number = $2",
        [variantId, orderNumber],
      )
    )[0].id;

  async function createAndReceivePO(orderNumber: number, lines: { variant_id: string; quantity: number; unit_cost: number }[], costs: { cost_type: string; amount: number }[] = []) {
    const poId = await rpc<string>(db, admin, "save_purchase_order", {
      order_number: orderNumber,
      supplier_id: supplier,
      order_date: "2026-01-10",
      items: lines,
      costs,
    });
    const items = await selectAs<{ id: string; quantity_ordered: number }>(
      db,
      admin,
      "select id, quantity_ordered from purchase_order_items where purchase_order_id = $1 order by line_number",
      [poId],
    );
    await rpc(db, admin, "receive_purchase_order", {
      purchase_order_id: poId,
      received_at: "2026-01-15",
      lines: items.map((i) => ({ item_id: i.id, quantity_received: i.quantity_ordered })),
    });
    return poId;
  }

  beforeAll(async () => {
    db = await createTestDatabase();
    admin = await createUser(db, "admin@prueba.local");
    seller = await createUser(db, "vendedor@prueba.local", "vendedor");
    respAdmin = (
      await selectAs<{ id: string }>(db, admin, "insert into responsibles (name, profile_id, is_partner) values ('Responsable A', $1, true) returning id", [admin])
    )[0].id;
    respSeller = (
      await selectAs<{ id: string }>(db, admin, "insert into responsibles (name, profile_id, is_partner) values ('Responsable B', $1, true) returning id", [seller])
    )[0].id;
    supplier = (await selectAs<{ id: string }>(db, admin, "insert into suppliers (name) values ('Proveedor de prueba') returning id"))[0].id;
    const pl = await selectAs<{ id: string; name: string }>(db, admin, "select id, name from platforms");
    vinted = pl.find((p) => p.name === "Vinted")!.id;
    enPersona = pl.find((p) => p.name === "En persona")!.id;
    inpost = (await selectAs<{ id: string }>(db, admin, "select id from carriers where name = 'InPost'"))[0].id;
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("el primer usuario es administrador y el segundo vendedor", async () => {
    const rows = await db.client.query("select email, role from profiles order by created_at");
    expect(rows.rows.map((r) => r.role)).toEqual(["admin", "vendedor"]);
  });

  it("coste medio ponderado para el almacén y coste del lote para el beneficio", async () => {
    const product = await rpc<string>(db, admin, "create_product", {
      name: "Prueba Encoder",
      brand_name: "Marca prueba",
      category_name: "Gafas",
      variants: [{ name: "Negro" }],
    });
    const negro = await variantOf(product);
    await createAndReceivePO(1, [{ variant_id: negro, quantity: 1, unit_cost: 10 }]);
    await createAndReceivePO(7, [{ variant_id: negro, quantity: 1, unit_cost: 15 }]);

    const inv = await selectAs<{ stock: number; weighted_avg_cost: string; stock_value: string }>(
      db,
      admin,
      "select stock, weighted_avg_cost, stock_value from v_variant_inventory where variant_id = $1",
      [negro],
    );
    expect(inv[0].stock).toBe(2);
    expect(Number(inv[0].weighted_avg_cost)).toBe(12.5);
    expect(Number(inv[0].stock_value)).toBe(25);

    const lot1 = await lotOf(negro, 1);
    const lot7 = await lotOf(negro, 7);
    const s1 = await rpc<string>(db, admin, "create_sale", {
      sale_date: "2026-02-01",
      responsible_id: respAdmin,
      platform_id: enPersona,
      items: [{ variant_id: negro, lot_id: lot1, quantity: 1, unit_price: 90 }],
    });
    const s7 = await rpc<string>(db, admin, "create_sale", {
      sale_date: "2026-02-02",
      responsible_id: respAdmin,
      platform_id: enPersona,
      items: [{ variant_id: negro, lot_id: lot7, quantity: 1, unit_price: 90 }],
    });
    const lines = await selectAs<{ sale_id: string; profit: string }>(db, admin, "select sale_id, profit from v_sale_lines where variant_id = $1", [negro]);
    expect(Number(lines.find((l) => l.sale_id === s1)!.profit)).toBe(80);
    expect(Number(lines.find((l) => l.sale_id === s7)!.profit)).toBe(75);
  });

  it("reparte los costes adicionales en proporción al valor de la mercancía", async () => {
    const pa = await rpc<string>(db, admin, "create_product", { name: "Prueba reparto A" });
    const pb = await rpc<string>(db, admin, "create_product", { name: "Prueba reparto B" });
    const va = await variantOf(pa);
    const vb = await variantOf(pb);
    await createAndReceivePO(
      20,
      [
        { variant_id: va, quantity: 10, unit_cost: 10 },
        { variant_id: vb, quantity: 5, unit_cost: 20 },
      ],
      [
        { cost_type: "transporte", amount: 20 },
        { cost_type: "aduanas", amount: 10 },
      ],
    );
    // mercancía 200 €, costes extra 30 € → +15 %
    const la = await selectAs<{ unit_cost: string }>(db, admin, "select unit_cost from inventory_lots where id = $1", [await lotOf(va, 20)]);
    const lb = await selectAs<{ unit_cost: string }>(db, admin, "select unit_cost from inventory_lots where id = $1", [await lotOf(vb, 20)]);
    expect(Number(la[0].unit_cost)).toBeCloseTo(11.5, 6);
    expect(Number(lb[0].unit_cost)).toBeCloseTo(23, 6);

    // Cambiar los costes después de recibir recalcula el coste real del lote
    const po = (await selectAs<{ id: string }>(db, admin, "select id from purchase_orders where order_number = 20"))[0].id;
    await rpc(db, admin, "set_purchase_costs", { purchase_order_id: po, costs: [{ cost_type: "transporte", amount: 40 }] });
    const la2 = await selectAs<{ unit_cost: string }>(db, admin, "select unit_cost from inventory_lots where id = $1", [await lotOf(va, 20)]);
    expect(Number(la2[0].unit_cost)).toBeCloseTo(12, 6);
  });

  it("bloquea la venta si no hay stock suficiente en el lote", async () => {
    const p = await rpc<string>(db, admin, "create_product", { name: "Prueba sin stock" });
    const v = await variantOf(p);
    await createAndReceivePO(30, [{ variant_id: v, quantity: 2, unit_cost: 5 }]);
    const lot = await lotOf(v, 30);
    await expect(
      rpc(db, admin, "create_sale", {
        responsible_id: respAdmin,
        platform_id: enPersona,
        items: [{ variant_id: v, lot_id: lot, quantity: 3, unit_price: 10 }],
      }),
    ).rejects.toThrow(/No hay stock suficiente/);

    // Dos líneas del mismo lote que juntas superan el stock también se bloquean
    await expect(
      rpc(db, admin, "create_sale", {
        responsible_id: respAdmin,
        platform_id: enPersona,
        items: [
          { variant_id: v, lot_id: lot, quantity: 2, unit_price: 10 },
          { variant_id: v, lot_id: lot, quantity: 1, unit_price: 10 },
        ],
      }),
    ).rejects.toThrow(/No hay stock suficiente/);

    const st = await selectAs<{ quantity_available: number }>(db, admin, "select quantity_available from inventory_lots where id = $1", [lot]);
    expect(st[0].quantity_available).toBe(2);
  });

  it("no permite ventas a 0 €: se registran como salida sin venta", async () => {
    const p = await rpc<string>(db, admin, "create_product", { name: "Prueba regalo" });
    const v = await variantOf(p);
    await createAndReceivePO(31, [{ variant_id: v, quantity: 2, unit_cost: 8 }]);
    const lot = await lotOf(v, 31);
    await expect(
      rpc(db, admin, "create_sale", { responsible_id: respAdmin, platform_id: enPersona, items: [{ variant_id: v, lot_id: lot, quantity: 1, unit_price: 0 }] }),
    ).rejects.toThrow(/salida sin venta/);
    await rpc(db, admin, "create_stock_exit", { variant_id: v, lot_id: lot, quantity: 1, reason: "regalo", notes: "de regalo" });
    const ex = await selectAs<{ cost_amount: string }>(db, admin, "select cost_amount from v_stock_exits where variant_id = $1", [v]);
    expect(Number(ex[0].cost_amount)).toBe(8);
    const st = await selectAs<{ stock: number }>(db, admin, "select stock from v_variant_inventory where variant_id = $1", [v]);
    expect(st[0].stock).toBe(1);
  });

  it("un vendedor solo vende a su nombre y no ve costes ni compras", async () => {
    const p = await rpc<string>(db, admin, "create_product", { name: "Prueba vendedor" });
    const v = await variantOf(p);
    await createAndReceivePO(40, [{ variant_id: v, quantity: 5, unit_cost: 12 }]);
    const lot = await lotOf(v, 40);

    // No ve lotes, compras, proveedores, movimientos ni auditoría
    for (const t of ["inventory_lots", "purchase_orders", "purchase_order_items", "suppliers", "inventory_movements", "audit_log", "v_sale_lines", "v_variant_inventory"]) {
      const rows = await selectAs(db, seller, `select * from ${t}`);
      expect(rows.length, t).toBe(0);
    }

    // Ve los lotes disponibles para vender pero sin coste
    const lots = await selectAs<{ unit_cost: string | null; quantity_available: number }>(db, seller, "select * from get_available_lots($1)", [v]);
    expect(lots[0].quantity_available).toBe(5);
    expect(lots[0].unit_cost).toBeNull();

    // No puede vender a nombre de otro responsable
    await expect(
      rpc(db, seller, "create_sale", {
        responsible_id: respAdmin,
        platform_id: vinted,
        carrier_id: inpost,
        items: [{ variant_id: v, lot_id: lot, quantity: 1, unit_price: 30 }],
      }),
    ).rejects.toThrow(/a tu nombre/);

    // Sí puede registrar una venta propia
    const saleId = await rpc<string>(db, seller, "create_sale", {
      platform_id: vinted,
      carrier_id: inpost,
      items: [{ variant_id: v, lot_id: lot, quantity: 1, unit_price: 30 }],
    });
    const mine = await selectAs<{ id: string; shipping_status: string; responsible_id: string }>(db, seller, "select * from sales");
    expect(mine.map((s) => s.id)).toEqual([saleId]);
    expect(mine[0].responsible_id).toBe(respSeller);
    expect(mine[0].shipping_status).toBe("pendiente");

    // Puede marcarla como enviada, pero no cambiar el responsable
    await rpc(db, seller, "update_sale", { id: saleId, shipping_status: "enviado" });
    await expect(rpc(db, seller, "update_sale", { id: saleId, responsible_id: respAdmin })).rejects.toThrow(/permisos/);

    // No puede tocar inventario, compras ni costes
    await expect(rpc(db, seller, "create_stock_adjustment", { direction: "entrada", variant_id: v, quantity: 5, unit_cost: 1, reason: "x" })).rejects.toThrow(/permisos/);
    await expect(rpc(db, seller, "save_purchase_order", { supplier_id: supplier, order_date: "2026-01-01", items: [] })).rejects.toThrow(/permisos/);
    await expect(rpc(db, seller, "delete_product", p)).rejects.toThrow(/permisos/);
    await expect(
      asUser(db, seller, (q) => q("insert into inventory_movements (movement_type, variant_id, lot_id, quantity, occurred_at) values ('ajuste_entrada', $1, $2, 5, current_date)", [v, lot])),
    ).rejects.toThrow();
    await expect(asUser(db, seller, (q) => q("update products set name = 'hack' where id = $1", [p]))).resolves.toBeDefined();
    const name = await selectAs<{ name: string }>(db, admin, "select name from products where id = $1", [p]);
    expect(name[0].name).toBe("Prueba vendedor");
    // Y no puede ascenderse a administrador
    await asUser(db, seller, (q) => q("update profiles set role = 'admin' where id = $1", [seller]));
    const role = await db.client.query("select role from profiles where id = $1", [seller]);
    expect(role.rows[0].role).toBe("vendedor");
  });

  it("marcar varias ventas como enviadas o pendientes: todo o nada y con permisos", async () => {
    const p = await rpc<string>(db, admin, "create_product", { name: "Prueba envío masivo" });
    const v = await variantOf(p);
    await createAndReceivePO(41, [{ variant_id: v, quantity: 10, unit_cost: 5 }]);
    const lot = await lotOf(v, 41);
    const sale = (by: string, platform: string, resp?: string) =>
      rpc<string>(db, by, "create_sale", {
        ...(resp ? { responsible_id: resp } : {}),
        platform_id: platform,
        carrier_id: platform === enPersona ? null : inpost,
        items: [{ variant_id: v, lot_id: lot, quantity: 1, unit_price: 20 }],
      });
    const a1 = await sale(admin, vinted, respAdmin);
    const a2 = await sale(admin, vinted, respAdmin);
    const s1 = await sale(seller, vinted);
    const hand = await sale(admin, enPersona, respAdmin);
    const status = async (ids: string[]) =>
      (await selectAs<{ shipping_status: string }>(db, admin, "select shipping_status from sales where id = any($1::uuid[]) order by id", [ids])).map((r) => r.shipping_status);

    expect(await rpc<number>(db, admin, "set_sales_shipping_status", [a1, a2], "enviado")).toBe(2);
    expect(await status([a1, a2])).toEqual(["enviado", "enviado"]);
    await rpc(db, admin, "set_sales_shipping_status", [a1, a2], "pendiente");
    expect(await status([a1, a2])).toEqual(["pendiente", "pendiente"]);

    // Una venta sin envío en la selección: no se cambia ninguna
    await expect(rpc(db, admin, "set_sales_shipping_status", [a1, hand], "enviado")).rejects.toThrow(/no lleva envío/);
    expect(await status([a1])).toEqual(["pendiente"]);

    // El vendedor puede con las suyas, pero no con las de otro (y no cambia nada)
    await rpc(db, seller, "set_sales_shipping_status", [s1], "enviado");
    expect(await status([s1])).toEqual(["enviado"]);
    await expect(rpc(db, seller, "set_sales_shipping_status", [s1, a1], "pendiente")).rejects.toThrow(/tus propias ventas/);
    expect(await status([s1, a1].sort())).toEqual(s1 < a1 ? ["enviado", "pendiente"] : ["pendiente", "enviado"]);

    await expect(rpc(db, admin, "set_sales_shipping_status", [a1], "perdido")).rejects.toThrow(/no válido/);
    await expect(rpc(db, null, "set_sales_shipping_status", [a1], "enviado")).rejects.toThrow();
  });

  it("el buscador encuentra por palabras sueltas y en cualquier orden", async () => {
    const brand = (await selectAs<{ id: string }>(db, admin, "insert into brands (name) values ('Marcabusca') returning id"))[0].id;
    const p = await rpc<string>(db, admin, "create_product", { name: "Marcabusca - Modelazo", brand_id: brand, variants: [{ name: "Rojo" }] });
    const found = async (q: string) =>
      (await selectAs<{ product_id: string }>(db, seller, "select product_id from search_sellable_variants($1, false, 50)", [q])).some((r) => r.product_id === p);
    expect(await found("Marcabusca Modelazo")).toBe(true);
    expect(await found("modelazo marcabusca")).toBe(true);
    expect(await found("Modelazo rojo")).toBe(true);
    expect(await found("Modelazo azul")).toBe(false);
    expect(await found("  ")).toBe(true);
  });

  it("panel de negocio: cifras coherentes con las ventas y el stock, y solo para el administrador", async () => {
    type Dash = {
      current: { revenue: number; profit: number; cost: number };
      inventory: { units: number; stock_value: number };
      inventory_then: { units: number; stock_value: number } | null;
      prev_end: string;
      series: { month: string; revenue: number }[];
    };
    const d = await rpc<Dash>(db, admin, "business_dashboard", 6);
    const month = await selectAs<{ revenue: string; profit: string; cost: string }>(
      db,
      admin,
      "select coalesce(sum(net_amount),0) revenue, coalesce(sum(profit),0) profit, coalesce(sum(cost_amount),0) cost from v_sale_lines where sale_date >= date_trunc('month', current_date)",
    );
    expect(Number(d.current.revenue)).toBeCloseTo(Number(month[0].revenue), 2);
    expect(Number(d.current.profit)).toBeCloseTo(Number(month[0].profit), 2);
    expect(Number(d.current.revenue) - Number(d.current.cost)).toBeCloseTo(Number(d.current.profit), 2);
    expect(d.series).toHaveLength(6);
    // Stock reconstruido: lo de entonces = lo de ahora deshaciendo los movimientos posteriores
    const after = await selectAs<{ q: string }>(db, admin, "select coalesce(sum(quantity),0) q from inventory_movements where occurred_at > $1", [d.prev_end]);
    expect(d.inventory_then).not.toBeNull();
    expect(Number(d.inventory_then!.units)).toBe(Number(d.inventory.units) - Number(after[0].q));
    await expect(rpc(db, seller, "business_dashboard", 6)).rejects.toThrow(/permisos/);
  });

  it("sin sesión no se puede leer nada", async () => {
    await expect(selectAs(db, null, "select * from products")).rejects.toThrow(/permission denied/);
    await expect(rpc(db, null, "search_sellable_variants", "x")).rejects.toThrow();
  });

  it("recepción: cantidades reales, cancelación de líneas y sustituciones", async () => {
    const enc = await variantOf(await rpc<string>(db, admin, "create_product", { name: "Prueba recepción Encoder" }));
    const radar = await variantOf(await rpc<string>(db, admin, "create_product", { name: "Prueba recepción Radar" }));
    const plate = await variantOf(await rpc<string>(db, admin, "create_product", { name: "Prueba recepción Plate" }));
    const poId = await rpc<string>(db, admin, "save_purchase_order", {
      supplier_id: supplier,
      order_date: "2026-03-01",
      items: [
        { variant_id: enc, quantity: 10, unit_cost: 10 },
        { variant_id: radar, quantity: 10, unit_cost: 10 },
      ],
      costs: [{ cost_type: "transporte", amount: 40 }],
    });
    const items = await selectAs<{ id: string; variant_id: string }>(db, admin, "select id, variant_id from purchase_order_items where purchase_order_id = $1 order by line_number", [poId]);
    await rpc(db, admin, "receive_purchase_order", {
      purchase_order_id: poId,
      lines: [
        { item_id: items[0].id, quantity_received: 10 },
        { item_id: items[1].id, quantity_received: 0, substitute_variant_id: plate, substitute_quantity: 10 },
      ],
    });
    const po = await selectAs<{ status: string }>(db, admin, "select status from purchase_orders where id = $1", [poId]);
    expect(po[0].status).toBe("recibido");
    const st = await selectAs<{ variant_id: string; stock: number; weighted_avg_cost: string }>(
      db,
      admin,
      "select variant_id, stock, weighted_avg_cost from v_variant_inventory where variant_id = any($1)",
      [[enc, radar, plate]],
    );
    const byV = Object.fromEntries(st.map((s) => [s.variant_id, s]));
    expect(byV[enc].stock).toBe(10);
    expect(byV[radar].stock).toBe(0);
    expect(byV[plate].stock).toBe(10);
    // 40 € de transporte repartidos entre 200 € de mercancía recibida → 12 €/u
    expect(Number(byV[plate].weighted_avg_cost)).toBe(12);
    const radarLine = await selectAs<{ status: string }>(db, admin, "select status from purchase_order_items where id = $1", [items[1].id]);
    expect(radarLine[0].status).toBe("cancelado");
    const audit = await selectAs<{ summary: string }>(db, admin, "select summary from audit_log where action = 'sustitucion_compra'");
    expect(audit[0].summary).toMatch(/Radar.*Plate/);
  });

  it("devoluciones: con producto vuelve al stock; sin producto es pérdida", async () => {
    const v = await variantOf(await rpc<string>(db, admin, "create_product", { name: "Prueba devolución" }));
    await createAndReceivePO(50, [{ variant_id: v, quantity: 2, unit_cost: 10 }]);
    const lot = await lotOf(v, 50);
    const s1 = await rpc<string>(db, admin, "create_sale", { responsible_id: respAdmin, platform_id: vinted, items: [{ variant_id: v, lot_id: lot, quantity: 1, unit_price: 90 }] });
    const s2 = await rpc<string>(db, admin, "create_sale", { responsible_id: respAdmin, platform_id: vinted, items: [{ variant_id: v, lot_id: lot, quantity: 1, unit_price: 90 }] });
    const si1 = (await selectAs<{ id: string }>(db, admin, "select id from sale_items where sale_id = $1", [s1]))[0].id;
    const si2 = (await selectAs<{ id: string }>(db, admin, "select id from sale_items where sale_id = $1", [s2]))[0].id;

    await rpc(db, admin, "create_return", { sale_id: s1, return_type: "devolucion_producto", reason: "No le gustó", items: [{ sale_item_id: si1, quantity: 1, refund_amount: 90 }] });
    await rpc(db, admin, "create_return", { sale_id: s2, return_type: "reembolso_sin_producto", reason: "Reclamación", items: [{ sale_item_id: si2, quantity: 1, refund_amount: 90 }] });

    const lines = await selectAs<{ sale_id: string; net_amount: string; profit: string; net_quantity: number }>(
      db,
      admin,
      "select sale_id, net_amount, profit, net_quantity from v_sale_lines where variant_id = $1",
      [v],
    );
    const l1 = lines.find((l) => l.sale_id === s1)!;
    const l2 = lines.find((l) => l.sale_id === s2)!;
    expect(Number(l1.net_amount)).toBe(0);
    expect(Number(l1.profit)).toBe(0);
    expect(Number(l2.net_amount)).toBe(0);
    expect(Number(l2.profit)).toBe(-10); // se pierde el coste del producto
    const st = await selectAs<{ stock: number }>(db, admin, "select stock from v_variant_inventory where variant_id = $1", [v]);
    expect(st[0].stock).toBe(1);

    await expect(
      rpc(db, admin, "create_return", { sale_id: s1, return_type: "devolucion_producto", items: [{ sale_item_id: si1, quantity: 1, refund_amount: 0 }] }),
    ).rejects.toThrow(/más unidades de las vendidas/);
  });

  it("anular una venta devuelve las unidades a su lote", async () => {
    const v = await variantOf(await rpc<string>(db, admin, "create_product", { name: "Prueba anulación" }));
    await createAndReceivePO(60, [{ variant_id: v, quantity: 3, unit_cost: 10 }]);
    const lot = await lotOf(v, 60);
    const s = await rpc<string>(db, admin, "create_sale", { responsible_id: respAdmin, platform_id: enPersona, items: [{ variant_id: v, lot_id: lot, quantity: 2, unit_price: 30 }] });
    await rpc(db, admin, "void_sale", s, "Error al registrar");
    const st = await selectAs<{ quantity_available: number }>(db, admin, "select quantity_available from inventory_lots where id = $1", [lot]);
    expect(st[0].quantity_available).toBe(3);
    const sale = await selectAs<{ status: string }>(db, admin, "select status from sales where id = $1", [s]);
    expect(sale[0].status).toBe("anulada");
  });

  it("los movimientos de stock no se pueden modificar ni borrar", async () => {
    await expect(db.client.query("update inventory_movements set quantity = 999")).rejects.toThrow(/no se pueden modificar/);
    await expect(db.client.query("delete from inventory_movements")).rejects.toThrow(/no se pueden modificar/);
  });

  it("filtros de fechas del informe de responsables", async () => {
    const all = await rpc<unknown>(db, admin, "report_sales_summary", {});
    const until = await rpc<{ orders: number }>(db, admin, "report_sales_summary", { to: "2026-02-01" });
    const from = await rpc<{ orders: number }>(db, admin, "report_sales_summary", { from: "2026-02-02" });
    expect((all as { orders: number }).orders).toBeGreaterThan(until.orders);
    expect(until.orders).toBeGreaterThanOrEqual(1);
    expect(from.orders).toBeGreaterThanOrEqual(1);
    const po1 = await rpc<{ orders: number }>(db, admin, "report_sales_summary", { purchase_order_number: 1 });
    expect(po1.orders).toBe(1);
    const resp = await selectAs<{ responsible_name: string; orders: number; ranking: number }>(db, admin, "select * from report_responsibles($1)", [{}]);
    expect(resp.length).toBe(2);
    expect(resp[0].ranking).toBe(1);
  });

  it("reparto 50/50 entre socios", async () => {
    const r = await rpc<{ total: number; share: number; partners: { name: string; balance: number; collected: number }[] }>(db, admin, "report_partner_settlement", {});
    expect(r.partners.length).toBe(2);
    expect(Number(r.share)).toBeCloseTo(Number(r.total) / 2, 2);
    const sumBalances = r.partners.reduce((a, p) => a + Number(p.balance), 0);
    expect(sumBalances).toBeCloseTo(0, 1);
  });

  it("la comprobación de integridad no encuentra problemas", async () => {
    const rows = await selectAs<{ check_name: string; ok: boolean }>(db, admin, "select * from check_integrity()");
    const failing = rows.filter((r) => !r.ok && !r.check_name.startsWith("Pedidos recibidos con proveedor"));
    expect(failing).toEqual([]);
  });

  it("etiquetas de envío: cada vendedor solo accede a las de sus ventas", async () => {
    const v = await variantOf(await rpc<string>(db, admin, "create_product", { name: "Prueba etiqueta" }));
    await createAndReceivePO(70, [{ variant_id: v, quantity: 2, unit_cost: 10 }]);
    const lot = await lotOf(v, 70);
    const own = await rpc<string>(db, seller, "create_sale", { platform_id: vinted, items: [{ variant_id: v, lot_id: lot, quantity: 1, unit_price: 20 }] });
    const other = await rpc<string>(db, admin, "create_sale", { responsible_id: respAdmin, platform_id: vinted, items: [{ variant_id: v, lot_id: lot, quantity: 1, unit_price: 20 }] });
    await asUser(db, seller, (q) => q("insert into storage.objects (bucket_id, name) values ('shipping-labels', $1)", [`${own}/etiqueta.pdf`]));
    await expect(
      asUser(db, seller, (q) => q("insert into storage.objects (bucket_id, name) values ('shipping-labels', $1)", [`${other}/etiqueta.pdf`])),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(db, seller, (q) => q("insert into storage.objects (bucket_id, name) values ('product-photos', 'x.png')")),
    ).rejects.toThrow(/row-level security/);
  });

  it("un alta que no viene del administrador entra desactivada y no ve nada", async () => {
    const intruso = await createUser(db, "desconocido@prueba.local");
    const prof = await db.client.query("select role, active from profiles where id = $1", [intruso]);
    expect(prof.rows[0]).toEqual({ role: "vendedor", active: false });
    expect(await selectAs(db, intruso, "select * from products")).toEqual([]);
    await expect(rpc(db, intruso, "search_sellable_variants", "a")).rejects.toThrow(/no está activo/);
    const creadoPorAdmin = await createUser(db, "nuevo@prueba.local", "vendedor");
    const p2 = await db.client.query("select active from profiles where id = $1", [creadoPorAdmin]);
    expect(p2.rows[0].active).toBe(true);
  });

  it("nadie puede escribir en la auditoría directamente", async () => {
    await expect(rpc(db, seller, "log_action", "x", "y", "z", "falso", null)).rejects.toThrow(/permission denied/);
    await expect(asUser(db, admin, (q) => q("insert into audit_log (action, entity) values ('x','y')"))).rejects.toThrow();
  });

  it("no se puede quitar el último administrador", async () => {
    await expect(asUser(db, admin, (q) => q("update profiles set role = 'vendedor' where id = $1", [admin]))).rejects.toThrow(/al menos un administrador/);
  });
});

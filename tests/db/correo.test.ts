/**
 * Ventas por correo: funciones de la base de datos (idempotencia, stock,
 * etiquetas y permisos) contra un PostgreSQL real. Datos solo de prueba.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, TestDb, asService, createTestDatabase, createUser, rpc, selectAs } from "./helpers";

const run = TEST_DATABASE_URL ? describe : describe.skip;

run("Ventas automáticas por correo", () => {
  let db: TestDb;
  let admin: string;
  let seller: string;
  let respA: string;
  let respB: string;
  let mobile: string;
  let enPersona: string;
  let variant: string;
  let variant2: string;
  let lotOld: string;
  let lotNew: string;
  let n = 0;
  let org: string;

  const svc = <T>(sql: string, params: unknown[] = []) => asService(db, async (q) => (await q(sql, params)).rows as T[]);

  /** Inserta un correo ya leído (como haría la sincronización). */
  async function email(kind: string, parsed: Record<string, unknown>, platform = kind.startsWith("vinted") ? "vinted" : "wallapop") {
    n++;
    const r = await db.client.query(
      "insert into email_messages (organization_id, gmail_message_id, received_at, platform, kind, parsed) values ($5, $1, '2026-10-05T10:00:00Z', $2, $3, $4) returning id",
      [`gm-${n}-${Date.now()}`, platform, kind, parsed, org],
    );
    return r.rows[0].id as string;
  }

  const counts = async () => {
    const r = await db.client.query(
      "select (select count(*) from sales)::int sales, (select count(*) from inventory_movements where movement_type = 'venta')::int moves, (select coalesce(sum(quantity_available),0) from inventory_lots)::int stock",
    );
    return r.rows[0] as { sales: number; moves: number; stock: number };
  };

  beforeAll(async () => {
    db = await createTestDatabase();
    admin = await createUser(db, "admin@prueba.local");
    seller = await createUser(db, "vendedor@prueba.local", "vendedor");
    org = (await db.client.query("select id from organizations where name = 'Prueba'")).rows[0].id;
    respA = (await selectAs<{ id: string }>(db, admin, "insert into responsibles (name, profile_id, is_partner) values ('Resp A', $1, true) returning id", [admin]))[0].id;
    respB = (await selectAs<{ id: string }>(db, admin, "insert into responsibles (name, profile_id, is_partner) values ('Resp B', $1, true) returning id", [seller]))[0].id;
    mobile = (await selectAs<{ id: string }>(db, admin, "select id from mobile_devices where number = 3"))[0].id;
    enPersona = (await selectAs<{ id: string }>(db, admin, "select id from platforms where name = 'En persona'"))[0].id;
    const supplier = (await selectAs<{ id: string }>(db, admin, "insert into suppliers (name) values ('Prov') returning id"))[0].id;
    const p = await rpc<string>(db, admin, "create_product", { name: "Oakley - Encoder", variants: [{ name: "Rosas" }, { name: "Negras" }] });
    const vs = await selectAs<{ id: string; name: string }>(db, admin, "select id, name from product_variants where product_id = $1 order by name", [p]);
    variant = vs.find((v) => v.name === "Rosas")!.id;
    variant2 = vs.find((v) => v.name === "Negras")!.id;
    // Dos pedidos: el antiguo (1 ud.) y el nuevo (20 uds.)
    for (const [num, date, qty] of [
      [1, "2026-01-10", 1],
      [2, "2026-03-10", 20],
    ] as const) {
      const po = await rpc<string>(db, admin, "save_purchase_order", {
        order_number: num,
        supplier_id: supplier,
        order_date: date,
        items: [{ variant_id: variant, quantity: qty, unit_cost: num === 1 ? 10 : 12 }],
      });
      const items = await selectAs<{ id: string; quantity_ordered: number }>(db, admin, "select id, quantity_ordered from purchase_order_items where purchase_order_id = $1", [po]);
      await rpc(db, admin, "receive_purchase_order", {
        purchase_order_id: po,
        received_at: date,
        lines: items.map((i) => ({ item_id: i.id, quantity_received: i.quantity_ordered })),
      });
    }
    const lots = await selectAs<{ id: string; received_at: string }>(db, admin, "select id, received_at::text from inventory_lots where variant_id = $1 order by received_at", [variant]);
    lotOld = lots[0].id;
    lotNew = lots[1].id;
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it("sin administrador asociado a Gmail, el proceso automático no hace nada", async () => {
    const e = await email("vinted_venta", { price: 45, buyer: "comprador1", product: "Oakley Encoder Rosas", account: "mauri", account_norm: "mauri" });
    await expect(asService(db, (q) => q("select email_register_sale($1, $2)", [e, variant]))).rejects.toThrow(/administrador activo/);
    await db.client.query("update email_integration set acting_profile_id = $1", [admin]);
    // Sin responsable por defecto ni cuenta asignada → pide responsable
    await expect(asService(db, (q) => q("select email_register_sale($1, $2)", [e, variant]))).rejects.toThrow(/Falta el responsable/);
    await db.client.query("update email_messages set status = 'revision' where id = $1", [e]);
  });

  it("Vinted: crea la venta (lote más antiguo, envío pendiente, sin etiqueta) y procesarla dos veces no duplica nada", async () => {
    await rpc(db, admin, "email_set_default_responsible", respA);
    const before = await counts();
    const e = await email("vinted_venta", { price: 45.5, buyer: "comprador_vinted", product: "Oakley Encoder Rosas", account: "Mauri", account_norm: "mauri" });
    const id1 = (await svc<{ r: string }>("select email_register_sale($1, $2) r", [e, variant]))[0].r;
    const id2 = (await svc<{ r: string }>("select email_register_sale($1, $2) r", [e, variant]))[0].r;
    expect(id2).toBe(id1);
    const after = await counts();
    expect(after.sales - before.sales).toBe(1);
    expect(after.moves - before.moves).toBe(1);
    expect(before.stock - after.stock).toBe(1);
    const sale = (
      await db.client.query(
        "select s.source, s.buyer_name, s.shipping_status, s.shipping_label_path, s.responsible_id, s.created_by, si.lot_id, si.unit_price, p.name platform from sales s join sale_items si on si.sale_id = s.id join platforms p on p.id = s.platform_id where s.id = $1",
        [id1],
      )
    ).rows[0];
    expect(sale).toMatchObject({ source: "correo", buyer_name: "comprador_vinted", shipping_status: "pendiente", shipping_label_path: null, responsible_id: respA, created_by: admin, lot_id: lotOld, platform: "Vinted" });
    expect(Number(sale.unit_price)).toBe(45.5);
    const em = (await db.client.query("select status, sale_id from email_messages where id = $1", [e])).rows[0];
    expect(em).toMatchObject({ status: "procesado", sale_id: id1 });
    // La venta aparece en el informe de ventas (mismo beneficio que una manual)
    const line = await selectAs<{ profit: string }>(db, admin, "select profit from v_sale_lines where sale_id = $1", [id1]);
    expect(Number(line[0].profit)).toBeCloseTo(45.5 - 10, 2);
  });

  it("Wallapop: la cuenta del correo decide responsable y móvil; un reintento no duplica", async () => {
    await db.client.query("insert into email_accounts (organization_id, platform, handle, handle_norm, responsible_id, mobile_device_id) values ($3, 'wallapop', 'Fran', 'fran', $1, $2)", [respB, mobile, org]);
    const before = await counts();
    const e = await email("wallapop_venta", { price: 55, total: 55, buyer: "Lucía", product: "Oakley Encoder Rosas", account: "Fran", account_norm: "fran", sale_date: "2026-10-04" });
    const [a, b] = await Promise.all([
      svc<{ r: string }>("select email_register_sale($1, $2) r", [e, variant]).catch((x) => x),
      Promise.resolve(null),
    ]);
    const id = (a as { r: string }[])[0].r;
    await svc("select email_register_sale($1, $2)", [e, variant]);
    expect(b).toBeNull();
    const after = await counts();
    expect(after.sales - before.sales).toBe(1);
    const s = (await db.client.query("select responsible_id, mobile_device_id, sale_date::text, buyer_name from sales where id = $1", [id])).rows[0];
    expect(s).toMatchObject({ responsible_id: respB, mobile_device_id: mobile, sale_date: "2026-10-04", buyer_name: "Lucía" });
  });

  it("no crea venta sin precio válido, sin stock o con correos que no son ventas", async () => {
    const zero = await email("wallapop_venta", { price: 0, product: "x", account_norm: "fran" });
    await expect(svc("select email_register_sale($1, $2)", [zero, variant])).rejects.toThrow(/precio válido/);
    const noStock = await email("vinted_venta", { price: 30, product: "Oakley Encoder Negras", account_norm: "mauri" });
    await expect(svc("select email_register_sale($1, $2)", [noStock, variant2])).rejects.toThrow(/No hay stock/);
    const aviso = await email("wallapop_aviso", { product: "x" });
    await expect(svc("select email_register_sale($1, $2)", [aviso, variant])).rejects.toThrow(/no es una venta/);
    const s = (await db.client.query("select count(*)::int c from sales where source_email_id in ($1, $2, $3)", [zero, noStock, aviso])).rows[0];
    expect(s.c).toBe(0);
  });

  it("la base de datos impide dos ventas con el mismo correo", async () => {
    const e = await email("vinted_venta", { price: 20, account_norm: "mauri" });
    const id = (await svc<{ r: string }>("select email_register_sale($1, $2) r", [e, variant]))[0].r;
    await expect(db.client.query("update sales set source_email_id = $1 where id <> $2 and id = (select id from sales where id <> $2 limit 1)", [e, id])).rejects.toThrow();
  });

  it("etiqueta de Vinted: se vincula a la venta existente, es idempotente y no se pone en otra venta", async () => {
    const e = await email("vinted_venta", { price: 40, buyer: "b", account_norm: "mauri" });
    const sale = (await svc<{ r: string }>("select email_register_sale($1, $2) r", [e, variant]))[0].r;
    const label = await email("vinted_etiqueta", { product: "Oakley Encoder Rosas", tracking: "TRK1" });
    const before = await counts();
    const path = `${sale}/vinted-x.pdf`;
    const meta = { tracking_number: "TRK1", transaction_id: "TX9", deadline: "2026-10-10T20:00:00+02:00" };
    await svc("select email_attach_label($1, $2, $3, $4)", [label, sale, path, meta]);
    await svc("select email_attach_label($1, $2, $3, $4)", [label, sale, path, meta]);
    const after = await counts();
    expect(after).toEqual(before); // la etiqueta no crea ventas ni mueve stock
    const s = (await db.client.query("select shipping_label_path, tracking_number, platform_transaction_id from sales where id = $1", [sale])).rows[0];
    expect(s).toMatchObject({ shipping_label_path: path, tracking_number: "TRK1", platform_transaction_id: "TX9" });
    // La misma etiqueta no puede ir a otra venta
    const other = await email("vinted_venta", { price: 41, account_norm: "mauri" });
    const sale2 = (await svc<{ r: string }>("select email_register_sale($1, $2) r", [other, variant]))[0].r;
    await expect(svc("select email_attach_label($1, $2, $3, $4)", [label, sale2, `${sale2}/x.pdf`, meta])).rejects.toThrow(/otra venta/);
    // Una segunda etiqueta para la misma venta tampoco
    const label2 = await email("vinted_etiqueta", { product: "Oakley Encoder Rosas" });
    await expect(svc("select email_attach_label($1, $2, $3, $4)", [label2, sale, `${sale}/y.pdf`, {}])).rejects.toThrow(/ya tiene la etiqueta/);
    // La ruta debe ser de esa venta
    await expect(svc("select email_attach_label($1, $2, $3, $4)", [label2, sale2, `${sale}/z.pdf`, {}])).rejects.toThrow(/no corresponde/);
  });

  it("no pisa una etiqueta subida a mano salvo que el administrador lo confirme", async () => {
    const e = await email("vinted_venta", { price: 33, account_norm: "mauri" });
    const sale = (await svc<{ r: string }>("select email_register_sale($1, $2) r", [e, variant]))[0].r;
    await db.client.query("update sales set shipping_label_path = $1 where id = $2", [`${sale}/manual.pdf`, sale]);
    const label = await email("vinted_etiqueta", { product: "x" });
    await expect(svc("select email_attach_label($1, $2, $3, $4)", [label, sale, `${sale}/auto.pdf`, {}])).rejects.toThrow(/a mano/);
    await rpc(db, admin, "email_attach_label", label, sale, `${sale}/auto.pdf`, { force: true });
    const r = (await db.client.query("select resolved_by from email_messages where id = $1", [label])).rows[0];
    expect(r.resolved_by).toBe(admin);
  });

  it("una venta en mano no admite etiqueta", async () => {
    const lot = lotNew;
    const sale = await rpc<string>(db, admin, "create_sale", { responsible_id: respA, platform_id: enPersona, items: [{ variant_id: variant, lot_id: lot, quantity: 1, unit_price: 50 }] });
    const label = await email("vinted_etiqueta", { product: "x" });
    await expect(svc("select email_attach_label($1, $2, $3, $4)", [label, sale, `${sale}/a.pdf`, {}])).rejects.toThrow(/no lleva envío/);
  });

  it("permisos: el vendedor no puede usar estas funciones ni ver los correos", async () => {
    const e = await email("vinted_venta", { price: 10, account_norm: "mauri" });
    await expect(rpc(db, seller, "email_register_sale", e, variant)).rejects.toThrow(/permisos/);
    await expect(rpc(db, seller, "email_integration_status")).rejects.toThrow(/permisos/);
    await expect(rpc(db, seller, "email_set_status", e, "ignorado")).rejects.toThrow(/permisos/);
    expect(await selectAs(db, seller, "select * from email_messages")).toHaveLength(0);
    // El permiso de Gmail no se puede leer desde la API ni siendo administrador
    await expect(selectAs(db, admin, "select refresh_token_enc from email_integration")).rejects.toThrow();
    const st = await rpc<Record<string, unknown>>(db, admin, "email_integration_status");
    expect(st).not.toHaveProperty("refresh_token_enc");
    expect(st).not.toHaveProperty("cron_token");
  });

  it("el administrador resuelve a mano eligiendo el producto y puede recordar el nombre", async () => {
    const e = await email("vinted_venta", { price: 25, product: "Encoder rosadas", account_norm: "mauri" });
    await db.client.query("update email_messages set status = 'revision', review_reason = 'Producto no identificado' where id = $1", [e]);
    const id = await rpc<string>(db, admin, "email_register_sale", e, variant, "Encoder rosadas", "encoder rosadas");
    expect(id).toBeTruthy();
    const alias = await selectAs<{ variant_id: string }>(db, admin, "select variant_id from product_aliases where alias_norm = 'encoder rosadas'");
    expect(alias[0].variant_id).toBe(variant);
    const em = (await db.client.query("select status, resolved_by from email_messages where id = $1", [e])).rows[0];
    expect(em).toMatchObject({ status: "procesado", resolved_by: admin });
  });

  it("descartar y reintentar un correo; uno procesado no se puede tocar", async () => {
    const e = await email("vinted_venta", { price: 25, account_norm: "mauri" });
    await rpc(db, admin, "email_set_status", e, "ignorado");
    await rpc(db, admin, "email_set_status", e, "pendiente");
    await svc("select email_register_sale($1, $2)", [e, variant]);
    await expect(rpc(db, admin, "email_set_status", e, "ignorado")).rejects.toThrow(/ya está procesado/);
  });

  it("venta detectada: el administrador puede corregir el precio al confirmar; el proceso automático no", async () => {
    const e = await email("wallapop_venta", { price: 61, product: "x", account_norm: "mauri" });
    await expect(svc("select email_register_sale($1, $2, null, null, 55)", [e, variant])).rejects.toThrow(/Solo el administrador/);
    const id = await rpc<string>(db, admin, "email_register_sale", e, variant, null, null, 55);
    const price = (await db.client.query("select unit_price from sale_items where sale_id = $1", [id])).rows[0].unit_price;
    expect(Number(price)).toBe(55);
  });

  it("marcar como duplicado: no crea venta ni mueve stock, une el correo a la venta y se puede deshacer", async () => {
    const manual = await rpc<string>(db, admin, "create_sale", {
      responsible_id: respA,
      platform_id: (await selectAs<{ id: string }>(db, admin, "select id from platforms where name = 'Vinted'"))[0].id,
      items: [{ variant_id: variant, lot_id: lotNew, quantity: 1, unit_price: 40 }],
    });
    const e = await email("vinted_venta", { price: 40, product: "Oakley", buyer: "dup_buyer", account_norm: "mauri" });
    const before = await counts();
    await rpc(db, admin, "email_mark_duplicate", e, manual);
    await rpc(db, admin, "email_mark_duplicate", e, manual); // dos veces: igual
    expect(await counts()).toEqual(before);
    const em = (await db.client.query("select status, sale_id from email_messages where id = $1", [e])).rows[0];
    expect(em).toMatchObject({ status: "duplicado", sale_id: manual });
    expect((await db.client.query("select buyer_name from sales where id = $1", [manual])).rows[0].buyer_name).toBe("dup_buyer");
    // Confirmarla después devuelve la venta ya apuntada, sin crear otra
    expect(await rpc<string>(db, admin, "email_register_sale", e, variant)).toBe(manual);
    expect(await counts()).toEqual(before);
    // Otro correo no puede unirse a la misma venta; una de otra plataforma tampoco
    const e2 = await email("vinted_venta", { price: 40, account_norm: "mauri" });
    await expect(rpc(db, admin, "email_mark_duplicate", e2, manual)).rejects.toThrow(/otro correo/);
    const w = await email("wallapop_venta", { price: 40, account_norm: "mauri" });
    await expect(rpc(db, admin, "email_mark_duplicate", w, manual)).rejects.toThrow(/otra plataforma/);
    // Deshacer: vuelve a la cola sin venta unida
    await rpc(db, admin, "email_set_status", e, "pendiente");
    expect((await db.client.query("select status, sale_id from email_messages where id = $1", [e])).rows[0]).toMatchObject({ status: "pendiente", sale_id: null });
    await expect(rpc(db, seller, "email_mark_duplicate", e, manual)).rejects.toThrow(/permisos/);
  });

  it("bloqueo de sincronización: dos procesos a la vez no se pisan", async () => {
    const a = await svc<{ r: boolean }>("select email_sync_try_lock($1, 60) r", [org]);
    const b = await svc<{ r: boolean }>("select email_sync_try_lock($1, 60) r", [org]);
    expect(a[0].r).toBe(true);
    expect(b[0]?.r ?? null).toBeNull();
    await svc("select email_sync_unlock($1)", [org]);
    expect((await svc<{ r: boolean }>("select email_sync_try_lock($1, 60) r", [org]))[0].r).toBe(true);
    await svc("select email_sync_unlock($1)", [org]);
    await expect(rpc(db, admin, "email_sync_try_lock", org, 60)).rejects.toThrow();
  });
});

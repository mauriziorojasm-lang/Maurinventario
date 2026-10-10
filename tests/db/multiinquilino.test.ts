/**
 * Varias organizaciones (SaaS): aislamiento entre clientes, roles,
 * invitaciones, suscripción, panel de plataforma y migración de los datos
 * existentes. Dos organizaciones de prueba independientes; datos ficticios.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, TestDb, applyMigration, asService, asUser, createTestDatabase, createUser, rpc, selectAs } from "./helpers";

const run = TEST_DATABASE_URL ? describe : describe.skip;
const MIGRATION = "20261012090000_multiinquilino.sql";

run("Varias organizaciones", () => {
  let db: TestDb;
  // Organización A (la «víctima») y B (el «curioso»)
  let adminA: string, sellerA: string, warehouseA: string, adminB: string, sellerB: string;
  let orgA: string, orgB: string;
  let productA: string, variantA: string, lotA: string, saleA: string, respA: string, platformA: string;
  let platformB: string, respB: string;

  const one = async <T>(user: string, sql: string, params: unknown[] = []) => (await selectAs<T>(db, user, sql, params))[0];

  beforeAll(async () => {
    db = await createTestDatabase();
    adminA = await createUser(db, "admin-a@prueba.local", undefined, "Tienda A");
    sellerA = await createUser(db, "vende-a@prueba.local", "vendedor", "Tienda A");
    warehouseA = await createUser(db, "almacen-a@prueba.local", "almacen", "Tienda A");
    adminB = await createUser(db, "admin-b@prueba.local", undefined, "Tienda B");
    sellerB = await createUser(db, "vende-b@prueba.local", "vendedor", "Tienda B");
    orgA = (await db.client.query("select id from organizations where name = 'Tienda A'")).rows[0].id;
    orgB = (await db.client.query("select id from organizations where name = 'Tienda B'")).rows[0].id;

    respA = (await one<{ id: string }>(adminA, "insert into responsibles (name, profile_id, is_partner) values ('Ana', $1, true) returning id", [adminA])).id;
    await selectAs(db, adminA, "insert into responsibles (name, profile_id) values ('Sergio', $1)", [sellerA]);
    respB = (await one<{ id: string }>(adminB, "insert into responsibles (name, profile_id, is_partner) values ('Berta', $1, true) returning id", [adminB])).id;
    await selectAs(db, adminB, "insert into responsibles (name, profile_id) values ('Bruno', $1)", [sellerB]);
    platformA = (await one<{ id: string }>(adminA, "select id from platforms where name = 'Vinted'")).id;
    platformB = (await one<{ id: string }>(adminB, "select id from platforms where name = 'Vinted'")).id;

    const supplier = (await one<{ id: string }>(adminA, "insert into suppliers (name) values ('Prov A') returning id")).id;
    productA = await rpc<string>(db, adminA, "create_product", { name: "Secreto de A", sku: "SKU-1", variants: [{ name: "Única" }] });
    variantA = (await one<{ id: string }>(adminA, "select id from product_variants where product_id = $1", [productA])).id;
    const po = await rpc<string>(db, adminA, "save_purchase_order", { supplier_id: supplier, order_date: "2026-09-01", items: [{ variant_id: variantA, quantity: 5, unit_cost: 10 }] });
    const items = await selectAs<{ id: string }>(db, adminA, "select id from purchase_order_items where purchase_order_id = $1", [po]);
    await rpc(db, adminA, "receive_purchase_order", { purchase_order_id: po, received_at: "2026-09-01", lines: [{ item_id: items[0].id, quantity_received: 5 }] });
    lotA = (await one<{ id: string }>(adminA, "select id from inventory_lots where variant_id = $1", [variantA])).id;
    saleA = await rpc<string>(db, adminA, "create_sale", { responsible_id: respA, platform_id: platformA, items: [{ variant_id: variantA, lot_id: lotA, quantity: 1, unit_price: 50 }] });
  }, 90_000);

  afterAll(async () => {
    await db?.close();
  });

  // ------------------------------------------------------------------
  it("1. un cliente no puede leer nada de otro (tablas, vistas, informes y panel)", async () => {
    for (const t of ["products", "product_variants", "inventory_lots", "inventory_movements", "sales", "sale_items", "purchase_orders", "suppliers", "responsibles", "audit_log", "v_sale_lines", "v_product_inventory", "v_lots"]) {
      const rows = await selectAs<{ n: string }>(db, adminB, `select count(*)::text n from ${t} where ${t.startsWith("v_") ? "true" : "organization_id <> $1"}`, t.startsWith("v_") ? [] : [orgB]);
      if (t.startsWith("v_")) continue;
      expect(rows[0].n, `${t} visible desde B`).toBe("0");
    }
    expect(await selectAs(db, adminB, "select * from v_sale_lines")).toEqual([]);
    expect(await selectAs(db, adminB, "select * from products where id = $1", [productA])).toEqual([]);
    const sum = await rpc<{ orders: number }>(db, adminB, "report_sales_summary", {});
    expect(Number(sum.orders)).toBe(0);
    const w = await rpc<{ current: { revenue: number } }>(db, adminB, "dashboard_widgets", "anio", null);
    expect(Number(w.current.revenue)).toBe(0);
    expect(await selectAs(db, adminB, "select * from search_sellable_variants($1, false, 50, null)", ["Secreto"])).toEqual([]);
    expect(await selectAs(db, adminB, "select * from get_available_lots($1)", [variantA])).toEqual([]);
    // El vendedor de B tampoco
    expect(await selectAs(db, sellerB, "select * from sales")).toEqual([]);
  });

  it("2. no puede modificar ni borrar lo de otro, ni con sus identificadores", async () => {
    expect(await selectAs(db, adminB, "update products set name = 'hackeado' where id = $1 returning id", [productA])).toEqual([]);
    expect(await selectAs(db, adminB, "delete from listings where product_id = $1 returning id", [productA])).toEqual([]);
    await expect(rpc(db, adminB, "update_product", { id: productA, name: "hackeado" })).rejects.toThrow();
    await expect(rpc(db, adminB, "delete_product", productA)).rejects.toThrow();
    await expect(rpc(db, adminB, "void_sale", saleA, "porque sí")).rejects.toThrow(/no existe/);
    await expect(rpc(db, adminB, "update_sale", { id: saleA, notes: "x" })).rejects.toThrow(/no existe/);
    await expect(rpc(db, adminB, "set_sales_shipping_status", [saleA], "enviado")).rejects.toThrow();
    // Vender con el lote de A desde B
    await expect(
      rpc(db, adminB, "create_sale", { responsible_id: respB, platform_id: platformB, items: [{ variant_id: variantA, lot_id: lotA, quantity: 1, unit_price: 10 }] }),
    ).rejects.toThrow();
    // Usar la plataforma o el responsable de A
    await expect(rpc(db, adminB, "create_sale", { responsible_id: respA, platform_id: platformA, items: [] })).rejects.toThrow();
    const a = await one<{ name: string; stock: number }>(adminA, "select p.name, (select quantity_available from inventory_lots where id = $2) stock from products p where p.id = $1", [productA, lotA]);
    expect(a).toEqual({ name: "Secreto de A", stock: 4 });
    expect((await one<{ status: string }>(adminA, "select status from sales where id = $1", [saleA])).status).toBe("activa");
  });

  it("3. manipular organization_id no sirve: ni al crear, ni al mover filas, ni cambiando de espacio", async () => {
    await expect(selectAs(db, adminB, "insert into brands (organization_id, name) values ($1, 'Intrusa')", [orgA])).rejects.toThrow(/row-level security/);
    await selectAs(db, adminB, "insert into brands (name) values ('Propia de B')");
    await expect(selectAs(db, adminB, "update brands set organization_id = $1", [orgA])).rejects.toThrow(/row-level security/);
    await expect(rpc(db, adminB, "set_active_org", orgA)).rejects.toThrow(/No perteneces/);
    // Las referencias exigen la misma organización (aunque se salte la API)
    await expect(
      db.client.query("insert into sale_items (organization_id, sale_id, line_number, variant_id, lot_id, quantity, unit_price) values ($1, $2, 9, $3, $4, 1, 1)", [orgB, saleA, variantA, lotA]),
    ).rejects.toThrow(/foreign key/);
    // Nombres y numeración por organización: B puede usar el mismo nombre y su primera venta es V-000001
    await rpc(db, adminB, "create_product", { name: "Secreto de A", sku: "SKU-1", variants: [{ name: "Única" }] });
    expect((await one<{ sale_number: string }>(adminA, "select sale_number from sales where id = $1", [saleA])).sale_number).toBe("V-000001");
  });

  it("4. archivos: cada cliente solo accede a los suyos", async () => {
    await db.client.query("insert into storage.objects (bucket_id, name) values ('product-photos', $1), ('shipping-labels', $2)", [`${productA}/foto.jpg`, `${saleA}/etiqueta.pdf`]);
    expect(await selectAs(db, adminA, "select name from storage.objects order by name")).toHaveLength(2);
    expect(await selectAs(db, adminB, "select name from storage.objects")).toEqual([]);
    await expect(asUser(db, adminB, (q) => q("insert into storage.objects (bucket_id, name) values ('product-photos', $1)", [`${productA}/intruso.jpg`]))).rejects.toThrow(/row-level security/);
    await expect(asUser(db, adminB, (q) => q("insert into storage.objects (bucket_id, name) values ('shipping-labels', $1)", [`${saleA}/intruso.pdf`]))).rejects.toThrow(/row-level security/);
    expect(await selectAs(db, adminB, "delete from storage.objects where name like $1 returning name", [`${productA}%`])).toEqual([]);
  });

  it("5. el vendedor no hace operaciones de administración", async () => {
    await expect(rpc(db, sellerA, "invite_member", "x@prueba.local", "admin")).rejects.toThrow(/permisos/);
    await expect(rpc(db, sellerA, "update_member_role", sellerA, "admin")).rejects.toThrow(/permisos/);
    await expect(rpc(db, sellerA, "save_purchase_order", { supplier_id: null, order_date: "2026-10-01", items: [] })).rejects.toThrow();
    await expect(rpc(db, sellerA, "request_org_deletion", "Tienda A")).rejects.toThrow(/administrador/);
    expect(await selectAs(db, sellerA, "select * from org_members()")).toEqual([]);
    expect(await selectAs(db, sellerA, "select * from inventory_lots")).toEqual([]);
  });

  it("6. almacén: gestiona envíos de todas las ventas, sin ver costes ni administración", async () => {
    expect(await selectAs(db, warehouseA, "select id from sales")).toHaveLength(1);
    for (const t of ["inventory_lots", "purchase_orders", "suppliers", "purchase_order_costs", "partner_transfers", "audit_log"]) {
      expect(await selectAs(db, warehouseA, `select * from ${t}`), t).toEqual([]);
    }
    await expect(rpc(db, warehouseA, "report_sales_summary", {})).rejects.toThrow();
    await expect(rpc(db, warehouseA, "dashboard_widgets", "mes", null)).rejects.toThrow();
    expect(await rpc<number>(db, warehouseA, "set_sales_shipping_status", [saleA], "enviado")).toBe(1);
    await expect(rpc(db, warehouseA, "update_sale", { id: saleA, notes: "cambio" })).rejects.toThrow(/permisos/);
    await expect(rpc(db, warehouseA, "void_sale", saleA, "x")).rejects.toThrow();
    const lines = await selectAs<{ cost_amount: string | null; profit: string | null }>(db, warehouseA, "select cost_amount, profit from v_sale_lines");
    expect(lines.every((l) => l.cost_amount === null && l.profit === null)).toBe(true);
    await rpc(db, warehouseA, "set_sales_shipping_status", [saleA], "pendiente");
  });

  it("7. el administrador de un espacio no gestiona otro", async () => {
    await expect(rpc(db, adminB, "update_member_role", sellerA, "admin")).rejects.toThrow(/no es miembro/);
    await expect(rpc(db, adminB, "remove_member", sellerA)).rejects.toThrow(/no es miembro/);
    const invA = await rpc<string>(db, adminA, "invite_member", "nuevo@prueba.local", "vendedor");
    const invId = (await db.client.query("select id from invitations where organization_id = $1", [orgA])).rows[0].id;
    await expect(rpc(db, adminB, "revoke_invitation", invId)).rejects.toThrow(/no existe/);
    expect((await selectAs<{ email: string }>(db, adminB, "select * from org_members()")).map((m) => m.email).sort()).toEqual(["admin-b@prueba.local", "vende-b@prueba.local"]);
    expect(await selectAs(db, adminB, "select * from invitations")).toEqual([]);
    expect(await selectAs(db, adminB, "select email from profiles where email like '%-a@%'")).toEqual([]);
    expect(invA).toMatch(/^[0-9a-f]{64}$/);
  });

  it("8. el administrador de la plataforma ve cifras, no datos de los clientes", async () => {
    const owner = await createUser(db, "duenio@plataforma.local", undefined, "Plataforma");
    await db.client.query("insert into platform_admins (user_id) values ($1)", [owner]);
    const stats = await rpc<{ organizations: number }>(db, owner, "platform_stats");
    expect(stats.organizations).toBeGreaterThanOrEqual(3);
    const orgs = await selectAs<{ name: string }>(db, owner, "select * from platform_organizations()");
    expect(orgs.map((o) => o.name)).toContain("Tienda A");
    expect(Object.keys(orgs[0]).some((k) => /sale|product|stock|revenue/i.test(k))).toBe(false);
    for (const t of ["products", "sales", "inventory_lots", "responsibles"]) {
      expect(await selectAs(db, owner, `select * from ${t} where organization_id = $1`, [orgA]), t).toEqual([]);
    }
    await expect(rpc(db, adminA, "platform_stats")).rejects.toThrow(/No autorizado/);
    await expect(rpc(db, adminA, "platform_set_comped", orgA, true)).rejects.toThrow(/No autorizado/);
  });

  it("9-10. pagos: solo el servidor cambia la suscripción; eventos repetidos o antiguos no cuentan", async () => {
    await expect(rpc(db, adminB, "billing_apply", orgB, "active", null, null, false, "cus_x", "sub_x", "2026-10-01T00:00:00Z")).rejects.toThrow(/permission denied/);
    await expect(selectAs(db, adminB, "update subscriptions set status = 'active', comped = true")).rejects.toThrow(/permission denied/);
    const svc = <T>(sql: string, params: unknown[]) => asService(db, async (q) => (await q(sql, params)).rows as T[]);
    const first = await svc<{ r: boolean | null }>("select billing_record_event('evt_1', 'customer.subscription.updated', $1, now()) r", [orgB]);
    const dup = await svc<{ r: boolean | null }>("select billing_record_event('evt_1', 'customer.subscription.updated', $1, now()) r", [orgB]);
    expect(first[0].r).toBe(true);
    expect(dup[0].r).toBeNull();
    await db.client.query("update subscriptions set comped = false where organization_id = $1", [orgB]);
    await svc("select billing_apply($1, 'active', null, '2026-11-01', false, 'cus_b', 'sub_b', '2026-10-10T10:00:00Z')", [orgB]);
    // Un evento más antiguo (llega tarde) no deshace el estado
    const old = await svc<{ r: boolean }>("select billing_apply($1, 'incomplete', null, null, false, 'cus_b', 'sub_b', '2026-10-10T09:00:00Z') r", [orgB]);
    expect(old[0].r).toBe(false);
    expect((await db.client.query("select status from subscriptions where organization_id = $1", [orgB])).rows[0].status).toBe("active");
  });

  it("11-12. impago, cancelación y fin de la prueba cortan el trabajo, pero los datos siguen ahí", async () => {
    const svc = (sql: string, params: unknown[]) => asService(db, (q) => q(sql, params));
    await svc("select billing_apply($1, 'canceled', null, null, false, 'cus_b', 'sub_b', '2026-10-11T10:00:00Z')", [orgB]);
    await expect(rpc(db, adminB, "create_product", { name: "Nuevo", variants: [{ name: "Única" }] })).rejects.toThrow(/suscripción/);
    expect((await selectAs(db, adminB, "select id from products")).length).toBeGreaterThan(0); // puede consultar y exportar
    await svc("select billing_apply($1, 'past_due', null, null, false, 'cus_b', 'sub_b', '2026-10-12T10:00:00Z')", [orgB]);
    await rpc(db, adminB, "create_product", { name: "Con pago pendiente", variants: [{ name: "Única" }] }); // periodo de gracia mientras Stripe reintenta
    await svc("select billing_apply($1, 'unpaid', null, null, false, 'cus_b', 'sub_b', '2026-10-13T10:00:00Z')", [orgB]);
    await expect(rpc(db, adminB, "create_product", { name: "Impagado", variants: [{ name: "Única" }] })).rejects.toThrow(/suscripción/);
    // Prueba gratuita: válida 7 días; caducada, sin acceso
    await db.client.query("update subscriptions set status = 'trialing', trial_ends_at = now() + interval '1 day', last_event_at = null where organization_id = $1", [orgB]);
    await rpc(db, adminB, "create_product", { name: "En prueba", variants: [{ name: "Única" }] });
    await db.client.query("update subscriptions set trial_ends_at = now() - interval '1 minute' where organization_id = $1", [orgB]);
    await expect(rpc(db, adminB, "create_product", { name: "Prueba caducada", variants: [{ name: "Única" }] })).rejects.toThrow(/suscripción/);
    expect(await rpc<boolean>(db, adminB, "org_has_access", orgB)).toBe(false);
    // También directamente por la API (sin pasar por las funciones): solo lectura
    await expect(selectAs(db, adminB, "insert into suppliers (name) values ('Directo')")).rejects.toThrow(/row-level security/);
    await selectAs(db, adminB, "update products set name = 'Cambiado' where true");
    await selectAs(db, adminB, "delete from suppliers where true");
    expect((await selectAs(db, adminB, "select id from products where name = 'Cambiado'")).length).toBe(0);
    await db.client.query("update subscriptions set comped = true where organization_id = $1", [orgB]);
  });

  it("registro: crear espacio exige correo confirmado, empieza con 7 días de prueba y tiene límite", async () => {
    const u = (await db.client.query("insert into auth.users (email, email_confirmed_at) values ('nuevo-cliente@prueba.local', null) returning id")).rows[0].id;
    await expect(rpc(db, u, "create_organization", "Mi tienda")).rejects.toThrow(/Confirma tu correo/);
    await db.client.query("update auth.users set email_confirmed_at = now() where id = $1", [u]);
    const org = await rpc<string>(db, u, "create_organization", "Mi tienda");
    const info = await rpc<{ role: string; has_access: boolean; subscription: { status: string; trial_ends_at: string } }>(db, u, "current_org_info");
    expect(info.role).toBe("admin");
    expect(info.has_access).toBe(true);
    expect(info.subscription.status).toBe("trialing");
    const days = (new Date(info.subscription.trial_ends_at).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect((await selectAs(db, u, "select name from platforms order by sort_order")).map((p) => (p as { name: string }).name)).toEqual(["Vinted", "Wallapop", "En persona"]);
    expect(await selectAs(db, u, "select * from products")).toEqual([]);
    await rpc(db, u, "create_organization", "Segunda");
    await rpc(db, u, "create_organization", "Tercera");
    await expect(rpc(db, u, "create_organization", "Cuarta")).rejects.toThrow(/máximo/);
    // Cambiar de espacio solo a los propios
    await rpc(db, u, "set_active_org", org);
    expect((await rpc<{ name: string }>(db, u, "current_org_info")).name).toBe("Mi tienda");
  });

  it("invitaciones: correo correcto, un solo uso, revocables y con caducidad", async () => {
    const token = await rpc<string>(db, adminA, "invite_member", "Invitada@Prueba.local", "vendedor");
    expect(await rpc<{ state: string; organization: string }>(db, adminB, "invitation_info", token)).toMatchObject({ state: "valida", organization: "Tienda A" });
    const other = (await db.client.query("insert into auth.users (email) values ('otra@prueba.local') returning id")).rows[0].id;
    await expect(rpc(db, other, "accept_invitation", token)).rejects.toThrow(/es para invitada@prueba.local/);
    const guest = (await db.client.query("insert into auth.users (email) values ('invitada@prueba.local') returning id")).rows[0].id;
    expect(await rpc<string>(db, guest, "accept_invitation", token)).toBe(orgA);
    expect((await rpc<{ role: string }>(db, guest, "current_org_info")).role).toBe("vendedor");
    expect(await selectAs(db, guest, "select id from responsibles where profile_id = $1", [guest])).toHaveLength(1);
    expect(await selectAs(db, guest, "select id from sales")).toEqual([]); // vendedor: solo sus ventas
    await expect(rpc(db, guest, "accept_invitation", token)).rejects.toThrow(/no es válida/);
    // Revocada
    const t2 = await rpc<string>(db, adminA, "invite_member", "revocada@prueba.local", "almacen");
    const id2 = (await db.client.query("select id from invitations where email = 'revocada@prueba.local'")).rows[0].id;
    await rpc(db, adminA, "revoke_invitation", id2);
    const rev = (await db.client.query("insert into auth.users (email) values ('revocada@prueba.local') returning id")).rows[0].id;
    await expect(rpc(db, rev, "accept_invitation", t2)).rejects.toThrow(/no es válida/);
    // Caducada
    const t3 = await rpc<string>(db, adminA, "invite_member", "tarde@prueba.local", "vendedor");
    await db.client.query("update invitations set expires_at = now() - interval '1 second' where email = 'tarde@prueba.local'");
    const late = (await db.client.query("insert into auth.users (email) values ('tarde@prueba.local') returning id")).rows[0].id;
    await expect(rpc(db, late, "accept_invitation", t3)).rejects.toThrow(/no es válida/);
    // Un token inventado no revela nada
    expect(await rpc(db, adminB, "invitation_info", "0".repeat(64))).toBeNull();
  });

  it("referencias: una sola relación entre tablas (la API puede unirlas) y siempre dentro de la organización", async () => {
    const dup = await db.client.query(`
      select cl.relname child, pcl.relname parent, count(*)::int n
        from pg_constraint con join pg_class cl on cl.oid = con.conrelid join pg_class pcl on pcl.oid = con.confrelid
       where con.contype = 'f' and cl.relnamespace = 'public'::regnamespace and pcl.relname <> 'organizations'
         and cl.relname in (select private.org_tables()) and pcl.relname in (select private.org_tables())
       group by 1, 2, con.conkey[array_upper(con.conkey, 1)] having count(*) > 1`);
    expect(dup.rows).toEqual([]);
    const simple = await db.client.query(`
      select count(*)::int n from pg_constraint con join pg_class cl on cl.oid = con.conrelid join pg_class pcl on pcl.oid = con.confrelid
       where con.contype = 'f' and cardinality(con.conkey) = 1 and cl.relnamespace = 'public'::regnamespace
         and cl.relname in (select private.org_tables()) and pcl.relname in (select private.org_tables()) and pcl.relname <> 'organizations'`);
    expect(simple.rows[0].n).toBe(0);
  });

  it("eliminación del espacio: confirmación, se puede anular y el borrado definitivo solo tras 30 días y desde el servidor", async () => {
    await expect(rpc(db, adminB, "request_org_deletion", "otro nombre")).rejects.toThrow(/exactamente/);
    await rpc(db, adminB, "request_org_deletion", "Tienda B");
    expect(await rpc<boolean>(db, adminB, "org_has_access", orgB)).toBe(false);
    expect((await selectAs(db, adminB, "select id from products")).length).toBeGreaterThan(0); // aún puede exportar
    await rpc(db, adminB, "cancel_org_deletion");
    await rpc(db, adminB, "request_org_deletion", "Tienda B");
    await expect(rpc(db, adminB, "platform_purge_organization", orgB)).rejects.toThrow(/permission denied/);
    await expect(asService(db, (q) => q("select platform_purge_organization($1)", [orgB]))).rejects.toThrow(/30 días/);
    await db.client.query("update organizations set deletion_requested_at = now() - interval '31 days' where id = $1", [orgB]);
    await asService(db, (q) => q("select platform_purge_organization($1)", [orgB]));
    const left = await db.client.query(
      "select (select count(*) from products where organization_id = $1) + (select count(*) from sales where organization_id = $1) + (select count(*) from memberships where organization_id = $1) n",
      [orgB],
    );
    expect(Number(left.rows[0].n)).toBe(0);
    // A intacta
    expect(await selectAs(db, adminA, "select id from products where id = $1", [productA])).toHaveLength(1);
  });
});

run("Migración de los datos existentes", () => {
  let db: TestDb;
  afterAll(async () => {
    await db?.close();
  });

  it("los datos de antes pasan a una organización del primer administrador, sin perder nada", async () => {
    db = await createTestDatabase({ stopBefore: MIGRATION });
    const c = db.client;
    // Como antes de la migración: el primer usuario es administrador
    const admin = (await c.query("insert into auth.users (email) values ('mauri@prueba.local') returning id")).rows[0].id;
    const seller = (await c.query("insert into auth.users (email, raw_app_meta_data) values ('fran@prueba.local', '{\"role\":\"vendedor\"}') returning id")).rows[0].id;
    await c.query("insert into responsibles (name, profile_id, is_partner) values ('Mauri', $1, true), ('Fran', $2, true)", [admin, seller]);
    await asUser(db, admin, (q) => q("select create_product($1)", [{ name: "Gafas", variants: [{ name: "Única" }] }]));
    const before = (await c.query("select (select count(*) from products) p, (select count(*) from responsibles) r, (select count(*) from platforms) pl, (select count(*) from audit_log) a")).rows[0];

    await applyMigration(db, MIGRATION);
    const after = (await c.query("select (select count(*) from products) p, (select count(*) from responsibles) r, (select count(*) from platforms) pl, (select count(*) from audit_log) a")).rows[0];
    expect(after).toEqual(before);
    const orphans = await c.query("select count(*)::int n from products where organization_id is null");
    expect(orphans.rows[0].n).toBe(0);
    const m = await c.query("select p.email, m.role from memberships m join profiles p on p.id = m.user_id order by p.email");
    expect(m.rows).toEqual([
      { email: "fran@prueba.local", role: "vendedor" },
      { email: "mauri@prueba.local", role: "admin" },
    ]);
    const sub = await c.query("select status, comped from subscriptions");
    expect(sub.rows).toEqual([{ status: "active", comped: true }]);
    // Sigue pudiendo trabajar con sus datos
    expect(await selectAs(db, admin, "select name from products")).toEqual([{ name: "Gafas" }]);
    expect(await rpc<{ orders: number }>(db, admin, "report_sales_summary", {})).toBeTruthy();
    await rpc(db, admin, "create_product", { name: "Nuevo tras migrar", variants: [{ name: "Única" }] });
  });
});

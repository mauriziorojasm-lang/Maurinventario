import type { Metadata } from "next";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Empty, PageHeader, Pagination, Panel, Table, Td, Th, Tr } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { first, pageFrom, toQuery, type SearchParams } from "@/lib/filters";
import { dateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { must } from "@/lib/db";

export const metadata: Metadata = { title: "Auditoría" };

const ENTITIES: Record<string, string> = {
  sales: "Ventas",
  sale_items: "Líneas de venta",
  products: "Productos",
  product_variants: "Variantes",
  purchase_orders: "Pedidos de compra",
  purchase_order_items: "Líneas de compra",
  purchase_order_costs: "Costes de compra",
  stock_exits: "Salidas sin venta",
  stock_adjustments: "Ajustes de stock",
  returns: "Devoluciones",
  return_items: "Líneas de devolución",
  responsibles: "Responsables",
  suppliers: "Proveedores",
  profiles: "Usuarios",
  partner_transfers: "Pagos entre socios",
  import_batches: "Importaciones",
  review_items: "Revisión",
  categories: "Categorías",
  brands: "Marcas",
  platforms: "Plataformas",
  carriers: "Transportistas",
  mobile_devices: "Móviles",
  mobile_device_accounts: "Cuentas de móviles",
};

const HIDDEN = new Set(["updated_at", "created_at", "id"]);

function changes(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null) {
  if (!oldData || !newData) return [];
  return Object.keys(newData)
    .filter((k) => !HIDDEN.has(k) && JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]))
    .map((k) => ({ k, from: oldData[k], to: newData[k] }));
}

const short = (v: unknown) => {
  if (v === null || v === undefined) return "vacío";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const entity = first(sp.entidad);
  const from = first(sp.from);
  const to = first(sp.to);
  const user = first(sp.usuario);
  const { page, from: a, to: b, size } = pageFrom(sp, 50);
  const supabase = await createClient();
  let q = supabase.from("audit_log").select("*", { count: "exact" });
  if (entity) q = q.eq("entity", entity);
  if (from) q = q.gte("occurred_at", `${from}T00:00:00`);
  if (to) q = q.lte("occurred_at", `${to}T23:59:59`);
  if (user) q = q.ilike("user_email", `%${user}%`);
  const res = await q.order("occurred_at", { ascending: false }).order("id", { ascending: false }).range(a, b);
  const data = must(res, "la auditoría");
  const count = res.count;
  const values = { entidad: entity, from, to, usuario: user };

  return (
    <>
      <PageHeader title="Auditoría" description="Quién hizo qué y cuándo: altas, cambios, anulaciones, recepciones, ajustes e importaciones." />
      <FilterBar
        basePath="/auditoria"
        values={values}
        fields={[
          { type: "select", name: "entidad", label: "Sección", empty: "Todas", options: Object.entries(ENTITIES).map(([value, label]) => ({ value, label })) },
          { type: "text", name: "usuario", label: "Usuario", placeholder: "Email" },
          { type: "date", name: "from", label: "Desde" },
          { type: "date", name: "to", label: "Hasta" },
        ]}
      />
      <Panel padded={false}>
        {(data ?? []).length === 0 ? (
          <Empty title="Sin registros" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Usuario</Th>
                <Th>Acción</Th>
                <Th>Sección</Th>
                <Th>Detalle</Th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((r) => {
                const diff = changes(r.old_data, r.new_data);
                return (
                  <Tr key={r.id}>
                    <Td className="num whitespace-nowrap">{dateTime(r.occurred_at)}</Td>
                    <Td>{r.user_email ?? <span className="text-muted">Sistema</span>}</Td>
                    <Td>
                      <Badge tone={r.action === "eliminar" || r.action.startsWith("anular") ? "bad" : r.action === "crear" ? "good" : "neutral"}>{r.action.replace(/_/g, " ")}</Badge>
                    </Td>
                    <Td>{ENTITIES[r.entity] ?? r.entity}</Td>
                    <Td className="text-[13px]">
                      {r.summary && <span className="block">{r.summary}</span>}
                      {diff.slice(0, 6).map((d) => (
                        <span key={d.k} className="block text-muted">
                          {d.k}: {short(d.from)} → {short(d.to)}
                        </span>
                      ))}
                      {!r.summary && diff.length === 0 && r.new_data?.name && <span className="text-muted">{String(r.new_data.name)}</span>}
                      {r.entity_id && <span className="block text-faint">id {String(r.entity_id).slice(0, 8)}</span>}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <Pagination page={page} size={size} total={count ?? 0} hrefFor={(p) => `/auditoria${toQuery({ ...values, page: p })}`} />
      </Panel>
    </>
  );
}

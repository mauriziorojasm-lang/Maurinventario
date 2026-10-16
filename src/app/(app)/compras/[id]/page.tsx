import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { POStatus } from "@/components/badges";
import { Badge, Figures, LinkButton, LotTag, Notice, PageHeader, Panel, Table, Td, Th, Tr } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { COST_TYPES, date, money, todayIso, units } from "@/lib/format";
import { loadSuppliers } from "@/lib/options";
import { createClient } from "@/lib/supabase/server";
import { variantDisplay } from "@/lib/types";
import { CancelPOButton, CostsButton, HeaderEditButton, ReceiveButton } from "./po-actions";
import { must } from "@/lib/db";

export const metadata: Metadata = { title: "Pedido de compra" };

export default async function PODetail({ params }: PageProps<"/compras/[id]">) {
  await requirePerm("compras");
  const { id } = await params;
  const supabase = await createClient();
  const po = must(await supabase.from("v_purchase_orders").select("*").eq("id", id).maybeSingle(), "el pedido");
  if (!po) notFound();
  const [{ data: lines }, { data: costs }, { data: raw }, suppliers] = await Promise.all([
    supabase.from("v_purchase_lines").select("*").eq("purchase_order_id", id).order("line_number"),
    supabase.from("purchase_order_costs").select("cost_type, amount, description").eq("purchase_order_id", id),
    supabase.from("purchase_orders").select("cancel_reason, source_ref").eq("id", id).maybeSingle(),
    loadSuppliers(),
  ]);
  const costMap: Record<string, string> = {};
  for (const c of costs ?? []) costMap[c.cost_type] = String(Number(costMap[c.cost_type] ?? 0) + Number(c.amount));
  const extra = (costs ?? []).reduce((a, c) => a + Number(c.amount), 0);
  const pending = po.status === "pendiente";
  const received = po.status === "recibido";
  const subsOf = new Map<string, string>();
  for (const l of lines ?? []) if (l.substitutes_item_id) subsOf.set(l.substitutes_item_id, variantDisplay(l.product_name, l.variant_name));

  return (
    <>
      <PageHeader
        back={{ href: "/compras", label: "Compras" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            Pedido de compra #{po.order_number} <POStatus status={po.status} />
          </span>
        }
        description={`${date(po.order_date)}${received ? `, recibido el ${date(po.received_at)}` : ""}${raw?.source_ref ? `. Importado del Excel.` : ""}`}
        actions={
          <>
            {po.status !== "cancelado" && <HeaderEditButton po={po} suppliers={suppliers} />}
            {po.status !== "cancelado" && <CostsButton poId={po.id} costs={costMap} received={received} />}
            {pending && <LinkButton href={`/compras/${po.id}/editar`}>Editar líneas</LinkButton>}
            {pending && <CancelPOButton poId={po.id} orderNumber={po.order_number} />}
            {pending && (
              <ReceiveButton
                poId={po.id}
                orderNumber={po.order_number}
                today={todayIso()}
                extra={extra}
                items={(lines ?? []).map((l) => ({ id: l.item_id, label: variantDisplay(l.product_name, l.variant_name), quantity_ordered: l.quantity_ordered, unit_cost: Number(l.unit_cost) }))}
              />
            )}
          </>
        }
      />
      {po.supplier_is_placeholder && (
        <Notice tone="warn" className="mb-4" title="Proveedor pendiente de identificar">
          El Excel no indicaba el proveedor. Créalo en <Link href="/proveedores">Proveedores</Link> y asígnalo con «Proveedor y datos».
        </Notice>
      )}
      {po.status === "cancelado" && raw?.cancel_reason && (
        <Notice tone="neutral" className="mb-4">
          Cancelado: {raw.cancel_reason}
        </Notice>
      )}
      <Figures
        className="mb-5"
        items={[
          { label: "Proveedor", value: <span className="text-[17px]">{po.supplier_is_placeholder ? "Pendiente" : po.supplier_name}</span> },
          { label: "Unidades", value: received ? `${units(po.units_received)} / ${units(po.units_ordered)}` : units(po.units_ordered), note: received ? "recibidas / pedidas" : "pedidas" },
          { label: "Mercancía", value: money(po.merchandise_cost) },
          { label: "Costes adicionales", value: money(po.extra_costs) },
          { label: "Coste total", value: money(po.total_cost) },
        ]}
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Panel title="Líneas" description={received ? "Cada línea recibida es un lote con su coste real por unidad." : "Coste real estimado con las cantidades pedidas."} padded={false}>
          <Table>
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th num>Pedidas</Th>
                <Th num>Recibidas</Th>
                <Th num>Coste ud.</Th>
                <Th num>Mercancía</Th>
                <Th num>Costes extra</Th>
                <Th num>Coste real ud.</Th>
                <Th>Lote</Th>
              </tr>
            </thead>
            <tbody>
              {(lines ?? []).map((l) => {
                const extraLine = Number(l.transporte) + Number(l.aduanas) + Number(l.aranceles) + Number(l.comisiones) + Number(l.gestion) + Number(l.otros);
                return (
                  <Tr key={l.item_id} muted={l.item_status === "cancelado"}>
                    <Td>
                      <Link href={`/productos/${l.product_id}`} className="font-semibold hover:underline">
                        {variantDisplay(l.product_name, l.variant_name)}
                      </Link>
                      {l.substitutes_item_id && <span className="block text-xs text-info">Llegó en sustitución de otra línea</span>}
                      {l.item_status === "cancelado" && (
                        <span className="block text-xs">
                          <Badge tone="neutral">No llegó</Badge>
                          {subsOf.get(l.item_id) && <span className="ml-1">Sustituido por {subsOf.get(l.item_id)}</span>}
                        </span>
                      )}
                      {l.notes && <span className="block text-xs text-muted">{l.notes}</span>}
                    </Td>
                    <Td num>{l.substitutes_item_id ? "—" : l.quantity_ordered}</Td>
                    <Td num>{l.quantity_received ?? "—"}</Td>
                    <Td num>{money(l.unit_cost, { precise: true })}</Td>
                    <Td num>{money(l.merchandise_cost)}</Td>
                    <Td num>{money(extraLine)}</Td>
                    <Td num className="font-semibold">
                      {money(l.real_unit_cost, { precise: true })}
                    </Td>
                    <Td>{l.lot_id ? <LotTag label={`Pedido #${po.order_number}`} /> : <span className="text-xs text-muted">—</span>}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </Panel>
        <Panel title="Costes del pedido">
          {(costs ?? []).length === 0 ? (
            <p className="text-sm text-muted">Sin costes adicionales.</p>
          ) : (
            <dl className="flex flex-col gap-2 text-sm">
              {Object.entries(costMap).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{COST_TYPES[k]}</dt>
                  <dd className="num">{money(v)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
                <dt>Total</dt>
                <dd className="num">{money(extra)}</dd>
              </div>
            </dl>
          )}
          <p className="mt-3 text-xs text-muted">Se reparten en proporción al valor de la mercancía de cada línea.</p>
          {po.notes && <p className="mt-4 border-t border-line pt-3 text-sm">{po.notes}</p>}
        </Panel>
      </div>
    </>
  );
}

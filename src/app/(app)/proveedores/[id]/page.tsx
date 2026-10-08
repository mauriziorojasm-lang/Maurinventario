import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { POStatus } from "@/components/badges";
import { Empty, Figures, LotTag, Notice, PageHeader, Panel, Table, Td, Th, Tr } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { date, money, units } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { SupplierButton } from "../supplier-form";

export const metadata: Metadata = { title: "Proveedor" };

export default async function SupplierDetail({ params }: PageProps<"/proveedores/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const { data: s } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle();
  if (!s) notFound();
  const { data: pos } = await supabase.from("v_purchase_orders").select("*").eq("supplier_id", id).order("order_date", { ascending: false });
  const active = (pos ?? []).filter((p) => p.status !== "cancelado");
  const total = active.reduce((a, p) => a + Number(p.total_cost), 0);
  return (
    <>
      <PageHeader
        back={{ href: "/proveedores", label: "Proveedores" }}
        title={s.name}
        description={[s.contact_name, s.email, s.phone].filter(Boolean).join(", ") || "Sin datos de contacto"}
        actions={<SupplierButton initial={{ id: s.id, name: s.is_placeholder ? "" : s.name, contact_name: s.contact_name, email: s.email, phone: s.phone, notes: s.notes }} label={s.is_placeholder ? "Poner el nombre real" : undefined} />}
      />
      {s.is_placeholder && (
        <Notice tone="warn" className="mb-4">
          Este proveedor se creó en la importación porque el Excel no indicaba de quién era cada pedido. Puedes ponerle el nombre real, o crear los proveedores reales y cambiar cada
          pedido desde su ficha.
        </Notice>
      )}
      <Figures
        className="mb-5"
        items={[
          { label: "Pedidos", value: units(active.length) },
          { label: "Importe total comprado", value: money(total) },
          { label: "Unidades recibidas", value: units(active.reduce((a, p) => a + p.units_received, 0)) },
        ]}
      />
      <Panel title="Historial de compras" padded={false}>
        {(pos ?? []).length === 0 ? (
          <Empty title="Sin pedidos todavía" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Pedido</Th>
                <Th>Fecha</Th>
                <Th>Estado</Th>
                <Th num>Unidades</Th>
                <Th num>Coste total</Th>
              </tr>
            </thead>
            <tbody>
              {(pos ?? []).map((p) => (
                <Tr key={p.id} muted={p.status === "cancelado"}>
                  <Td>
                    <Link href={`/compras/${p.id}`}>
                      <LotTag label={`Pedido #${p.order_number}`} />
                    </Link>
                  </Td>
                  <Td className="num">{date(p.order_date)}</Td>
                  <Td>
                    <POStatus status={p.status} />
                  </Td>
                  <Td num>{units(p.status === "recibido" ? p.units_received : p.units_ordered)}</Td>
                  <Td num>{money(p.total_cost)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
      {s.notes && (
        <Panel title="Notas" className="mt-5">
          <p className="whitespace-pre-line text-sm">{s.notes}</p>
        </Panel>
      )}
    </>
  );
}

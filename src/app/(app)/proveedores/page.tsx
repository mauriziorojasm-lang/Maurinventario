import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Empty, PageHeader, Panel, Table, Td, Th, Tr } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { money, units } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { SupplierButton } from "./supplier-form";

export const metadata: Metadata = { title: "Proveedores" };

export default async function SuppliersPage() {
  await requirePerm("compras");
  const supabase = await createClient();
  const [{ data: suppliers }, { data: pos }] = await Promise.all([
    supabase.from("suppliers").select("*").is("deleted_at", null).order("is_placeholder", { ascending: false }).order("name"),
    supabase.from("v_purchase_orders").select("supplier_id, status, total_cost"),
  ]);
  const stats = new Map<string, { orders: number; total: number }>();
  for (const p of pos ?? []) {
    if (p.status === "cancelado") continue;
    const s = stats.get(p.supplier_id) ?? { orders: 0, total: 0 };
    s.orders++;
    s.total += Number(p.total_cost);
    stats.set(p.supplier_id, s);
  }
  return (
    <>
      <PageHeader title="Proveedores" description="A quién compras, con su historial de pedidos e importe total." actions={<SupplierButton />} />
      <Panel padded={false}>
        {(suppliers ?? []).length === 0 ? (
          <Empty title="Aún no hay proveedores" action={<SupplierButton label="Crear el primero" />} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Proveedor</Th>
                <Th>Contacto</Th>
                <Th>Email</Th>
                <Th>Teléfono</Th>
                <Th num>Pedidos</Th>
                <Th num>Total comprado</Th>
              </tr>
            </thead>
            <tbody>
              {(suppliers ?? []).map((s) => (
                <Tr key={s.id}>
                  <Td>
                    <Link href={`/proveedores/${s.id}`} className="font-semibold hover:underline">
                      {s.name}
                    </Link>
                    {s.is_placeholder && (
                      <span className="ml-2">
                        <Badge tone="warn">Sustituir por el real</Badge>
                      </span>
                    )}
                  </Td>
                  <Td>{s.contact_name ?? "—"}</Td>
                  <Td>{s.email ?? "—"}</Td>
                  <Td>{s.phone ?? "—"}</Td>
                  <Td num>{units(stats.get(s.id)?.orders ?? 0)}</Td>
                  <Td num>{money(stats.get(s.id)?.total ?? 0)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}

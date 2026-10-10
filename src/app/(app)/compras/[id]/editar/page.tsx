import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { todayIso } from "@/lib/format";
import { loadSuppliers } from "@/lib/options";
import { createClient } from "@/lib/supabase/server";
import { variantDisplay } from "@/lib/types";
import { PurchaseOrderForm } from "../../po-form";
import { must } from "@/lib/db";

export const metadata: Metadata = { title: "Editar pedido" };

export default async function EditPO({ params }: PageProps<"/compras/[id]/editar">) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const po = must(await supabase.from("purchase_orders").select("id, order_number, supplier_id, order_date, notes, status").eq("id", id).maybeSingle(), "el pedido");
  if (!po) notFound();
  if (po.status !== "pendiente") redirect(`/compras/${id}`);
  const [{ data: lines }, { data: costs }, suppliers] = await Promise.all([
    supabase.from("v_purchase_lines").select("item_id, variant_id, product_name, variant_name, quantity_ordered, unit_cost, notes").eq("purchase_order_id", id).order("line_number"),
    supabase.from("purchase_order_costs").select("cost_type, amount").eq("purchase_order_id", id),
    loadSuppliers(),
  ]);
  const costMap: Record<string, string> = {};
  for (const c of costs ?? []) costMap[c.cost_type] = String(Number(costMap[c.cost_type] ?? 0) + Number(c.amount));
  return (
    <>
      <PageHeader title={`Editar pedido #${po.order_number}`} back={{ href: `/compras/${id}`, label: `Pedido #${po.order_number}` }} />
      <PurchaseOrderForm
        suppliers={suppliers}
        today={todayIso()}
        initial={{
          id: po.id,
          order_number: po.order_number,
          supplier_id: po.supplier_id,
          order_date: po.order_date,
          notes: po.notes,
          costs: costMap,
          lines: (lines ?? []).map((l) => ({
            key: l.item_id,
            variant_id: l.variant_id,
            label: variantDisplay(l.product_name, l.variant_name),
            quantity: String(l.quantity_ordered),
            unit_cost: String(Number(l.unit_cost)),
            notes: l.notes ?? "",
          })),
        }}
      />
    </>
  );
}

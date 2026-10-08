import type { Metadata } from "next";
import { Notice, PageHeader, Panel } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { todayIso } from "@/lib/format";
import { first, type SearchParams } from "@/lib/filters";
import { createClient } from "@/lib/supabase/server";
import { variantDisplay } from "@/lib/types";
import { ReturnForm } from "./return-form";

export const metadata: Metadata = { title: "Nueva devolución" };

export default async function NewReturn({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createClient();
  let saleId = first(sp.venta);
  const number = first(sp.numero)?.trim();
  if (!saleId && number) {
    const { data } = await supabase.from("sales").select("id").eq("sale_number", number.toUpperCase()).eq("status", "activa").maybeSingle();
    saleId = data?.id;
  }
  if (!saleId) {
    return (
      <>
        <PageHeader title="Nueva devolución" back={{ href: "/devoluciones", label: "Devoluciones" }} />
        <Panel className="max-w-lg" title="¿De qué venta?">
          <form method="get" className="flex gap-2">
            <input name="numero" placeholder="Nº de venta, por ejemplo V-000072" defaultValue={number} className="h-10 flex-1 rounded-[var(--radius-sm)] border border-line-strong px-3 text-sm" />
            <button className="h-10 rounded-[var(--radius-sm)] bg-ledger px-4 text-sm font-semibold text-white">Buscar</button>
          </form>
          {number && <Notice tone="warn" className="mt-3">No hay ninguna venta activa con el número {number}.</Notice>}
          <p className="mt-3 text-[13px] text-muted">También puedes abrir la venta y pulsar «Registrar devolución».</p>
        </Panel>
      </>
    );
  }
  const { data: sale } = await supabase.from("sales").select("id, sale_number, status, platforms(name)").eq("id", saleId).maybeSingle();
  const { data: lines } = await supabase.from("v_sale_lines").select("sale_item_id, product_name, variant_name, quantity, returned_qty, unit_price, refunded_amount").eq("sale_id", saleId).order("line_number");
  if (!sale || sale.status !== "activa" || !lines?.length) {
    return (
      <>
        <PageHeader title="Nueva devolución" back={{ href: "/devoluciones", label: "Devoluciones" }} />
        <Notice tone="bad">Esa venta no existe o está anulada.</Notice>
      </>
    );
  }
  const platform = (sale as unknown as { platforms: { name: string } | null }).platforms?.name;
  return (
    <>
      <PageHeader title={`Devolución de la venta ${sale.sale_number}`} description={platform ? `Vendida en ${platform}.` : undefined} back={{ href: `/ventas/${sale.id}`, label: `Venta ${sale.sale_number}` }} />
      <ReturnForm
        saleId={sale.id}
        saleNumber={sale.sale_number}
        today={todayIso()}
        lines={lines.map((l) => ({
          id: l.sale_item_id,
          label: variantDisplay(l.product_name, l.variant_name),
          quantity: l.quantity,
          already: l.returned_qty,
          unit_price: Number(l.unit_price),
          refunded: Number(l.refunded_amount),
        }))}
      />
    </>
  );
}

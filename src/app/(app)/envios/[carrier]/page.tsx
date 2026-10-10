import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LabelButton } from "@/components/label-viewer";
import { Badge, LinkButton, Notice, PageHeader } from "@/components/ui";
import { date } from "@/lib/format";
import { signLabels } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { BulkShippingBar, SaleCheckbox, SelectAllCheckbox, ShippingSelection } from "../../ventas/bulk-shipping";
import { NO_CARRIER, loadPendingShipments } from "../data";
import { MarkOneShipped } from "./mark-one";

export const metadata: Metadata = { title: "Pendientes de envío" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CarrierShipments({ params }: PageProps<"/envios/[carrier]">) {
  const { carrier } = await params;
  if (carrier !== NO_CARRIER && !UUID.test(carrier)) notFound();

  const supabase = await createClient();
  let carrierName = "Sin paquetería";
  if (carrier !== NO_CARRIER) {
    const { data } = await supabase.from("carriers").select("name").eq("id", carrier).maybeSingle();
    if (!data) notFound();
    carrierName = data.name as string;
  }

  const { rows: all, error } = await loadPendingShipments();
  const rows = all.filter((r) => (carrier === NO_CARRIER ? r.carrier_id === null : r.carrier_id === carrier));
  const urls = await signLabels(rows.map((r) => r.label_path));
  const withoutLabel = rows.filter((r) => !r.label_path).length;

  return (
    <>
      <PageHeader
        back={{ href: "/envios", label: "Pendientes de envío" }}
        title={carrierName}
        description={
          rows.length > 0
            ? `${rows.length} ${rows.length === 1 ? "paquete" : "paquetes"} por enviar, del más antiguo al más reciente.${withoutLabel ? ` ${withoutLabel} sin etiqueta.` : ""}`
            : undefined
        }
      />
      {error && <Notice tone="bad">{error}</Notice>}

      {!error && rows.length === 0 && (
        <section className="flex flex-col items-center gap-3 rounded-[var(--radius-md)] border border-good/30 bg-good-soft px-6 py-12 text-center">
          <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-good text-[24px] font-bold text-on-good">
            ✓
          </span>
          <h2 className="text-[20px] font-bold text-good-ink">Todo enviado con {carrierName}</h2>
          <LinkButton href="/envios">Ver otras paqueterías</LinkButton>
        </section>
      )}

      {rows.length > 0 && (
        <ShippingSelection>
          <BulkShippingBar />
          <div className="mb-2 flex items-center gap-2 px-1 text-[13px] text-muted">
            <SelectAllCheckbox sales={rows.map((r) => ({ id: r.id, status: "pendiente" as const }))} />
            <span>Seleccionar todos</span>
          </div>
          <ul className="flex flex-col gap-2.5">
            {rows.map((r) => (
              <li key={r.id} className="flex gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-3.5 sm:p-4">
                <div className="pt-0.5">
                  <SaleCheckbox saleId={r.id} status="pendiente" label={`la venta ${r.sale_number}`} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                      <Link href={`/ventas/${r.id}?desde=${carrier}`} className="font-bold text-brand-ink hover:underline">
                        {r.sale_number}
                      </Link>
                      <span className="num text-[13px] text-muted">{date(r.sale_date)}</span>
                      {!r.label_path && <Badge tone="warn">Sin etiqueta</Badge>}
                    </p>
                    <ul className="mt-1 text-[14.5px] font-medium">
                      {r.items.map((i, k) => (
                        <li key={k}>
                          <span className="num">{i.quantity}</span> × {i.text}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-[13px] text-muted">
                      {[r.platform_name, r.responsible_name, r.mobile, r.external_reference && `Ref. ${r.external_reference}`].filter(Boolean).join(" · ")}
                    </p>
                    {r.notes && <p className="mt-0.5 text-[13px] text-ink-soft">{r.notes}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {r.label_path ? (
                      <LabelButton url={urls.get(r.label_path)} path={r.label_path} title={`Etiqueta · ${r.sale_number}`} size="sm" />
                    ) : (
                      <LinkButton href={`/ventas/${r.id}?desde=${carrier}`} size="sm">
                        Subir etiqueta
                      </LinkButton>
                    )}
                    <MarkOneShipped saleId={r.id} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </ShippingSelection>
      )}
    </>
  );
}

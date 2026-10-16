import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LabelButton } from "@/components/label-viewer";
import { CarrierIcon, PlatformIcon } from "@/components/marks";
import { ProductThumb } from "@/components/thumb";
import { Badge, Empty, LinkButton, Notice, PageHeader } from "@/components/ui";
import { date, dateTime, money } from "@/lib/format";
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
        title={
          <span className="flex items-center gap-3">
            {carrier !== NO_CARRIER && <CarrierIcon name={carrierName} size={36} showName={false} />}
            {carrierName}
          </span>
        }
        description={
          rows.length > 0
            ? `${rows.length} ${rows.length === 1 ? "paquete" : "paquetes"} por enviar, del más antiguo al más reciente.${withoutLabel ? ` ${withoutLabel} sin etiqueta.` : ""}`
            : undefined
        }
      />
      {error && <Notice tone="bad">{error}</Notice>}

      {!error && rows.length === 0 && (
        <div className="rounded-[var(--radius-md)] border border-line bg-surface">
          <Empty title={`Todo enviado con ${carrierName}`} action={<LinkButton href="/envios">Ver otros transportistas</LinkButton>} />
        </div>
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
              <li key={r.id} className="flex gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-3 sm:p-4">
                <div className="flex items-center self-stretch sm:items-start sm:pt-1">
                  <SaleCheckbox saleId={r.id} status="pendiente" label={`la venta ${r.sale_number}`} />
                </div>
                <Link href={`/ventas/${r.id}?desde=${carrier}`} className="shrink-0" aria-hidden tabIndex={-1}>
                  <ProductThumb src={r.photo} alt="" size={72} rounded={12} className="max-sm:h-16 max-sm:w-16" />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <Link href={`/ventas/${r.id}?desde=${carrier}`} className="block text-[15.5px] font-semibold leading-snug text-ink hover:underline">
                      {r.items.map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.text}` : i.text)).join(", ")}
                    </Link>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
                      <PlatformIcon name={r.platform_name} size={16} />
                      {r.buyer && <span>· {r.buyer}</span>}
                      <span className="num font-semibold text-ink">· {money(r.total)}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-faint">
                      <span className="num">{r.sale_number}</span>
                      <span className="num">· {date(r.sale_date)}</span>
                      {r.responsible_name && <span>· {r.responsible_name}</span>}
                      {r.mobile && <span>· {r.mobile}</span>}
                      {r.external_reference && <span>· Ref. {r.external_reference}</span>}
                    </p>
                    <p className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge tone="neutral" dot>
                        Pendiente de envío
                      </Badge>
                      {!r.label_path && <Badge tone="warn">Sin etiqueta</Badge>}
                      {r.deadline && (
                        <Badge tone={Date.parse(r.deadline) - Date.now() < 36 * 3600_000 ? "warn" : "neutral"}>Enviar antes del {dateTime(r.deadline)}</Badge>
                      )}
                      {r.tracking_number && <Badge tone="neutral">Código {r.tracking_number}</Badge>}
                    </p>
                    {r.notes && <p className="mt-1 text-[13px] text-ink-soft">{r.notes}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 [&>*]:max-sm:flex-1">
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

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, LinkButton, LotTag, Notice, PageHeader, Panel, Table, Td, Th, Tr } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { RETURN_TYPES, date, dateTime, money } from "@/lib/format";
import { signLabels } from "@/lib/labels";
import { loadSaleOptions } from "@/lib/options";
import { createClient } from "@/lib/supabase/server";
import { variantDisplay } from "@/lib/types";
import { LinePriceEditor, SaleHeaderEditor, ShippingEditor, VoidSaleButton } from "./sale-editors";
import { RemovedButton } from "../../anuncios/listing-buttons";

export const metadata: Metadata = { title: "Venta" };

export default async function SaleDetail({ params, searchParams }: PageProps<"/ventas/[id]">) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const { id } = await params;
  const sp = await searchParams;
  // Si se llega desde «Pendientes de envío», el enlace de volver lleva allí
  const fromShipments = typeof sp.desde === "string" && /^[0-9a-z-]{1,40}$/i.test(sp.desde) ? sp.desde : null;
  const supabase = await createClient();

  const { data: sale } = await supabase
    .from("sales")
    .select(
      "id, sale_number, sale_date, status, void_reason, voided_at, responsible_id, platform_id, carrier_id, mobile_device_id, shipping_status, shipping_label_path, external_reference, notes, source_ref, created_at, source, buyer_name, tracking_number, platform_transaction_id, shipping_deadline, responsibles(name), platforms(name, requires_shipping), carriers(name), mobile_devices(number, name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!sale) notFound();

  const { data: items } = await supabase
    .from("sale_items")
    .select("id, line_number, quantity, unit_price, notes, lot_id, variant_id, product_variants(name, product_id, products(name))")
    .eq("sale_id", id)
    .order("line_number");

  const lotIds = (items ?? []).map((i) => i.lot_id);
  const lots = isAdmin && lotIds.length ? ((await supabase.from("v_lots").select("lot_id, lot_label, unit_cost, origin").in("lot_id", lotIds)).data ?? []) : [];
  const lotMap = new Map(lots.map((l) => [l.lot_id as string, l]));

  const returns = isAdmin
    ? ((
        await supabase
          .from("v_returns")
          .select("id, return_date, return_type, reason, product_name, variant_name, quantity, refund_amount, restocked, lost_cost")
          .eq("sale_id", id)
          .order("return_date")
      ).data ?? [])
    : [];
  const refundTotal = returns.reduce((a, r) => a + Number(r.refund_amount), 0);
  const netProfit =
    isAdmin && returns.length
      ? ((await supabase.from("v_sale_lines").select("profit").eq("sale_id", id)).data ?? []).reduce((a, r) => a + Number(r.profit), 0)
      : null;

  const opts = await loadSaleOptions();
  const labelUrl = sale.shipping_label_path ? ((await signLabels([sale.shipping_label_path])).get(sale.shipping_label_path) ?? null) : null;
  const s = sale as unknown as {
    id: string;
    sale_number: string;
    sale_date: string;
    status: "activa" | "anulada";
    void_reason: string | null;
    voided_at: string | null;
    responsible_id: string;
    platform_id: string;
    carrier_id: string | null;
    mobile_device_id: string | null;
    shipping_status: "pendiente" | "enviado" | null;
    shipping_label_path: string | null;
    external_reference: string | null;
    notes: string | null;
    source_ref: string | null;
    created_at: string;
    source: "manual" | "excel" | "correo";
    buyer_name: string | null;
    tracking_number: string | null;
    platform_transaction_id: string | null;
    shipping_deadline: string | null;
    responsibles: { name: string } | null;
    platforms: { name: string; requires_shipping: boolean } | null;
    carriers: { name: string } | null;
    mobile_devices: { number: number; name: string } | null;
  };
  type Item = {
    id: string;
    line_number: number;
    quantity: number;
    unit_price: number;
    notes: string | null;
    lot_id: string;
    product_variants: { name: string; product_id: string; products: { name: string } | null } | null;
  };
  const lines = (items ?? []) as unknown as Item[];
  const gross = lines.reduce((a, l) => a + l.quantity * Number(l.unit_price), 0);
  const cost = lines.reduce((a, l) => a + l.quantity * Number(lotMap.get(l.lot_id)?.unit_cost ?? 0), 0);
  const active = s.status === "activa";
  // Anuncios que siguen publicados de productos que se han quedado sin stock
  const productIds = [...new Set((items ?? []).map((i) => (i.product_variants as unknown as { product_id: string } | null)?.product_id).filter((x): x is string => !!x))];
  const toRemove =
    isAdmin && active && productIds.length
      ? (((await supabase.from("v_listings_to_remove").select("product_id, platform, product_name").in("product_id", productIds)).data ?? []) as {
          product_id: string;
          platform: "vinted" | "wallapop";
          product_name: string;
        }[])
      : [];

  return (
    <>
      <PageHeader
        back={fromShipments ? { href: `/envios/${fromShipments}`, label: "Pendientes de envío" } : { href: "/ventas", label: "Ventas" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            Venta {s.sale_number}
            {!active && <Badge tone="bad">Anulada</Badge>}
          </span>
        }
        description={`${date(s.sale_date)}, ${s.responsibles?.name ?? ""}, ${s.platforms?.name ?? ""}`}
        actions={
          isAdmin &&
          active && (
            <>
              <SaleHeaderEditor
                sale={{ ...s, requires_shipping: !!s.platforms?.requires_shipping }}
                responsibles={opts.responsibles}
                platforms={opts.platforms}
                mobiles={opts.mobiles}
              />
              <LinkButton href={`/devoluciones/nueva?venta=${s.id}`}>Registrar devolución</LinkButton>
              {returns.length === 0 && <VoidSaleButton saleId={s.id} saleNumber={s.sale_number} />}
            </>
          )
        }
      />
      {toRemove.length > 0 && (
        <Notice tone="warn" className="mb-4" title="Quita el anuncio">
          <p>
            {[...new Set(toRemove.map((t) => t.product_name))].join(", ")} se ha quedado sin stock y sigue anunciado en{" "}
            {[...new Set(toRemove.map((t) => (t.platform === "vinted" ? "Vinted" : "Wallapop")))].join(" y ")}. Quítalo para no venderlo otra vez.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {toRemove.map((t) => (
              <RemovedButton key={t.product_id + t.platform} productId={t.product_id} platform={t.platform} />
            ))}
          </div>
        </Notice>
      )}
      {sp.aviso === "creada" && (
        <Notice tone="good" className="mb-4">
          Venta registrada. El stock de cada lote ya se ha descontado.
        </Notice>
      )}
      {sp.aviso === "etiqueta" && (
        <Notice tone="warn" className="mb-4">
          La venta se ha guardado, pero la etiqueta no se ha podido subir. Súbela de nuevo abajo.
        </Notice>
      )}
      {!active && (
        <Notice tone="bad" className="mb-4" title="Venta anulada">
          {s.void_reason} ({dateTime(s.voided_at)}). Sus unidades volvieron a su lote.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          <Panel title="Productos" padded={false}>
            <Table>
              <thead>
                <tr>
                  <Th>Producto</Th>
                  <Th>Lote</Th>
                  <Th num>Uds.</Th>
                  <Th num>Precio</Th>
                  <Th num>Importe</Th>
                  {isAdmin && <Th num>Coste lote</Th>}
                  {isAdmin && <Th num>Beneficio</Th>}
                  {isAdmin && active && <Th />}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const lot = lotMap.get(l.lot_id);
                  const amount = l.quantity * Number(l.unit_price);
                  const lineCost = l.quantity * Number(lot?.unit_cost ?? 0);
                  return (
                    <Tr key={l.id}>
                      <Td>
                        {variantDisplay(l.product_variants?.products?.name ?? "", l.product_variants?.name)}
                        {l.notes && <span className="block text-xs text-muted">{l.notes}</span>}
                      </Td>
                      <Td>{isAdmin ? <LotTag label={lot?.lot_label} /> : <span className="text-xs text-muted">Registrado</span>}</Td>
                      <Td num>{l.quantity}</Td>
                      <Td num>{money(l.unit_price)}</Td>
                      <Td num>{money(amount)}</Td>
                      {isAdmin && <Td num>{money(lot?.unit_cost, { precise: true })}</Td>}
                      {isAdmin && <Td num>{money(amount - lineCost)}</Td>}
                      {isAdmin && active && (
                        <Td>
                          <LinePriceEditor itemId={l.id} price={Number(l.unit_price)} notes={l.notes} />
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <Td colSpan={4}>Total</Td>
                  <Td num>{money(gross)}</Td>
                  {isAdmin && <Td num>{money(cost)}</Td>}
                  {isAdmin && <Td num>{money(gross - cost)}</Td>}
                  {isAdmin && active && <Td />}
                </tr>
              </tfoot>
            </Table>
            {isAdmin && returns.length > 0 && (
              <p className="border-t border-line px-3 py-2.5 text-[13px] text-muted">
                Reembolsado: <span className="num font-semibold text-ink">{money(refundTotal)}</span>. Beneficio después de devoluciones:{" "}
                <span className={`num font-semibold ${Number(netProfit) < 0 ? "text-danger" : "text-ink"}`}>{money(netProfit)}</span>. Los informes ya usan esta
                cifra.
              </p>
            )}
          </Panel>

          {isAdmin && returns.length > 0 && (
            <Panel title="Devoluciones" padded={false}>
              <Table>
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Producto</Th>
                    <Th>Tipo</Th>
                    <Th num>Uds.</Th>
                    <Th num>Reembolso</Th>
                    <Th num>Pérdida</Th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((r) => (
                    <Tr key={`${r.id}-${r.product_name}`}>
                      <Td className="num">{date(r.return_date)}</Td>
                      <Td>
                        {variantDisplay(r.product_name, r.variant_name)}
                        {r.reason && <span className="block text-xs text-muted">{r.reason}</span>}
                      </Td>
                      <Td>{RETURN_TYPES[r.return_type]}</Td>
                      <Td num>{r.quantity}</Td>
                      <Td num>{money(r.refund_amount)}</Td>
                      <Td num>{money(r.lost_cost)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Panel>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {s.platforms?.requires_shipping && active && (
            <Panel title="Envío">
              <ShippingEditor sale={{ ...s, requires_shipping: true }} carriers={opts.carriers} labelUrl={labelUrl} />
            </Panel>
          )}
          <Panel title="Datos">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Fecha</dt>
              <dd className="num">{date(s.sale_date)}</dd>
              <dt className="text-muted">Responsable</dt>
              <dd>{s.responsibles?.name}</dd>
              <dt className="text-muted">Plataforma</dt>
              <dd>{s.platforms?.name}</dd>
              {s.platforms?.requires_shipping && (
                <>
                  <dt className="text-muted">Transporte</dt>
                  <dd>{s.carriers?.name ?? "Sin indicar"}</dd>
                  <dt className="text-muted">Envío</dt>
                  <dd>{s.shipping_status === "enviado" ? <Badge tone="good">Enviado</Badge> : <Badge tone="warn">Pendiente</Badge>}</dd>
                </>
              )}
              {s.buyer_name && (
                <>
                  <dt className="text-muted">Comprador</dt>
                  <dd>{s.buyer_name}</dd>
                </>
              )}
              {s.tracking_number && (
                <>
                  <dt className="text-muted">Seguimiento</dt>
                  <dd className="num break-all">{s.tracking_number}</dd>
                </>
              )}
              {s.shipping_deadline && (
                <>
                  <dt className="text-muted">Enviar antes de</dt>
                  <dd className="num">{dateTime(s.shipping_deadline)}</dd>
                </>
              )}
              {s.platform_transaction_id && (
                <>
                  <dt className="text-muted">Nº de transacción</dt>
                  <dd className="num break-all">{s.platform_transaction_id}</dd>
                </>
              )}
              <dt className="text-muted">Móvil</dt>
              <dd>
                {s.mobile_devices
                  ? `Móvil ${s.mobile_devices.number}${s.mobile_devices.name !== `Móvil ${s.mobile_devices.number}` ? ` (${s.mobile_devices.name})` : ""}`
                  : "Sin indicar"}
              </dd>
              {s.external_reference && (
                <>
                  <dt className="text-muted">Referencia</dt>
                  <dd>{s.external_reference}</dd>
                </>
              )}
              {s.notes && (
                <>
                  <dt className="text-muted">Notas</dt>
                  <dd>{s.notes}</dd>
                </>
              )}
              <dt className="text-muted">Origen</dt>
              <dd>
                {s.source === "correo"
                  ? `Automática, desde el correo de ${s.platforms?.name ?? "la plataforma"}`
                  : s.source_ref
                    ? `Importado del Excel (${s.source_ref})`
                    : s.source === "excel"
                      ? "Importado del Excel"
                      : "Registrada a mano"}
              </dd>
              <dt className="text-muted">Registrada</dt>
              <dd>{dateTime(s.created_at)}</dd>
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}

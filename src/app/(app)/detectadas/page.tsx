import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Empty, Notice, PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { dateTime, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { loadDetected } from "./data";
import { ConfirmAllButton, DetectedActions } from "./detected-actions";

export const metadata: Metadata = { title: "Ventas detectadas" };
export const maxDuration = 60;

export default async function DetectedPage() {
  await requirePerm("correo");
  const { rows, error } = await loadDetected();
  const supabase = await createClient();
  const { data: st } = await supabase.rpc("email_integration_status");
  const connected = !!(st as { connected?: boolean } | null)?.connected;

  // Se pueden confirmar todas de golpe las que no tienen ninguna duda
  const clean = rows.filter((r) => r.suggestion && r.suggestion.stock > 0 && !r.doubt && r.duplicates.length === 0 && r.price);

  return (
    <>
      <PageHeader
        title="Ventas detectadas"
        description="Ventas que han llegado al correo de Vinted y Wallapop. No cuentan hasta que las confirmes: al confirmar se registra la venta y se descuenta el stock."
        actions={clean.length >= 2 ? <ConfirmAllButton items={clean.map((r) => ({ emailId: r.id, variantId: r.suggestion!.id }))} /> : undefined}
      />
      {error && <Notice tone="bad">{error}</Notice>}
      {!connected && (
        <Notice tone="info" className="mb-4">
          Gmail no está conectado, así que no llegan ventas nuevas. Se conecta en{" "}
          <Link href="/correos" className="font-semibold text-brand-ink underline">
            Ventas por correo
          </Link>
          .
        </Notice>
      )}

      {!error && rows.length === 0 ? (
        <Empty title="Nada por confirmar">Cuando llegue una venta al correo, aparecerá aquí para que la confirmes.</Empty>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={r.platform === "vinted" ? "info" : "neutral"}>{r.platform === "vinted" ? "Vinted" : "Wallapop"}</Badge>
                <span className="num text-xs text-faint">Llegó el {dateTime(r.receivedAt)}</span>
                {r.duplicates.length > 0 && <Badge tone="warn">¿Ya apuntada?</Badge>}
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-muted">En el correo</p>
                  <p className="text-[17px] font-semibold leading-snug text-ink">{r.product || "Artículo sin nombre"}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-muted">
                    {r.buyer && <span>Comprador: {r.buyer}</span>}
                    {r.account && <span>Cuenta: {r.account}</span>}
                    <span className="num">Fecha de venta: {r.saleDate.split("-").reverse().join("/")}</span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="display num text-[28px] leading-none text-brand-ink">{r.price !== null ? money(r.price) : "—"}</p>
                  {(r.shipping !== null || r.total !== null) && (
                    <p className="num mt-1 text-[12px] text-muted">
                      {r.shipping !== null && `envío ${money(r.shipping)}`}
                      {r.total !== null && ` · total ${money(r.total)}`}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-[var(--radius-sm)] bg-ink/5 px-3 py-2 text-sm">
                {r.suggestion ? (
                  <p>
                    <span className="text-muted">En tu inventario: </span>
                    <strong>{r.suggestion.label}</strong>{" "}
                    <span className={r.suggestion.stock > 0 ? "text-muted" : "font-semibold text-danger"}>
                      ({r.suggestion.stock > 0 ? `${r.suggestion.stock} en stock` : "sin stock"})
                    </span>
                  </p>
                ) : (
                  <p className="font-semibold text-warn">Producto sin identificar: elígelo al confirmar.</p>
                )}
              </div>

              {r.doubt && r.note && <Notice tone="warn">{r.note}</Notice>}
              {r.duplicates.length > 0 && (
                <Notice tone="warn" title="Puede que ya la tengas apuntada">
                  Hay {r.duplicates.length === 1 ? "una venta parecida" : `${r.duplicates.length} ventas parecidas`} apuntada a mano:{" "}
                  {r.duplicates.map((d) => d.label).join(" · ")}. Si es la misma, pulsa «Ya estaba apuntada».
                </Notice>
              )}

              <DetectedActions sale={r} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

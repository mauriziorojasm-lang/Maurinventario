"use client";
import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { CarrierIcon, PlatformIcon } from "@/components/marks";
import { ProductPicker } from "@/components/product-picker";
import { ProductThumb } from "@/components/thumb";
import { Badge, Button, Field, Input, Notice, Select, clsx } from "@/components/ui";
import { ActionMessages, ConfirmAction, Modal, useServerAction } from "@/components/ui-client";
import { money } from "@/lib/format";
import { variantDisplay, type SellableVariant } from "@/lib/types";
import { confirmDetected, confirmMany, discardDetected, markDuplicate } from "./actions";
import type { DetectedSale, ExistingOption, Option, ProductGuess } from "./data";

const PLATFORM_NAME = { vinted: "Vinted", wallapop: "Wallapop" } as const;

/** Grado de confianza de la identificación del producto. */
export function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const pct = Math.round(score * 100);
  if (score >= 0.9) return <Badge tone="good">Seguro · {pct} %</Badge>;
  if (score >= 0.75) return <Badge tone="good">Muy probable · {pct} %</Badge>;
  return <Badge tone="warn">Revisa · {pct} %</Badge>;
}

export function ConfirmAllButton({ items }: { items: { emailId: string; variantId: string; carrierId: string | null; responsibleId: string | null }[] }) {
  return (
    <ConfirmAction
      variant="primary"
      label={
        <>
          <Check size={17} strokeWidth={2.5} />
          Confirmar las {items.length} sin dudas
        </>
      }
      title="Confirmar varias ventas"
      description={`Se registrarán ${items.length} ventas con el producto, el precio y el transportista detectados, y se descontará 1 unidad de cada una. Solo se incluyen las que tienen el producto identificado con seguridad, stock y ninguna duda ni posible duplicado.`}
      confirmLabel="Confirmar todas"
      action={() => confirmMany(items)}
    />
  );
}

export function DetectedActions({ sale, carriers, responsibles }: { sale: DetectedSale; carriers: Option[]; responsibles: Option[] }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-2 [&>*]:max-sm:flex-1">
      <Button variant={sale.likelyDuplicate ? "secondary" : "primary"} onClick={() => setConfirmOpen(true)}>
        <Check size={17} strokeWidth={2.5} />
        Confirmar venta
      </Button>
      <DuplicateDialog sale={sale} onNotDuplicate={() => setConfirmOpen(true)} />
      <ConfirmAction
        variant="secondary"
        label="No es una venta"
        title="Descartar"
        description="No se registrará nada con este correo. Desaparecerá de esta lista."
        confirmLabel="Descartar"
        action={() => discardDetected(sale.id)}
      />
      <ConfirmDialog sale={sale} carriers={carriers} responsibles={responsibles} open={confirmOpen} onClose={() => setConfirmOpen(false)} />
    </div>
  );
}

/** Ventana de confirmación: todo lo detectado, ya rellenado y editable. */
function ConfirmDialog({
  sale,
  carriers,
  responsibles,
  open,
  onClose,
}: {
  sale: DetectedSale;
  carriers: Option[];
  responsibles: Option[];
  open: boolean;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<ProductGuess | null>(sale.suggestion);
  const [changing, setChanging] = useState(!sale.suggestion);
  const [price, setPrice] = useState(sale.price !== null ? String(sale.price).replace(".", ",") : "");
  const [carrierId, setCarrierId] = useState(sale.carrier?.id ?? "");
  const [respId, setRespId] = useState(sale.responsibleId ?? (responsibles.length === 1 ? responsibles[0].id : ""));
  const [remember, setRemember] = useState(true);
  const { run, pending, error } = useServerAction(confirmDetected);
  const priceNum = Number(price.replace(/\./g, "").replace(",", "."));
  const validPrice = price.trim() !== "" && Number.isFinite(priceNum) && priceNum > 0;
  const changedProduct = !!picked && picked.id !== sale.suggestion?.id;
  const options = [sale.suggestion, ...sale.alternatives].filter((x): x is ProductGuess => !!x);
  const carrierName = carriers.find((c) => c.id === carrierId)?.name ?? null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirmar venta"
      wide
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!picked || !validPrice || !respId || pending}
            onClick={async () => {
              if (!picked) return;
              const r = await run({ emailId: sale.id, variantId: picked.id, price: priceNum, remember, carrierId: carrierId || null, responsibleId: respId || null });
              if (r.ok) onClose();
            }}
          >
            <Check size={17} strokeWidth={2.5} />
            {pending ? "Registrando…" : "Confirmar venta"}
          </Button>
        </>
      }
    >
      <div className="flex gap-4">
        <ProductThumb src={sale.image ?? picked?.photo} alt={sale.product} size={104} rounded={14} className="max-sm:h-[84px] max-sm:w-[84px]" />
        <div className="min-w-0 flex-1">
          <PlatformIcon name={PLATFORM_NAME[sale.platform]} size={18} className="text-[13px] font-medium" />
          <p className="mt-1.5 line-clamp-2 text-[17px] font-semibold leading-snug">{sale.product}</p>
          <p className="mt-1 text-[13px] text-muted">
            {sale.buyer ? `Comprador: ${sale.buyer} · ` : ""}
            <span className="num">{sale.saleDate.split("-").reverse().join("/")}</span>
            {sale.reference ? <span className="num"> · Ref. {sale.reference}</span> : null}
          </p>
        </div>
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-[10px] bg-brand-soft px-3 py-2 text-[13px] text-brand-ink">
        <Sparkles size={15} strokeWidth={2} className="mt-0.5 shrink-0" />
        Resellap lo ha rellenado con lo que dice el correo. Revisa y cambia lo que haga falta.
      </p>

      {sale.doubt && sale.note && (
        <Notice tone="warn" className="mt-3">
          {sale.note}
        </Notice>
      )}

      {/* Producto */}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-muted">Producto de tu inventario</p>
          {picked && !changing && (
            <button type="button" className="min-h-10 text-[13px] font-semibold text-brand-ink hover:underline" onClick={() => setChanging(true)}>
              Cambiar
            </button>
          )}
        </div>
        {picked && (
          <div className="flex items-center gap-3 rounded-[12px] border border-line p-2.5">
            <ProductThumb src={picked.photo} alt="" size={48} rounded={10} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-semibold">{picked.label}</p>
              <p className={clsx("text-[12.5px]", picked.stock > 0 ? "text-faint" : "font-semibold text-danger")}>
                {picked.stock > 0 ? `${picked.stock} en stock · se descuenta 1 del lote más antiguo` : "Sin stock: no se puede registrar"}
              </p>
              {picked.reasons.length > 0 && picked.id === sale.suggestion?.id && (
                <p className="mt-0.5 truncate text-[12px] text-faint">{picked.reasons.filter((x) => !/stock/i.test(x)).join(" · ")}</p>
              )}
            </div>
            {picked.id === sale.suggestion?.id && <ConfidenceBadge score={picked.score} />}
          </div>
        )}
        {changing && (
          <div className="mt-2 flex flex-col gap-2">
            {options.length > 0 && (
              <ul className="grid gap-2 sm:grid-cols-2">
                {options.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicked(o);
                        setChanging(false);
                      }}
                      className={clsx(
                        "press flex w-full items-center gap-2.5 rounded-[12px] border p-2 text-left",
                        picked?.id === o.id ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong",
                      )}
                    >
                      <ProductThumb src={o.photo} alt="" size={40} rounded={8} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold">{o.label}</span>
                        <span className="block truncate text-[12px] text-faint">
                          {o.score !== null ? `${Math.round(o.score * 100)} % · ` : ""}
                          {o.stock > 0 ? `${o.stock} en stock` : "sin stock"}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <ProductPicker
              onlyInStock
              allowCreate
              placeholder={options.length ? "O busca otro producto" : "Busca el producto"}
              onSelect={(v: SellableVariant) => {
                setPicked({ id: v.variant_id, label: variantDisplay(v.product_name, v.variant_name, v.variant_count), stock: v.stock, photo: v.photo_url ?? null, score: null, reasons: [] });
                setChanging(false);
              }}
            />
          </div>
        )}
        {changedProduct && (
          <label className="mt-2 flex items-start gap-2 text-[13.5px]">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--color-brand)]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Recordar que «{sale.product}» es este producto (la próxima vez se elegirá solo)</span>
          </label>
        )}
      </div>

      {/* Datos editables */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Precio de venta (€)" hint="El del artículo, sin el envío.">
          <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="num" />
        </Field>
        <Field label="Transportista" hint={sale.carrier ? `Detectado en ${sale.carrier.source === "etiqueta" ? "la etiqueta" : "el correo"}` : "No se ha podido detectar"}>
          <Select value={carrierId} onChange={(e) => setCarrierId(e.target.value)}>
            <option value="">Sin transportista</option>
            {carriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Responsable" required error={!respId ? "Elige quién la ha vendido." : undefined}>
          <Select value={respId} onChange={(e) => setRespId(e.target.value)}>
            <option value="">Elige…</option>
            {responsibles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Envío</span>
          <div className="flex min-h-11 items-center rounded-[10px] border border-line bg-surface-2 px-3 text-[14px]">
            <CarrierIcon name={carrierName} size={20} />
            {sale.tracking && <span className="num ml-auto text-[12.5px] text-faint">{sale.tracking}</span>}
          </div>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-[12px] bg-surface-2 px-3.5 py-3 text-[13px] sm:grid-cols-4">
        <div>
          <dt className="text-faint">Plataforma</dt>
          <dd className="font-medium">{PLATFORM_NAME[sale.platform]}</dd>
        </div>
        <div>
          <dt className="text-faint">Comprador</dt>
          <dd className="truncate font-medium">{sale.buyer ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-faint">Fecha</dt>
          <dd className="num font-medium">{sale.saleDate.split("-").reverse().join("/")}</dd>
        </div>
        <div>
          <dt className="text-faint">Referencia</dt>
          <dd className="num truncate font-medium">{sale.reference ?? "—"}</dd>
        </div>
      </dl>
      {error && (
        <Notice tone="bad" className="mt-3">
          {error}
        </Notice>
      )}
    </Modal>
  );
}

/** «Ya estaba apuntada»: tarjetas visuales de las ventas parecidas, la más probable primero. */
function DuplicateDialog({ sale, onNotDuplicate }: { sale: DetectedSale; onNotDuplicate: () => void }) {
  const [open, setOpen] = useState(false);
  const best = sale.existing[0];
  const [picked, setPicked] = useState<string | null>(best && best.score >= 0.55 ? best.id : null);
  const { run, pending, error, message } = useServerAction(markDuplicate);
  return (
    <>
      <Button variant={sale.likelyDuplicate ? "primary" : "secondary"} onClick={() => setOpen(true)}>
        Ya estaba apuntada
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="¿Esta venta ya estaba registrada?"
        wide
        footer={
          <>
            <Button
              onClick={() => {
                setOpen(false);
                onNotDuplicate();
              }}
              disabled={pending}
            >
              No, es otra venta
            </Button>
            <Button
              variant="primary"
              disabled={!picked || pending}
              onClick={async () => {
                if (!picked) return;
                const r = await run(sale.id, picked);
                if (r.ok) setOpen(false);
              }}
            >
              <Check size={17} strokeWidth={2.5} />
              {pending ? "Guardando…" : "Sí, es esta venta"}
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-3 rounded-[12px] bg-surface-2 p-2.5">
          <ProductThumb src={sale.image} alt="" size={44} rounded={8} />
          <div className="min-w-0 text-[13px]">
            <p className="truncate font-semibold">{sale.product}</p>
            <p className="text-muted">
              {PLATFORM_NAME[sale.platform]} · {sale.buyer ?? "comprador sin nombre"} · <span className="num">{sale.price !== null ? money(sale.price) : "—"}</span> ·{" "}
              <span className="num">{sale.saleDate.split("-").reverse().join("/")}</span>
            </p>
          </div>
        </div>
        <p className="mt-3 text-[13.5px] text-ink-soft">
          Elige la venta que ya apuntaste. No se creará otra ni se tocará el stock; se le añadirán la foto, el comprador y la referencia si le faltan.
          {sale.platform === "vinted" && " Cuando llegue la etiqueta de Vinted, se pondrá en esa venta."}
        </p>
        {sale.existing.length === 0 ? (
          <Notice tone="info" className="mt-3">
            No hay ventas de {PLATFORM_NAME[sale.platform]} apuntadas a mano en fechas cercanas. Si no la tienes apuntada, pulsa «No, es otra venta» y confírmala.
          </Notice>
        ) : (
          <ul className="mt-3 grid gap-2">
            {sale.existing.map((d, i) => (
              <li key={d.id}>
                <ExistingCard d={d} best={i === 0 && d.score >= 0.55} checked={picked === d.id} onPick={() => setPicked(d.id)} name={`dup-${sale.id}`} />
              </li>
            ))}
          </ul>
        )}
        <ActionMessages error={error} message={message} />
      </Modal>
    </>
  );
}

function ExistingCard({ d, best, checked, onPick, name }: { d: ExistingOption; best: boolean; checked: boolean; onPick: () => void; name: string }) {
  return (
    <label className={clsx("press flex cursor-pointer items-center gap-3 rounded-[12px] border p-2.5", checked ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong")}>
      <input type="radio" name={name} checked={checked} onChange={onPick} className="h-5 w-5 shrink-0 accent-[var(--color-brand)]" />
      <ProductThumb src={d.photo} alt="" size={52} rounded={10} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2">
          <span className="truncate text-[14px] font-semibold">{d.product}</span>
          {best && <Badge tone="good">Más probable</Badge>}
        </span>
        <span className="mt-0.5 block text-[12.5px] text-muted">
          <span className="num">{d.number}</span> · <span className="num">{d.date.split("-").reverse().join("/")}</span>
          {d.buyer ? ` · ${d.buyer}` : ""}
          {d.carrier ? ` · ${d.carrier}` : ""}
        </span>
        {d.reasons.length > 0 && <span className="mt-0.5 block truncate text-[12px] text-faint">{d.reasons.join(" · ")}</span>}
      </span>
      <span className="num shrink-0 text-[15px] font-semibold">{money(d.price)}</span>
    </label>
  );
}

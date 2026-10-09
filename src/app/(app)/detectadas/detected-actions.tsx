"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { ProductPicker } from "@/components/product-picker";
import { Button, Field, Input, Notice, clsx } from "@/components/ui";
import { ActionMessages, ConfirmAction, Modal, useServerAction } from "@/components/ui-client";
import { money } from "@/lib/format";
import { variantDisplay, type SellableVariant } from "@/lib/types";
import { confirmDetected, confirmMany, discardDetected, markDuplicate } from "./actions";
import type { DetectedSale } from "./data";

export function ConfirmAllButton({ items }: { items: { emailId: string; variantId: string }[] }) {
  return (
    <ConfirmAction
      variant="primary"
      label={
        <>
          <Check size={17} strokeWidth={2.75} />
          Confirmar las {items.length} sin dudas
        </>
      }
      title="Confirmar varias ventas"
      description={`Se registrarán ${items.length} ventas con el producto y el precio del correo, y se descontará 1 unidad de cada una. Solo se incluyen las que tienen el producto identificado, stock y ninguna duda ni posible duplicado.`}
      confirmLabel="Confirmar todas"
      action={() => confirmMany(items)}
    />
  );
}

export function DetectedActions({ sale }: { sale: DetectedSale }) {
  const quick = useServerAction(confirmDetected);
  const canQuick = !!sale.suggestion && sale.suggestion.stock > 0 && !sale.doubt && sale.price !== null && sale.duplicates.length === 0;
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {canQuick ? (
          <Button
            variant="primary"
            disabled={quick.pending}
            onClick={() => quick.run({ emailId: sale.id, variantId: sale.suggestion!.id, price: null, remember: false })}
          >
            <Check size={17} strokeWidth={2.75} />
            {quick.pending ? "Registrando…" : "Sí, es una venta"}
          </Button>
        ) : (
          <ConfirmDialog sale={sale} primary />
        )}
        <DuplicateDialog sale={sale} />
        <ConfirmAction
          variant="secondary"
          label="No es una venta"
          title="Descartar"
          description="No se registrará nada con este correo."
          confirmLabel="Descartar"
          action={() => discardDetected(sale.id)}
        />
        {canQuick && <ConfirmDialog sale={sale} />}
      </div>
      <ActionMessages error={quick.error} message={quick.message} />
    </div>
  );
}

/** Confirmar eligiendo o cambiando el producto y el precio. */
function ConfirmDialog({ sale, primary }: { sale: DetectedSale; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<{ id: string; label: string; stock: number | null } | null>(sale.suggestion);
  const [price, setPrice] = useState(sale.price !== null ? String(sale.price).replace(".", ",") : "");
  const [remember, setRemember] = useState(true);
  const { run, pending, error } = useServerAction(confirmDetected);
  const priceNum = Number(price.replace(/\./g, "").replace(",", "."));
  const validPrice = price.trim() !== "" && Number.isFinite(priceNum) && priceNum > 0;
  const changedProduct = !!picked && picked.id !== sale.suggestion?.id;
  const options = [sale.suggestion, ...sale.alternatives].filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <>
      <Button variant={primary ? "primary" : "secondary"} onClick={() => setOpen(true)}>
        {primary ? (
          <>
            <Check size={17} strokeWidth={2.75} />
            {sale.suggestion ? "Revisar y confirmar" : "Elegir producto y confirmar"}
          </>
        ) : (
          "Cambiar producto o precio"
        )}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Confirmar la venta"
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={pending}>
              Volver
            </Button>
            <Button
              variant="primary"
              disabled={!picked || !validPrice || pending}
              onClick={async () => {
                if (!picked) return;
                const r = await run({ emailId: sale.id, variantId: picked.id, price: priceNum, remember });
                if (r.ok) setOpen(false);
              }}
            >
              {pending ? "Registrando…" : "Registrar la venta"}
            </Button>
          </>
        }
      >
        <div className="rounded-[var(--radius-sm)] bg-ink/5 p-3 text-sm">
          <p className="text-muted">En el correo:</p>
          <p className="font-semibold">{sale.product}</p>
          <p className="num text-ink-soft">
            {sale.price !== null ? money(sale.price) : "sin precio"}
            {sale.buyer ? ` · ${sale.buyer}` : ""}
          </p>
        </div>
        {sale.doubt && sale.note && (
          <Notice tone="warn" className="mt-3">
            {sale.note}
          </Notice>
        )}

        <p className="mb-1.5 mt-4 text-[13px] font-semibold text-ink-soft">Producto</p>
        {options.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setPicked(o)}
                className={clsx(
                  "press rounded-full border px-3 py-1.5 text-[13px] font-semibold",
                  picked?.id === o.id ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface hover:border-brand",
                )}
              >
                {o.label} <span className="font-normal opacity-75">({o.stock})</span>
              </button>
            ))}
          </div>
        )}
        <ProductPicker
          onlyInStock
          placeholder={options.length ? "O busca otro producto" : "Busca el producto"}
          onSelect={(v: SellableVariant) => setPicked({ id: v.variant_id, label: variantDisplay(v.product_name, v.variant_name, v.variant_count), stock: v.stock })}
        />
        {picked && (
          <p className="mt-2 text-sm">
            Elegido: <strong>{picked.label}</strong>
          </p>
        )}

        <Field label="Precio de venta (€)" className="mt-4" hint="El del artículo, sin el envío.">
          <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="num max-w-40" />
        </Field>

        {changedProduct && (
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>Recordar que «{sale.product}» es este producto (la próxima vez saldrá ya elegido)</span>
          </label>
        )}
        <p className="mt-3 text-[13px] text-muted">Se descontará 1 unidad del lote más antiguo.</p>
        {error && (
          <Notice tone="bad" className="mt-3">
            {error}
          </Notice>
        )}
      </Modal>
    </>
  );
}

/** «Ya estaba apuntada»: elegir la venta que ya existe. */
function DuplicateDialog({ sale }: { sale: DetectedSale }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(sale.duplicates.length === 1 ? sale.duplicates[0].id : null);
  const { run, pending, error } = useServerAction(markDuplicate);
  const all = [...sale.duplicates.map((d) => ({ ...d, likely: true })), ...sale.otherSales.map((d) => ({ ...d, likely: false }))];
  return (
    <>
      <Button variant={sale.duplicates.length ? "primary" : "secondary"} onClick={() => setOpen(true)}>
        Ya estaba apuntada
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="¿Cuál es la venta?"
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={pending}>
              Volver
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
              {pending ? "Guardando…" : "Es esta, no crear otra"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          Elige la venta de {sale.platform === "vinted" ? "Vinted" : "Wallapop"} que ya apuntaste a mano. No se creará otra venta ni se tocará el stock.
          {sale.platform === "vinted" && " La etiqueta de Vinted, cuando llegue, se pondrá en esa venta."}
        </p>
        {all.length === 0 ? (
          <Notice tone="info" className="mt-3">
            No hay ventas de {sale.platform === "vinted" ? "Vinted" : "Wallapop"} apuntadas a mano en las fechas cercanas. Si no la tienes apuntada, pulsa «Sí, es una venta».
          </Notice>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {all.map((d) => (
              <li key={d.id}>
                <label
                  className={clsx(
                    "press flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-2.5 text-sm",
                    picked === d.id ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong",
                  )}
                >
                  <input type="radio" name={`dup-${sale.id}`} checked={picked === d.id} onChange={() => setPicked(d.id)} className="accent-[var(--color-brand)]" />
                  <span className="num flex-1">{d.label}</span>
                  {d.likely && <span className="text-[12px] font-semibold text-warn">Parecida</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <Notice tone="bad" className="mt-3">
            {error}
          </Notice>
        )}
      </Modal>
    </>
  );
}

"use client";
import { useState } from "react";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { ActionMessages, ConfirmAction, Modal, useServerAction } from "@/components/ui-client";
import { createClient } from "@/lib/supabase/client";
import type { MobileOption, Option, PlatformOption } from "@/lib/types";
import { LabelButton, labelFileName } from "@/components/label-viewer";
import { updateSale, updateSaleItem, voidSale } from "../actions";

type Sale = {
  id: string;
  sale_date: string;
  responsible_id: string;
  platform_id: string;
  carrier_id: string | null;
  mobile_device_id: string | null;
  shipping_status: "pendiente" | "enviado" | null;
  shipping_label_path: string | null;
  external_reference: string | null;
  notes: string | null;
  requires_shipping: boolean;
};

export function ShippingEditor({ sale, carriers, labelUrl }: { sale: Sale; carriers: Option[]; labelUrl: string | null }) {
  const [status, setStatus] = useState(sale.shipping_status ?? "pendiente");
  const [carrier, setCarrier] = useState(sale.carrier_id ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const { run, pending, error, message } = useServerAction(updateSale);
  const label = useServerAction(updateSale);

  async function save() {
    await run({ id: sale.id, shipping_status: status, carrier_id: carrier || null });
  }

  /** La etiqueta se sube y se guarda en la venta en cuanto se elige: no hace falta pulsar nada más. */
  async function uploadLabel(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    if (file.size > 10 * 1024 * 1024) {
      setUploadError("La etiqueta pesa más de 10 MB.");
      setInputKey((k) => k + 1);
      return;
    }
    setUploading(true);
    const supabase = createClient();
    const path = `${sale.id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
    const up = await supabase.storage.from("shipping-labels").upload(path, file, { contentType: file.type || undefined });
    if (up.error) {
      setUploading(false);
      setUploadError(`No se ha podido subir la etiqueta: ${up.error.message}`);
      setInputKey((k) => k + 1);
      return;
    }
    await label.run({ id: sale.id, shipping_label_path: path });
    setUploading(false);
    setInputKey((k) => k + 1);
  }

  const busyLabel = uploading || label.pending;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Estado del envío">
          <Select value={status} onChange={(e) => setStatus(e.target.value as "pendiente" | "enviado")}>
            <option value="pendiente">Pendiente</option>
            <option value="enviado">Enviado</option>
          </Select>
        </Field>
        <Field label="Empresa de transporte">
          <Select value={carrier} onChange={(e) => setCarrier(e.target.value)}>
            <option value="">Sin indicar</option>
            {carriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div>
        <Button variant="primary" onClick={save} disabled={pending}>
          {pending ? "Guardando…" : "Guardar envío"}
        </Button>
        <ActionMessages error={error} message={message} />
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <p className="text-[13px] font-semibold">Etiqueta de envío</p>
        {sale.shipping_label_path ? (
          <div className="flex flex-wrap items-center gap-2">
            <LabelButton url={labelUrl} path={sale.shipping_label_path} variant="primary" />
            <span className="min-w-0 truncate text-xs text-muted">{labelFileName(sale.shipping_label_path)}</span>
          </div>
        ) : (
          <p className="text-xs text-muted">Aún no hay etiqueta.</p>
        )}
        <Field label={sale.shipping_label_path ? "Cambiar por otra" : "Subir etiqueta"} hint="PDF o imagen, máximo 10 MB. Se guarda al elegirla.">
          <Input
            key={inputKey}
            type="file"
            accept="application/pdf,image/*"
            className="py-1.5"
            disabled={busyLabel}
            onChange={(e) => uploadLabel(e.target.files?.[0])}
          />
        </Field>
        {busyLabel && <p className="text-[13px] font-medium text-muted">Subiendo etiqueta…</p>}
        {uploadError && <Notice tone="bad">{uploadError}</Notice>}
        {!busyLabel && <ActionMessages error={label.error} message={label.message ? "Etiqueta guardada." : null} />}
      </div>
    </div>
  );
}

export function SaleHeaderEditor({
  sale,
  responsibles,
  platforms,
  mobiles,
}: {
  sale: Sale;
  responsibles: Option[];
  platforms: PlatformOption[];
  mobiles: MobileOption[];
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    sale_date: sale.sale_date,
    responsible_id: sale.responsible_id,
    platform_id: sale.platform_id,
    mobile_device_id: sale.mobile_device_id ?? "",
    external_reference: sale.external_reference ?? "",
    notes: sale.notes ?? "",
  });
  const { run, pending, error } = useServerAction(updateSale);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <>
      <Button onClick={() => setOpen(true)}>Editar datos</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Editar datos de la venta"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={pending}
              onClick={async () => {
                const r = await run({ id: sale.id, ...form, mobile_device_id: form.mobile_device_id || null });
                if (r.ok) setOpen(false);
              }}
            >
              {pending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha">
            <Input type="date" value={form.sale_date} onChange={set("sale_date")} />
          </Field>
          <Field label="Responsable">
            <Select value={form.responsible_id} onChange={set("responsible_id")}>
              {responsibles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Plataforma">
            <Select value={form.platform_id} onChange={set("platform_id")}>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Móvil utilizado">
            <Select value={form.mobile_device_id} onChange={set("mobile_device_id")}>
              <option value="">Sin indicar</option>
              {mobiles.map((m) => (
                <option key={m.id} value={m.id}>
                  Móvil {m.number}
                  {m.name !== `Móvil ${m.number}` ? ` (${m.name})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Referencia de la venta" className="sm:col-span-2">
            <Input value={form.external_reference} onChange={set("external_reference")} />
          </Field>
          <Field label="Notas" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={set("notes")} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-muted">Para cambiar productos, unidades o lote, anula la venta y regístrala de nuevo: así el stock queda bien.</p>
        <ActionMessages error={error} />
      </Modal>
    </>
  );
}

export function LinePriceEditor({ itemId, price, notes }: { itemId: string; price: number; notes: string | null }) {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState(String(price));
  const [n, setN] = useState(notes ?? "");
  const { run, pending, error } = useServerAction(updateSaleItem);
  return (
    <>
      <button className="text-xs font-semibold text-ledger hover:underline" onClick={() => setOpen(true)}>
        Editar
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Editar línea"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={pending}
              onClick={async () => {
                const r = await run({ id: itemId, unit_price: Number(p.replace(",", ".")), notes: n || null });
                if (r.ok) setOpen(false);
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Precio por unidad (€)">
            <Input inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} />
          </Field>
          <Field label="Detalle">
            <Input value={n} onChange={(e) => setN(e.target.value)} />
          </Field>
        </div>
        <ActionMessages error={error} />
      </Modal>
    </>
  );
}

export function VoidSaleButton({ saleId, saleNumber }: { saleId: string; saleNumber: string }) {
  return (
    <ConfirmAction
      label="Anular venta"
      title={`Anular la venta ${saleNumber}`}
      description="Las unidades vuelven a su pedido/lote. La venta no se borra: queda anulada en el historial."
      confirmLabel="Anular venta"
      requireReason
      reasonLabel="Motivo de la anulación"
      action={(reason) => voidSale(saleId, reason)}
    />
  );
}

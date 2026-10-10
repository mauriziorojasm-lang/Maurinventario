"use client";
import { useState } from "react";
import { getLots } from "@/app/(app)/ventas/actions";
import { ProductPicker } from "@/components/product-picker";
import { Button, Field, Input, Notice, Select, Textarea, clsx } from "@/components/ui";
import { ActionMessages, ConfirmAction, Modal, useServerAction } from "@/components/ui-client";
import { EXIT_REASONS, money } from "@/lib/format";
import type { AvailableLot, Option, SellableVariant } from "@/lib/types";
import { variantDisplay } from "@/lib/types";
import { createAdjustment, createStockExit, updateStockExit, voidStockExit } from "./actions";

function useVariantWithLots() {
  const [variant, setVariant] = useState<SellableVariant | null>(null);
  const [lots, setLots] = useState<AvailableLot[] | null>(null);
  const [lotId, setLotId] = useState("");
  async function pick(v: SellableVariant) {
    setVariant(v);
    setLots(null);
    setLotId("");
    const r = await getLots(v.variant_id);
    const ls = r.ok ? (r.data ?? []) : [];
    setLots(ls);
    if (ls.length === 1) setLotId(ls[0].lot_id);
  }
  return { variant, lots, lotId, setLotId, pick, reset: () => (setVariant(null), setLots(null), setLotId("")) };
}

function LotSelect({ lots, lotId, setLotId }: { lots: AvailableLot[] | null; lotId: string; setLotId: (v: string) => void }) {
  if (lots === null) return <p className="text-sm text-muted">Cargando lotes…</p>;
  if (lots.length === 0) return <p className="text-sm text-danger">No hay stock en ningún lote.</p>;
  return (
    <Select value={lotId} onChange={(e) => setLotId(e.target.value)}>
      <option value="">Elige el lote…</option>
      {lots.map((l) => (
        <option key={l.lot_id} value={l.lot_id}>
          {l.label}: {l.quantity_available} uds., coste {money(l.unit_cost)}
        </option>
      ))}
    </Select>
  );
}

export function NewExitButton({ responsibles, today }: { responsibles: Option[]; today: string }) {
  const [open, setOpen] = useState(false);
  const pv = useVariantWithLots();
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("regalo");
  const [resp, setResp] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const { run, pending, error } = useServerAction(createStockExit);
  const lot = pv.lots?.find((l) => l.lot_id === pv.lotId);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Salida sin venta
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Salida sin venta"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={pending || !pv.variant || !pv.lotId || !(Number(qty) > 0)}
              onClick={async () => {
                const r = await run({ exit_date: date, variant_id: pv.variant!.variant_id, lot_id: pv.lotId, quantity: Number(qty), reason, responsible_id: resp || null, notes: notes.trim() || null });
                if (r.ok) {
                  setOpen(false);
                  pv.reset();
                  setNotes("");
                }
              }}
            >
              Registrar salida
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-ink-soft">Regalos, pérdidas, roturas… La unidad sale del stock sin contar como venta, y su coste se registra como pérdida.</p>
        <div className="grid gap-3">
          <Field label="Producto" required htmlFor="">
            {pv.variant ? (
              <div className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-line px-3 py-2 text-sm">
                <span className="font-semibold">{variantDisplay(pv.variant.product_name, pv.variant.variant_name, pv.variant.variant_count)}</span>
                <Button size="sm" variant="ghost" onClick={pv.reset}>
                  Cambiar
                </Button>
              </div>
            ) : (
              <ProductPicker onSelect={pv.pick} onlyInStock />
            )}
          </Field>
          {pv.variant && (
            <Field label="Pedido / lote" required htmlFor="">
              <LotSelect lots={pv.lots} lotId={pv.lotId} setLotId={pv.setLotId} />
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Unidades" required>
              <Input type="number" min={1} max={lot?.quantity_available} value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Field label="Motivo" required>
              <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                {Object.entries(EXIT_REASONS)
                  .filter(([k]) => k !== "pendiente")
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Fecha">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Responsable">
              <Select value={resp} onChange={(e) => setResp(e.target.value)}>
                <option value="">Sin indicar</option>
                {responsibles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Notas">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-12" />
          </Field>
          {lot && Number(qty) > 0 && <p className="text-[13px] text-muted">Pérdida: {money(Number(qty) * Number(lot.unit_cost ?? 0))}</p>}
        </div>
        <ActionMessages error={error} />
      </Modal>
    </>
  );
}

export function NewAdjustmentButton({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [dir, setDir] = useState<"entrada" | "salida">("salida");
  const pv = useVariantWithLots();
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const { run, pending, error } = useServerAction(createAdjustment);
  const ok = !!pv.variant && Number(qty) > 0 && reason.trim() && (dir === "salida" ? !!pv.lotId : cost.trim() !== "" && Number(cost.replace(",", ".")) >= 0);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Ajuste de stock</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Ajuste de stock"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={pending || !ok}
              onClick={async () => {
                const r = await run({
                  adjustment_date: date,
                  direction: dir,
                  variant_id: pv.variant!.variant_id,
                  quantity: Number(qty),
                  lot_id: dir === "salida" ? pv.lotId : null,
                  unit_cost: dir === "entrada" ? Number(cost.replace(",", ".")) : null,
                  reason: reason.trim(),
                });
                if (r.ok) {
                  setOpen(false);
                  pv.reset();
                  setReason("");
                }
              }}
            >
              Registrar ajuste
            </Button>
          </>
        }
      >
        <Notice tone="info" className="mb-3">
          Usa los ajustes solo para corregir recuentos. No se borra nada: el ajuste queda como un movimiento con su motivo.
        </Notice>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {(["salida", "entrada"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDir(d)}
              className={clsx("rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-semibold", dir === d ? "border-brand bg-brand-soft text-ink" : "border-line text-ink-soft")}
            >
              {d === "salida" ? "Quitar unidades" : "Añadir unidades"}
            </button>
          ))}
        </div>
        <div className="grid gap-3">
          <Field label="Producto" required htmlFor="">
            {pv.variant ? (
              <div className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-line px-3 py-2 text-sm">
                <span className="font-semibold">{variantDisplay(pv.variant.product_name, pv.variant.variant_name, pv.variant.variant_count)}</span>
                <Button size="sm" variant="ghost" onClick={pv.reset}>
                  Cambiar
                </Button>
              </div>
            ) : (
              <ProductPicker onSelect={pv.pick} onlyInStock={dir === "salida"} />
            )}
          </Field>
          {pv.variant && dir === "salida" && (
            <Field label="Pedido / lote del que salen" required htmlFor="">
              <LotSelect lots={pv.lots} lotId={pv.lotId} setLotId={pv.setLotId} />
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Unidades" required>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            {dir === "entrada" ? (
              <Field label="Coste por unidad (€)" required hint="Las unidades entran como un lote nuevo con este coste.">
                <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
              </Field>
            ) : (
              <Field label="Fecha">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            )}
          </div>
          <Field label="Motivo" required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-12" placeholder="Por ejemplo: recuento físico del 08/10" />
          </Field>
        </div>
        <ActionMessages error={error} />
      </Modal>
    </>
  );
}

export function ExitReasonEditor({ id, reason }: { id: string; reason: string }) {
  const [value, setValue] = useState(reason);
  const { run, pending, error } = useServerAction(updateStockExit);
  return (
    <span className="flex items-center gap-1.5">
      <select value={value} onChange={(e) => setValue(e.target.value)} className="h-11 rounded-[var(--radius-sm)] border border-line-strong bg-surface px-2 text-base sm:h-8 sm:text-[13px]" aria-label="Motivo">
        {Object.entries(EXIT_REASONS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      {value !== reason && (
        <Button size="sm" variant="primary" disabled={pending} onClick={() => run(id, value)}>
          Guardar
        </Button>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

export function VoidExitButton({ id }: { id: string }) {
  return (
    <ConfirmAction
      size="sm"
      label="Anular"
      title="Anular salida sin venta"
      description="Las unidades vuelven a su lote. La salida queda anulada en el historial."
      confirmLabel="Anular salida"
      requireReason
      action={(reason) => voidStockExit(id, reason)}
    />
  );
}

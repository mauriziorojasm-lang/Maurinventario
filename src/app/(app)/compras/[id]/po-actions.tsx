"use client";
import { useState } from "react";
import { ProductPicker } from "@/components/product-picker";
import { Button, Field, Input, Notice, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { ActionMessages, ConfirmAction, Modal, useServerAction } from "@/components/ui-client";
import { money } from "@/lib/format";
import type { Option, SellableVariant } from "@/lib/types";
import { variantDisplay } from "@/lib/types";
import { cancelPurchaseOrder, receivePurchaseOrder, savePurchaseOrder, setPurchaseCosts } from "../actions";
import { CostsEditor, distribute, type POCosts } from "../po-form";

type Item = { id: string; label: string; quantity_ordered: number; unit_cost: number };

export function ReceiveButton({ poId, orderNumber, items, extra, today }: { poId: string; orderNumber: number; items: Item[]; extra: number; today: string }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState(items.map((i) => ({ ...i, received: String(i.quantity_ordered), sub: null as SellableVariant | null, subQty: "", notes: "" })));
  const { run, pending, error } = useServerAction(receivePurchaseOrder);
  const set = (id: string, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // Vista previa del coste real con lo que de verdad llega
  const basis = rows.flatMap((r) => [
    { quantity: Math.max(0, Math.floor(Number(r.received) || 0)), unit_cost: r.unit_cost },
    { quantity: r.sub ? Math.max(0, Math.floor(Number(r.subQty) || 0)) : 0, unit_cost: r.unit_cost },
  ]);
  const real = distribute(basis, extra);
  const totalUnits = basis.reduce((a, b) => a + b.quantity, 0);
  const invalid = rows.some((r) => !/^\d+$/.test(r.received.trim()) || (r.sub && !/^[1-9]\d*$/.test(r.subQty.trim())));

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Recibir pedido
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        wide
        title={`Recibir el pedido #${orderNumber}`}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={pending || invalid || totalUnits === 0}
              onClick={async () => {
                const r = await run({
                  purchase_order_id: poId,
                  received_at: date,
                  lines: rows.map((x) => ({
                    item_id: x.id,
                    quantity_received: Number(x.received),
                    substitute_variant_id: x.sub?.variant_id ?? null,
                    substitute_quantity: x.sub ? Number(x.subQty) : null,
                    notes: x.notes.trim() || null,
                  })),
                });
                if (r.ok) setOpen(false);
              }}
            >
              {pending ? "Guardando…" : `Confirmar recepción (${totalUnits} uds.)`}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          Escribe las unidades que han llegado de verdad. Si de una línea no llega nada, pon 0 y se cancela. Si llegó otro producto en su lugar, indícalo como sustitución: el pedido no
          entra en stock y el sustituto sí.
        </p>
        <Field label="Fecha de recepción" className="mt-3 max-w-xs">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Table className="mt-4">
          <thead>
            <tr>
              <Th>Línea</Th>
              <Th num>Pedidas</Th>
              <Th num>Recibidas</Th>
              <Th num>Coste real</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="align-top">
                <Td>
                  <p className="font-semibold">{r.label}</p>
                  {r.sub ? (
                    <div className="mt-2 rounded-[var(--radius-sm)] border border-line bg-paper p-2">
                      <p className="text-[13px]">
                        Sustituido por <strong>{variantDisplay(r.sub.product_name, r.sub.variant_name, r.sub.variant_count)}</strong>
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <Input type="number" min={1} className="h-9 w-24" placeholder="Uds." value={r.subQty} onChange={(e) => set(r.id, { subQty: e.target.value })} />
                        <Button size="sm" variant="ghost" onClick={() => set(r.id, { sub: null, subQty: "" })}>
                          Quitar sustitución
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <details className="mt-1 text-[13px]">
                      <summary className="cursor-pointer text-brand-ink">Llegó otro producto en su lugar</summary>
                      <div className="mt-2">
                        <ProductPicker allowCreate onSelect={(v) => set(r.id, { sub: v, subQty: String(r.quantity_ordered), received: "0" })} placeholder="Busca el producto recibido" />
                      </div>
                    </details>
                  )}
                </Td>
                <Td num>{r.quantity_ordered}</Td>
                <Td num>
                  <Input type="number" min={0} className="ml-auto h-9 w-24 text-right" value={r.received} onChange={(e) => set(r.id, { received: e.target.value })} />
                </Td>
                <Td num>
                  {money(real[i * 2], { precise: true })}
                  {r.sub && <span className="block text-xs text-muted">sustituto: {money(real[i * 2 + 1], { precise: true })}</span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {invalid && <Notice tone="warn" className="mt-3">Revisa las cantidades: deben ser números enteros (0 o más).</Notice>}
        <ActionMessages error={error} />
      </Modal>
    </>
  );
}

export function CostsButton({ poId, costs, received }: { poId: string; costs: POCosts; received: boolean }) {
  const [open, setOpen] = useState(false);
  const [c, setC] = useState<POCosts>(costs);
  const { run, pending, error } = useServerAction(setPurchaseCosts);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Costes del pedido</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        wide
        title="Costes del pedido"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={pending}
              onClick={async () => {
                const r = await run(
                  poId,
                  Object.entries(c)
                    .filter(([, v]) => Number(String(v).replace(",", ".")) > 0)
                    .map(([cost_type, v]) => ({ cost_type, amount: Number(String(v).replace(",", ".")) })),
                );
                if (r.ok) setOpen(false);
              }}
            >
              Guardar costes
            </Button>
          </>
        }
      >
        {received && (
          <Notice tone="warn" className="mb-3">
            El pedido ya está recibido: al guardar se recalcula el coste real de sus lotes y, con él, el beneficio de las ventas que salieron de ellos.
          </Notice>
        )}
        <CostsEditor costs={c} setCosts={setC} />
        <ActionMessages error={error} />
      </Modal>
    </>
  );
}

export function HeaderEditButton({ po, suppliers }: { po: { id: string; order_number: number; supplier_id: string; order_date: string; notes: string | null }; suppliers: Option[] }) {
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState(po.supplier_id);
  const [date, setDate] = useState(po.order_date);
  const [notes, setNotes] = useState(po.notes ?? "");
  const { run, pending, error } = useServerAction(savePurchaseOrder);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Proveedor y datos</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Pedido #${po.order_number}`}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={pending}
              onClick={async () => {
                const r = await run({ id: po.id, supplier_id: supplier, order_date: date, notes: notes.trim() || null });
                if (r.ok) setOpen(false);
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Proveedor">
            <Select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha del pedido">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Notas">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <ActionMessages error={error} />
      </Modal>
    </>
  );
}

export function CancelPOButton({ poId, orderNumber }: { poId: string; orderNumber: number }) {
  return (
    <ConfirmAction
      label="Cancelar pedido"
      title={`Cancelar el pedido #${orderNumber}`}
      description="El pedido queda cancelado y no entra nada en stock. Se conserva en el historial."
      confirmLabel="Cancelar pedido"
      requireReason
      action={(reason) => cancelPurchaseOrder(poId, reason)}
    />
  );
}

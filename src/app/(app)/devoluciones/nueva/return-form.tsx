"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Notice, Table, Td, Textarea, Th, clsx } from "@/components/ui";
import { money } from "@/lib/format";
import { createReturn } from "../actions";

type Line = { id: string; label: string; quantity: number; already: number; unit_price: number; refunded: number };

export function ReturnForm({ saleId, saleNumber, lines, today }: { saleId: string; saleNumber: string; lines: Line[]; today: string }) {
  const router = useRouter();
  const [type, setType] = useState<"devolucion_producto" | "reembolso_sin_producto">("devolucion_producto");
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState(
    lines.map((l) => {
      const left = l.quantity - l.already;
      return { ...l, qty: left > 0 ? String(left) : "0", refund: left > 0 ? String(Math.round(l.unit_price * left * 100) / 100) : "0" };
    }),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const total = rows.reduce((a, r) => a + (Number(r.refund.replace(",", ".")) || 0), 0);
  const units = rows.reduce((a, r) => a + (Number(r.qty) || 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <h2 className="mb-3 text-[15px] font-bold">¿Qué ha pasado?</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["devolucion_producto", "El cliente devuelve el producto", "Le devuelves el dinero y la unidad vuelve a su lote. Se reduce la facturación y se recalcula el beneficio."],
              ["reembolso_sin_producto", "Reembolso sin devolver el producto", "Vinted o Wallapop devuelve el dinero y el cliente se queda el producto. No vuelve al stock y su coste se registra como pérdida."],
            ] as const
          ).map(([value, title, text]) => (
            <label key={value} className={clsx("cursor-pointer rounded-[var(--radius-sm)] border p-3", type === value ? "border-ledger bg-ledger-soft" : "border-line hover:border-line-strong")}>
              <span className="flex items-center gap-2 font-semibold">
                <input type="radio" name="tipo" checked={type === value} onChange={() => setType(value)} className="accent-[var(--color-ledger)]" />
                {title}
              </span>
              <span className="mt-1 block text-[13px] text-ink-soft">{text}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <h2 className="mb-3 text-[15px] font-bold">Productos de la venta {saleNumber}</h2>
        <Table>
          <thead>
            <tr>
              <Th>Producto</Th>
              <Th num>Vendidas</Th>
              <Th num>Ya devueltas</Th>
              <Th num>Devuelve ahora</Th>
              <Th num>Importe reembolsado (€)</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="font-semibold">{r.label}</Td>
                <Td num>{r.quantity}</Td>
                <Td num>{r.already}</Td>
                <Td num>
                  <Input type="number" min={0} max={r.quantity - r.already} className="ml-auto h-9 w-20 text-right" value={r.qty} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, qty: e.target.value } : x)))} />
                </Td>
                <Td num>
                  <Input inputMode="decimal" className="ml-auto h-9 w-28 text-right" value={r.refund} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, refund: e.target.value } : x)))} />
                  <span className="mt-1 block text-xs text-muted">cobrado {money(r.unit_price * r.quantity - r.refunded)}</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>

      <section className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Fecha" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Motivo" className="sm:col-span-2">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Por ejemplo: no le quedaba bien, llegó roto…" />
          </Field>
          <Field label="Notas" className="sm:col-span-3">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-12" />
          </Field>
        </div>
      </section>

      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={pending || units <= 0}
          onClick={async () => {
            setPending(true);
            setError(null);
            const res = await createReturn({
              sale_id: saleId,
              return_date: date,
              return_type: type,
              reason: reason.trim() || null,
              notes: notes.trim() || null,
              items: rows.filter((r) => Number(r.qty) > 0).map((r) => ({ sale_item_id: r.id, quantity: Number(r.qty), refund_amount: Number(r.refund.replace(",", ".")) || 0 })),
            });
            setPending(false);
            if (!res.ok) setError(res.error);
            else router.push(`/ventas/${saleId}`);
          }}
        >
          {pending ? "Guardando…" : `Registrar devolución (${money(total)})`}
        </Button>
        <span className="text-[13px] text-muted">{type === "devolucion_producto" ? `${units} ud. volverán al stock.` : "No vuelve nada al stock."}</span>
      </div>
    </div>
  );
}

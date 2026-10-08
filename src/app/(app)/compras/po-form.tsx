"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProductPicker } from "@/components/product-picker";
import { Button, Field, Input, Notice, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { COST_TYPES, money } from "@/lib/format";
import type { Option } from "@/lib/types";
import { variantDisplay } from "@/lib/types";
import { savePurchaseOrder } from "./actions";

export type POLine = { key: string; variant_id: string; label: string; quantity: string; unit_cost: string; notes: string };
export type POCosts = Record<string, string>;

const num = (s: string) => Number(String(s).replace(",", ".")) || 0;

/** Reparte los costes extra en proporción al valor de cada línea (igual que la base de datos). */
export function distribute(lines: { quantity: number; unit_cost: number }[], extra: number) {
  const value = lines.reduce((a, l) => a + l.quantity * l.unit_cost, 0);
  const qty = lines.reduce((a, l) => a + l.quantity, 0);
  return lines.map((l) => {
    if (l.quantity <= 0) return 0;
    if (value > 0) return l.unit_cost * (1 + extra / value);
    return l.unit_cost + (qty > 0 ? extra / qty : 0);
  });
}

export function CostsEditor({ costs, setCosts }: { costs: POCosts; setCosts: (c: POCosts) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {Object.entries(COST_TYPES).map(([k, label]) => (
        <Field key={k} label={`${label} (€)`}>
          <Input inputMode="decimal" value={costs[k] ?? ""} onChange={(e) => setCosts({ ...costs, [k]: e.target.value })} placeholder="0,00" />
        </Field>
      ))}
    </div>
  );
}

export function PurchaseOrderForm({
  suppliers,
  today,
  initial,
}: {
  suppliers: (Option & { is_placeholder: boolean })[];
  today: string;
  initial?: { id: string; order_number: number; supplier_id: string; order_date: string; notes: string | null; lines: POLine[]; costs: POCosts };
}) {
  const router = useRouter();
  const [supplier, setSupplier] = useState(initial?.supplier_id ?? "");
  const [orderDate, setOrderDate] = useState(initial?.order_date ?? today);
  const [orderNumber, setOrderNumber] = useState(initial ? String(initial.order_number) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<POLine[]>(initial?.lines ?? []);
  const [costs, setCosts] = useState<POCosts>(initial?.costs ?? {});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const extra = Object.values(costs).reduce((a, v) => a + num(v), 0);
  const parsed = lines.map((l) => ({ quantity: Math.max(0, Math.floor(num(l.quantity))), unit_cost: num(l.unit_cost) }));
  const real = distribute(parsed, extra);
  const merch = parsed.reduce((a, l) => a + l.quantity * l.unit_cost, 0);
  const invalid = lines.some((l) => !Number.isInteger(num(l.quantity)) || num(l.quantity) <= 0 || l.unit_cost.trim() === "" || num(l.unit_cost) < 0);

  async function save() {
    setPending(true);
    setError(null);
    const res = await savePurchaseOrder({
      id: initial?.id,
      order_number: orderNumber.trim() ? Number(orderNumber) : null,
      supplier_id: supplier,
      order_date: orderDate,
      notes: notes.trim() || null,
      items: lines.map((l) => ({ variant_id: l.variant_id, quantity: Math.floor(num(l.quantity)), unit_cost: num(l.unit_cost), notes: l.notes.trim() || null })),
      costs: Object.entries(costs)
        .filter(([, v]) => num(v) > 0)
        .map(([cost_type, v]) => ({ cost_type, amount: num(v) })),
    });
    setPending(false);
    if (!res.ok) setError(res.error);
    else router.push(`/compras/${res.data}`);
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Proveedor" required className="sm:col-span-2" hint={suppliers.length === 0 ? "Crea primero un proveedor en Proveedores." : "Un pedido pertenece a un solo proveedor."}>
            <Select value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              <option value="">Elige…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha del pedido" required>
            <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </Field>
          <Field label="Nº de pedido" hint="Vacío: el siguiente número.">
            <Input type="number" min={1} value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
          </Field>
          <Field label="Notas" className="sm:col-span-4">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-12" />
          </Field>
        </div>
      </section>

      <section className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <h2 className="mb-3 text-[15px] font-bold">Líneas del pedido</h2>
        <ProductPicker
          allowCreate
          placeholder="Añade un producto: busca por nombre o SKU"
          onSelect={(v) =>
            setLines((ls) => [...ls, { key: `${v.variant_id}-${Date.now()}`, variant_id: v.variant_id, label: variantDisplay(v.product_name, v.variant_name, v.variant_count), quantity: "1", unit_cost: "", notes: "" }])
          }
        />
        {lines.length > 0 && (
          <Table className="mt-3">
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th num>Unidades</Th>
                <Th num>Coste unitario (€)</Th>
                <Th num>Mercancía</Th>
                <Th num>Coste real / ud.</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.key}>
                  <Td className="font-semibold">{l.label}</Td>
                  <Td num>
                    <Input type="number" min={1} step={1} className="ml-auto h-9 w-24 text-right" value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, quantity: e.target.value } : x)))} />
                  </Td>
                  <Td num>
                    <Input inputMode="decimal" className="ml-auto h-9 w-28 text-right" value={l.unit_cost} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, unit_cost: e.target.value } : x)))} placeholder="0,00" />
                  </Td>
                  <Td num>{money(parsed[i].quantity * parsed[i].unit_cost)}</Td>
                  <Td num className="font-semibold">{money(real[i], { precise: true })}</Td>
                  <Td>
                    <Button size="sm" variant="ghost" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                      Quitar
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <h2 className="text-[15px] font-bold">Costes del pedido</h2>
        <p className="mb-3 mt-0.5 text-[13px] text-muted">Se reparten entre las líneas en proporción al valor de la mercancía. El resultado es el coste real por unidad de cada lote.</p>
        <CostsEditor costs={costs} setCosts={setCosts} />
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-1 text-sm">
          <div>
            <dt className="text-muted">Mercancía</dt>
            <dd className="num font-semibold">{money(merch)}</dd>
          </div>
          <div>
            <dt className="text-muted">Costes adicionales</dt>
            <dd className="num font-semibold">{money(extra)}</dd>
          </div>
          <div>
            <dt className="text-muted">Total del pedido</dt>
            <dd className="num text-base font-bold">{money(merch + extra)}</dd>
          </div>
        </dl>
      </section>

      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={save} disabled={pending || !supplier || !orderDate || lines.length === 0 || invalid}>
          {pending ? "Guardando…" : initial ? "Guardar cambios" : "Guardar como pendiente"}
        </Button>
        <p className="text-[13px] text-muted">El stock no entra hasta que registres la recepción del pedido.</p>
      </div>
    </div>
  );
}

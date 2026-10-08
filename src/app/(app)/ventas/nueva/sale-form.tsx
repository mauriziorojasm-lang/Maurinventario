"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ProductPicker } from "@/components/product-picker";
import { Button, Field, Input, LotTag, Notice, Select, Textarea, clsx } from "@/components/ui";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { AvailableLot, MobileOption, Option, PlatformOption, SellableVariant } from "@/lib/types";
import { variantDisplay } from "@/lib/types";
import { createSale, getLots, updateSale } from "../actions";

type Line = {
  key: string;
  variant: SellableVariant;
  lots: AvailableLot[] | null;
  lotId: string;
  quantity: string;
  price: string;
  notes: string;
  error?: string | null;
};

export function SaleForm({
  isAdmin,
  today,
  responsibles,
  ownResponsible,
  platforms,
  carriers,
  mobiles,
}: {
  isAdmin: boolean;
  today: string;
  responsibles: Option[];
  ownResponsible: Option | null;
  platforms: PlatformOption[];
  carriers: Option[];
  mobiles: MobileOption[];
}) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [responsible, setResponsible] = useState(ownResponsible?.id ?? (responsibles.length === 1 ? responsibles[0].id : ""));
  const [platformId, setPlatformId] = useState("");
  const [carrierId, setCarrierId] = useState("");
  const [shipping, setShipping] = useState<"pendiente" | "enviado">("pendiente");
  const [mobileId, setMobileId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [label, setLabel] = useState<File | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const platform = platforms.find((p) => p.id === platformId);
  const needsShipping = !!platform?.requires_shipping;

  async function addVariant(v: SellableVariant) {
    const key = `${v.variant_id}-${Date.now()}`;
    setLines((ls) => [...ls, { key, variant: v, lots: null, lotId: "", quantity: "1", price: v.normal_sale_price ? String(v.normal_sale_price) : "", notes: "" }]);
    const res = await getLots(v.variant_id);
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        if (!res.ok) return { ...l, lots: [], error: res.error };
        const lots = res.data ?? [];
        return { ...l, lots, lotId: lots.length === 1 ? lots[0].lot_id : "" };
      }),
    );
  }

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Comprobación de stock por lote (sumando líneas del mismo lote)
  const problems = useMemo(() => {
    const used = new Map<string, number>();
    for (const l of lines) if (l.lotId) used.set(l.lotId, (used.get(l.lotId) ?? 0) + (Number(l.quantity) || 0));
    const out = new Map<string, string>();
    for (const l of lines) {
      if (!l.lots) continue;
      if (l.lots.length === 0) {
        out.set(l.key, "No hay stock suficiente. Este producto no tiene unidades en ningún lote.");
        continue;
      }
      if (!l.lotId) {
        out.set(l.key, "Elige el pedido/lote de procedencia.");
        continue;
      }
      const q = Number(l.quantity);
      if (!Number.isInteger(q) || q <= 0) out.set(l.key, "Las unidades deben ser un número entero mayor que 0.");
      else {
        const lot = l.lots.find((x) => x.lot_id === l.lotId);
        if (lot && (used.get(l.lotId) ?? 0) > lot.quantity_available)
          out.set(l.key, `No hay stock suficiente. ${lot.label} solo tiene ${lot.quantity_available} unidad${lot.quantity_available === 1 ? "" : "es"}.`);
      }
      const p = Number(l.price.replace(",", "."));
      if (!out.has(l.key) && (!l.price.trim() || !Number.isFinite(p) || p < 0)) out.set(l.key, "Indica el precio de venta por unidad.");
      else if (!out.has(l.key) && p === 0) out.set(l.key, "Una venta a 0 € no es una venta: regístrala como salida sin venta.");
    }
    return out;
  }, [lines]);

  const total = lines.reduce((a, l) => a + (Number(l.quantity) || 0) * (Number(l.price.replace(",", ".")) || 0), 0);
  const canSave = lines.length > 0 && problems.size === 0 && !!platformId && (!isAdmin || !!responsible) && !pending;

  async function save() {
    setError(null);
    setPending(true);
    const res = await createSale({
      sale_date: date,
      responsible_id: isAdmin ? responsible : null,
      platform_id: platformId,
      carrier_id: needsShipping ? carrierId || null : null,
      mobile_device_id: mobileId || null,
      shipping_status: needsShipping ? shipping : null,
      external_reference: reference.trim() || null,
      notes: notes.trim() || null,
      items: lines.map((l) => ({
        variant_id: l.variant.variant_id,
        lot_id: l.lotId,
        quantity: Number(l.quantity),
        unit_price: Number(l.price.replace(",", ".")),
        notes: l.notes.trim() || null,
      })),
    });
    if (!res.ok || !res.data) {
      setPending(false);
      setError(res.ok ? "No se ha podido registrar la venta." : res.error);
      return;
    }
    const saleId = res.data;
    if (needsShipping && label) {
      const supabase = createClient();
      const path = `${saleId}/${Date.now()}-${label.name.replace(/[^\w.\-]+/g, "_")}`;
      const up = await supabase.storage.from("shipping-labels").upload(path, label, { upsert: false, contentType: label.type });
      if (up.error) {
        setPending(false);
        router.push(`/ventas/${saleId}?aviso=etiqueta`);
        return;
      }
      await updateSale({ id: saleId, shipping_label_path: path });
    }
    router.push(`/ventas/${saleId}?aviso=creada`);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-5">
        <section className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
          <h2 className="mb-3 text-[15px] font-bold">Productos</h2>
          <ProductPicker onSelect={addVariant} allowCreate={isAdmin} autoFocus />
          {lines.length === 0 && <p className="mt-3 text-sm text-muted">Busca un producto para añadirlo. Una venta puede tener varios productos.</p>}
          <ul className="mt-3 flex flex-col gap-3">
            {lines.map((l) => {
              const lot = l.lots?.find((x) => x.lot_id === l.lotId);
              const problem = problems.get(l.key) ?? l.error;
              return (
                <li key={l.key} className={clsx("rounded-[var(--radius-sm)] border p-3", problem ? "border-danger/40" : "border-line")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{variantDisplay(l.variant.product_name, l.variant.variant_name, l.variant.variant_count)}</p>
                      <p className="text-xs text-muted">{[l.variant.brand_name, l.variant.sku].filter(Boolean).join(", ") || " "}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Quitar producto">
                      Quitar
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1.6fr_0.7fr_0.9fr]">
                    <Field label="Pedido / lote de procedencia" required htmlFor={`lote-${l.key}`}>
                      {l.lots === null ? (
                        <p className="h-10 text-sm leading-10 text-muted">Cargando lotes…</p>
                      ) : l.lots.length === 0 ? (
                        <p className="h-10 text-sm leading-10 text-danger">Sin stock en ningún lote</p>
                      ) : (
                        <Select id={`lote-${l.key}`} value={l.lotId} onChange={(e) => update(l.key, { lotId: e.target.value })}>
                          <option value="">Elige el lote…</option>
                          {l.lots.map((x) => (
                            <option key={x.lot_id} value={x.lot_id}>
                              {x.label}: {x.quantity_available} uds.{x.unit_cost !== null ? `, coste ${money(x.unit_cost)}` : ""}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Field label="Unidades" required>
                      <Input type="number" min={1} step={1} inputMode="numeric" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
                    </Field>
                    <Field label="Precio por unidad (€)" required>
                      <Input inputMode="decimal" value={l.price} onChange={(e) => update(l.key, { price: e.target.value })} placeholder="0,00" />
                    </Field>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <Input className="h-9 max-w-md text-[13px]" placeholder="Detalle (color, estado…), opcional" value={l.notes} onChange={(e) => update(l.key, { notes: e.target.value })} />
                    <span className="flex items-center gap-2 text-sm">
                      {lot && <LotTag label={lot.label} />}
                      <span className="num font-semibold">{money((Number(l.quantity) || 0) * (Number(l.price.replace(",", ".")) || 0))}</span>
                    </span>
                  </div>
                  {problem && <p className="mt-2 text-[13px] font-medium text-danger">{problem}</p>}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
          <h2 className="mb-3 text-[15px] font-bold">Datos de la venta</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fecha" required>
              <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>
            {isAdmin ? (
              <Field label="Responsable" required hint={responsibles.length === 0 ? "Crea primero un responsable en Responsables." : undefined}>
                <Select value={responsible} onChange={(e) => setResponsible(e.target.value)}>
                  <option value="">Elige…</option>
                  {responsibles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label="Responsable">
                <Input value={ownResponsible?.name ?? "Sin vincular"} disabled />
              </Field>
            )}
            <Field label="Plataforma" required>
              <Select value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
                <option value="">Elige…</option>
                {platforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Móvil utilizado">
              <Select value={mobileId} onChange={(e) => setMobileId(e.target.value)}>
                <option value="">Sin indicar</option>
                {mobiles.map((m) => (
                  <option key={m.id} value={m.id}>
                    Móvil {m.number}
                    {m.name && m.name !== `Móvil ${m.number}` ? ` (${m.name})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            {needsShipping && (
              <>
                <Field label="Empresa de transporte">
                  <Select value={carrierId} onChange={(e) => setCarrierId(e.target.value)}>
                    <option value="">Sin indicar</option>
                    {carriers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Estado del envío">
                  <Select value={shipping} onChange={(e) => setShipping(e.target.value as "pendiente" | "enviado")}>
                    <option value="pendiente">Pendiente</option>
                    <option value="enviado">Enviado</option>
                  </Select>
                </Field>
                <Field label="Etiqueta de envío" hint="PDF o imagen, máximo 10 MB." className="sm:col-span-2">
                  <Input type="file" accept="application/pdf,image/*" className="py-1.5" onChange={(e) => setLabel(e.target.files?.[0] ?? null)} />
                </Field>
              </>
            )}
            <Field label="Referencia de la venta" hint="Opcional, por ejemplo el número de pedido de Vinted.">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            <Field label="Notas">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-10" />
            </Field>
          </div>
        </section>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <section className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
          <h2 className="text-[15px] font-bold">Resumen</h2>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Productos</dt>
              <dd className="num">{lines.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Unidades</dt>
              <dd className="num">{lines.reduce((a, l) => a + (Number(l.quantity) || 0), 0)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd className="num">{money(total)}</dd>
            </div>
          </dl>
          {error && (
            <Notice tone="bad" className="mt-3">
              {error}
            </Notice>
          )}
          <Button variant="primary" className="mt-4 w-full" disabled={!canSave} onClick={save}>
            {pending ? "Guardando…" : "Registrar venta"}
          </Button>
          {!platformId && lines.length > 0 && <p className="mt-2 text-xs text-muted">Falta elegir la plataforma.</p>}
          {isAdmin && !responsible && lines.length > 0 && <p className="mt-1 text-xs text-muted">Falta elegir el responsable.</p>}
        </section>
      </aside>
    </div>
  );
}

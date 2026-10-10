"use client";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
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
  // Un identificador por venta: si se reintenta tras un corte, no se duplica
  const requestId = useRef<string>(newUuid());
  // Paso actual (solo en el móvil: 1 producto, 2 datos, 3 confirmar)
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const goTo = (n: 1 | 2 | 3) => {
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const platform = platforms.find((p) => p.id === platformId);
  const needsShipping = !!platform?.requires_shipping;

  async function addVariant(v: SellableVariant) {
    const key = `${v.variant_id}-${Date.now()}`;
    setLines((ls) => [
      ...ls,
      { key, variant: v, lots: null, lotId: "", quantity: "1", price: v.normal_sale_price ? String(v.normal_sale_price) : "", notes: "" },
    ]);
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
  const productsOk = lines.length > 0 && problems.size === 0 && lines.every((l) => l.lots !== null);
  const dataOk = !!platformId && (!isAdmin || !!responsible);
  const canSave = productsOk && dataOk && !pending;
  const totalUnits = lines.reduce((a, l) => a + (Number(l.quantity) || 0), 0);
  const stepHidden = (n: number) => (step === n ? "" : "max-md:hidden");

  async function save() {
    if (pending) return;
    setError(null);
    setPending(true);
    let goingAway = false;
    try {
      const res = await createSale({
        client_request_id: requestId.current,
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
        setError(res.ok ? "No se ha podido registrar la venta." : res.error);
        return;
      }
      const saleId = res.data;
      goingAway = true;
      if (needsShipping && label) {
        const supabase = createClient();
        const path = `${saleId}/${Date.now()}-${label.name.replace(/[^\w.\-]+/g, "_")}`;
        const up = await supabase.storage.from("shipping-labels").upload(path, label, { upsert: false, contentType: label.type });
        if (up.error) {
          router.push(`/ventas/${saleId}?aviso=etiqueta`);
          return;
        }
        await updateSale({ id: saleId, shipping_label_path: path });
      }
      router.push(`/ventas/${saleId}?aviso=creada`);
    } catch {
      // Sin conexión o corte: se puede volver a pulsar sin miedo (no se duplica)
      setError("No se ha podido conectar. Comprueba la conexión y vuelve a pulsar «Registrar venta»: no se registrará dos veces.");
    } finally {
      // Si se va a la venta, el botón sigue en «Guardando…» hasta cambiar de pantalla
      if (!goingAway) setPending(false);
    }
  }

  const steps = ["Producto", "Datos", "Confirmar"];

  return (
    <div className="grid gap-5 max-md:pb-24 lg:grid-cols-[1fr_340px]">
      {/* Pasos (solo móvil) */}
      <ol className="grid grid-cols-3 gap-2 md:hidden" aria-label="Pasos">
        {steps.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const reachable = n === 1 || (n === 2 && productsOk) || (n === 3 && productsOk && dataOk);
          return (
            <li key={label}>
              <button
                type="button"
                disabled={!reachable}
                onClick={() => goTo(n)}
                aria-current={step === n ? "step" : undefined}
                className="press flex w-full flex-col gap-1.5 text-left disabled:opacity-60"
              >
                <span className={clsx("h-1.5 rounded-full transition-colors duration-300", step >= n ? "bg-brand" : "bg-line-strong")} />
                <span className={clsx("text-[12px] font-semibold uppercase tracking-[0.06em]", step === n ? "text-ink" : "text-muted")}>
                  {n}. {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex min-w-0 flex-col gap-5">
        <section className={clsx("rounded-[var(--radius-md)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]", stepHidden(1))}>
          <h2 className="display mb-3 text-[22px] uppercase">
            <span className="md:hidden">¿Qué vendes?</span>
            <span className="max-md:hidden">Productos</span>
          </h2>
          <ProductPicker onSelect={addVariant} allowCreate={isAdmin} autoFocus />
          {lines.length === 0 && <p className="mt-3 text-sm text-muted">Busca un producto para añadirlo. Una venta puede tener varios productos.</p>}
          <ul className="mt-3 flex flex-col gap-3">
            {lines.map((l) => {
              const lot = l.lots?.find((x) => x.lot_id === l.lotId);
              const problem = problems.get(l.key) ?? l.error;
              return (
                <li key={l.key} className={clsx("animate-rise rounded-[var(--radius-md)] border p-3", problem ? "border-danger/40" : "border-line")}>
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
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        value={l.quantity}
                        onChange={(e) => update(l.key, { quantity: e.target.value })}
                      />
                    </Field>
                    <Field label="Precio por unidad (€)" required>
                      <Input inputMode="decimal" value={l.price} onChange={(e) => update(l.key, { price: e.target.value })} placeholder="0,00" />
                    </Field>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <Input
                      className="h-10 max-w-md sm:h-9 sm:text-[13px]"
                      placeholder="Detalle (color, estado…), opcional"
                      value={l.notes}
                      onChange={(e) => update(l.key, { notes: e.target.value })}
                    />
                    <span className="flex items-center gap-2 text-sm">
                      {lot && <LotTag label={lot.label} />}
                      <span className="display num text-[20px]">{money((Number(l.quantity) || 0) * (Number(l.price.replace(",", ".")) || 0))}</span>
                    </span>
                  </div>
                  {problem && <p className="mt-2 text-[13px] font-medium text-danger">{problem}</p>}
                </li>
              );
            })}
          </ul>
        </section>

        <section className={clsx("rounded-[var(--radius-md)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]", stepHidden(2))}>
          <h2 className="display mb-3 text-[22px] uppercase">Datos de la venta</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[13px] font-semibold text-ink-soft">
                Plataforma<span className="text-danger"> *</span>
              </span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Plataforma">
                {platforms.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={platformId === p.id}
                    onClick={() => setPlatformId(p.id)}
                    className={clsx(
                      "press h-11 rounded-full border px-5 text-sm font-semibold",
                      platformId === p.id ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface text-ink hover:border-ink/40",
                    )}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
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
                <div className="flex animate-rise flex-col gap-1.5 sm:col-span-2">
                  <span className="text-[13px] font-semibold text-ink-soft">Paquetería</span>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Paquetería">
                    {carriers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={carrierId === c.id}
                        onClick={() => setCarrierId(carrierId === c.id ? "" : c.id)}
                        className={clsx(
                          "press h-10 rounded-full border px-4 text-[13.5px] font-semibold",
                          carrierId === c.id
                            ? "border-brand bg-brand-soft text-ink ring-1 ring-brand"
                            : "border-line-strong bg-surface text-ink hover:border-ink/40",
                        )}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
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

      <aside className={clsx("lg:sticky lg:top-6 lg:self-start", stepHidden(3))}>
        <section className="rounded-[var(--radius-md)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
          <h2 className="display text-[22px] uppercase">Resumen</h2>
          {/* Repaso de todo (solo móvil, en el paso 3) */}
          <div className="mt-3 flex flex-col gap-3 md:hidden">
            <ul className="flex flex-col gap-2">
              {lines.map((l) => {
                const lot = l.lots?.find((x) => x.lot_id === l.lotId);
                return (
                  <li key={l.key} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {l.quantity} × {variantDisplay(l.variant.product_name, l.variant.variant_name, l.variant.variant_count)}
                      </span>
                      {lot && <LotTag label={lot.label} />}
                    </span>
                    <span className="num font-semibold">{money((Number(l.quantity) || 0) * (Number(l.price.replace(",", ".")) || 0))}</span>
                  </li>
                );
              })}
            </ul>
            <p className="rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2 text-[13px] text-ink-soft">
              {[
                platform?.name,
                needsShipping ? (carriers.find((c) => c.id === carrierId)?.name ?? "Paquetería sin indicar") : "En mano",
                needsShipping ? (shipping === "enviado" ? "Enviado" : "Pendiente de envío") : null,
                isAdmin ? responsibles.find((r) => r.id === responsible)?.name : ownResponsible?.name,
                date !== today ? date.split("-").reverse().join("/") : "Hoy",
              ]
                .filter(Boolean)
                .join(" · ")}
              {label && <span className="block">Etiqueta: {label.name}</span>}
            </p>
          </div>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Productos</dt>
              <dd className="num">{lines.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Unidades</dt>
              <dd className="num">{totalUnits}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-line pt-2">
              <dt className="text-base font-bold">Total</dt>
              <dd className="display num text-[34px]">{money(total)}</dd>
            </div>
          </dl>
          {error && (
            <Notice tone="bad" className="mt-3">
              {error}
            </Notice>
          )}
          <Button variant="primary" className="mt-4 w-full max-md:hidden" disabled={!canSave} onClick={save}>
            {pending ? "Guardando…" : "Registrar venta"}
          </Button>
          {!platformId && lines.length > 0 && <p className="mt-2 text-xs text-muted">Falta elegir la plataforma.</p>}
          {isAdmin && !responsible && lines.length > 0 && <p className="mt-1 text-xs text-muted">Falta elegir el responsable.</p>}
        </section>
      </aside>

      {/* Botón fijo abajo (móvil), encima de la barra de navegación */}
      <div className="fixed inset-x-0 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-20 px-4 md:hidden no-print">
        <div className="mx-auto flex max-w-xl items-center gap-3 rounded-[var(--radius-lg)] border border-line bg-surface/95 p-2 pl-4 shadow-[var(--shadow-pop)] backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              {lines.length ? `${totalUnits} ${totalUnits === 1 ? "ud." : "uds."}` : "Sin productos"}
            </p>
            <p className="display num text-[24px] leading-none">{money(total)}</p>
          </div>
          {step > 1 && (
            <Button variant="ghost" onClick={() => goTo((step - 1) as 1 | 2)} aria-label="Paso anterior">
              Atrás
            </Button>
          )}
          {step === 1 && (
            <Button variant="primary" disabled={!productsOk} onClick={() => goTo(2)}>
              Siguiente →
            </Button>
          )}
          {step === 2 && (
            <Button variant="primary" disabled={!dataOk} onClick={() => goTo(3)}>
              Siguiente →
            </Button>
          )}
          {step === 3 && (
            <Button variant="primary" disabled={!canSave} onClick={save}>
              {pending ? "Guardando…" : "Registrar venta"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function newUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

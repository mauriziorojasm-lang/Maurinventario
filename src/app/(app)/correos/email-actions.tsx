"use client";
import Link from "next/link";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { ProductPicker } from "@/components/product-picker";
import { Button, Field, Notice, Select, buttonClass, clsx } from "@/components/ui";
import { ActionMessages, ConfirmAction, Modal, useServerAction } from "@/components/ui-client";
import { money } from "@/lib/format";
import type { SellableVariant } from "@/lib/types";
import { variantDisplay } from "@/lib/types";
import { disconnectGmail, dismissEmail, undoEmail, linkLabel, resolveSale, retryEmail, saveAccount, setDefaultResponsible, syncNow } from "./actions";
import type { EmailRowView } from "./page";

export function ConnectionButtons({ connected, credentials, status }: { connected: boolean; credentials: boolean; status: string }) {
  const sync = useServerAction(syncNow);
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {/* Enlace normal: la conexión pasa por la pantalla de Google */}
        <a
          href="/api/correo/conectar"
          className={buttonClass(connected && status === "conectado" ? "secondary" : "primary", "md", !credentials ? "pointer-events-none opacity-50" : undefined)}
          aria-disabled={!credentials}
        >
          {connected ? "Volver a conectar" : "Conectar Gmail"}
        </a>
        {connected && (
          <Button variant="primary" onClick={() => sync.run()} disabled={sync.pending}>
            <RefreshCw size={16} strokeWidth={2.5} className={sync.pending ? "animate-spin" : undefined} />
            {sync.pending ? "Revisando…" : "Revisar ahora"}
          </Button>
        )}
        {connected && (
          <ConfirmAction
            label="Desconectar"
            title="Desconectar Gmail"
            description="Se dejarán de leer los correos. Las ventas ya registradas no se tocan. Si vuelves a conectar, se empezará desde ese momento."
            confirmLabel="Desconectar"
            action={() => disconnectGmail()}
          />
        )}
      </div>
      <ActionMessages error={sync.error} message={sync.message} />
    </div>
  );
}

export function DefaultResponsible({ value, responsibles }: { value: string | null; responsibles: { id: string; name: string }[] }) {
  const { run, pending, error, message } = useServerAction(setDefaultResponsible);
  return (
    <Field label="Responsable por defecto" hint="Para las ventas de cuentas que no tengan responsable asignado.">
      <Select defaultValue={value ?? ""} disabled={pending} onChange={(e) => run(e.target.value || null)}>
        <option value="">— Ninguno (la venta queda para revisar) —</option>
        {responsibles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </Select>
      <ActionMessages error={error} message={message} />
    </Field>
  );
}

export function AccountRow({
  account,
  responsibles,
  mobiles,
}: {
  account: { id: string; platform: string; handle: string; responsible_id: string | null; mobile_device_id: string | null };
  responsibles: { id: string; name: string }[];
  mobiles: { id: string; number: number; name: string }[];
}) {
  const [resp, setResp] = useState(account.responsible_id ?? "");
  const [mob, setMob] = useState(account.mobile_device_id ?? "");
  const { run, pending, error, message } = useServerAction(saveAccount);
  const save = (r: string, m: string) => run({ id: account.id, responsible_id: r || null, mobile_device_id: m || null });
  return (
    <li className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_1fr_1fr] sm:items-end">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{account.platform === "vinted" ? "Vinted" : "Wallapop"}</p>
        <p className="truncate font-semibold">{account.handle}</p>
      </div>
      <Field label="Responsable">
        <Select
          value={resp}
          disabled={pending}
          onChange={(e) => {
            setResp(e.target.value);
            save(e.target.value, mob);
          }}
        >
          <option value="">— El de por defecto —</option>
          {responsibles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Móvil">
        <Select
          value={mob}
          disabled={pending}
          onChange={(e) => {
            setMob(e.target.value);
            save(resp, e.target.value);
          }}
        >
          <option value="">— Sin móvil —</option>
          {mobiles.map((m) => (
            <option key={m.id} value={m.id}>
              Móvil {m.number} · {m.name}
            </option>
          ))}
        </Select>
      </Field>
      {(error || message) && (
        <div className="sm:col-span-3">
          <ActionMessages error={error} message={message} />
        </div>
      )}
    </li>
  );
}

/** Acciones sobre un correo que necesita una persona. */
export function IncidentActions({ email }: { email: EmailRowView }) {
  const retry = useServerAction(retryEmail);
  const isSale = email.kind === "vinted_venta" || email.kind === "wallapop_venta";
  const isLabel = email.kind === "vinted_etiqueta";
  const productCandidates = (email.candidates ?? []).filter((c) => c.variant_id);
  const saleCandidates = (email.candidates ?? []).filter((c) => c.sale_id);
  const amountsDoubt = /importes/.test(email.review_reason ?? "");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2 lg:justify-end">
        {isSale && email.status !== "pendiente" && !amountsDoubt && <ChooseProduct email={email} suggestions={productCandidates} />}
        {isSale && amountsDoubt && (
          <Link href="/ventas/nueva" className={buttonClass("primary", "sm")}>
            Registrar a mano
          </Link>
        )}
        {isLabel && email.status !== "pendiente" && <ChooseSale email={email} candidates={saleCandidates} />}
        <Button size="sm" onClick={() => retry.run(email.id)} disabled={retry.pending}>
          {retry.pending ? "Reintentando…" : "Reintentar"}
        </Button>
        <ConfirmAction
          size="sm"
          variant="secondary"
          label="Descartar"
          title="Descartar este correo"
          description={
            isSale
              ? "No se creará ninguna venta con este correo. Úsalo si ya la registraste a mano o si no es una venta real."
              : "La etiqueta no se añadirá a ninguna venta. Podrás subirla a mano desde la ficha de la venta."
          }
          confirmLabel="Descartar"
          action={() => dismissEmail(email.id)}
        />
      </div>
      <ActionMessages error={retry.error} message={retry.message} />
    </div>
  );
}

function ChooseProduct({ email, suggestions }: { email: EmailRowView; suggestions: { variant_id?: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<{ id: string; label: string } | null>(null);
  const [remember, setRemember] = useState(true);
  const { run, pending, error } = useServerAction(resolveSale);
  const p = email.parsed as { product?: string; price?: number; buyer?: string };
  return (
    <>
      <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
        Elegir producto
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="¿Qué producto es?"
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
                const r = await run(email.id, picked.id, remember);
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
          <p className="font-semibold">{p.product}</p>
          <p className="num text-ink-soft">
            {typeof p.price === "number" ? money(p.price) : ""}
            {p.buyer ? ` · ${p.buyer}` : ""}
          </p>
        </div>
        {suggestions.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-[13px] font-semibold text-ink-soft">Parecidos en tu inventario</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s.variant_id}
                  type="button"
                  onClick={() => setPicked({ id: s.variant_id!, label: s.label })}
                  className={clsx(
                    "press rounded-full border px-3 py-1.5 text-[13px] font-semibold",
                    picked?.id === s.variant_id ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface hover:border-brand",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3">
          <p className="mb-1.5 text-[13px] font-semibold text-ink-soft">O búscalo</p>
          <ProductPicker
            onlyInStock
            onSelect={(v: SellableVariant) => setPicked({ id: v.variant_id, label: variantDisplay(v.product_name, v.variant_name, v.variant_count) })}
          />
        </div>
        {picked && (
          <Notice tone="info" className="mt-3">
            Elegido: <strong>{picked.label}</strong>. Se descontará 1 unidad del lote más antiguo.
          </Notice>
        )}
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Recordar que «{p.product}» es este producto (la próxima venta se registrará sola)</span>
        </label>
        {error && (
          <Notice tone="bad" className="mt-3">
            {error}
          </Notice>
        )}
      </Modal>
    </>
  );
}

function ChooseSale({ email, candidates }: { email: EmailRowView; candidates: { sale_id?: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [force, setForce] = useState(false);
  const { run, pending, error } = useServerAction(linkLabel);
  const manualConflict = /subida a mano/.test(error ?? email.review_reason ?? "");
  return (
    <>
      <Button size="sm" variant="primary" onClick={() => setOpen(true)} disabled={candidates.length === 0}>
        Elegir la venta
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="¿De qué venta es la etiqueta?"
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
                const r = await run(email.id, picked, force);
                if (r.ok) setOpen(false);
              }}
            >
              {pending ? "Añadiendo…" : "Añadir la etiqueta"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          Etiqueta de <strong>{String((email.parsed as { product?: string }).product ?? "un artículo")}</strong>. Elige la venta (número · fecha · comprador):
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {candidates.map((c) => (
            <li key={c.sale_id}>
              <label
                className={clsx(
                  "press flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-2.5 text-sm",
                  picked === c.sale_id ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong",
                )}
              >
                <input type="radio" name={`sale-${email.id}`} checked={picked === c.sale_id} onChange={() => setPicked(c.sale_id!)} className="accent-[var(--color-brand)]" />
                <span className="num">{c.label}</span>
              </label>
            </li>
          ))}
        </ul>
        {manualConflict && (
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={force} onChange={(e) => setForce(e.target.checked)} />
            <span>Esa venta ya tiene una etiqueta subida a mano. Sustituirla por la del correo.</span>
          </label>
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

export function UndoButton({ id }: { id: string }) {
  const { run, pending, error, message } = useServerAction(undoEmail);
  return (
    <div className="shrink-0">
      <Button size="sm" onClick={() => run(id)} disabled={pending}>
        {pending ? "Deshaciendo…" : "Volver a detectadas"}
      </Button>
      <ActionMessages error={error} message={message} />
    </div>
  );
}

"use client";
import { useState } from "react";
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui";
import { ActionMessages, useServerAction } from "@/components/ui-client";
import { TRACKING_LABEL, type TrackingStatus } from "@/components/tracking";
import { markAlertsRead, refreshTracking, updateTracking } from "./actions";

/** Código de seguimiento (con copiar y enlace a la web del transportista). */
export function TrackingCode({ code, link }: { code: string; link: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <span className="num truncate font-medium">{code}</span>
      <button
        type="button"
        className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-faint hover:bg-subtle hover:text-ink"
        aria-label="Copiar código"
        title={copied ? "Copiado" : "Copiar"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* sin permiso de portapapeles */
          }
        }}
      >
        <Copy size={15} strokeWidth={1.75} />
      </button>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-faint hover:bg-subtle hover:text-ink"
          aria-label="Ver en la web del transportista"
          title="Ver en la web del transportista"
        >
          <ExternalLink size={15} strokeWidth={1.75} />
        </a>
      )}
      {copied && <span className="text-[12px] text-good-ink">Copiado</span>}
    </span>
  );
}

/** Añadir o cambiar el código y el transportista; cambiar el estado a mano. */
export function TrackingEditor({
  saleId,
  code,
  carrierId,
  carriers,
  shipped,
  status,
  automatic,
}: {
  saleId: string;
  code: string | null;
  carrierId: string | null;
  carriers: { id: string; name: string }[];
  shipped: boolean;
  status: string;
  automatic: boolean;
}) {
  const [num, setNum] = useState(code ?? "");
  const [car, setCar] = useState(carrierId ?? "");
  const [st, setSt] = useState<TrackingStatus | "">("");
  const [note, setNote] = useState("");
  const save = useServerAction(updateTracking);
  const manual = useServerAction(updateTracking);
  const refresh = useServerAction(refreshTracking);
  const changed = num.trim().toUpperCase().replace(/\s+/g, "") !== (code ?? "") || car !== (carrierId ?? "");
  return (
    <div className="flex flex-col gap-5">
      <form
        className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          save.run({ id: saleId, tracking_number: num.trim() || null, carrier_id: car || null });
        }}
      >
        <Field label={code ? "Código de seguimiento" : "Añadir código de seguimiento"} hint={!code ? "Lo encuentras en la etiqueta o en el correo del transportista." : undefined}>
          <Input value={num} onChange={(e) => setNum(e.target.value)} placeholder="Ej. PQ4D8A0712345670128001E" autoCapitalize="characters" className="num" />
        </Field>
        <Field label="Transportista">
          <Select value={car} onChange={(e) => setCar(e.target.value)}>
            <option value="">Sin transportista</option>
            {carriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant={changed ? "primary" : "secondary"} disabled={!changed || save.pending}>
          {save.pending ? "Guardando…" : "Guardar"}
        </Button>
      </form>
      <ActionMessages error={save.error} message={save.message} />

      {shipped && (
        <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <Field label="Cambiar el estado a mano" hint={automatic ? "El seguimiento automático lo actualiza solo; úsalo si sabes algo que el transportista aún no dice." : "Sin seguimiento automático: actualízalo tú."}>
            <Select value={st} onChange={(e) => setSt(e.target.value as TrackingStatus | "")}>
              <option value="">Elige…</option>
              {(["en_transito", "en_reparto", "entregado", "incidencia", "devuelto", "cancelado"] as TrackingStatus[]).map((s) => (
                <option key={s} value={s} disabled={s === status}>
                  {TRACKING_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nota (opcional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Recogido en el punto de entrega" maxLength={300} />
          </Field>
          <Button
            variant="secondary"
            className="sm:col-span-2 sm:justify-self-start"
            disabled={!st || manual.pending}
            onClick={async () => {
              if (!st) return;
              const r = await manual.run({ id: saleId, status: st as Exclude<TrackingStatus, "pendiente">, note: note.trim() || undefined });
              if (r.ok) {
                setSt("");
                setNote("");
              }
            }}
          >
            {manual.pending ? "Guardando…" : "Actualizar estado"}
          </Button>
        </div>
      )}
      <ActionMessages error={manual.error} message={manual.message} />

      {automatic && shipped && code && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button size="sm" onClick={() => refresh.run(saleId)} disabled={refresh.pending}>
            <RefreshCw size={15} strokeWidth={1.75} className={refresh.pending ? "animate-spin" : undefined} />
            {refresh.pending ? "Consultando…" : "Consultar ahora"}
          </Button>
          <ActionMessages error={refresh.error} message={refresh.message} />
        </div>
      )}
    </div>
  );
}

export function RefreshAllButton() {
  const { run, pending, error, message } = useServerAction(refreshTracking);
  return (
    <span className="flex flex-col items-end">
      <Button onClick={() => run()} disabled={pending}>
        <RefreshCw size={16} strokeWidth={1.75} className={pending ? "animate-spin" : undefined} />
        {pending ? "Actualizando…" : "Actualizar envíos"}
      </Button>
      {(error || message) && <span className={error ? "mt-1 max-w-xs text-right text-xs text-danger" : "mt-1 text-xs text-good-ink"}>{error ?? message}</span>}
    </span>
  );
}

export function MarkAlertsReadButton({ ids, label = "Marcar como vistas" }: { ids: number[] | null; label?: string }) {
  const { run, pending } = useServerAction(markAlertsRead);
  return (
    <Button size="sm" variant="ghost" onClick={() => run(ids)} disabled={pending}>
      {pending ? "…" : label}
    </Button>
  );
}

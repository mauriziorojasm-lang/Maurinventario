/**
 * Piezas visuales del seguimiento de envíos: estado, barra de progreso e
 * historial (línea de tiempo). Sin estado: sirven en servidor y cliente.
 */
import { Check } from "lucide-react";
import { Badge, clsx } from "./ui";

export type TrackingStatus = "pendiente" | "enviado" | "en_transito" | "en_reparto" | "entregado" | "incidencia" | "devuelto" | "cancelado" | "desconocido";

export const TRACKING_LABEL: Record<TrackingStatus, string> = {
  pendiente: "Pendiente",
  enviado: "Enviado",
  en_transito: "En tránsito",
  en_reparto: "En reparto",
  entregado: "Entregado",
  incidencia: "Incidencia",
  devuelto: "Devuelto",
  cancelado: "Cancelado",
  desconocido: "Desconocido",
};

const TONE: Record<TrackingStatus, "neutral" | "good" | "warn" | "bad" | "info"> = {
  pendiente: "neutral",
  enviado: "info",
  en_transito: "info",
  en_reparto: "good",
  entregado: "good",
  incidencia: "warn",
  devuelto: "bad",
  cancelado: "neutral",
  desconocido: "neutral",
};

export function TrackingBadge({ status }: { status: string | null | undefined }) {
  const s = (status ?? "pendiente") as TrackingStatus;
  return (
    <Badge tone={TONE[s] ?? "neutral"} dot>
      {TRACKING_LABEL[s] ?? s}
    </Badge>
  );
}

const STEPS: { key: TrackingStatus; label: string }[] = [
  { key: "enviado", label: "Enviado" },
  { key: "en_transito", label: "En tránsito" },
  { key: "en_reparto", label: "En reparto" },
  { key: "entregado", label: "Entregado" },
];
const STEP_INDEX: Partial<Record<TrackingStatus, number>> = { enviado: 0, desconocido: 0, en_transito: 1, incidencia: 1, en_reparto: 2, entregado: 3 };

/** Barra de 4 pasos: dónde está el paquete de un vistazo. */
export function TrackingProgress({ status, compact }: { status: string | null | undefined; compact?: boolean }) {
  const s = (status ?? "pendiente") as TrackingStatus;
  const at = s === "pendiente" ? -1 : (STEP_INDEX[s] ?? 0);
  const problem = s === "incidencia" || s === "devuelto" || s === "cancelado";
  return (
    <div className="w-full" aria-label={`Estado: ${TRACKING_LABEL[s] ?? s}`}>
      <div className="flex gap-1">
        {STEPS.map((st, i) => (
          <span
            key={st.key}
            className={clsx(
              "h-1.5 flex-1 rounded-full transition-colors duration-500",
              i <= at ? (problem && i === at ? "bg-warn" : s === "entregado" ? "bg-brand-mark" : "bg-ink") : "bg-subtle",
            )}
          />
        ))}
      </div>
      {!compact && (
        <div className="mt-1.5 grid grid-cols-4 text-[11.5px] text-faint">
          {STEPS.map((st, i) => (
            <span key={st.key} className={clsx(i === at && "font-semibold text-ink", i === 3 && "text-right", (i === 1 || i === 2) && "text-center")}>
              {st.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export type TimelineEvent = { id: number | string; at: string; status: string; description: string; location: string | null; source: string };

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)).replace(",", " ·");

/** Historial del envío: el estado actual arriba y destacado. */
export function TrackingTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return <p className="text-[13.5px] text-muted">Aún no hay movimientos.</p>;
  // El más reciente arriba; «Marcado como enviado en Resellap» es el punto de partida y va siempre al final
  const sorted = [...events].sort((a, b) => (a.source === "resellap" ? 1 : 0) - (b.source === "resellap" ? 1 : 0) || Date.parse(b.at) - Date.parse(a.at));
  return (
    <ol className="relative">
      {sorted.map((e, i) => {
        const current = i === 0;
        const s = e.status as TrackingStatus;
        const done = s === "entregado";
        const bad = s === "incidencia" || s === "devuelto";
        return (
          <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < sorted.length - 1 && <span aria-hidden className="absolute bottom-0 left-[11px] top-6 w-px bg-line" />}
            <span
              aria-hidden
              className={clsx(
                "relative z-[1] mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                current ? (done ? "border-brand-mark bg-brand-mark text-white" : bad ? "border-warn bg-warn-soft" : "border-ink bg-surface") : "border-line bg-surface",
              )}
            >
              {current && done ? <Check size={13} strokeWidth={3} /> : <span className={clsx("h-2 w-2 rounded-full", current ? (bad ? "bg-warn" : "bg-ink") : "bg-line-strong")} />}
            </span>
            <div className={clsx("min-w-0 flex-1", !current && "text-muted")}>
              <p className={clsx("text-[14px] leading-snug", current ? "font-semibold text-ink" : "font-medium")}>{e.description}</p>
              <p className="num mt-0.5 text-[12.5px] text-faint">
                {fmt(e.at)}
                {e.location ? ` · ${e.location}` : ""}
                {e.source === "manual" ? " · a mano" : e.source === "resellap" ? " · Resellap" : ""}
              </p>
            </div>
            {current && <TrackingBadge status={e.status} />}
          </li>
        );
      })}
    </ol>
  );
}

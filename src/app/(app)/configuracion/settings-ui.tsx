"use client";
/** Piezas comunes de las pantallas de Ajustes. */
import { Check, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Notice, clsx } from "@/components/ui";
import { ConfirmAction } from "@/components/ui-client";
import type { ActionResult } from "@/lib/errors";

/** Barra inferior con Guardar / Descartar / Restablecer. */
export function SaveBar({
  dirty,
  pending,
  onSave,
  onDiscard,
  error,
  message,
  reset,
}: {
  dirty: boolean;
  pending: boolean;
  onSave: () => void;
  onDiscard: () => void;
  error?: string | null;
  message?: string | null;
  reset?: { label: string; description: string; action: () => Promise<ActionResult<unknown>>; onDone?: () => void };
}) {
  return (
    // Solo queda fija abajo cuando hay algo pendiente de guardar (o un error)
    <div className={clsx("z-20 mt-5", (dirty || error) && "sticky bottom-[calc(5.2rem+env(safe-area-inset-bottom))] md:bottom-4")}>
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-line bg-surface/95 p-3 shadow-[var(--shadow-pop)] backdrop-blur">
        <p className="min-w-0 flex-1 text-[13px] text-muted" role="status" aria-live="polite">
          {error ? (
            <span className="font-semibold text-danger">{error}</span>
          ) : dirty ? (
            "Tienes cambios sin guardar."
          ) : message ? (
            <span className="inline-flex items-center gap-1 font-semibold text-good">
              <Check size={15} strokeWidth={3} /> {message}
            </span>
          ) : (
            "Todo guardado."
          )}
        </p>
        {reset && (
          <ConfirmAction
            label={
              <>
                <RotateCcw size={15} /> {reset.label}
              </>
            }
            title={reset.label}
            description={reset.description}
            confirmLabel="Restablecer"
            variant="secondary"
            size="sm"
            action={reset.action}
            onDone={reset.onDone}
          />
        )}
        <Button size="sm" onClick={onDiscard} disabled={!dirty || pending}>
          Descartar
        </Button>
        <Button size="sm" variant="primary" onClick={onSave} disabled={!dirty || pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </div>
  );
}

/** Interruptor accesible (sí / no). */
export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={clsx("flex cursor-pointer items-start justify-between gap-4 py-3", disabled && "cursor-not-allowed opacity-60")}>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative mt-0.5 h-7 w-12 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  );
}

export function SectionNote({ children }: { children: ReactNode }) {
  return <Notice tone="info" className="mb-4">{children}</Notice>;
}

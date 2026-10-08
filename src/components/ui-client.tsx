"use client";
/**
 * Componentes con interacción (ventanas, confirmaciones, envío de formularios).
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import type { ActionResult } from "@/lib/errors";
import { Button, Field, Notice, Textarea, clsx } from "./ui";

/** Ventana modal accesible (usa <dialog> nativo). */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={clsx(
        "m-auto w-[calc(100%-1.5rem)] rounded-[var(--radius-md)] border border-line bg-surface p-0 text-ink shadow-[0_20px_60px_-20px_rgba(24,32,43,0.45)] backdrop:bg-ink/45",
        wide ? "max-w-3xl" : "max-w-lg",
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
            <h2 className="text-base font-bold">{title}</h2>
            <button type="button" onClick={onClose} className="-mr-1 rounded px-2 text-xl leading-none text-muted hover:text-ink" aria-label="Cerrar">
              ×
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/**
 * Ejecuta una acción del servidor, muestra el error si lo hay y
 * refresca la página al terminar.
 */
export function useServerAction<A extends unknown[], T>(action: (...args: A) => Promise<ActionResult<T>>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function run(...args: A): Promise<ActionResult<T>> {
    setError(null);
    setMessage(null);
    return new Promise((resolve) => {
      startTransition(async () => {
        try {
          const res = await action(...args);
          if (!res.ok) setError(res.error);
          else {
            if (res.message) setMessage(res.message);
            router.refresh();
          }
          resolve(res);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Ha ocurrido un error.";
          setError(msg);
          resolve({ ok: false, error: msg });
        }
      });
    });
  }
  return { run, pending, error, setError, message };
}

/** Botón que pide confirmación (y opcionalmente un motivo) antes de actuar. */
export function ConfirmAction({
  label,
  title,
  description,
  confirmLabel,
  requireReason,
  optionalReason,
  reasonLabel = "Motivo",
  variant = "danger",
  size = "md",
  action,
  onDone,
}: {
  label: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  requireReason?: boolean;
  /** Muestra el cuadro de texto pero sin obligar a rellenarlo. */
  optionalReason?: boolean;
  reasonLabel?: string;
  variant?: "danger" | "primary" | "secondary";
  size?: "sm" | "md";
  action: (reason: string) => Promise<ActionResult<unknown>>;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { run, pending, error } = useServerAction(action);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={pending}>
              Volver
            </Button>
            <Button
              variant={variant === "secondary" ? "primary" : variant}
              disabled={pending || (requireReason && !reason.trim())}
              onClick={async () => {
                const r = await run(reason.trim());
                if (r.ok) {
                  setOpen(false);
                  setReason("");
                  onDone?.();
                }
              }}
            >
              {pending ? "Guardando…" : confirmLabel}
            </Button>
          </>
        }
      >
        {description && <div className="text-sm text-ink-soft">{description}</div>}
        {(requireReason || optionalReason) && (
          <Field label={reasonLabel} className="mt-3" required={requireReason}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
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

export function ActionMessages({ error, message }: { error?: string | null; message?: string | null }) {
  if (!error && !message) return null;
  return (
    <Notice tone={error ? "bad" : "good"} className="mt-3">
      {error ?? message}
    </Notice>
  );
}

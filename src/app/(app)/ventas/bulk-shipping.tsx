"use client";
/**
 * Selección de varias ventas para marcarlas como enviadas o pendientes.
 * - Solo pendientes seleccionadas → «Marcar como enviadas».
 * - Solo enviadas seleccionadas → «Marcar como pendientes».
 * - Mezcla → no se ofrece ninguna acción.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { ActionMessages, useServerAction } from "@/components/ui-client";
import { setShippingStatusBulk } from "./actions";

type Status = "pendiente" | "enviado";
type Ctx = {
  selected: Map<string, Status>;
  toggle: (id: string, status: Status) => void;
  setMany: (items: { id: string; status: Status }[], on: boolean) => void;
  clear: () => void;
};
const SelectionCtx = createContext<Ctx | null>(null);

function useSelection() {
  const c = useContext(SelectionCtx);
  if (!c) throw new Error("Falta ShippingSelection");
  return c;
}

export function ShippingSelection({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Map<string, Status>>(new Map());
  const value = useMemo<Ctx>(
    () => ({
      selected,
      toggle: (id, status) =>
        setSelected((prev) => {
          const next = new Map(prev);
          if (next.has(id)) next.delete(id);
          else next.set(id, status);
          return next;
        }),
      setMany: (items, on) =>
        setSelected((prev) => {
          const next = new Map(prev);
          for (const it of items) {
            if (on) next.set(it.id, it.status);
            else next.delete(it.id);
          }
          return next;
        }),
      clear: () => setSelected(new Map()),
    }),
    [selected],
  );
  return <SelectionCtx.Provider value={value}>{children}</SelectionCtx.Provider>;
}

const boxClass = "h-[18px] w-[18px] cursor-pointer accent-[var(--color-brand)] align-middle";

/** Casilla de una venta. Las ventas en mano (sin envío) no tienen casilla. */
export function SaleCheckbox({ saleId, status, label }: { saleId: string; status: Status | null; label: string }) {
  const { selected, toggle } = useSelection();
  if (!status) return null;
  return (
    <input type="checkbox" className={boxClass} aria-label={`Seleccionar ${label}`} checked={selected.has(saleId)} onChange={() => toggle(saleId, status)} />
  );
}

/** Casilla de la cabecera: selecciona o quita todas las ventas con envío de esta página. */
export function SelectAllCheckbox({ sales }: { sales: { id: string; status: Status | null }[] }) {
  const { selected, setMany } = useSelection();
  const items = useMemo(() => {
    const seen = new Map<string, Status>();
    for (const s of sales) if (s.status && !seen.has(s.id)) seen.set(s.id, s.status);
    return [...seen].map(([id, status]) => ({ id, status }));
  }, [sales]);
  if (!items.length) return null;
  const all = items.every((i) => selected.has(i.id));
  return (
    <input
      type="checkbox"
      className={boxClass}
      aria-label="Seleccionar todas las ventas con envío de esta página"
      checked={all}
      onChange={() => setMany(items, !all)}
    />
  );
}

/** Barra que aparece al seleccionar ventas. */
export function BulkShippingBar() {
  const { selected, clear } = useSelection();
  const { run, pending, error, message } = useServerAction(setShippingStatusBulk);
  const n = selected.size;
  const statuses = new Set(selected.values());
  const target: Status | null = statuses.size === 1 ? (statuses.has("pendiente") ? "enviado" : "pendiente") : null;

  if (n === 0)
    return error || message ? (
      <div className="mb-3 -mt-3">
        <ActionMessages error={error} message={message} />
      </div>
    ) : null;

  return (
    <div className="sticky top-14 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-brand/60 bg-surface px-4 py-2.5 shadow-[0_8px_24px_-16px_rgba(0,0,0,0.5)] lg:top-2">
      <span className="text-[14px] font-semibold">
        {n} {n === 1 ? "venta seleccionada" : "ventas seleccionadas"}
      </span>
      {target && (
        <Button
          variant="primary"
          size="sm"
          disabled={pending}
          onClick={async () => {
            const res = await run([...selected.keys()], target);
            if (res.ok) clear();
          }}
        >
          {pending ? "Guardando…" : target === "enviado" ? "Marcar como enviado" : "Marcar como pendiente"}
        </Button>
      )}
      <Button variant="ghost" size="sm" disabled={pending} onClick={clear}>
        Quitar selección
      </Button>
      {error && <span className="text-[13px] font-medium text-danger">{error}</span>}
    </div>
  );
}

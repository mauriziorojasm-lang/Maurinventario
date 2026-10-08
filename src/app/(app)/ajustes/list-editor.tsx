"use client";
import { useState } from "react";
import { Badge, Button, Input } from "@/components/ui";
import { useServerAction } from "@/components/ui-client";
import { archiveListItem, saveListItem } from "./actions";

type Row = { id: string; name: string; active?: boolean; requires_shipping?: boolean; number?: number; email?: string | null; phone?: string | null; uses?: number };

export function ListEditor({ list, rows, kind }: { list: "platforms" | "carriers" | "categories" | "brands" | "mobile_devices"; rows: Row[]; kind: "simple" | "active" | "platform" | "mobile" }) {
  const [adding, setAdding] = useState(false);
  return (
    <div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <RowEditor key={r.id} list={list} row={r} kind={kind} />
        ))}
        {adding && <RowEditor list={list} kind={kind} onDone={() => setAdding(false)} row={{ id: "", name: "", active: true, requires_shipping: true, number: (rows.at(-1)?.number ?? 0) + 1 }} />}
      </ul>
      {!adding && (
        <div className="px-4 py-3">
          <Button size="sm" onClick={() => setAdding(true)}>
            Añadir
          </Button>
        </div>
      )}
    </div>
  );
}

function RowEditor({ list, row, kind, onDone }: { list: Parameters<typeof saveListItem>[0]; row: Row; kind: string; onDone?: () => void }) {
  const [v, setV] = useState(row);
  const { run, pending, error } = useServerAction(saveListItem);
  const del = useServerAction(archiveListItem);
  const dirty = JSON.stringify(v) !== JSON.stringify(row) || !row.id;
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      {kind === "mobile" && (
        <Input type="number" className="h-9 w-16" value={v.number ?? ""} onChange={(e) => setV({ ...v, number: Number(e.target.value) })} aria-label="Número" />
      )}
      <Input className="h-9 min-w-40 flex-1" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} aria-label="Nombre" />
      {kind === "mobile" && (
        <>
          <Input className="h-9 w-56" placeholder="Correo de la cuenta" value={v.email ?? ""} onChange={(e) => setV({ ...v, email: e.target.value })} />
          <Input className="h-9 w-36" placeholder="Teléfono" value={v.phone ?? ""} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        </>
      )}
      {kind === "platform" && (
        <label className="flex items-center gap-1.5 text-[13px]">
          <input type="checkbox" checked={!!v.requires_shipping} onChange={(e) => setV({ ...v, requires_shipping: e.target.checked })} className="accent-[var(--color-ledger)]" />
          Con envío
        </label>
      )}
      {kind !== "simple" && (
        <label className="flex items-center gap-1.5 text-[13px]">
          <input type="checkbox" checked={v.active !== false} onChange={(e) => setV({ ...v, active: e.target.checked })} className="accent-[var(--color-ledger)]" />
          Activo
        </label>
      )}
      {kind === "simple" && row.uses !== undefined && <Badge>{row.uses} productos</Badge>}
      {dirty && (
        <Button
          size="sm"
          variant="primary"
          disabled={pending || !v.name.trim()}
          onClick={async () => {
            const payload: Record<string, unknown> = { id: row.id || undefined, name: v.name };
            if (kind !== "simple") payload.active = v.active !== false;
            if (kind === "platform") payload.requires_shipping = !!v.requires_shipping;
            if (kind === "mobile") {
              payload.number = v.number;
              payload.account = { email: v.email ?? "", phone: v.phone ?? "" };
            }
            const r = await run(list, payload);
            if (r.ok) onDone?.();
          }}
        >
          Guardar
        </Button>
      )}
      {!row.id && onDone && (
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      )}
      {kind === "simple" && row.id && row.uses === 0 && (list === "categories" || list === "brands") && (
        <Button size="sm" variant="ghost" disabled={del.pending} onClick={() => del.run(list, row.id)}>
          Eliminar
        </Button>
      )}
      {(error || del.error) && <span className="w-full text-xs text-danger">{error ?? del.error}</span>}
    </li>
  );
}

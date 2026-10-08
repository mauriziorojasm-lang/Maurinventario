"use client";
import { Button } from "@/components/ui";
import { ConfirmAction, useServerAction } from "@/components/ui-client";
import { resolveReview } from "./actions";

export function ReviewActions({ id, status }: { id: string; status: string }) {
  const reopen = useServerAction(resolveReview);
  if (status !== "pendiente") {
    return (
      <Button size="sm" variant="ghost" disabled={reopen.pending} onClick={() => reopen.run(id, "pendiente", "")}>
        Volver a pendiente
      </Button>
    );
  }
  return (
    <span className="flex gap-1.5">
      <ConfirmAction
        size="sm"
        variant="primary"
        label="Resuelto"
        title="Marcar como resuelto"
        description="Anota qué has hecho (opcional), para que quede en el historial."
        confirmLabel="Marcar como resuelto"
        optionalReason
        reasonLabel="Nota"
        action={(note) => resolveReview(id, "resuelto", note)}
      />
      <ConfirmAction size="sm" variant="secondary" label="Descartar" title="Descartar" description="Se quita de la lista de pendientes." confirmLabel="Descartar" optionalReason reasonLabel="Nota" action={(note) => resolveReview(id, "descartado", note)} />
    </span>
  );
}

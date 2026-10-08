"use client";
import { Button } from "@/components/ui";
import { useServerAction } from "@/components/ui-client";
import { setShippingStatusBulk } from "../../ventas/actions";

/** Marca un solo paquete como enviado, con un toque. */
export function MarkOneShipped({ saleId }: { saleId: string }) {
  const { run, pending, error } = useServerAction(setShippingStatusBulk);
  return (
    <span className="flex flex-col items-start gap-1">
      <Button size="sm" variant="primary" disabled={pending} onClick={() => run([saleId], "enviado")}>
        {pending ? "Guardando…" : "Marcar como enviado"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

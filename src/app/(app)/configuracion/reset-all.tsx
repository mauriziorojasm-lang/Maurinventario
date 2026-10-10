"use client";
import { RotateCcw } from "lucide-react";
import { ConfirmAction } from "@/components/ui-client";
import { resetPreferences } from "./actions";

export function ResetAllButton() {
  return (
    <ConfirmAction
      label={
        <>
          <RotateCcw size={16} /> Restablecer todos mis ajustes
        </>
      }
      title="Restablecer ajustes"
      description="Tu panel, aspecto, tablas, avisos y preferencias volverán a la configuración inicial. Tus datos del negocio no se tocan."
      confirmLabel="Restablecer"
      variant="secondary"
      action={() => resetPreferences()}
      onDone={() => location.reload()}
    />
  );
}

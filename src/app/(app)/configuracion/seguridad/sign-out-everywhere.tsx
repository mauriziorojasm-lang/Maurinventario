"use client";
import { MonitorSmartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Notice } from "@/components/ui";
import { ConfirmAction } from "@/components/ui-client";
import { signOutEverywhere } from "../actions";

export function SignOutEverywhere() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <ConfirmAction
        label={
          <>
            <MonitorSmartphone size={17} /> Cerrar sesión en todos los dispositivos
          </>
        }
        title="Cerrar todas las sesiones"
        description="Se cerrará la sesión en todos tus dispositivos, también en este. Tendrás que volver a entrar con tu contraseña."
        confirmLabel="Cerrar todas"
        variant="secondary"
        action={async () => {
          const r = await signOutEverywhere();
          if (r.ok) router.replace("/login");
          else setError(r.error);
          return r;
        }}
      />
      {error && <Notice tone="bad">{error}</Notice>}
    </>
  );
}

"use client";
import { useMemo, useState } from "react";
import { Field, Input, Panel } from "@/components/ui";
import { useServerAction } from "@/components/ui-client";
import { DEFAULT_PREFS, type Prefs } from "@/lib/preferences";
import { resetPreferences, savePreferences } from "../actions";
import { SaveBar, Toggle } from "../settings-ui";

type N = Prefs["notifications"];

export function NotificationsEditor({ initial, admin }: { initial: N; admin: boolean }) {
  const [saved, setSaved] = useState<N>(initial);
  const [n, setN] = useState<N>(initial);
  const { run, pending, error, message } = useServerAction(savePreferences<"notifications">);
  const dirty = useMemo(() => JSON.stringify(n) !== JSON.stringify(saved), [n, saved]);
  const set = (k: keyof N) => (v: boolean) => setN({ ...n, [k]: v });

  return (
    <div className="flex flex-col gap-5">
      <Panel title="Qué quieres que te avise">
        <div className="-my-1 divide-y divide-line">
          <Toggle checked={n.shipments} onChange={set("shipments")} label="Ventas pendientes de envío" description="Paquetes que aún no has marcado como enviados." />
          {admin && (
            <>
              <Toggle checked={n.detected} onChange={set("detected")} label="Ventas por confirmar" description="Ventas que han llegado por correo y esperan tu confirmación." />
              <Toggle checked={n.emails} onChange={set("emails")} label="Correos que requieren atención" description="Correos de ventas que la app no ha podido procesar sola." />
              <Toggle checked={n.listings} onChange={set("listings")} label="Anuncios por quitar" description="Productos sin stock que siguen publicados." />
              <Toggle checked={n.imports} onChange={set("imports")} label="Problemas de importación" description="Filas del Excel que quedaron pendientes de revisar." />
              <Toggle checked={n.lowStock} onChange={set("lowStock")} label="Stock bajo" description="Productos a los que les quedan pocas unidades." />
              {n.lowStock && (
                <Field label="Avisar cuando queden como mucho (unidades)" className="py-3">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    inputMode="numeric"
                    value={n.lowStockThreshold}
                    onChange={(e) => setN({ ...n, lowStockThreshold: Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1))) })}
                    className="max-w-32"
                  />
                </Field>
              )}
            </>
          )}
        </div>
      </Panel>
      <SaveBar
        dirty={dirty}
        pending={pending}
        onSave={async () => {
          const r = await run("notifications", { ...n });
          if (r.ok) setSaved(n);
        }}
        onDiscard={() => setN(saved)}
        error={error}
        message={message}
        reset={{
          label: "Avisos iniciales",
          description: "Todos los avisos activados salvo el de stock bajo.",
          action: () => resetPreferences("notifications"),
          onDone: () => {
            setN(DEFAULT_PREFS.notifications);
            setSaved(DEFAULT_PREFS.notifications);
          },
        }}
      />
    </div>
  );
}

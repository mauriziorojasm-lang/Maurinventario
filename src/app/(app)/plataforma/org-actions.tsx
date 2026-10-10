"use client";
import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { ActionMessages, ConfirmAction, Modal, useServerAction } from "@/components/ui-client";
import { purgeOrganizationAction, setCompedAction, setOrgStatusAction } from "./actions";

export function OrgActions({ org }: { org: { id: string; name: string; status: string; comped: boolean; canPurge: boolean } }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {org.status === "activa" && (
        <ConfirmAction
          size="sm"
          label="Suspender"
          title={`Suspender «${org.name}»`}
          description="Sus miembros podrán ver y exportar sus datos, pero no registrar cambios. No se borra nada."
          requireReason
          confirmLabel="Suspender"
          action={(reason) => setOrgStatusAction(org.id, "suspendida", reason)}
        />
      )}
      {org.status === "suspendida" && (
        <ConfirmAction
          size="sm"
          variant="primary"
          label="Reactivar"
          title={`Reactivar «${org.name}»`}
          optionalReason
          confirmLabel="Reactivar"
          action={(reason) => setOrgStatusAction(org.id, "activa", reason)}
        />
      )}
      <ConfirmAction
        size="sm"
        variant="secondary"
        label={org.comped ? "Quitar gratis" : "Dar gratis"}
        title={org.comped ? "Retirar el acceso gratuito" : "Conceder acceso gratuito"}
        description={org.comped ? "Volverá a depender de su suscripción." : "Podrá usar la app sin pagar hasta que lo retires."}
        confirmLabel="Confirmar"
        action={() => setCompedAction(org.id, !org.comped)}
      />
      {org.canPurge && <PurgeButton id={org.id} name={org.name} />}
    </div>
  );
}

function PurgeButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const { run, pending, error, message } = useServerAction(purgeOrganizationAction);
  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Borrar definitivamente
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Borrado definitivo"
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={pending}>
              Volver
            </Button>
            <Button variant="danger" disabled={pending || confirm.trim() !== name} onClick={() => run(id, confirm)}>
              {pending ? "Borrando…" : "Borrar para siempre"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">El cliente pidió eliminar este espacio hace más de 30 días. Se borrarán sus datos y archivos. No se puede deshacer.</p>
        <Field label={`Escribe «${name}» para confirmar`} className="mt-3">
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </Field>
        <ActionMessages error={error} message={message} />
      </Modal>
    </>
  );
}

"use client";
import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { ConfirmAction, Modal, useServerAction, ActionMessages } from "@/components/ui-client";
import { cancelDeletionAction, requestDeletionAction } from "./actions";

export function RequestDeletion({ orgName }: { orgName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { run, pending, error } = useServerAction(requestDeletionAction);
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Solicitar eliminación
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Eliminar el espacio y sus datos"
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={pending}>
              Volver
            </Button>
            <Button
              variant="danger"
              disabled={pending || name.trim() !== orgName}
              onClick={async () => {
                const r = await run(name);
                if (r.ok) setOpen(false);
              }}
            >
              {pending ? "Guardando…" : "Solicitar eliminación"}
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-ink-soft">
          <p>El espacio pasará a solo lectura. Durante 30 días podrás exportar tus datos y anular la solicitud.</p>
          <p>Pasado ese plazo, se borrarán de forma definitiva todos los productos, ventas, compras, archivos y el equipo. No se puede deshacer.</p>
          <p>Esto no cancela la suscripción de Stripe: cancélala en «Gestionar pago» para que no se te cobre más.</p>
        </div>
        <Field label={`Escribe «${orgName}» para confirmar`} className="mt-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        <ActionMessages error={error} />
      </Modal>
    </>
  );
}

export function CancelDeletion() {
  return (
    <ConfirmAction
      label="Anular la eliminación"
      variant="primary"
      title="Anular la eliminación"
      description="El espacio vuelve a estar activo y no se borrará nada."
      confirmLabel="Anular"
      action={() => cancelDeletionAction()}
    />
  );
}

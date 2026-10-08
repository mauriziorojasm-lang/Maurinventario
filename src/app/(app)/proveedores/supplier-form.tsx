"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { ActionMessages, Modal, useServerAction } from "@/components/ui-client";
import { saveSupplier, type SupplierInput } from "./actions";

export function SupplierButton({ initial, label }: { initial?: SupplierInput; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<SupplierInput>(initial ?? { name: "" });
  const { run, pending, error } = useServerAction(saveSupplier);
  const set = (k: keyof SupplierInput) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <>
      <Button variant={initial ? "secondary" : "primary"} onClick={() => setOpen(true)}>
        {label ?? (initial ? "Editar proveedor" : "Nuevo proveedor")}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={initial ? "Editar proveedor" : "Nuevo proveedor"}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={pending || !v.name.trim()}
              onClick={async () => {
                const r = await run(v);
                if (r.ok) {
                  setOpen(false);
                  if (!initial && r.data) router.push(`/proveedores/${r.data}`);
                }
              }}
            >
              Guardar proveedor
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" required className="sm:col-span-2">
            <Input value={v.name} onChange={set("name")} autoFocus />
          </Field>
          <Field label="Persona de contacto">
            <Input value={v.contact_name ?? ""} onChange={set("contact_name")} />
          </Field>
          <Field label="Teléfono">
            <Input value={v.phone ?? ""} onChange={set("phone")} />
          </Field>
          <Field label="Email" className="sm:col-span-2">
            <Input type="email" value={v.email ?? ""} onChange={set("email")} />
          </Field>
          <Field label="Notas" className="sm:col-span-2">
            <Textarea value={v.notes ?? ""} onChange={set("notes")} />
          </Field>
        </div>
        <ActionMessages error={error} />
      </Modal>
    </>
  );
}

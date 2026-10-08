"use client";
import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { ActionMessages, Modal, useServerAction } from "@/components/ui-client";
import type { Option } from "@/lib/types";
import { createUserAction, resetPasswordAction, updateUserAction } from "./actions";

export function NewUserButton({ freeResponsibles }: { freeResponsibles: Option[] }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ email: "", password: "", full_name: "", role: "vendedor" as "admin" | "vendedor", responsible: "new" });
  const { run, pending, error, message } = useServerAction(createUserAction);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Nuevo usuario
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo usuario"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cerrar</Button>
            <Button
              variant="primary"
              disabled={pending || !v.email || v.password.length < 8}
              onClick={async () => {
                const r = await run(v);
                if (r.ok) setV({ email: "", password: "", full_name: "", role: "vendedor", responsible: "new" });
              }}
            >
              Crear usuario
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" className="sm:col-span-2">
            <Input value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} />
          </Field>
          <Field label="Email" required>
            <Input type="email" autoComplete="off" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
          </Field>
          <Field label="Contraseña inicial" required hint="Mínimo 8 caracteres. Podrá cambiarla en Mi cuenta.">
            <Input type="text" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
          </Field>
          <Field label="Rol">
            <Select value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as "admin" | "vendedor" })}>
              <option value="vendedor">Vendedor: registra y consulta sus ventas</option>
              <option value="admin">Administrador: acceso completo</option>
            </Select>
          </Field>
          <Field label="Responsable" hint="Las ventas de este usuario se registran a nombre de su responsable.">
            <Select value={v.responsible} onChange={(e) => setV({ ...v, responsible: e.target.value })}>
              <option value="new">Crear un responsable nuevo con su nombre</option>
              {freeResponsibles.map((r) => (
                <option key={r.id} value={r.id}>
                  Vincular a «{r.name}»
                </option>
              ))}
              <option value="none">Ninguno</option>
            </Select>
          </Field>
        </div>
        <ActionMessages error={error} message={message} />
      </Modal>
    </>
  );
}

export function EditUserButton({ user, isMe }: { user: { id: string; email: string; full_name: string | null; role: "admin" | "vendedor"; active: boolean }; isMe: boolean }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ role: user.role, active: user.active, full_name: user.full_name ?? "" });
  const [password, setPassword] = useState("");
  const upd = useServerAction(updateUserAction);
  const pwd = useServerAction(resetPasswordAction);
  return (
    <>
      <button className="text-xs font-semibold text-ledger hover:underline" onClick={() => setOpen(true)}>
        Gestionar
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={user.email}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cerrar</Button>
            <Button
              variant="primary"
              disabled={upd.pending}
              onClick={async () => {
                const r = await upd.run({ id: user.id, ...v });
                if (r.ok) setOpen(false);
              }}
            >
              Guardar cambios
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Nombre">
            <Input value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} />
          </Field>
          <Field label="Rol">
            <Select value={v.role} disabled={isMe} onChange={(e) => setV({ ...v, role: e.target.value as "admin" | "vendedor" })}>
              <option value="vendedor">Vendedor</option>
              <option value="admin">Administrador</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={isMe} checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} className="h-4 w-4 accent-[var(--color-ledger)]" />
            Activo (puede iniciar sesión)
          </label>
          <div className="border-t border-line pt-3">
            <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
              <div className="flex gap-2">
                <Input type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button disabled={pwd.pending || password.length < 8} onClick={() => pwd.run(user.id, password)}>
                  Cambiar
                </Button>
              </div>
            </Field>
          </div>
        </div>
        <ActionMessages error={upd.error ?? pwd.error} message={pwd.message} />
      </Modal>
    </>
  );
}

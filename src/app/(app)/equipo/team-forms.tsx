"use client";
import { useState } from "react";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { ActionMessages, ConfirmAction, Modal, useServerAction } from "@/components/ui-client";
import { changeRoleAction, inviteMemberAction, removeMemberAction, revokeInvitationAction } from "./actions";

type Role = "admin" | "vendedor" | "almacen";

export function InviteButton({ mail }: { mail: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("vendedor");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { run, pending, error, message } = useServerAction(inviteMemberAction);
  return (
    <>
      <Button variant="primary" onClick={() => { setOpen(true); setLink(null); }}>
        Invitar
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Invitar al equipo"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cerrar</Button>
            <Button
              variant="primary"
              disabled={pending || !email.includes("@")}
              onClick={async () => {
                setCopied(false);
                const r = await run(email, role);
                if (r.ok && r.data) {
                  setLink(r.data.link);
                  setEmail("");
                }
              }}
            >
              {pending ? "Creando…" : "Crear invitación"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Email" required>
            <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Rol">
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="vendedor">Vendedor: registra y consulta sus ventas</option>
              <option value="almacen">Almacén: stock y envíos, sin costes</option>
              <option value="admin">Administrador: acceso completo</option>
            </Select>
          </Field>
          {!mail && <p className="text-[13px] text-muted">El envío de correos no está configurado: tendrás que copiar el enlace y mandárselo tú.</p>}
        </div>
        <ActionMessages error={error} message={message} />
        {link && (
          <Notice tone="info" className="mt-3" title="Enlace de invitación (caduca en 7 días)">
            <div className="mt-1 flex gap-2">
              <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace de invitación" />
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <p className="mt-1 text-xs">Solo funciona con el email invitado. Se muestra una vez: si lo pierdes, crea otra invitación.</p>
          </Notice>
        )}
      </Modal>
    </>
  );
}

export function MemberActions({ member, lastAdmin }: { member: { user_id: string; email: string; role: Role; is_me: boolean }; lastAdmin: boolean }) {
  const [role, setRole] = useState<Role>(member.role);
  const { run, pending, error } = useServerAction(changeRoleAction);
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Select
        aria-label={`Rol de ${member.email}`}
        className="w-auto"
        value={role}
        disabled={pending || lastAdmin}
        title={lastAdmin ? "Debe quedar al menos un administrador" : undefined}
        onChange={async (e) => {
          const next = e.target.value as Role;
          const prev = role;
          setRole(next);
          const r = await run(member.user_id, next);
          if (!r.ok) setRole(prev);
        }}
      >
        <option value="admin">Administrador</option>
        <option value="vendedor">Vendedor</option>
        <option value="almacen">Almacén</option>
      </Select>
      {!member.is_me && !lastAdmin && (
        <ConfirmAction
          label="Quitar"
          size="sm"
          title={`Quitar a ${member.email}`}
          description="Dejará de tener acceso a este espacio. Sus ventas y su historial se conservan."
          confirmLabel="Quitar del equipo"
          action={() => removeMemberAction(member.user_id)}
        />
      )}
      {error && <span className="basis-full text-right text-xs text-danger">{error}</span>}
    </div>
  );
}

export function RevokeButton({ id, email }: { id: string; email: string }) {
  return (
    <ConfirmAction
      label="Revocar"
      size="sm"
      title="Revocar invitación"
      description={`El enlace enviado a ${email} dejará de funcionar.`}
      confirmLabel="Revocar"
      action={() => revokeInvitationAction(id)}
    />
  );
}

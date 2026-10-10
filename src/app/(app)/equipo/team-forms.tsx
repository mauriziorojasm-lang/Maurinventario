"use client";
import { useState } from "react";
import { Button, Field, Input, Notice, Select } from "@/components/ui";
import { ActionMessages, ConfirmAction, Modal, useServerAction } from "@/components/ui-client";
import { PERMISSIONS, ROLE_DEFAULTS, type Perm } from "@/lib/permissions";
import { changeRoleAction, inviteMemberAction, removeMemberAction, revokeInvitationAction, setPermissionsAction } from "./actions";

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

export function MemberActions({
  member,
  lastAdmin,
}: {
  member: { user_id: string; email: string; full_name?: string | null; role: Role; is_me: boolean; permissions: string[]; custom: boolean };
  lastAdmin: boolean;
}) {
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
      {member.role !== "admin" && <PermissionsButton member={member} />}
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

const GROUPS = ["Ventas", "Productos y almacén", "Negocio"] as const;

/** Qué ve y qué puede hacer un miembro. Lo aplica la base de datos. */
export function PermissionsButton({
  member,
}: {
  member: { user_id: string; email: string; full_name?: string | null; role: Role; permissions: string[]; custom: boolean };
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set(member.permissions));
  const { run, pending, error, message } = useServerAction(setPermissionsAction);
  const defaults = member.role === "admin" ? [] : ROLE_DEFAULTS[member.role];
  const toggle = (k: Perm) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setSel(new Set(member.permissions));
          setOpen(true);
        }}
      >
        Permisos{member.custom ? " ·" : ""}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Permisos de ${member.full_name || member.email}`}
        footer={
          <>
            <Button
              disabled={pending}
              onClick={async () => {
                const r = await run(member.user_id, null);
                if (r.ok) setSel(new Set(defaults));
              }}
            >
              Los de su rol
            </Button>
            <Button variant="primary" disabled={pending} onClick={() => run(member.user_id, [...sel])}>
              {pending ? "Guardando…" : "Guardar permisos"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          Marca lo que puede ver y hacer. Lo comprueba la base de datos, no solo la pantalla. El equipo, la suscripción, el historial de cambios y las copias de
          seguridad son siempre solo del administrador.
        </p>
        {GROUPS.map((g) => (
          <fieldset key={g} className="mt-4">
            <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{g}</legend>
            <div className="grid gap-1.5">
              {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                <label key={p.key} className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border border-line px-3 py-2.5 hover:border-ink/30">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-brand)]" checked={sel.has(p.key)} onChange={() => toggle(p.key)} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {p.label}
                      {(defaults as string[]).includes(p.key) && <span className="ml-1.5 text-xs font-normal text-muted">(de su rol)</span>}
                    </span>
                    <span className="block text-xs text-muted">{p.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <ActionMessages error={error} message={message} />
      </Modal>
    </>
  );
}

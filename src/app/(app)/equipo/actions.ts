"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { sendMail } from "@/lib/mail";
import { siteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

type Role = "admin" | "vendedor" | "almacen";
const ROLE_TEXT: Record<Role, string> = { admin: "administrador", vendedor: "vendedor", almacen: "almacén" };

function done(message: string): ActionResult {
  revalidatePath("/equipo");
  revalidatePath("/responsables");
  return { ok: true, message };
}

/** Invita por email. Devuelve el enlace para copiarlo (y lo envía si hay correo configurado). */
export async function inviteMemberAction(email: string, role: Role): Promise<ActionResult<{ link: string; emailed: boolean }>> {
  const me = await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_member", { p_email: email, p_role: role });
  if (error || !data) return { ok: false, error: friendlyError(error) };
  const link = `${await siteUrl()}/invitacion/${data as string}`;
  const emailed = await sendMail(
    email.trim().toLowerCase(),
    `Invitación a ${me.orgName} en MaurInventario`,
    `${me.fullName ?? me.email} te invita a unirte a ${me.orgName} en MaurInventario como ${ROLE_TEXT[role]}.\nEl enlace caduca en 7 días.`,
    { href: link, label: "Aceptar invitación" },
  );
  revalidatePath("/equipo");
  return {
    ok: true,
    data: { link, emailed },
    message: emailed ? "Invitación enviada por email." : "Invitación creada. Copia el enlace y envíaselo.",
  };
}

export async function revokeInvitationAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invitation", { p_id: id });
  if (error) return { ok: false, error: friendlyError(error) };
  return done("Invitación revocada.");
}

export async function changeRoleAction(userId: string, role: Role): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member_role", { p_user: userId, p_role: role });
  if (error) return { ok: false, error: friendlyError(error) };
  return done("Rol actualizado.");
}

export async function removeMemberAction(userId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { p_user: userId });
  if (error) return { ok: false, error: friendlyError(error) };
  return done("Persona quitada del equipo. Sus ventas se conservan.");
}

/** Salir uno mismo del espacio (cualquier rol). */
export async function leaveOrganizationAction(): Promise<ActionResult> {
  const me = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { p_user: me.id });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Has salido del espacio." };
}

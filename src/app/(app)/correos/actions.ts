"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { GmailAuthError } from "@/lib/email/gmail";
import { attachLabel, gmailForServer, markAuthError, runSync } from "@/lib/email/sync";
import { callRpc } from "@/lib/rpc";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function admin() {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin" || !u.active || !u.orgId) throw new Error("Solo los administradores pueden hacer esto.");
  return u as typeof u & { orgId: string };
}

function done(message?: string): ActionResult {
  revalidatePath("/", "layout");
  return { ok: true, message };
}

/** «Revisar ahora»: la misma sincronización que la automática. */
export async function syncNow(): Promise<ActionResult> {
  const me = await admin();
  const s = await runSync("manual", me.orgId);
  revalidatePath("/", "layout");
  if (s.skipped) return { ok: false, error: s.skipped };
  if (s.error) return { ok: false, error: s.error };
  const parts = [
    `${s.new_emails} ${s.new_emails === 1 ? "correo nuevo" : "correos nuevos"}`,
    `${s.detected} ${s.detected === 1 ? "venta detectada (por confirmar)" : "ventas detectadas (por confirmar)"}`,
    `${s.labels} ${s.labels === 1 ? "etiqueta añadida" : "etiquetas añadidas"}`,
  ];
  if (s.review) parts.push(`${s.review} para revisar`);
  if (s.waiting) parts.push(`${s.waiting} esperando su venta`);
  if (s.errors) parts.push(`${s.errors} con error (se reintentarán)`);
  return { ok: true, message: `Hecho: ${parts.join(" · ")}.` };
}

export async function disconnectGmail(): Promise<ActionResult> {
  return callRpc("email_disconnect", {}, ["/correos"], "Gmail desconectado. Ya no se leerán correos.");
}

export async function setDefaultResponsible(id: string | null): Promise<ActionResult> {
  return callRpc("email_set_default_responsible", { p_responsible_id: id || null }, ["/correos"], "Guardado.");
}

const accountSchema = z.object({ id: z.uuid(), responsible_id: z.uuid().nullable(), mobile_device_id: z.uuid().nullable() });

export async function saveAccount(input: z.input<typeof accountSchema>): Promise<ActionResult> {
  await admin();
  const v = accountSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "Datos no válidos." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_accounts")
    .update({ responsible_id: v.data.responsible_id, mobile_device_id: v.data.mobile_device_id })
    .eq("id", v.data.id);
  if (error) return { ok: false, error: friendlyError(error) };
  return done("Guardado.");
}

/** El administrador elige el producto de una venta que no se pudo identificar. */
export async function resolveSale(emailId: string, variantId: string, remember: boolean): Promise<ActionResult> {
  await admin();
  if (!z.uuid().safeParse(emailId).success || !z.uuid().safeParse(variantId).success) return { ok: false, error: "Datos no válidos." };
  const supabase = await createClient();
  const { data: e } = await supabase.from("email_messages").select("parsed").eq("id", emailId).maybeSingle();
  if (!e) return { ok: false, error: "El correo no existe." };
  const p = e.parsed as { product?: string; product_norm?: string };
  const { error } = await supabase.rpc("email_register_sale", {
    p_email_id: emailId,
    p_variant_id: variantId,
    p_alias: remember ? (p.product ?? null) : null,
    p_alias_norm: remember ? (p.product_norm ?? null) : null,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  // Puede que una etiqueta estuviera esperando a esta venta
  await runSync("manual", (await admin()).orgId).catch(() => undefined);
  return done(remember ? "Venta registrada. La próxima vez ese nombre se reconocerá solo." : "Venta registrada.");
}

/** El administrador indica a qué venta va una etiqueta de Vinted. */
export async function linkLabel(emailId: string, saleId: string, force: boolean): Promise<ActionResult> {
  const { orgId } = await admin();
  if (!z.uuid().safeParse(emailId).success || !z.uuid().safeParse(saleId).success) return { ok: false, error: "Datos no válidos." };
  const db = createAdminClient();
  const { data: e } = await db.from("email_messages").select("id, gmail_message_id, parsed, kind").eq("organization_id", orgId).eq("id", emailId).maybeSingle();
  if (!e || e.kind !== "vinted_etiqueta") return { ok: false, error: "El correo no es una etiqueta de Vinted." };
  try {
    const gmail = await gmailForServer(db, orgId);
    const r = await attachLabel(db, orgId, gmail, e, saleId, { force, userClient: await createClient() });
    if (r === "review") {
      const { data: again } = await db.from("email_messages").select("review_reason").eq("organization_id", orgId).eq("id", emailId).single();
      return { ok: false, error: again?.review_reason ?? "No se ha podido añadir la etiqueta." };
    }
    return done("Etiqueta añadida a la venta.");
  } catch (err) {
    if (err instanceof GmailAuthError) {
      await markAuthError(db, orgId, err.message);
      revalidatePath("/correos");
    }
    return { ok: false, error: err instanceof Error ? err.message : "No se ha podido añadir la etiqueta." };
  }
}

/** Deshace «duplicado» o «descartado» de una venta: vuelve a Ventas detectadas. */
export async function undoEmail(emailId: string): Promise<ActionResult> {
  const r = await callRpc("email_set_status", { p_email_id: emailId, p_status: "pendiente" });
  if (!r.ok) return r;
  await runSync("manual", (await admin()).orgId).catch(() => undefined);
  revalidatePath("/", "layout");
  return { ok: true, message: "Ha vuelto a Ventas detectadas." };
}

export async function retryEmail(emailId: string): Promise<ActionResult> {
  const r = await callRpc("email_set_status", { p_email_id: emailId, p_status: "pendiente" });
  if (!r.ok) return r;
  const s = await runSync("manual", (await admin()).orgId);
  revalidatePath("/", "layout");
  if (s.error) return { ok: false, error: s.error };
  return { ok: true, message: "Reintentado. Mira el estado del correo en la lista." };
}

export async function dismissEmail(emailId: string): Promise<ActionResult> {
  return callRpc("email_set_status", { p_email_id: emailId, p_status: "ignorado" }, ["/"], "Descartado. No creará ninguna venta.");
}

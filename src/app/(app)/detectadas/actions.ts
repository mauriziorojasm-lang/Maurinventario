"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { runSync } from "@/lib/email/sync";
import { createClient } from "@/lib/supabase/server";

async function admin() {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin" || !u.active || !u.orgId) throw new Error("Solo los administradores pueden hacer esto.");
  return u as typeof u & { orgId: string };
}

/** Tras confirmar o marcar un duplicado, puede que una etiqueta de Vinted estuviera esperando. */
async function afterChange() {
  await runSync("manual", (await admin()).orgId).catch(() => undefined);
  revalidatePath("/", "layout");
}

const confirmSchema = z.object({
  emailId: z.uuid(),
  variantId: z.uuid(),
  price: z.number().positive().max(100000).nullable(),
  remember: z.boolean(),
});

/** «Sí, es una venta»: se registra y se descuenta el stock. */
export async function confirmDetected(input: z.input<typeof confirmSchema>): Promise<ActionResult> {
  await admin();
  const v = confirmSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "Revisa el producto y el precio." };
  const supabase = await createClient();
  const { data: e } = await supabase.from("email_messages").select("parsed, variant_id").eq("id", v.data.emailId).maybeSingle();
  if (!e) return { ok: false, error: "Esa venta detectada ya no existe." };
  const p = e.parsed as { product?: string; product_norm?: string; price?: number };
  // Solo se recuerda el nombre si el producto lo ha elegido el administrador
  const remember = v.data.remember && v.data.variantId !== e.variant_id;
  const priceChanged = v.data.price !== null && Math.abs(v.data.price - Number(p.price ?? 0)) >= 0.005;
  const { error } = await supabase.rpc("email_register_sale", {
    p_email_id: v.data.emailId,
    p_variant_id: v.data.variantId,
    p_alias: remember ? (p.product ?? null) : null,
    p_alias_norm: remember ? (p.product_norm ?? null) : null,
    p_price: priceChanged ? v.data.price : null,
  });
  if (error) return { ok: false, error: friendlyError(error) };
  await afterChange();
  return { ok: true, message: "Venta registrada." };
}

/** Confirma de una vez las que tienen producto identificado, stock y ninguna duda. */
export async function confirmMany(items: { emailId: string; variantId: string }[]): Promise<ActionResult> {
  await admin();
  const list = z.array(z.object({ emailId: z.uuid(), variantId: z.uuid() })).max(100).safeParse(items);
  if (!list.success) return { ok: false, error: "Datos no válidos." };
  const supabase = await createClient();
  let ok = 0;
  const failed: string[] = [];
  for (const it of list.data) {
    const { error } = await supabase.rpc("email_register_sale", { p_email_id: it.emailId, p_variant_id: it.variantId });
    if (error) failed.push(friendlyError(error));
    else ok++;
  }
  await afterChange();
  if (failed.length) return { ok: false, error: `${ok} registradas. ${failed.length} no se han podido registrar: ${[...new Set(failed)].join(" ")}` };
  return { ok: true, message: `${ok} ${ok === 1 ? "venta registrada" : "ventas registradas"}.` };
}

/** «Ya estaba apuntada»: no se crea nada y el correo queda unido a esa venta. */
export async function markDuplicate(emailId: string, saleId: string): Promise<ActionResult> {
  await admin();
  if (!z.uuid().safeParse(emailId).success || !z.uuid().safeParse(saleId).success) return { ok: false, error: "Datos no válidos." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("email_mark_duplicate", { p_email_id: emailId, p_sale_id: saleId });
  if (error) return { ok: false, error: friendlyError(error) };
  await afterChange();
  return { ok: true, message: "Marcada como duplicado. No se ha creado otra venta." };
}

/** «No es una venta». */
export async function discardDetected(emailId: string): Promise<ActionResult> {
  await admin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("email_set_status", { p_email_id: emailId, p_status: "ignorado" });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Descartada. No se ha registrado nada." };
}

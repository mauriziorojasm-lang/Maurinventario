"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePerm } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

type ListName = "platforms" | "carriers" | "categories" | "brands" | "mobile_devices";

const LISTS = z.enum(["platforms", "carriers", "categories", "brands", "mobile_devices"]);

export async function saveListItem(list: ListName, item: Record<string, unknown> & { id?: string }): Promise<ActionResult> {
  await requirePerm("configuracion");
  if (!LISTS.safeParse(list).success) return { ok: false, error: "Lista no válida." };
  const supabase = await createClient();
  const { id, account, ...row } = item as { id?: string; account?: { email?: string; phone?: string } } & Record<string, unknown>;
  if (typeof row.name === "string") row.name = row.name.trim();
  if (row.name === "") return { ok: false, error: "El nombre es obligatorio." };
  const res = id ? await supabase.from(list).update(row).eq("id", id).select("id").single() : await supabase.from(list).insert(row).select("id").single();
  if (res.error) return { ok: false, error: friendlyError(res.error) };
  if (list === "mobile_devices" && account) {
    const { error } = await supabase
      .from("mobile_device_accounts")
      .upsert({ mobile_device_id: res.data.id, email: account.email?.trim() || null, phone: account.phone?.trim() || null });
    if (error) return { ok: false, error: friendlyError(error) };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Guardado." };
}

export async function archiveListItem(list: "categories" | "brands", id: string): Promise<ActionResult> {
  await requirePerm("configuracion");
  const supabase = await createClient();
  const { count } = await supabase.from("products").select("id", { count: "exact", head: true }).eq(list === "categories" ? "category_id" : "brand_id", id).is("deleted_at", null);
  if ((count ?? 0) > 0) return { ok: false, error: `No se puede eliminar: la usan ${count} producto(s).` };
  const { error } = await supabase.from(list).update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Eliminado." };
}

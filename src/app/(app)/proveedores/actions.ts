"use server";
import { revalidatePath } from "next/cache";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type SupplierInput = { id?: string; name: string; contact_name?: string | null; email?: string | null; phone?: string | null; notes?: string | null };

export async function saveSupplier(s: SupplierInput): Promise<ActionResult<string>> {
  const name = s.name.trim();
  if (!name) return { ok: false, error: "El nombre del proveedor es obligatorio." };
  const row = { name, contact_name: s.contact_name?.trim() || null, email: s.email?.trim() || null, phone: s.phone?.trim() || null, notes: s.notes?.trim() || null };
  const supabase = await createClient();
  const res = s.id
    ? await supabase.from("suppliers").update({ ...row, is_placeholder: false }).eq("id", s.id).select("id").single()
    : await supabase.from("suppliers").insert(row).select("id").single();
  if (res.error) return { ok: false, error: friendlyError(res.error) };
  revalidatePath("/proveedores", "layout");
  revalidatePath("/compras", "layout");
  return { ok: true, data: res.data.id, message: "Proveedor guardado." };
}

export async function archiveSupplier(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { count } = await supabase.from("purchase_orders").select("id", { count: "exact", head: true }).eq("supplier_id", id);
  if ((count ?? 0) > 0) return { ok: false, error: "No se puede eliminar: tiene pedidos de compra. Su historial debe conservarse." };
  const { error } = await supabase.from("suppliers").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/proveedores", "layout");
  return { ok: true, message: "Proveedor eliminado." };
}

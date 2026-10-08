import "server-only";
import { revalidatePath } from "next/cache";
import { friendlyError, type ActionResult } from "./errors";
import { createClient } from "./supabase/server";

/**
 * Llama a una función de negocio de la base de datos con la sesión del
 * usuario. Los permisos los comprueba la propia base de datos.
 */
export async function callRpc<T = unknown>(fn: string, args: Record<string, unknown>, revalidate: string[] = [], message?: string): Promise<ActionResult<T>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: friendlyError(error) };
  for (const p of revalidate) revalidatePath(p, "layout");
  return { ok: true, data: data as T, message };
}

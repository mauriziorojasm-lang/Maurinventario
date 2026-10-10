"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function platformAdmin() {
  const u = await requireSession();
  if (!u.isPlatformAdmin) throw new Error("No autorizado.");
  return u;
}

const id = z.uuid();

export async function setOrgStatusAction(org: string, status: "activa" | "suspendida", reason: string): Promise<ActionResult> {
  await platformAdmin();
  if (!id.safeParse(org).success) return { ok: false, error: "Datos no válidos." };
  const { error } = await (await createClient()).rpc("platform_set_org_status", { p_org: org, p_status: status, p_reason: reason });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/plataforma");
  return { ok: true, message: status === "suspendida" ? "Espacio suspendido." : "Espacio reactivado." };
}

export async function setCompedAction(org: string, comped: boolean): Promise<ActionResult> {
  await platformAdmin();
  if (!id.safeParse(org).success) return { ok: false, error: "Datos no válidos." };
  const { error } = await (await createClient()).rpc("platform_set_comped", { p_org: org, p_comped: comped });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/plataforma");
  return { ok: true, message: comped ? "Acceso gratuito concedido." : "Acceso gratuito retirado." };
}

/**
 * Borrado definitivo (solo espacios con la eliminación pedida hace más de
 * 30 días). Primero los archivos, después la base de datos. El panel no
 * ve ni devuelve ningún dato del espacio: solo cuenta lo borrado.
 */
export async function purgeOrganizationAction(org: string, confirmName: string): Promise<ActionResult> {
  await platformAdmin();
  if (!id.safeParse(org).success) return { ok: false, error: "Datos no válidos." };
  const db = createAdminClient();
  const { data: o } = await db.from("organizations").select("name, status, deletion_requested_at").eq("id", org).maybeSingle();
  if (!o || o.status !== "eliminacion_solicitada" || !o.deletion_requested_at || Date.parse(o.deletion_requested_at) > Date.now() - 30 * 86400000) {
    return { ok: false, error: "Solo se pueden borrar espacios con la eliminación solicitada hace más de 30 días." };
  }
  if (confirmName.trim() !== o.name) return { ok: false, error: "Escribe exactamente el nombre del espacio para confirmar." };

  let files = 0;
  const purgeFolders = async (bucket: string, table: "products" | "sales") => {
    for (let from = 0; ; from += 1000) {
      const { data: rows, error } = await db.from(table).select("id").eq("organization_id", org).range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const r of rows ?? []) {
        const { data: objs } = await db.storage.from(bucket).list(r.id, { limit: 1000 });
        const paths = (objs ?? []).filter((x) => x.name).map((x) => `${r.id}/${x.name}`);
        if (paths.length) {
          const { error: e } = await db.storage.from(bucket).remove(paths);
          if (e) throw new Error(e.message);
          files += paths.length;
        }
      }
      if (!rows || rows.length < 1000) break;
    }
  };
  try {
    await purgeFolders("product-photos", "products");
    await purgeFolders("shipping-labels", "sales");
  } catch (e) {
    return { ok: false, error: `No se han podido borrar los archivos: ${e instanceof Error ? e.message : "error"}. No se ha borrado nada más.` };
  }
  const { error } = await db.rpc("platform_purge_organization", { p_org: org });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/plataforma");
  return { ok: true, message: `Espacio borrado definitivamente (${files} archivos).` };
}

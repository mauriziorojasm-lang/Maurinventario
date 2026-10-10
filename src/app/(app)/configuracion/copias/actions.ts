"use server";
import { getCurrentUser } from "@/lib/auth";
import { BACKUP_TABLES } from "@/lib/backup";
import type { ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

/** Cuántos registros hay ahora en cada tabla (para comparar con una copia). */
export async function currentCounts(fileSummary: string): Promise<ActionResult<Record<string, number>>> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin" || !user.active) return { ok: false, error: "Solo los administradores pueden hacer esto." };
  const supabase = await createClient();
  const out: Record<string, number> = {};
  const res = await Promise.all(BACKUP_TABLES.map((t) => supabase.from(t.name).select("*", { count: "exact", head: true })));
  for (let i = 0; i < BACKUP_TABLES.length; i++) {
    if (res[i].error) return { ok: false, error: `No se ha podido contar «${BACKUP_TABLES[i].name}».` };
    out[BACKUP_TABLES[i].name] = res[i].count ?? 0;
  }
  await supabase.rpc("log_user_event", { p_action: "comprobar_copia", p_summary: `Copia comprobada: ${fileSummary.slice(0, 120)}` });
  return { ok: true, data: out };
}

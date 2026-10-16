"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { trackingConfigured } from "@/lib/tracking/seventeen";
import { runTracking } from "@/lib/tracking/service";

const STATUSES = ["enviado", "en_transito", "en_reparto", "entregado", "incidencia", "devuelto", "cancelado", "desconocido"] as const;

const schema = z.object({
  id: z.uuid(),
  tracking_number: z.string().max(60).nullable().optional(),
  carrier_id: z.uuid().nullable().optional(),
  status: z.enum(STATUSES).optional(),
  note: z.string().max(300).optional(),
});

/** Código de seguimiento, transportista o estado puesto a mano. La base de datos comprueba los permisos. */
export async function updateTracking(input: z.input<typeof schema>): Promise<ActionResult> {
  const v = schema.safeParse(input);
  if (!v.success) return { ok: false, error: "Revisa los datos del envío." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_tracking", { p: v.data });
  if (error) return { ok: false, error: friendlyError(error) };
  // Con código nuevo, se da de alta y se consulta ya (si hay servicio de seguimiento)
  if (v.data.tracking_number && trackingConfigured()) await runTracking({ saleIds: [v.data.id] }).catch(() => undefined);
  revalidatePath("/", "layout");
  return { ok: true, message: v.data.status ? "Estado actualizado." : "Envío actualizado." };
}

/** Consultar ahora al transportista: un envío o todos los abiertos (solo los que ve este usuario). */
export async function refreshTracking(saleId?: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user?.orgId || !user.active) return { ok: false, error: "No tienes acceso." };
  if (!trackingConfigured()) return { ok: false, error: "El seguimiento automático no está activado (falta la clave del servicio). Puedes actualizar el estado a mano." };
  const supabase = await createClient();
  // Solo ventas que el usuario puede ver (las reglas de acceso filtran). También las pendientes con código:
  // si el transportista ya las ha recogido, pasan a enviadas solas.
  let q = supabase
    .from("sales")
    .select("id")
    .eq("status", "activa")
    .is("delivered_at", null)
    .not("tracking_number", "is", null)
    .or("tracking_status.is.null,tracking_status.not.in.(devuelto,cancelado,entregado)")
    .order("tracking_checked_at", { ascending: true, nullsFirst: true })
    .limit(120);
  if (saleId) q = q.eq("id", saleId);
  const { data } = await q;
  const ids = (data ?? []).map((r) => r.id as string);
  if (!ids.length) return { ok: true, message: "No hay envíos con código por consultar." };
  const r = await runTracking({ saleIds: ids });
  revalidatePath("/", "layout");
  if (!r.checked && r.errors) return { ok: false, error: `No se ha podido consultar ${ids.length === 1 ? "el envío" : "ningún envío"} (${r.errors} con problemas). Revisa el código y el transportista.` };
  return { ok: true, message: `${r.checked} ${r.checked === 1 ? "envío actualizado" : "envíos actualizados"}${r.updated ? `, ${r.updated} con novedades` : ""}${r.errors ? ` (${r.errors} con problemas)` : ""}.` };
}

export async function markAlertsRead(ids: number[] | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_shipment_alerts_read", { p_ids: ids });
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true };
}

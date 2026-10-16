import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin";
import { CARRIER_CODES, NO_CARRIER_ERROR, changeCarriers, fetchTrackInfo, registerNumbers, trackingConfigured } from "./seventeen";

/**
 * Seguimiento automático. Usa la clave del servidor, así que cada consulta
 * va filtrada por organización o por venta concreta.
 *
 * · Al marcar una venta como enviada (o al añadir el código), se da de alta
 *   en el servicio de seguimiento.
 * · Cada cierto tiempo (aviso automático del correo cada 5 minutos, o al
 *   abrir «Seguimiento») se consultan los envíos abiertos que no se han
 *   mirado en las últimas horas.
 * Sin TRACK17_API_KEY no se consulta nada: el seguimiento se lleva a mano.
 */

const RECHECK_MS = 3 * 60 * 60 * 1000; // cada envío, como mucho cada 3 horas
const MAX_PER_RUN = 120;

type OpenSale = {
  id: string;
  organization_id: string;
  tracking_number: string;
  tracking_registered_at: string | null;
  tracking_error: string | null;
  carrier: { name: string }[] | { name: string } | null;
};

const carrierName = (s: OpenSale): string => (Array.isArray(s.carrier) ? s.carrier[0]?.name : s.carrier?.name) ?? "";
const carrierCode = (s: OpenSale): number | null => CARRIER_CODES[carrierName(s).trim().toLowerCase()] ?? null;

export type TrackingRun = { configured: boolean; registered: number; checked: number; updated: number; errors: number; alerts: number };

async function openSales(db: SupabaseClient, opts: { orgId?: string; saleIds?: string[]; force?: boolean }): Promise<OpenSale[]> {
  let q = db
    .from("sales")
    .select("id, organization_id, tracking_number, tracking_registered_at, tracking_checked_at, tracking_error, carrier:carriers(name)")
    .eq("status", "activa")
    .not("shipped_at", "is", null)
    .is("delivered_at", null)
    .not("tracking_number", "is", null)
    .not("tracking_status", "in", "(devuelto,cancelado,entregado)")
    .order("tracking_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_PER_RUN);
  if (opts.orgId) q = q.eq("organization_id", opts.orgId);
  if (opts.saleIds?.length) q = q.in("id", opts.saleIds);
  if (!opts.force) q = q.or(`tracking_checked_at.is.null,tracking_checked_at.lt.${new Date(Date.now() - RECHECK_MS).toISOString()}`);
  const { data, error } = await q;
  if (error) throw new Error(`No se han podido leer los envíos: ${error.message}`);
  return (data ?? []) as OpenSale[];
}

/** Da de alta y actualiza los envíos abiertos (de una organización, de unas ventas o de todas). */
export async function runTracking(opts: { orgId?: string; saleIds?: string[]; force?: boolean } = {}): Promise<TrackingRun> {
  const run: TrackingRun = { configured: trackingConfigured(), registered: 0, checked: 0, updated: 0, errors: 0, alerts: 0 };
  const db = createAdminClient();
  if (run.configured) {
    const sales = await openSales(db, opts);
    // 1) Alta de los códigos nuevos
    const toRegister = sales.filter((s) => !s.tracking_registered_at);
    if (toRegister.length) {
      try {
        const res = await registerNumbers(toRegister.map((s) => ({ number: s.tracking_number, tag: s.id, carrier: carrierCode(s) })));
        for (const s of toRegister) {
          const err = res.get(s.tracking_number);
          if (err === undefined) continue;
          await db.rpc("tracking_apply", { p_sale_id: s.id, p: { provider: "17track", registered: err === null, error: err } });
          if (err === null) {
            s.tracking_registered_at = new Date().toISOString();
            run.registered++;
          } else run.errors++;
        }
      } catch (e) {
        run.errors++;
        for (const s of toRegister) await db.rpc("tracking_apply", { p_sale_id: s.id, p: { provider: "17track", error: e instanceof Error ? e.message : "Error" } });
      }
    }
    // 2) Movimientos de los registrados
    const registered = sales.filter((s) => s.tracking_registered_at);
    if (registered.length) {
      try {
        // Códigos que 17TRACK no reconoce y de los que sabemos el transportista: se lo indicamos
        const lost = registered.filter((s) => s.tracking_error === NO_CARRIER_ERROR && carrierCode(s));
        if (lost.length) await changeCarriers(lost.map((s) => ({ number: s.tracking_number, carrier: carrierCode(s)! })));
        const info = await fetchTrackInfo([...new Set(registered.map((s) => s.tracking_number))]);
        for (const s of registered) {
          const r = info.get(s.tracking_number);
          if (!r) continue;
          run.checked++;
          const { error } = await db.rpc("tracking_apply", {
            p_sale_id: s.id,
            p: { provider: "17track", error: r.error, eta: r.eta, events: r.events },
          });
          if (error) run.errors++;
          else if (r.events.length) run.updated++;
        }
      } catch {
        run.errors++;
      }
    }
  }
  // 3) Alertas por tiempo (retraso, sin novedades): también sin servicio externo
  const { data: n } = await db.rpc("tracking_check_stale");
  run.alerts = Number(n ?? 0);
  return run;
}

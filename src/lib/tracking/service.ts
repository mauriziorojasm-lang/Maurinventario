import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin";
import { CARRIER_CODES, fetchTrackInfo, registerNumbers, trackingConfigured } from "./seventeen";

/**
 * Seguimiento automático. Usa la clave del servidor, así que cada consulta
 * va filtrada por organización o por venta concreta.
 *
 * Solo se consulta al transportista cuando pasa algo (nunca cada cierto tiempo):
 * · al añadir o cambiar el código de una venta (desde Ventas o Seguimiento),
 * · al marcar ventas como enviadas,
 * · al confirmar una venta detectada o llegar una etiqueta con código (solo los códigos nuevos),
 * · al pulsar «Actualizar envíos» (todos los abiertos).
 * También entran las ventas pendientes con código: si el transportista ya las
 * ha recogido, pasan a enviadas solas.
 * Sin TRACK17_API_KEY no se consulta nada: el seguimiento se lleva a mano.
 */

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
const carrierCodes = (s: OpenSale): number[] => CARRIER_CODES[carrierName(s).trim().toLowerCase()] ?? [];

export type TrackingRun = { configured: boolean; registered: number; checked: number; updated: number; errors: number; alerts: number };
export type TrackingScope = {
  /** Solo los envíos de esta organización. */
  orgId?: string;
  /** Solo estas ventas. */
  saleIds?: string[];
  /** Solo los códigos que aún no se han consultado nunca (ventas o etiquetas nuevas). */
  onlyNew?: boolean;
};

async function openSales(db: SupabaseClient, opts: TrackingScope): Promise<OpenSale[]> {
  let q = db
    .from("sales")
    .select("id, organization_id, tracking_number, tracking_registered_at, tracking_checked_at, tracking_error, carrier:carriers(name)")
    .eq("status", "activa")
    .is("delivered_at", null)
    .not("tracking_number", "is", null)
    .or("tracking_status.is.null,tracking_status.not.in.(devuelto,cancelado,entregado)")
    .order("tracking_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_PER_RUN);
  if (opts.orgId) q = q.eq("organization_id", opts.orgId);
  if (opts.saleIds?.length) q = q.in("id", opts.saleIds);
  if (opts.onlyNew) q = q.is("tracking_checked_at", null);
  const { data, error } = await q;
  if (error) throw new Error(`No se han podido leer los envíos: ${error.message}`);
  return (data ?? []) as OpenSale[];
}

/** Alertas por tiempo (retraso, sin novedades). Solo mira la base de datos: no gasta consultas. */
export async function checkStaleShipments(): Promise<number> {
  const { data } = await createAdminClient().rpc("tracking_check_stale");
  return Number(data ?? 0);
}

/** Da de alta y actualiza los envíos abiertos (de una organización, de unas ventas o de todas). */
export async function runTracking(opts: TrackingScope = {}): Promise<TrackingRun> {
  const run: TrackingRun = { configured: trackingConfigured(), registered: 0, checked: 0, updated: 0, errors: 0, alerts: 0 };
  const db = createAdminClient();
  if (run.configured) {
    const sales = await openSales(db, opts);
    // 1) Alta de los códigos nuevos
    const toRegister = sales.filter((s) => !s.tracking_registered_at);
    if (toRegister.length) {
      try {
        const res = await registerNumbers(toRegister.map((s) => ({ number: s.tracking_number, tag: s.id, carriers: carrierCodes(s) })));
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
  run.alerts = await checkStaleShipments();
  return run;
}

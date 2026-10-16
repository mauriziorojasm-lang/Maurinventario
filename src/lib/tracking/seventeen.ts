import "server-only";
import { testOnlyEnv } from "../test-env";

/**
 * Cliente de la API de 17TRACK (v2.4). Solo se usa si existe la variable
 * TRACK17_API_KEY. Documentación: https://api.17track.net/en/doc
 *
 * · /register da de alta un código (gasta 1 de la cuota; 200 gratis al
 *   crear la cuenta). Registrar dos veces el mismo código no gasta más.
 * · /gettrackinfo consulta los movimientos de los códigos ya registrados
 *   (no gasta cuota).
 * El transportista se detecta solo (no se envía el código de transportista).
 */

export type TrackStatus = "enviado" | "en_transito" | "en_reparto" | "entregado" | "incidencia" | "devuelto" | "desconocido";
export type TrackEvent = { at: string; status: TrackStatus; description: string; location: string | null };
export type TrackResult = { number: string; events: TrackEvent[]; eta: string | null; carrierName: string | null; error: string | null };

const BASE = () => (testOnlyEnv("TRACK17_API_BASE") || "https://api.17track.net/track/v2.4").replace(/\/$/, "");

export function trackingConfigured(): boolean {
  return !!process.env.TRACK17_API_KEY?.trim();
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const key = process.env.TRACK17_API_KEY?.trim();
  if (!key) throw new Error("Falta TRACK17_API_KEY");
  const res = await fetch(`${BASE()}${path}`, {
    method: "POST",
    headers: { "17token": key, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("17TRACK ha rechazado la clave (TRACK17_API_KEY).");
  if (!res.ok) throw new Error(`17TRACK ha respondido con un error (${res.status}).`);
  const j = (await res.json()) as { code: number; data?: T; message?: string };
  if (j.code !== 0 || !j.data) throw new Error(`17TRACK: ${j.message ?? `código ${j.code}`}`);
  return j.data;
}

type Rejected = { number: string; error?: { code?: number; message?: string } };

const ALREADY_REGISTERED = -18019901;
const QUOTA_MESSAGES: Record<number, string> = {
  [-18019908]: "Se ha gastado la cuota de 17TRACK: amplíala en tu cuenta de 17TRACK o introduce los estados a mano.",
  [-18019907]: "Se ha llegado al límite diario de 17TRACK. Se volverá a intentar mañana.",
};

/** Da de alta códigos. Devuelve, por código, null si está bien o el motivo del error. */
export async function registerNumbers(numbers: { number: string; tag: string }[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let i = 0; i < numbers.length; i += 40) {
    const chunk = numbers.slice(i, i + 40);
    const data = await call<{ accepted?: { number: string }[]; rejected?: Rejected[] }>("/register", chunk.map((n) => ({ number: n.number, tag: n.tag })));
    for (const a of data.accepted ?? []) out.set(a.number, null);
    for (const r of data.rejected ?? []) {
      const code = r.error?.code ?? 0;
      out.set(r.number, code === ALREADY_REGISTERED ? null : (QUOTA_MESSAGES[code] ?? r.error?.message ?? "17TRACK no acepta este código."));
    }
  }
  return out;
}

type Raw17Event = { time_iso?: string | null; time_utc?: string | null; description?: string | null; location?: string | null; stage?: string | null; sub_status?: string | null };
type Raw17 = {
  number: string;
  track_info?: {
    latest_status?: { status?: string | null; sub_status?: string | null } | null;
    time_metrics?: { estimated_delivery_date?: { from?: string | null; to?: string | null } | null } | null;
    tracking?: { providers?: { provider?: { name?: string | null } | null; events?: Raw17Event[] | null }[] | null } | null;
  } | null;
};

/** Traduce los estados de 17TRACK a los de Resellap. */
export function mapStatus(stage?: string | null, sub?: string | null): TrackStatus {
  const s = `${sub ?? ""} ${stage ?? ""}`;
  if (/Delivered/.test(s)) return "entregado";
  if (/Return/.test(s)) return "devuelto";
  if (/DeliveryFailure|Exception/.test(s)) return "incidencia";
  if (/OutForDelivery|AvailableForPickup/.test(s)) return "en_reparto";
  if (/InTransit|PickedUp|Departure|Arrival/.test(s)) return "en_transito";
  if (/InfoReceived/.test(s)) return "enviado";
  return "desconocido";
}

export function parseTrackInfo(raw: Raw17): TrackResult {
  const ti = raw.track_info ?? {};
  const providers = ti.tracking?.providers ?? [];
  const events: TrackEvent[] = [];
  for (const p of providers) {
    for (const e of p.events ?? []) {
      const at = e.time_utc || e.time_iso;
      if (!at || Number.isNaN(Date.parse(at))) continue;
      events.push({
        at: new Date(at).toISOString(),
        status: mapStatus(e.stage, e.sub_status),
        description: (e.description ?? "").trim().slice(0, 500) || "Movimiento del envío",
        location: e.location?.trim().slice(0, 200) || null,
      });
    }
  }
  const eta = ti.time_metrics?.estimated_delivery_date?.to || ti.time_metrics?.estimated_delivery_date?.from || null;
  const latest = ti.latest_status?.status ?? null;
  return {
    number: raw.number,
    events,
    eta: eta && !Number.isNaN(Date.parse(eta)) ? new Date(eta).toISOString().slice(0, 10) : null,
    carrierName: providers[0]?.provider?.name ?? null,
    error: !events.length && (latest === "NotFound" || !latest) ? "El transportista aún no tiene información de este código." : null,
  };
}

/** Consulta los movimientos de códigos ya registrados. */
export async function fetchTrackInfo(numbers: string[]): Promise<Map<string, TrackResult>> {
  const out = new Map<string, TrackResult>();
  for (let i = 0; i < numbers.length; i += 40) {
    const chunk = numbers.slice(i, i + 40);
    const data = await call<{ accepted?: Raw17[]; rejected?: Rejected[] }>("/gettrackinfo", chunk.map((n) => ({ number: n })));
    for (const a of data.accepted ?? []) out.set(a.number, parseTrackInfo(a));
    for (const r of data.rejected ?? []) {
      out.set(r.number, { number: r.number, events: [], eta: null, carrierName: null, error: QUOTA_MESSAGES[r.error?.code ?? 0] ?? r.error?.message ?? "17TRACK no tiene este código." });
    }
  }
  return out;
}

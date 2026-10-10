/** Formatos en español de España. */
const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const eur4 = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const int = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

export function money(v: number | string | null | undefined, opts?: { precise?: boolean }): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return (opts?.precise ? eur4 : eur).format(n);
}

export function units(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  return int.format(Number(v));
}

/** "1 ud." / "3 uds." */
export function udsLabel(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  return `${units(n)} ${n === 1 ? "ud." : "uds."}`;
}

export function percent(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  return `${pct.format(Number(v))} %`;
}

const madridDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" });

/**
 * dd/mm/aaaa. Las fechas sin hora («2026-10-09») se muestran tal cual; los
 * instantes (con hora) se pasan a la hora de Madrid, para que una venta de
 * las 00:30 no aparezca en el día anterior.
 */
export function date(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const s = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : madridDay.format(typeof v === "string" ? new Date(v) : v);
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function dateTime(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" });
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-ES", { month: "short", year: "2-digit", timeZone: "UTC" });
}

/** Fecha de hoy en Madrid, "aaaa-mm-dd". */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

export const EXIT_REASONS: Record<string, string> = {
  regalo: "Regalo",
  perdida: "Pérdida",
  otro: "Otro",
  pendiente: "Motivo pendiente",
};

export const RETURN_TYPES: Record<string, string> = {
  devolucion_producto: "El cliente devuelve el producto",
  reembolso_sin_producto: "Reembolso sin devolver el producto",
};

export const PO_STATUS: Record<string, string> = { pendiente: "Pendiente", recibido: "Recibido", cancelado: "Cancelado" };

export const COST_TYPES: Record<string, string> = {
  transporte: "Transporte / porte",
  aduanas: "Aduanas",
  aranceles: "Aranceles",
  comisiones: "Comisiones",
  gestion: "Gestión",
  otros: "Otros costes",
};

export const MOVEMENT_TYPES: Record<string, string> = {
  entrada_compra: "Entrada por compra",
  venta: "Venta",
  anulacion_venta: "Venta anulada",
  devolucion: "Devolución",
  salida_sin_venta: "Salida sin venta",
  anulacion_salida: "Salida anulada",
  ajuste_entrada: "Ajuste (entrada)",
  ajuste_salida: "Ajuste (salida)",
};

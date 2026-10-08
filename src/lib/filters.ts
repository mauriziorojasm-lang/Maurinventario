/** Lee los filtros de la URL (?from=…&to=…) y los convierte en el JSON que esperan los informes. */
export type SearchParams = Record<string, string | string[] | undefined>;

export const REPORT_FILTER_KEYS = [
  "from",
  "to",
  "purchase_order_number",
  "product_id",
  "variant_id",
  "category_id",
  "brand_id",
  "responsible_id",
  "platform_id",
  "supplier_id",
  "status",
  "shipping_status",
  "search",
  "only_in_stock",
] as const;

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function filtersFrom(sp: SearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of REPORT_FILTER_KEYS) {
    const v = first(sp[k])?.trim();
    if (v) out[k] = v;
  }
  return out;
}

export function pageFrom(sp: SearchParams, size = 50): { page: number; from: number; to: number; size: number } {
  const page = Math.max(1, Number(first(sp.page)) || 1);
  return { page, from: (page - 1) * size, to: page * size - 1, size };
}

export function toQuery(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

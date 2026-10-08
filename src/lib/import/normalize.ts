/**
 * Funciones de limpieza de datos para la importación.
 * Son puras (sin efectos) para poder probarlas fácilmente.
 */

export type CellValue = string | number | boolean | Date | null;

/** Texto sin espacios sobrantes, o null si está vacío. */
export function cleanText(v: CellValue): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return toIsoDate(v);
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/** Clave para comparar nombres: minúsculas, sin acentos, sin espacios dobles. */
export function normKey(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Normaliza una cabecera de columna para compararla con los sinónimos. */
export function normHeader(v: CellValue): string {
  if (v === null || v === undefined) return "";
  return normKey(String(v))
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9ºª ]/g, " ")
    .replace(/[ºª]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Número a partir de una celda ("12,5", "12.5 €", 12.5). */
export function toNumber(v: CellValue): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean" || v instanceof Date) return null;
  let s = String(v).replace(/[€\s]/g, "");
  if (s === "") return null;
  // 1.234,56 → 1234.56 ; 1234,56 → 1234.56
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function isInteger(n: number | null): n is number {
  return n !== null && Number.isInteger(n);
}

/** Redondeo seguro de importes (evita 45.00000001). */
export function round(n: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Fecha a partir de una celda: Date de Excel, número de serie de Excel,
 * "dd/mm/aaaa", "dd-mm-aaaa" o "aaaa-mm-dd". Devuelve "aaaa-mm-dd" o null.
 */
export function toDate(v: CellValue): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : toIsoDate(v);
  if (typeof v === "number") {
    if (v < 1 || v > 2958465) return null;
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return toIsoDate(new Date(ms));
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validDate(year, Number(m[2]), Number(m[1]));
  }
  return null;
}

function validDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 2000 || y > 2100) return null;
  return toIsoDate(dt);
}

/** "si", "sí", "x", "enviado", true… → true */
export function toYes(v: CellValue): boolean {
  if (v === true) return true;
  const k = normKey(cleanText(v));
  return ["si", "s", "yes", "y", "x", "ok", "enviado", "true", "1", "hecho"].includes(k);
}

/** "Oakley - Encoder" → "Oakley". Solo si el nombre sigue el patrón "Marca - Modelo". */
export function brandFromName(name: string): string | null {
  const m = name.match(/^(.{2,30}?)\s+-\s+\S/);
  return m ? m[1].trim() : null;
}

/** "Vinted - InPost" → { platform: "Vinted", carrier: "InPost" }; "En persona" → { platform: "En persona" } */
export function splitShippingMethod(v: string | null): { platform: string | null; carrier: string | null } {
  if (!v) return { platform: null, carrier: null };
  const idx = v.indexOf(" - ");
  if (idx === -1) return { platform: v.trim(), carrier: null };
  return { platform: v.slice(0, idx).trim() || null, carrier: v.slice(idx + 3).trim() || null };
}

/** Hash corto y estable (cyrb53) para las huellas de importación. */
export function hash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Similitud entre 0 y 1 (Levenshtein normalizado). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

/** Texto de teléfono sin decimales de Excel (657464231.0 → "657464231"). */
export function toPhone(v: CellValue): string | null {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  return cleanText(v);
}

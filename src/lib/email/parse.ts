/**
 * Lectura de los correos de Vinted y Wallapop.
 *
 * Funciones puras (sin red ni base de datos) para poder probarlas con
 * ejemplos. Nunca inventan datos: si un campo no aparece, se queda vacío,
 * y si los importes no cuadran, se marca como dudoso para revisión.
 */

export type EmailKind = "vinted_venta" | "vinted_etiqueta" | "wallapop_venta" | "wallapop_aviso" | "otro";
export type Platform = "vinted" | "wallapop";

export interface EmailInput {
  from: string;
  subject: string;
  /** Texto del correo (si solo hay HTML, pásalo por htmlToText antes). */
  text: string;
  /** Nombres de los adjuntos PDF (solo para clasificar). */
  pdfNames?: string[];
}

export interface VintedSale {
  account: string | null;
  account_norm: string | null;
  buyer: string | null;
  product: string;
  product_norm: string;
  price: number;
}

export interface VintedLabel {
  account: string | null;
  account_norm: string | null;
  product: string | null;
  product_norm: string | null;
  package_size: string | null;
  tracking_number: string | null;
  deadline: string | null; // ISO con zona horaria
  deadline_text: string | null;
  transaction_id: string | null;
  carrier_text: string | null;
}

export interface WallapopSale {
  account: string | null;
  account_norm: string | null;
  buyer: string | null;
  product: string;
  product_norm: string;
  price: number;
  shipping: number | null;
  total: number | null;
  amounts: number[];
  sale_date: string | null; // AAAA-MM-DD
  order_id: string | null;
  /** Si no es null, los importes no cuadran y hay que revisarlo a mano. */
  doubt: string | null;
}

// ---------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  euro: "€",
  ordm: "º",
  ordf: "ª",
  deg: "°",
  iexcl: "¡",
  iquest: "¿",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  ntilde: "ñ",
  Ntilde: "Ñ",
  uuml: "ü",
  Uuml: "Ü",
  ccedil: "ç",
  middot: "·",
  laquo: "«",
  raquo: "»",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  zwnj: "",
  zwj: "",
  shy: "",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Convierte el HTML del correo en líneas de texto. */
export function htmlToText(html: string): string {
  const s = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|tbody|thead|section|article|header|footer|blockquote)\s*>/gi, "\n")
    .replace(/<(p|div|tr|li|h[1-6]|table|blockquote)\b[^>]*>/gi, "\n")
    .replace(/<\/(td|th)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return cleanText(decodeEntities(s));
}

/** Limpia espacios raros, líneas vacías repetidas y las marcas «>» de las respuestas. */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[   \t]/g, " ")
    .replace(/[​-‍⁠﻿­]/g, "")
    .split("\n")
    .map((l) => l.replace(/^(\s*>)+/, "").replace(/ {2,}/g, " ").trim())
    .filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""))
    .join("\n")
    .trim();
}

function lines(text: string): string[] {
  return cleanText(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Minúsculas, sin acentos ni signos, espacios simples. «Oakley - Encoder · Rosas» → «oakley encoder rosas». */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------
// Importes y fechas
// ---------------------------------------------------------------------

const AMOUNT_RE = /(?:€\s*(-?\d[\d.,]*))|(?:(-?\d[\d.,]*)\s*(?:€|eur\b|euros?\b))/i;

/** «55.00 €», «55,00 €», «1.234,50 €», «€12» → número. null si no hay importe. */
export function parseEuro(s: string): number | null {
  const m = s.match(AMOUNT_RE);
  if (!m) return null;
  return parseNumber(m[1] ?? m[2]);
}

export function parseNumber(raw: string): number | null {
  let n = raw.replace(/\s/g, "").replace(/[.,]$/, "");
  const lastDot = n.lastIndexOf(".");
  const lastComma = n.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // Los dos separadores: el último es el decimal
    const dec = Math.max(lastDot, lastComma);
    n = n.slice(0, dec).replace(/[.,]/g, "") + "." + n.slice(dec + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    // Uno solo: es decimal si lleva 1 o 2 cifras detrás («12,5», «55.00»); si no, de miles («1.234»)
    const parts = n.split(lastDot >= 0 ? "." : ",");
    n = parts.length === 2 && parts[1].length <= 2 ? `${parts[0]}.${parts[1]}` : parts.join("");
  }
  const v = Number(n);
  return n !== "" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
}

const MONTHS: Record<string, number> = {
  ene: 1,
  enero: 1,
  feb: 2,
  febrero: 2,
  mar: 3,
  marzo: 3,
  abr: 4,
  abril: 4,
  may: 5,
  mayo: 5,
  jun: 6,
  junio: 6,
  jul: 7,
  julio: 7,
  ago: 8,
  agosto: 8,
  sep: 9,
  sept: 9,
  septiembre: 9,
  setiembre: 9,
  oct: 10,
  octubre: 10,
  nov: 11,
  noviembre: 11,
  dic: 12,
  diciembre: 12,
  jan: 1,
  january: 1,
  february: 2,
  march: 3,
  apr: 4,
  april: 4,
  june: 6,
  july: 7,
  aug: 8,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  dec: 12,
  december: 12,
};

export interface LocalDate {
  y: number;
  m: number;
  d: number;
  hh: number | null;
  mi: number | null;
}

/** Lee fechas españolas: «14/10/2026 23:59», «14-10-2026», «14 de octubre de 2026 a las 23:59», «14 oct. 2026, 23:59», «2026-10-14». */
export function parseSpanishDate(s: string): LocalDate | null {
  const t = normalizeName(s.replace(/(\d)[:h](\d)/g, "$1 h $2"));
  let y: number, m: number, d: number;
  let rest = "";
  let r: RegExpMatchArray | null;
  if ((r = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/))) {
    y = +r[1];
    m = +r[2];
    d = +r[3];
    if (r[4]) return valid({ y, m, d, hh: +r[4], mi: +r[5] });
    return valid({ y, m, d, hh: null, mi: null });
  }
  if ((r = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) {
    d = +r[1];
    m = +r[2];
    y = +r[3] < 100 ? 2000 + +r[3] : +r[3];
    rest = s.slice((r.index ?? 0) + r[0].length);
  } else if ((r = t.match(/\b(\d{1,2}) (?:de )?([a-z]+) (?:de |del )?(\d{4})\b/)) && MONTHS[r[2]]) {
    d = +r[1];
    m = MONTHS[r[2]];
    y = +r[3];
    rest = t.slice((r.index ?? 0) + r[0].length);
  } else {
    return null;
  }
  const time = rest.match(/(\d{1,2})\s*(?::|h)\s*(\d{2})/);
  return valid({ y, m, d, hh: time ? +time[1] : null, mi: time ? +time[2] : null });
}

function valid(x: LocalDate): LocalDate | null {
  if (x.m < 1 || x.m > 12 || x.d < 1 || x.d > 31 || x.y < 2000 || x.y > 2100) return null;
  if (x.hh !== null && (x.hh > 23 || (x.mi ?? 0) > 59)) return { ...x, hh: null, mi: null };
  const dt = new Date(Date.UTC(x.y, x.m - 1, x.d));
  if (dt.getUTCMonth() !== x.m - 1) return null;
  return x;
}

export function isoDate(x: LocalDate): string {
  return `${x.y}-${String(x.m).padStart(2, "0")}-${String(x.d).padStart(2, "0")}`;
}

/** Hora de Madrid → instante ISO (tiene en cuenta el horario de verano). */
export function madridToIso(x: LocalDate): string {
  const hh = x.hh ?? 23;
  const mi = x.mi ?? 59;
  const guess = Date.UTC(x.y, x.m - 1, x.d, hh, mi);
  const offset = (t: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Madrid",
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
        .formatToParts(new Date(t))
        .map((q) => [q.type, q.value]),
    );
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t;
  };
  let t = guess - offset(guess);
  t = guess - offset(t);
  return new Date(t).toISOString();
}

// ---------------------------------------------------------------------
// Reenvíos: si el correo se reenvió a mano, los datos de verdad están
// en el bloque «Mensaje reenviado» del cuerpo.
// ---------------------------------------------------------------------

export function forwardedHeaders(text: string): { from: string | null; subject: string | null } {
  const ls = cleanText(text).split("\n");
  let from: string | null = null;
  let subject: string | null = null;
  for (const l of ls) {
    const f = l.match(/^\*?(?:de|from)\s*:\*?\s*(.+)$/i);
    if (f && !from && /@/.test(f[1])) from = f[1].trim();
    const s = l.match(/^\*?(?:asunto|subject)\s*:\*?\s*(.+)$/i);
    if (s && !subject) subject = s[1].trim();
  }
  return { from, subject };
}

function stripPrefixes(subject: string): string {
  return subject.replace(/^\s*((fwd?|rv|re|tr|reenv(?:iado)?)\s*:\s*)+/i, "").trim();
}

// ---------------------------------------------------------------------
// Clasificación
// ---------------------------------------------------------------------

export function classify(input: EmailInput): { kind: EmailKind; platform: Platform | null } {
  const fwd = forwardedHeaders(input.text);
  const from = `${input.from} ${fwd.from ?? ""}`.toLowerCase();
  const subject = normalizeName(`${stripPrefixes(input.subject)} ${fwd.subject ? stripPrefixes(fwd.subject) : ""}`);
  const body = normalizeName(input.text);

  const isVinted = /vinted\./.test(from) || /\bvinted\b/.test(subject) || /\bequipo de vinted\b/.test(body);
  const isWallapop = /wallapop\./.test(from) || /\bwallapop\b/.test(subject) || /\bwallapop\b/.test(body);

  if (isVinted && !isWallapop) {
    if (
      /etiqueta de envio adjunta/.test(body) ||
      (/\bn o de seguimiento\b|\bnumero de seguimiento\b|\bn de seguimiento\b/.test(body) && /\btransaccion\b/.test(body) && /\bpedido\b/.test(body))
    ) {
      return { kind: "vinted_etiqueta", platform: "vinted" };
    }
    if (/has vendido un articulo en vinted/.test(subject) || /\bha comprado\b/.test(body)) {
      return { kind: "vinted_venta", platform: "vinted" };
    }
    return { kind: "otro", platform: "vinted" };
  }
  if (isWallapop) {
    if (/confirmacion de tu venta/.test(body) && /comprado por/.test(body)) return { kind: "wallapop_venta", platform: "wallapop" };
    if (/has hecho una nueva venta/.test(body + " " + subject) || /selecciona un metodo de envio/.test(body)) {
      return { kind: "wallapop_aviso", platform: "wallapop" };
    }
    return { kind: "otro", platform: "wallapop" };
  }
  return { kind: "otro", platform: null };
}

// ---------------------------------------------------------------------
// Vinted · «Has vendido un artículo en Vinted»
// ---------------------------------------------------------------------

function greeting(ls: string[]): string | null {
  for (const l of ls) {
    const m = l.match(/^hola,?\s+(.+?)\s*[:,]/i) ?? l.match(/^hola,?\s+(.+?)\s*[:,.!]?$/i);
    if (m && m[1] && m[1].length <= 60) return m[1].trim();
  }
  return null;
}

/** El cuerpo útil empieza en el saludo (descarta las cabeceras de un reenvío). */
function fromGreeting(text: string): string[] {
  const ls = lines(text);
  const i = ls.findIndex((l) => /^hola\b/i.test(l));
  return i >= 0 ? ls.slice(i) : ls;
}

export function parseVintedSale(text: string): VintedSale | null {
  const ls = fromGreeting(text);
  const account = greeting(ls);
  const i = ls.findIndex((l) => /\bha comprado\b/i.test(l));
  if (i < 0) return null;
  const m = ls[i].match(/^(.*?)\s*\bha comprado\b\s*:?\s*(.*)$/i)!;
  const buyer = m[1].trim() || null;
  let product = m[2].trim();
  let j = i + 1;
  // En una sola línea puede venir «producto 12,00 €»
  if (product && parseEuro(product) !== null) {
    const price = parseEuro(product)!;
    product = product.replace(AMOUNT_RE, "").trim();
    return product ? build(product, price) : null;
  }
  if (!product) {
    while (j < ls.length && parseEuro(ls[j]) !== null && !/[a-z]{3}/i.test(ls[j].replace(AMOUNT_RE, ""))) j++;
    product = ls[j] ?? "";
    j++;
  }
  if (!product || /^transferiremos\b/i.test(product)) return null;
  // El precio es la primera línea que es solo un importe, justo después del artículo
  for (let k = j; k < Math.min(ls.length, j + 3); k++) {
    const p = parseEuro(ls[k]);
    if (p !== null && ls[k].replace(AMOUNT_RE, "").trim().length <= 2) return build(product, p);
  }
  return null;

  function build(name: string, price: number): VintedSale | null {
    if (!(price > 0)) return null;
    return {
      account,
      account_norm: account ? normalizeName(account) : null,
      buyer,
      product: name,
      product_norm: normalizeName(name),
      price,
    };
  }
}

// ---------------------------------------------------------------------
// Vinted · correo con la etiqueta adjunta
// ---------------------------------------------------------------------

/** Valor de un campo «Etiqueta: valor» (o con el valor en la línea siguiente). */
function field(ls: string[], re: RegExp): { value: string | null; index: number } {
  for (let i = 0; i < ls.length; i++) {
    const m = ls[i].match(re);
    if (!m) continue;
    const after = ls[i].slice((m.index ?? 0) + m[0].length).replace(/^\s*:?\s*/, "").trim();
    if (after) return { value: after, index: i };
    const next = ls[i + 1];
    if (next && !/:\s*$/.test(next) && !LABEL_FIELDS.some((r) => r.test(next))) return { value: next.trim(), index: i + 1 };
    return { value: null, index: i };
  }
  return { value: null, index: -1 };
}

const N = String.raw`(?:n\.?\s*[º°o]\.?|n[uú]m(?:ero)?\.?|nº|no\.)\s*`;
const F_PEDIDO = /^pedido\s*:/i;
const F_TAMANO = /^tama[nñ]o(?:\s+del\s+paquete)?\s*:/i;
const F_SEGUIMIENTO = new RegExp(String.raw`^${N}de\s+seguimiento\s*:?`, "i");
const F_LIMITE = /^fecha\s+l[ií]mite(?:\s+de\s+env[ií]o)?\s*:?/i;
const F_TRANSACCION = new RegExp(String.raw`^${N}de\s+transacci[oó]n\s*:?`, "i");
const LABEL_FIELDS = [F_PEDIDO, F_TAMANO, F_SEGUIMIENTO, F_LIMITE, F_TRANSACCION];

export function parseVintedLabel(text: string): VintedLabel {
  const ls = fromGreeting(text);
  const account = greeting(ls);
  const product = field(ls, F_PEDIDO).value;
  const size = field(ls, F_TAMANO).value;
  const tracking = field(ls, F_SEGUIMIENTO).value;
  const limit = field(ls, F_LIMITE).value;
  const trx = field(ls, F_TRANSACCION);
  const transaction = trx.value?.match(/[A-Za-z0-9-]{4,}/)?.[0] ?? null;
  const date = limit ? parseSpanishDate(limit) : null;
  // El transportista suele venir justo después de los datos de envío
  let carrier: string | null = null;
  if (trx.index >= 0) {
    for (let k = trx.index + 1; k < Math.min(ls.length, trx.index + 4); k++) {
      if (/^(tu equipo|el equipo|gracias|saludos|instrucciones)/i.test(ls[k])) break;
      if (ls[k].length <= 200) {
        carrier = ls[k];
        break;
      }
    }
  }
  return {
    account,
    account_norm: account ? normalizeName(account) : null,
    product,
    product_norm: product ? normalizeName(product) : null,
    package_size: size,
    tracking_number: tracking?.match(/[A-Za-z0-9-]{4,}/)?.[0] ?? null,
    deadline: date ? madridToIso(date) : null,
    deadline_text: limit,
    transaction_id: transaction,
    carrier_text: carrier,
  };
}

// ---------------------------------------------------------------------
// Wallapop · «aquí tienes la confirmación de tu venta»
// ---------------------------------------------------------------------

export function parseWallapopSale(text: string): WallapopSale | null {
  const ls = fromGreeting(text);
  let account: string | null = null;
  const g = ls.find((l) => /^hola\b/i.test(l));
  if (g) {
    const m = g.match(/^hola,?\s+(.+?)\s*,\s*aqu[ií] tienes/i) ?? g.match(/^hola,?\s+(.+?)\s*[:,.]/i);
    account = m?.[1]?.trim() || null;
  }
  const by = field(ls, /^comprado\s+por\s*:?/i);
  if (by.index < 0) return null;
  const buyer = by.value;

  // El artículo: primera línea con texto después de «Comprado por» que no sea un importe
  let i = by.index + 1;
  while (i < ls.length && (parseEuro(ls[i]) !== null || /^(hola|aqu[ií] tienes)/i.test(ls[i]))) i++;
  const product = ls[i];
  if (!product) return null;

  // Importes entre el artículo y «Total». Cada importe se asocia a su
  // explicación (en la misma línea o en la línea anterior).
  const entries: { value: number; label: string }[] = [];
  let total: number | null = null;
  let prevLabel = "";
  for (let k = i + 1; k < ls.length; k++) {
    const l = ls[k];
    if (/^fecha\s+de\s+compra/i.test(l) || /^ver instrucciones/i.test(l)) break;
    const v = parseEuro(l);
    if (/^total\b/i.test(l)) {
      total = v ?? (ls[k + 1] ? parseEuro(ls[k + 1]) : null);
      if (v === null && total !== null) k++;
      prevLabel = "";
      continue;
    }
    if (v === null) {
      prevLabel = l;
      continue;
    }
    const sameLine = l.replace(AMOUNT_RE, "").replace(/[:\s]+$/, "").trim();
    entries.push({ value: v, label: normalizeName(sameLine || prevLabel) });
    prevLabel = "";
  }
  if (!entries.length) return null;

  // Precio del artículo: el primer importe (sin explicación o «precio/artículo»).
  // Envío: el importe cuya explicación habla de envío o entrega.
  const isShipping = (e: { label: string }) => /envi|entrega|transport|correos|domicilio|punto/.test(e.label);
  const priceEntry = entries.find((e) => !isShipping(e));
  if (!priceEntry) return null;
  const price = priceEntry.value;
  const shippingEntries = entries.filter(isShipping);
  const shipping = shippingEntries.length ? shippingEntries[0].value : null;
  const amounts = entries.map((e) => e.value).concat(total !== null ? [total] : []);

  let doubt: string | null = null;
  if (entries.length - 1 - (shipping !== null ? 1 : 0) > 0 || shippingEntries.length > 1) {
    doubt = "El correo tiene más importes de los esperados.";
  } else if (total !== null && Math.abs(price + (shipping ?? 0) - total) > 0.01) {
    const eur = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;
    doubt = `Los importes no cuadran: artículo ${eur(price)} + envío ${eur(shipping ?? 0)} ≠ total ${eur(total)}.`;
  }
  if (!(price > 0)) return null;

  const dateLine = field(ls, /^fecha\s+de\s+compra\s*:?/i).value;
  const date = dateLine ? parseSpanishDate(dateLine) : null;
  const order = field(ls, new RegExp(String.raw`^(?:${N}de\s+)?(?:pedido|transacci[oó]n|compra)\s*(?:id|n[º°o])?\s*:`, "i")).value;

  return {
    account,
    account_norm: account ? normalizeName(account) : null,
    buyer,
    product,
    product_norm: normalizeName(product),
    price,
    shipping,
    total,
    amounts,
    sale_date: date ? isoDate(date) : null,
    order_id: order?.match(/[A-Za-z0-9-]{4,}/)?.[0] ?? null,
    doubt,
  };
}

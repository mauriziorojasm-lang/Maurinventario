/**
 * Registro de plataformas de venta y transportistas que Resellap conoce.
 *
 * Sirve para reconocerlos en los correos y etiquetas (alias), para
 * identificarlos visualmente (color y siglas) y para el enlace de
 * seguimiento en la web de cada transportista. Las listas de cada espacio
 * (Listas → Plataformas / Paqueterías) siguen siendo las que mandan: este
 * registro solo se usa para reconocer el nombre. Añadir uno nuevo es añadir
 * una entrada aquí (y, si se quiere, su logotipo en /public/logos/).
 *
 * Los colores son aproximaciones neutras para distinguirlos de un vistazo;
 * no se reproducen logotipos de terceros. Si tienes el logotipo oficial con
 * permiso de uso, guárdalo como /public/logos/<clave>.svg y se usará solo.
 */

export type BrandMark = {
  key: string;
  name: string;
  /** Siglas para el icono (2 letras como mucho). */
  short: string;
  /** Color de fondo y de texto del icono. */
  bg: string;
  fg: string;
  /** Formas de escribirlo que se reconocen en correos y etiquetas (ya normalizadas: minúsculas, sin acentos). */
  aliases: string[];
  /** ¿Hay logotipo propio en /public/logos/<key>.svg? */
  logo?: boolean;
};

export type CarrierMark = BrandMark & {
  /** Web de seguimiento con el código (null si no tiene página pública). */
  trackingUrl: ((code: string) => string) | null;
};

const enc = encodeURIComponent;

export const PLATFORMS: BrandMark[] = [
  { key: "vinted", name: "Vinted", short: "V", bg: "#09B1BA", fg: "#FFFFFF", aliases: ["vinted"] },
  { key: "wallapop", name: "Wallapop", short: "W", bg: "#13C1AC", fg: "#FFFFFF", aliases: ["wallapop"] },
  { key: "ebay", name: "eBay", short: "eB", bg: "#E53238", fg: "#FFFFFF", aliases: ["ebay"] },
  { key: "milanuncios", name: "Milanuncios", short: "M", bg: "#F2C200", fg: "#1D1D1B", aliases: ["milanuncios"] },
  { key: "facebook", name: "Facebook Marketplace", short: "f", bg: "#1877F2", fg: "#FFFFFF", aliases: ["facebook marketplace", "facebook", "marketplace"] },
  { key: "etsy", name: "Etsy", short: "E", bg: "#F1641E", fg: "#FFFFFF", aliases: ["etsy"] },
  { key: "todocoleccion", name: "todocoleccion", short: "tc", bg: "#3B5998", fg: "#FFFFFF", aliases: ["todocoleccion", "todo coleccion"] },
  { key: "depop", name: "Depop", short: "D", bg: "#FF2300", fg: "#FFFFFF", aliases: ["depop"] },
  { key: "vestiaire", name: "Vestiaire Collective", short: "VC", bg: "#1D1D1B", fg: "#FFFFFF", aliases: ["vestiaire collective", "vestiaire"] },
  { key: "persona", name: "En persona", short: "EP", bg: "#E9EDEB", fg: "#343C39", aliases: ["en persona", "mano", "en mano"] },
];

export const CARRIERS: CarrierMark[] = [
  {
    key: "correos",
    name: "Correos",
    short: "C",
    bg: "#FFCD00",
    fg: "#002F6C",
    aliases: ["correos"],
    trackingUrl: (c) => `https://www.correos.es/es/es/herramientas/localizador/envios/detalle?tracking-number=${enc(c)}`,
  },
  {
    key: "correos-express",
    name: "Correos Express",
    short: "CX",
    bg: "#E30613",
    fg: "#FFFFFF",
    aliases: ["correos express", "correosexpress"],
    trackingUrl: (c) => `https://s.correosexpress.com/SeguimientoSinCP/search?shippingNumber=${enc(c)}`,
  },
  { key: "dhl", name: "DHL", short: "DHL", bg: "#FFCC00", fg: "#D40511", aliases: ["dhl"], trackingUrl: (c) => `https://www.dhl.com/es-es/home/tracking.html?tracking-id=${enc(c)}` },
  { key: "inpost", name: "InPost", short: "IP", bg: "#FFC900", fg: "#1D1D1B", aliases: ["inpost", "in post"], trackingUrl: (c) => `https://inpost.es/seguimiento-de-envio/?number=${enc(c)}` },
  { key: "gls", name: "GLS", short: "GLS", bg: "#061AB1", fg: "#FFD100", aliases: ["gls"], trackingUrl: (c) => `https://gls-group.com/ES/es/seguimiento-envio/?match=${enc(c)}` },
  { key: "seur", name: "SEUR", short: "S", bg: "#004899", fg: "#FFFFFF", aliases: ["seur"], trackingUrl: (c) => `https://www.seur.com/livetracking/?segOnlineIdentificador=${enc(c)}` },
  { key: "vinted-go", name: "Vinted Go", short: "VG", bg: "#007782", fg: "#FFFFFF", aliases: ["vinted go", "vintedgo"], trackingUrl: null },
  { key: "mrw", name: "MRW", short: "MRW", bg: "#E2001A", fg: "#FFFFFF", aliases: ["mrw"], trackingUrl: (c) => `https://www.mrw.es/seguimiento_envios/MRW_resultados_consultas.asp?modo=nacional&envio=${enc(c)}` },
  { key: "ctt", name: "CTT Express", short: "CTT", bg: "#D2001E", fg: "#FFFFFF", aliases: ["ctt express", "ctt", "tourline"], trackingUrl: (c) => `https://www.cttexpress.com/localizador-de-envios/?sc=${enc(c)}` },
  { key: "nacex", name: "NACEX", short: "NX", bg: "#F39200", fg: "#FFFFFF", aliases: ["nacex"], trackingUrl: null },
  { key: "ups", name: "UPS", short: "UPS", bg: "#351C15", fg: "#FFB500", aliases: ["ups"], trackingUrl: (c) => `https://www.ups.com/track?loc=es_ES&tracknum=${enc(c)}` },
  { key: "fedex", name: "FedEx", short: "FX", bg: "#4D148C", fg: "#FF6600", aliases: ["fedex", "fed ex"], trackingUrl: (c) => `https://www.fedex.com/fedextrack/?trknbr=${enc(c)}` },
  { key: "paack", name: "Paack", short: "PK", bg: "#1D1D1B", fg: "#FFFFFF", aliases: ["paack"], trackingUrl: null },
  { key: "sending", name: "Sending", short: "SD", bg: "#E5231B", fg: "#FFFFFF", aliases: ["sending"], trackingUrl: null },
  { key: "mondial-relay", name: "Mondial Relay", short: "MR", bg: "#96154A", fg: "#FFFFFF", aliases: ["mondial relay"], trackingUrl: (c) => `https://www.mondialrelay.es/seguimiento/?numeroExpedition=${enc(c)}` },
  { key: "packeta", name: "Packeta", short: "PA", bg: "#BA1B02", fg: "#FFFFFF", aliases: ["packeta", "zasilkovna"], trackingUrl: (c) => `https://tracking.packeta.com/es/?id=${enc(c)}` },
];

export function normalizeKey(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findIn<T extends BrandMark>(list: T[], name: string | null | undefined): T | null {
  if (!name) return null;
  const n = normalizeKey(name);
  return list.find((b) => b.aliases.includes(n) || normalizeKey(b.name) === n) ?? null;
}

export const platformMark = (name: string | null | undefined) => findIn(PLATFORMS, name);
export const carrierMark = (name: string | null | undefined) => findIn(CARRIERS, name);

/** Icono genérico (siglas) para un nombre que no está en el registro. */
export function genericMark(name: string): BrandMark {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const short = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
  return { key: normalizeKey(name).replace(/ /g, "-"), name, short, bg: "#E9EDEB", fg: "#343C39", aliases: [] };
}

/**
 * Busca transportistas mencionados en un texto (correo o etiqueta). Si se
 * nombra uno que contiene a otro («Correos Express» y «Correos»), vale el
 * más largo. Devuelve el nombre canónico si hay uno solo claro.
 */
export function detectCarrier(text: string | null | undefined): { name: string; key: string } | null {
  if (!text) return null;
  const t = ` ${normalizeKey(text)} `;
  const hits: { c: CarrierMark; alias: string }[] = [];
  for (const c of CARRIERS) {
    for (const a of c.aliases) {
      if (t.includes(` ${a} `)) {
        hits.push({ c, alias: a });
        break;
      }
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => b.alias.length - a.alias.length);
  const best = hits[0];
  const others = hits.slice(1).filter((h) => !best.alias.includes(h.alias) && h.c.key !== best.c.key);
  // «vinted go» contiene «vinted»: no cuenta como otro transportista
  if (others.length) return null;
  return { name: best.c.name, key: best.c.key };
}

export function trackingLink(carrierName: string | null | undefined, code: string | null | undefined): string | null {
  if (!code) return null;
  const c = carrierMark(carrierName);
  return c?.trackingUrl ? c.trackingUrl(code) : null;
}

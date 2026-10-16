/**
 * Identificación del producto de una venta detectada. Funciones puras
 * (sin red ni base de datos) para poder probarlas con ejemplos.
 *
 * Cada producto del inventario recibe una puntuación de 0 a 1 según:
 *  · el título de tu anuncio en la plataforma (el correo trae ese mismo título),
 *  · el nombre del producto y la variante, la referencia (SKU) y los nombres
 *    recordados («alias»),
 *  · los números de modelo («42083», «9013»), que pesan mucho,
 *  · el precio (parecido al del anuncio o al habitual),
 *  · el stock (sin stock es menos probable).
 * Se elige solo cuando hay un claro ganador; si hay duda real, se ofrecen
 * las mejores alternativas con el motivo.
 */
import { normalizeName } from "./parse";

export type MatchListing = { platform: string; title: string; price: number | null; active: boolean };
export type MatchVariant = {
  id: string;
  label: string;
  productName: string;
  variantName: string;
  single: boolean;
  skus: string[];
  normalPrice: number | null;
  stock: number;
  listings: MatchListing[];
  aliases: string[];
};
export type MatchCandidate = { variant_id: string; label: string; score: number; reasons: string[]; stock: number };
export type MatchResult = {
  variantId: string | null;
  confidence: number;
  reasons: string[];
  /** Motivo de la duda (si no se ha elegido solo). */
  doubt: string | null;
  candidates: MatchCandidate[];
};

/** Palabras que no ayudan a distinguir productos. */
const STOP = new Set(
  "de del la el los las un una unos unas y o para con sin en por al a su sus tu mi talla tallas nuevo nueva nuevos nuevas usado usada usados usadas como estrenar perfecto perfecta estado buen muy original originales unisex hombre mujer nino nina pack lote color".split(
    " ",
  ),
);
/** Palabras genéricas que valen poco (el tipo de producto, no el modelo). */
const WEAK = new Set("gafa sol lente zapatilla camiseta pantalon chaqueta sudadera bolso reloj juego set figura caja libro".split(" "));

/** Plural y singular cuentan igual («marrones» = «marron», «gafas» = «gafa»). */
const stem = (t: string) => (/\d/.test(t) ? t : t.length > 5 && /[^aeiou]es$/.test(t) ? t.slice(0, -2) : t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);
const tokens = (s: string) =>
  normalizeName(s)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
const isModel = (t: string) => /\d/.test(t) && t.length >= 3;
const weight = (t: string) => (isModel(t) ? 3 : WEAK.has(t) ? 0.4 : 1);

function overlap(a: string[], b: string[]): { score: number; models: string[]; missingModel: boolean } {
  if (!a.length || !b.length) return { score: 0, models: [], missingModel: false };
  const A = new Set(a);
  const B = new Set(b);
  let common = 0;
  let wa = 0;
  let wb = 0;
  const models: string[] = [];
  for (const t of A) {
    wa += weight(t);
    if (B.has(t)) {
      common += weight(t);
      if (isModel(t)) models.push(t);
    }
  }
  for (const t of B) wb += weight(t);
  // Cuánto del producto aparece en el correo (pesa más) y cuánto del correo explica el producto
  const coverB = common / wb;
  const coverA = common / wa;
  const missingModel = [...A].some((t) => isModel(t) && t.length >= 4 && !B.has(t)) && [...B].some((t) => isModel(t) && t.length >= 4);
  return { score: 0.75 * coverB + 0.25 * coverA, models, missingModel };
}

const near = (a: number, b: number, pct: number) => Math.abs(a - b) <= Math.max(1, b * pct);
const eur = (v: number) => `${v.toFixed(2).replace(".", ",")} €`;

export function scoreVariant(email: { name: string; price: number | null; platform: string | null }, v: MatchVariant): MatchCandidate {
  const norm = normalizeName(email.name);
  const reasons: string[] = [];
  let score = 0;

  const exactKeys = [v.single ? v.productName : "", `${v.productName} ${v.variantName}`, ...v.skus].filter(Boolean).map(normalizeName);
  const sameListing = v.listings.find((l) => normalizeName(l.title) === norm && (!email.platform || l.platform === email.platform));
  const anyListing = v.listings.find((l) => normalizeName(l.title) === norm);
  if (v.aliases.includes(norm)) {
    score = 1;
    reasons.push("Ya lo elegiste antes para este mismo título");
  } else if (sameListing) {
    score = 0.98;
    reasons.push(`Mismo título que tu anuncio de ${email.platform === "wallapop" ? "Wallapop" : "Vinted"}`);
  } else if (exactKeys.includes(norm)) {
    score = 0.97;
    reasons.push("Mismo nombre que en tu inventario");
  } else if (anyListing) {
    score = 0.93;
    reasons.push("Mismo título que uno de tus anuncios");
  } else {
    const et = tokens(email.name);
    const candidates = [
      [...tokens(v.productName), ...(v.single ? [] : tokens(v.variantName))],
      ...v.listings.map((l) => tokens(l.title)),
    ];
    let best = { score: 0, models: [] as string[], missingModel: false };
    for (const c of candidates) {
      const o = overlap(et, c);
      if (o.score > best.score) best = o;
    }
    score = best.score * 0.85;
    if (best.models.length) {
      score += 0.12;
      reasons.push(`Mismo modelo (${best.models.join(", ")})`);
    }
    if (best.missingModel) {
      score -= 0.3;
      reasons.push("El número de modelo no coincide");
    }
    if (best.score >= 0.8) reasons.push("Nombre casi igual");
    else if (best.score >= 0.5) reasons.push("Nombre parecido");
  }

  // Precio: el del anuncio en esa plataforma o el habitual
  const ref = (email.platform && v.listings.find((l) => l.platform === email.platform && l.price)?.price) || v.normalPrice;
  if (email.price && ref) {
    if (near(email.price, ref, 0.12)) {
      score += 0.06;
      reasons.push(`Precio parecido al habitual (${eur(ref)})`);
    } else if (!near(email.price, ref, 0.5)) {
      score -= 0.08;
      reasons.push(`Precio distinto al habitual (${eur(ref)})`);
    }
  }
  if (v.stock <= 0) {
    score -= 0.15;
    reasons.push("Sin stock");
  } else {
    reasons.push(v.stock === 1 ? "1 en stock" : `${v.stock} en stock`);
  }
  return { variant_id: v.id, label: v.label, score: Math.max(0, Math.min(1, Math.round(score * 100) / 100)), reasons, stock: v.stock };
}

/** Umbrales: elegir solo con ≥ 0,75 de puntuación y 0,15 de ventaja sobre el segundo. */
export const AUTO_SCORE = 0.75;
export const AUTO_MARGIN = 0.15;
const SUGGEST_SCORE = 0.3;

export function matchProduct(email: { name: string; price: number | null; platform: string | null }, variants: MatchVariant[]): MatchResult {
  if (!normalizeName(email.name)) {
    return { variantId: null, confidence: 0, reasons: [], doubt: "El correo no trae el nombre del artículo.", candidates: [] };
  }
  const scored = variants
    .map((v) => scoreVariant(email, v))
    .filter((c) => c.score >= SUGGEST_SCORE)
    .sort((a, b) => b.score - a.score || b.stock - a.stock);
  const [top, second] = scored;
  if (!top) {
    return {
      variantId: null,
      confidence: 0,
      reasons: [],
      doubt: `No hay ningún producto parecido a «${email.name.trim()}» en tu inventario. Elígelo o créalo.`,
      candidates: [],
    };
  }
  const margin = top.score - (second?.score ?? 0);
  const clear = top.score >= AUTO_SCORE && margin >= AUTO_MARGIN && top.stock > 0;
  if (clear) return { variantId: top.variant_id, confidence: top.score, reasons: top.reasons, doubt: null, candidates: scored.slice(1, 5) };
  let doubt: string;
  if (top.score >= AUTO_SCORE && second && margin < AUTO_MARGIN) {
    doubt = `«${email.name.trim()}» se parece mucho a ${scored.filter((c) => top.score - c.score < AUTO_MARGIN).length} productos. Elige cuál es.`;
  } else if (top.score >= AUTO_SCORE && top.stock <= 0) {
    doubt = `El producto más parecido (${top.label}) no tiene stock. Revisa cuál es.`;
  } else {
    doubt = `No hay un producto claramente igual a «${email.name.trim()}». Te proponemos los más parecidos.`;
  }
  return { variantId: null, confidence: top.score, reasons: top.reasons, doubt, candidates: scored.slice(0, 5) };
}

// ---------------------------------------------------------------------
// ¿Esta venta ya estaba apuntada? Puntuación de las ventas existentes.
// ---------------------------------------------------------------------
export type ExistingSale = {
  id: string;
  date: string; // AAAA-MM-DD
  price: number;
  buyer: string | null;
  platform: string | null;
  variantIds: string[];
  productNames: string[];
  reference: string | null;
};
export type SaleMatch = { id: string; score: number; reasons: string[] };

export function scoreExistingSale(
  email: { date: string; price: number | null; buyer: string | null; platform: string | null; variantId: string | null; name: string; reference: string | null },
  s: ExistingSale,
): SaleMatch {
  const reasons: string[] = [];
  let score = 0;
  if (email.reference && s.reference && email.reference === s.reference) {
    return { id: s.id, score: 1, reasons: ["Mismo nº de transacción"] };
  }
  if (email.variantId && s.variantIds.includes(email.variantId)) {
    score += 0.4;
    reasons.push("Mismo producto");
  } else {
    const o = Math.max(0, ...s.productNames.map((n) => overlap(tokens(email.name), tokens(n)).score));
    if (o >= 0.6) {
      score += 0.3 * o;
      reasons.push("Producto parecido");
    }
  }
  if (email.buyer && s.buyer && normalizeName(email.buyer) === normalizeName(s.buyer)) {
    score += 0.3;
    reasons.push("Mismo comprador");
  }
  if (email.price !== null && Math.abs(email.price - s.price) < 0.01) {
    score += 0.15;
    reasons.push("Mismo precio");
  } else if (email.price !== null && near(email.price, s.price, 0.1)) {
    score += 0.07;
    reasons.push("Precio parecido");
  }
  const days = Math.abs(Date.parse(email.date) - Date.parse(s.date)) / 86400_000;
  if (days <= 1) {
    score += 0.15;
    reasons.push(days === 0 ? "Mismo día" : "Un día de diferencia");
  } else if (days <= 3) {
    score += 0.08;
    reasons.push(`${Math.round(days)} días de diferencia`);
  } else if (days > 10) {
    score -= 0.1;
  }
  return { id: s.id, score: Math.max(0, Math.min(1, Math.round(score * 100) / 100)), reasons };
}

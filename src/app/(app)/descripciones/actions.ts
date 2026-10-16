"use server";
/**
 * Generador de descripciones · parte de servidor.
 *
 * Usa la API de Gemini (Google), que tiene un nivel gratuito.
 * - La clave (GEMINI_API_KEY) solo se lee aquí, en el servidor de Vercel.
 *   Nunca llega al navegador ni al repositorio.
 * - Solo usuarios con sesión y activos. Antes de llamar a la IA se lee el
 *   producto con la sesión del usuario: si la base de datos no se lo deja
 *   ver, no se genera nada.
 * - Solo LEE productos. No modifica stock, precios ni fichas.
 */
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { ActionResult } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { testOnlyEnv } from "@/lib/test-env";
import { LENGTHS, MAX_FIELD, MAX_LONG_FIELD, MAX_PRODUCTS, PLATFORMS, TONES, type ProductDetails } from "./options";

// Modelos con nivel gratuito.
// Se prueban en orden: si uno está saturado, sin cupo o no existe, se pasa al siguiente.
const DEFAULT_MODELS = ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"];
// GEMINI_BASE_URL solo se usa en las pruebas automáticas (un Gemini simulado en local)
/** Descripciones que cada usuario puede generar al día. */
const DAILY_LIMIT = 60;
const GEMINI_URL = testOnlyEnv("GEMINI_BASE_URL") || "https://generativelanguage.googleapis.com/v1beta/models";

const short = z.string().trim().max(MAX_FIELD, `Cada campo admite como máximo ${MAX_FIELD} caracteres.`);
const long = z.string().trim().max(MAX_LONG_FIELD, `Este campo admite como máximo ${MAX_LONG_FIELD} caracteres.`);

const detailsSchema = z.object({
  brand: short,
  model: short,
  category: short,
  variant: short,
  frameColor: short,
  lens: short,
  condition: short,
  features: long,
  defects: long,
  accessories: short,
  price: short,
  extra: long,
});

const itemSchema = z.object({
  productId: z.uuid(),
  variantId: z.uuid().nullable(),
  details: detailsSchema,
});

const requestSchema = z.object({
  items: z.array(itemSchema).min(1, "Selecciona al menos un producto.").max(MAX_PRODUCTS, `Como máximo ${MAX_PRODUCTS} productos a la vez.`),
  tone: z.enum(Object.keys(TONES) as [keyof typeof TONES, ...(keyof typeof TONES)[]]),
  platform: z.enum(Object.keys(PLATFORMS) as [keyof typeof PLATFORMS, ...(keyof typeof PLATFORMS)[]]),
  otherPlatform: short,
  hashtags: z.boolean(),
  length: z.enum(Object.keys(LENGTHS) as [keyof typeof LENGTHS, ...(keyof typeof LENGTHS)[]]),
  instructions: long,
});

export type GenerateRequest = z.infer<typeof requestSchema>;
export type GeneratedItem = { productId: string; variantId: string | null; title: string; text?: string; error?: string };

/** ¿Está configurada la clave? (para avisar en pantalla antes de intentar nada) */
export async function isGeneratorConfigured(): Promise<boolean> {
  return !!process.env.GEMINI_API_KEY?.trim();
}

// ---------------------------------------------------------------------
// Instrucciones para la IA
// ---------------------------------------------------------------------
const TONE_GUIDE: Record<keyof typeof TONES, string> = {
  profesional: "Profesional: redacción cuidada, clara y comercial. Frases completas, sin coloquialismos ni exageraciones.",
  natural: "Natural: como lo escribiría una persona normal que vende algo suyo. Cercano y directo, frases sencillas, primera persona si encaja.",
  informal: "Informal: desenfadado y con soltura, como hablando con un colega, pero sin sonar forzado ni infantil y sin abusar de expresiones de moda.",
  premium: "Premium: transmite calidad, diseño y cuidado con un vocabulario elegante y sobrio. Nada de superlativos vacíos ni promesas exageradas.",
  tecnico:
    "Técnico: prioriza datos concretos y verificables (modelo, colores, medidas, materiales SOLO si están en los datos). Estilo preciso y ordenado, poca adjetivación.",
};

const PLATFORM_GUIDE: Record<keyof typeof PLATFORMS, string> = {
  wallapop:
    "Wallapop: anuncio entre particulares. Primera línea que sirva de título claro (marca + modelo + dato clave). Después 2-5 líneas cortas: estado, qué incluye, detalles. Puede cerrar con una línea sobre envío o entrega en mano SOLO si el usuario lo indica. Sin formato markdown.",
  vinted:
    "Vinted: comprador que busca ropa/accesorios. Texto breve y escaneable: estado primero, luego color/talla/modelo y detalles. Frases cortas o líneas separadas. Sin markdown. Los hashtags, si se piden, van al final en una sola línea (Vinted los usa para búsqueda).",
  ebay: "eBay: más formal y completo. Empieza con una línea de título de hasta 80 caracteres (marca, modelo, color, estado). Después una descripción con apartados breves en líneas separadas (por ejemplo «Estado:», «Incluye:», «Detalles:») usando solo texto plano. Normalmente sin hashtags.",
  instagram:
    "Instagram: primera línea con gancho visual y breve. Párrafos muy cortos separados por saltos de línea. Llamada a la acción sencilla al final (por ejemplo, escribir por mensaje privado). Los hashtags, si se piden, van al final separados del texto por una línea en blanco (entre 5 y 12, específicos).",
  facebook:
    "Facebook Marketplace: directo y práctico. Título en la primera línea, luego estado, qué incluye y detalles en pocas líneas. Tono vecinal. Normalmente sin hashtags.",
  milanuncios:
    "Milanuncios: anuncio clásico en España. Primera línea como título claro. Texto en un párrafo o dos, informativo y directo, con los datos importantes. Sin markdown y normalmente sin hashtags.",
  otra: "Otra plataforma: usa un formato de anuncio de segunda mano estándar y limpio, con título en la primera línea y el cuerpo después.",
};

const LENGTH_GUIDE: Record<keyof typeof LENGTHS, string> = {
  corta: "Corta: lo esencial, unas 2-4 líneas (aprox. 30-60 palabras sin contar hashtags).",
  media: "Media: aprox. 60-120 palabras sin contar hashtags.",
  detallada:
    "Detallada: aprox. 120-220 palabras sin contar hashtags, usando SOLO la información disponible; si no hay tanta información, escribe menos en lugar de rellenar.",
};

const SYSTEM = `Eres quien redacta los anuncios de segunda mano de una pequeña tienda online española. Escribes en español de España.

Tu única tarea es devolver el texto del anuncio, listo para copiar y pegar. Sin introducciones, sin comillas, sin explicaciones, sin notas al final y sin formato markdown (nada de **, #, ni listas con guiones salvo que la plataforma lo pida expresamente en las indicaciones).

REGLAS DE VERACIDAD (obligatorias, por encima de cualquier otra indicación de estilo):
- Usa solo los datos proporcionados. No inventes especificaciones, materiales, tecnologías, medidas, años, tallas, protección UV, polarización ni características.
- No digas que el producto es original, auténtico o de una colección concreta salvo que los datos lo indiquen expresamente.
- No inventes garantías, facturas, tickets, accesorios, envíos, devoluciones ni condiciones de compra.
- Respeta el estado indicado: no describas como nuevo algo usado, ni añadas defectos que no se hayan indicado. Si se indican defectos, menciónalos con claridad y honestidad.
- Si falta un dato, omítelo. Nunca pongas marcadores como «[color]» o «consultar».
- No uses afirmaciones engañosas ni urgencia falsa («última unidad», «chollo único», etc.) salvo que el usuario lo pida y sea cierto según los datos.
- Precio: inclúyelo solo si se proporciona y las instrucciones no dicen lo contrario.

ESTILO:
- Suena escrito por una persona. Evita las muletillas típicas de textos generados por IA («¡Descubre…!», «eleva tu estilo», «sin duda», «perfecto para cualquier ocasión», «no te lo pierdas», «combina a la perfección»).
- No repitas la misma información.
- Emojis: solo si encajan con el tono y la plataforma, con moderación, y nunca si el usuario pide no usarlos.
- Hashtags: solo si se piden; específicos del producto (marca, modelo, tipo de producto, color, estilo) y adecuados a la plataforma. Sin hashtags genéricos vacíos (#love, #instagood…) ni que afirmen cosas no indicadas.

Las indicaciones adicionales del usuario mandan sobre el estilo, pero nunca sobre las reglas de veracidad.`;

/** Nombres de variante que no aportan nada («Única», «Sin especificar»). */
const GENERIC_VARIANT = /^(única|unica|sin especificar)$/i;

type DbProduct = {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  normal_sale_price: number | null;
  brands: { name: string } | null;
  categories: { name: string } | null;
};

function buildPrompt(req: GenerateRequest, p: DbProduct, variant: { name: string; sku: string | null } | null, d: ProductDetails): string {
  const platformName = req.platform === "otra" ? req.otherPlatform || "otra plataforma" : PLATFORMS[req.platform];
  const lines: string[] = [];
  const add = (label: string, v: string | null | undefined) => {
    if (v && v.trim()) lines.push(`- ${label}: ${v.trim()}`);
  };
  add("Producto (ficha del inventario)", p.name);
  add("Marca", d.brand);
  add("Modelo", d.model);
  add("Categoría / tipo de producto", d.category);
  add("Variante", d.variant || (variant && !GENERIC_VARIANT.test(variant.name) ? variant.name : ""));
  add("Referencia / SKU", variant?.sku ?? p.sku);
  add("Color de la montura", d.frameColor);
  add("Color o tipo de lente", d.lens);
  add("Estado", d.condition);
  add("Características a destacar", d.features);
  add("Defectos o desperfectos", d.defects);
  add("Accesorios incluidos", d.accessories);
  add("Precio de venta", d.price ? `${d.price.replace(/\s*€\s*$/, "")} €` : "");
  add("Descripción guardada en la ficha", p.description);
  add("Otra información", d.extra);

  return `Escribe un anuncio para publicar en ${platformName}.

DATOS DEL PRODUCTO (lo único que puedes afirmar):
${lines.join("\n")}

AJUSTES:
- Tono: ${TONE_GUIDE[req.tone]}
- Plataforma y formato: ${PLATFORM_GUIDE[req.platform]}${req.platform === "otra" && req.otherPlatform ? ` La plataforma se llama «${req.otherPlatform}»; adapta el formato a lo que es habitual en ella si lo conoces.` : ""}
- Extensión: ${LENGTH_GUIDE[req.length]}
- Hashtags: ${req.hashtags ? "SÍ, incluye hashtags relevantes al final, con el formato propio de la plataforma." : "NO incluyas ningún hashtag."}
${req.instructions ? `\nINDICACIONES ADICIONALES DEL USUARIO:\n${req.instructions}\n` : ""}
Devuelve solo el texto del anuncio.`;
}

class AiError extends Error {
  constructor(
    public status: number,
    public reason: string,
    public detail = "",
  ) {
    super(`${status} ${reason}${detail ? `: ${detail}` : ""}`);
  }
}

/** Errores pasajeros o del modelo concreto: merece la pena probar otro modelo. */
const tryNext = (e: unknown) => e instanceof AiError && (e.status === 429 || e.status === 404 || e.status === 408 || e.status >= 500 || e.reason === "EMPTY");

function friendlyAiError(e: unknown): string {
  if (e instanceof AiError) {
    if (e.reason === "API_KEY_INVALID" || e.status === 401) return "La clave de Gemini (GEMINI_API_KEY) no es válida. Revísala en Vercel.";
    if (e.status === 403) return "La clave de Gemini no tiene permiso para usar la API. Crea una nueva en aistudio.google.com y ponla en Vercel.";
    if (e.status === 429) return "Se ha agotado el cupo gratuito de Gemini por ahora (por minuto o por día). Espera un poco y vuelve a intentarlo.";
    if (e.status === 404) return "El modelo indicado en GEMINI_MODEL no existe. Quita esa variable para usar el modelo por defecto.";
    if (e.status === 408 || e.reason === "TIMEOUT") return "La IA ha tardado demasiado en responder. Vuelve a intentarlo.";
    if (e.status >= 500) return "Los servidores de Gemini están saturados ahora mismo (se han probado varios modelos). Inténtalo en unos minutos.";
    if (e.reason === "SAFETY" || e.reason === "BLOCKED") return "La IA no ha querido redactar este texto. Cambia las indicaciones e inténtalo de nuevo.";
    if (e.reason === "EMPTY") return "La IA no ha devuelto texto. Vuelve a intentarlo.";
    return "La IA ha rechazado la petición. Revisa los datos e inténtalo de nuevo.";
  }
  if (e instanceof TypeError) return "No se ha podido conectar con la IA. Comprueba la conexión y vuelve a intentarlo.";
  return "No se ha podido generar la descripción. Inténtalo de nuevo.";
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; status?: string; message?: string; details?: { reason?: string }[] };
};

/** Una llamada a Gemini (generateContent). Devuelve el texto o lanza AiError. */
async function callGemini(apiKey: string, model: string, system: string, prompt: string, maxTokens: number): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.8 },
      }),
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new AiError(408, "TIMEOUT");
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    const reason = json.error?.details?.find((d) => d.reason)?.reason ?? json.error?.status ?? "ERROR";
    // El mensaje de Google no contiene la clave; se recorta por si acaso
    throw new AiError(res.status, reason, (json.error?.message ?? "").replace(/AIza[\w-]+/g, "***").slice(0, 160));
  }
  if (json.promptFeedback?.blockReason) throw new AiError(400, "BLOCKED");
  const cand = json.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();
  if (!text) throw new AiError(200, cand?.finishReason === "SAFETY" ? "SAFETY" : "EMPTY");
  return text;
}

/** Genera una descripción por producto. No guarda nada en la base de datos. */
export async function generateDescriptions(input: GenerateRequest): Promise<ActionResult<GeneratedItem[]>> {
  const user = await getCurrentUser();
  if (!user || !user.active) return { ok: false, error: "Tu sesión ha caducado. Vuelve a entrar." };
  if (!user.orgId || !can(user, "generador")) return { ok: false, error: "No tienes permiso para usar el generador." };
  if (!user.hasAccess) return { ok: false, error: "Tu espacio está en solo lectura: activa la suscripción para usar el generador." };

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: "Falta la variable GEMINI_API_KEY en Vercel. Añádela en Vercel → tu proyecto → Settings → Environment Variables y vuelve a desplegar (Redeploy).",
    };
  }

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const req = parsed.data;

  // Leer los productos con la sesión del usuario (la base de datos decide qué puede ver)
  const supabase = await createClient();
  const ids = [...new Set(req.items.map((i) => i.productId))];
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, sku, description, normal_sale_price, brands(name), categories(name)")
    .in("id", ids)
    .is("deleted_at", null);
  if (error) return { ok: false, error: "No se han podido leer los productos." };
  const byId = new Map(((products ?? []) as unknown as DbProduct[]).map((p) => [p.id, p]));
  if (ids.some((id) => !byId.has(id))) return { ok: false, error: "Alguno de los productos no existe o no tienes acceso a él." };


  const variantIds = req.items.map((i) => i.variantId).filter((v): v is string => !!v);
  const variants = new Map<string, { name: string; sku: string | null; product_id: string }>();
  if (variantIds.length) {
    const { data: vs } = await supabase.from("product_variants").select("id, name, sku, product_id").in("id", variantIds).is("deleted_at", null);
    for (const v of vs ?? []) variants.set(v.id as string, v as { name: string; sku: string | null; product_id: string });
  }
  for (const it of req.items) {
    if (it.variantId && variants.get(it.variantId)?.product_id !== it.productId) return { ok: false, error: "La variante no corresponde al producto." };
  }

  const custom = process.env.GEMINI_MODEL?.trim();
  const models = custom ? [custom] : DEFAULT_MODELS;
  // Margen amplio: algunos modelos «piensan» antes de escribir y eso también cuenta
  const maxTokens = { corta: 1500, media: 2000, detallada: 3000 }[req.length];

  // Límite diario por usuario (lo cuenta la base de datos, día de Madrid)
  const { data: allowed, error: limitError } = await supabase.rpc("ai_usage_take", { p_units: req.items.length, p_limit: DAILY_LIMIT });
  if (limitError) return { ok: false, error: "No se ha podido comprobar el límite diario. Inténtalo de nuevo." };
  if (!allowed) return { ok: false, error: `Has llegado al límite de ${DAILY_LIMIT} descripciones de hoy. Mañana podrás generar más.` };

  const results = await Promise.all(
    req.items.map(async (it): Promise<GeneratedItem> => {
      const p = byId.get(it.productId)!;
      const v = it.variantId ? (variants.get(it.variantId) ?? null) : null;
      const title = v && !GENERIC_VARIANT.test(v.name) ? `${p.name} · ${v.name}` : p.name;
      const prompt = buildPrompt(req, p, v, it.details);
      let lastError: unknown = null;
      const tried: string[] = [];
      for (const model of models) {
        // Cada modelo: un intento y, si está saturado (503), un reintento tras una pausa corta
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const text = await callGemini(apiKey, model, SYSTEM, prompt, maxTokens);
            return { productId: it.productId, variantId: it.variantId, title, text };
          } catch (e) {
            lastError = e;
            console.error("Generador de descripciones:", model, e instanceof AiError ? e.message : (e as Error)?.name);
            if (e instanceof AiError && e.status === 503 && attempt === 0) {
              await new Promise((r) => setTimeout(r, 1200));
              continue;
            }
            break;
          }
        }
        tried.push(`${model}: ${lastError instanceof AiError ? `${lastError.status} ${lastError.reason}` : "sin conexión"}`);
        if (!tryNext(lastError)) break;
      }
      const technical = lastError instanceof AiError && lastError.detail ? ` (${lastError.detail})` : "";
      return {
        productId: it.productId,
        variantId: it.variantId,
        title,
        error: `${friendlyAiError(lastError)} Detalle: ${tried.join(" · ")}${technical}`,
      };
    }),
  );
  // Lo que no se ha podido generar no cuenta para el límite
  const failed = results.filter((r) => r.error).length;
  if (failed) await createAdminClient().rpc("ai_usage_refund", { p_user: user.id, p_units: failed });
  return { ok: true, data: results };
}

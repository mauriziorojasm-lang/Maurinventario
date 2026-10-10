"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { friendlyError, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { generateDescriptions } from "../descripciones/actions";

/**
 * Anuncio de cada producto en Vinted y Wallapop: borrador (título, texto,
 * precio), publicado o retirado. La app no publica en las plataformas (no
 * tienen una conexión abierta): esto sirve para prepararlo y llevar el control.
 */

export type ListingPlatform = "vinted" | "wallapop";
const platformEnum = z.enum(["vinted", "wallapop"]);

async function admin() {
  const u = await getCurrentUser();
  if (!u || !u.active || !can(u, "anuncios")) throw new Error("No tienes permisos para gestionar anuncios.");
  return u;
}

function refresh(productId: string) {
  revalidatePath(`/productos/${productId}`, "layout");
  revalidatePath("/anuncios");
  revalidatePath("/", "layout");
}

const draftSchema = z.object({
  productId: z.uuid(),
  platform: platformEnum,
  title: z.string().trim().max(200, "El título es demasiado largo."),
  description: z.string().trim().max(5000, "El texto es demasiado largo."),
  price: z.number().min(0).max(100000).nullable(),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((u) => u === "" || /^https?:\/\//i.test(u), "El enlace debe empezar por https://"),
});

export async function saveListing(input: z.input<typeof draftSchema>): Promise<ActionResult> {
  const user = await admin();
  const v = draftSchema.safeParse(input);
  if (!v.success) return { ok: false, error: v.error.issues[0]?.message ?? "Datos no válidos." };
  const d = v.data;
  const supabase = await createClient();
  const { error } = await supabase.from("listings").upsert(
    {
      product_id: d.productId,
      platform: d.platform,
      title: d.title || null,
      description: d.description || null,
      price: d.price,
      url: d.url || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,product_id,platform" },
  );
  if (error) return { ok: false, error: friendlyError(error) };
  refresh(d.productId);
  return { ok: true, message: "Guardado." };
}

export async function setListingStatus(productId: string, platform: ListingPlatform, status: "publicado" | "retirado" | "borrador"): Promise<ActionResult> {
  const user = await admin();
  const v = z.object({ productId: z.uuid(), platform: platformEnum, status: z.enum(["publicado", "retirado", "borrador"]) }).safeParse({ productId, platform, status });
  if (!v.success) return { ok: false, error: "Datos no válidos." };
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("listings").upsert(
    {
      product_id: productId,
      platform,
      status,
      ...(status === "publicado" ? { published_at: now, removed_at: null } : {}),
      ...(status === "retirado" ? { removed_at: now } : {}),
      updated_by: user.id,
      updated_at: now,
    },
    { onConflict: "organization_id,product_id,platform" },
  );
  if (error) return { ok: false, error: friendlyError(error) };
  refresh(productId);
  const name = platform === "vinted" ? "Vinted" : "Wallapop";
  return { ok: true, message: status === "publicado" ? `Marcado como publicado en ${name}.` : status === "retirado" ? `Marcado como retirado de ${name}.` : "Guardado." };
}

const genSchema = z.object({
  productId: z.uuid(),
  platform: platformEnum,
  tone: z.enum(["profesional", "natural", "informal", "premium", "tecnico"]),
  condition: z.string().trim().max(300),
  features: z.string().trim().max(800),
  defects: z.string().trim().max(800),
  price: z.string().trim().max(30),
  hashtags: z.boolean(),
});

/** Texto del anuncio con el generador de siempre (Gemini). */
export async function generateListingText(input: z.input<typeof genSchema>): Promise<ActionResult<{ title: string; text: string }>> {
  await admin();
  const v = genSchema.safeParse(input);
  if (!v.success) return { ok: false, error: "Datos no válidos." };
  const d = v.data;
  const supabase = await createClient();
  const { data: p } = await supabase.from("products").select("name, brands(name), categories(name)").eq("id", d.productId).maybeSingle();
  if (!p) return { ok: false, error: "El producto no existe." };
  const prod = p as unknown as { name: string; brands: { name: string } | null; categories: { name: string } | null };
  const r = await generateDescriptions({
    items: [
      {
        productId: d.productId,
        variantId: null,
        details: {
          brand: prod.brands?.name ?? "",
          model: "",
          category: prod.categories?.name ?? "",
          variant: "",
          frameColor: "",
          lens: "",
          condition: d.condition,
          features: d.features,
          defects: d.defects,
          accessories: "",
          price: d.price,
          extra: "",
        },
      },
    ],
    tone: d.tone,
    platform: d.platform,
    otherPlatform: "",
    hashtags: d.hashtags,
    length: "media",
    instructions:
      "En la PRIMERA línea escribe solo un título corto para el anuncio (máximo 60 caracteres, sin la palabra «Título», sin emojis ni hashtags). Deja una línea en blanco y después escribe la descripción.",
  });
  if (!r.ok) return r;
  const item = r.data?.[0];
  if (!item || item.error || !item.text) return { ok: false, error: item?.error ?? "No se ha podido generar el texto." };
  // Primera línea = título; el resto = descripción
  const lines = item.text.replace(/\r/g, "").split("\n");
  const first = (lines[0] ?? "").replace(/^t[ií]tulo\s*:\s*/i, "").trim();
  const rest = lines.slice(1).join("\n").trim();
  if (first && first.length <= 80 && rest) return { ok: true, data: { title: first, text: rest } };
  return { ok: true, data: { title: prod.name, text: item.text.trim() } };
}

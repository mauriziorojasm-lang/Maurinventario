import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin";
import { decryptSecret } from "./secret";
import { Gmail, GmailAuthError, pdfAttachments, refreshAccessToken, validatePdf, type MailMessage } from "./gmail";
import { classify, normalizeName, parseVintedLabel, parseVintedSale, parseWallapopSale, type EmailKind } from "./parse";

/**
 * Sincronización con Gmail: lee los correos nuevos, los guarda (sin el
 * cuerpo) y crea las ventas o añade las etiquetas. Se puede ejecutar
 * cuantas veces haga falta: nada se duplica, porque cada correo de Gmail
 * tiene un identificador único y las funciones de la base de datos
 * comprueban si ya está hecho.
 */

type Admin = SupabaseClient;

export interface SyncSummary {
  trigger: "auto" | "manual";
  started_at: string;
  finished_at?: string;
  read: number;
  new_emails: number;
  sales: number;
  detected: number;
  labels: number;
  review: number;
  waiting: number;
  errors: number;
  ignored: number;
  error?: string;
  skipped?: string;
}

const MAX_ATTEMPTS = 3;
const WAIT_LABEL_DAYS = 7;
const TIME_BUDGET_MS = 45_000;
const SEARCH = "{from:vinted from:wallapop subject:vinted subject:wallapop vinted wallapop}";

interface Integration {
  email: string | null;
  refresh_token_enc: string | null;
  status: string;
  connected_at: string | null;
  last_success_at: string | null;
}

interface EmailRow {
  id: string;
  gmail_message_id: string;
  received_at: string;
  platform: "vinted" | "wallapop" | null;
  kind: EmailKind;
  status: string;
  parsed: Record<string, unknown>;
  attempts: number;
  sale_id: string | null;
}

// ---------------------------------------------------------------------
// Sincronización completa
// ---------------------------------------------------------------------

/**
 * Revisa el correo. Con una organización, solo la suya (botones de la app).
 * Sin ella (aviso automático), recorre todas las organizaciones conectadas
 * mientras quede tiempo. Cada consulta va filtrada por organización: este
 * proceso usa la clave del servidor, que no pasa por las reglas de acceso.
 */
export async function runSync(trigger: "auto" | "manual", orgId?: string): Promise<SyncSummary> {
  const db = createAdminClient();
  const deadline = Date.now() + TIME_BUDGET_MS;
  if (orgId) return syncOrg(db, orgId, trigger, deadline);
  const total = emptySummary(trigger);
  const { data: orgs } = await db
    .from("email_integration")
    .select("organization_id")
    .not("refresh_token_enc", "is", null)
    .neq("status", "error_autorizacion")
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(200);
  for (const o of orgs ?? []) {
    if (Date.now() > deadline - 5_000) break;
    const s = await syncOrg(db, o.organization_id as string, trigger, deadline);
    for (const k of ["read", "new_emails", "sales", "detected", "labels", "review", "waiting", "errors", "ignored"] as const) total[k] += s[k];
    if (s.error) total.errors++;
  }
  total.finished_at = new Date().toISOString();
  return total;
}

function emptySummary(trigger: "auto" | "manual"): SyncSummary {
  return {
    trigger,
    started_at: new Date().toISOString(),
    read: 0,
    new_emails: 0,
    sales: 0,
    detected: 0,
    labels: 0,
    review: 0,
    waiting: 0,
    errors: 0,
    ignored: 0,
  };
}

async function syncOrg(db: Admin, org: string, trigger: "auto" | "manual", deadline: number): Promise<SyncSummary> {
  const summary = emptySummary(trigger);
  const { data: integ } = await db
    .from("email_integration")
    .select("email, refresh_token_enc, status, connected_at, last_success_at")
    .eq("organization_id", org)
    .maybeSingle<Integration>();
  if (!integ?.refresh_token_enc) return { ...summary, skipped: "Gmail no está conectado." };

  const { data: locked } = await db.rpc("email_sync_try_lock", { p_org: org, p_seconds: 120 });
  if (!locked) return { ...summary, skipped: "Ya hay una revisión en marcha." };

  let gmail: Gmail | null = null;
  try {
    let refresh: string;
    try {
      refresh = decryptSecret(integ.refresh_token_enc);
    } catch {
      throw new GmailAuthError("No se puede leer el permiso guardado. Vuelve a conectar Gmail.");
    }
    gmail = new Gmail(await refreshAccessToken(refresh));

    // 1) Correos nuevos desde la conexión (con 3 días de margen sobre la última revisión correcta)
    const since = Math.max(
      Date.parse(integ.connected_at ?? summary.started_at),
      integ.last_success_at ? Date.parse(integ.last_success_at) - 3 * 86400_000 : 0,
    );
    const listed = await gmail.list(`${SEARCH} after:${Math.floor(since / 1000) - 60}`);
    summary.read = listed.length;
    const known = new Set<string>();
    for (let i = 0; i < listed.length; i += 200) {
      const ids = listed.slice(i, i + 200).map((m) => m.id);
      const { data } = await db.from("email_messages").select("gmail_message_id").eq("organization_id", org).in("gmail_message_id", ids);
      for (const r of data ?? []) known.add(r.gmail_message_id);
    }
    const connectedAt = Date.parse(integ.connected_at ?? summary.started_at);
    for (const m of listed.reverse()) {
      if (known.has(m.id)) continue;
      if (Date.now() > deadline) break;
      const mail = await gmail.message(m.id);
      // Solo correos llegados después de conectar Gmail: las ventas anteriores ya están en la app
      if (mail.receivedAt.getTime() < connectedAt - 60_000) continue;
      const res = await storeEmail(db, org, mail);
      if (res === "new") summary.new_emails++;
      if (res === "ignored") summary.ignored++;
    }

    // 2) Procesar lo pendiente, del más antiguo al más nuevo
    await processQueue(db, org, gmail, summary, deadline);

    summary.finished_at = new Date().toISOString();
    await db
      .from("email_integration")
      .update({
        status: "conectado",
        last_error: null,
        last_sync_at: summary.finished_at,
        last_success_at: summary.finished_at,
        last_summary: summary,
        updated_at: summary.finished_at,
      })
      .eq("organization_id", org);
    return summary;
  } catch (e) {
    const auth = e instanceof GmailAuthError;
    summary.error = e instanceof Error ? e.message : "Error desconocido";
    summary.finished_at = new Date().toISOString();
    await db
      .from("email_integration")
      .update({
        status: auth ? "error_autorizacion" : "error",
        last_error: summary.error,
        last_sync_at: summary.finished_at,
        last_summary: summary,
        updated_at: summary.finished_at,
      })
      .eq("organization_id", org);
    return summary;
  } finally {
    await db.rpc("email_sync_unlock", { p_org: org });
  }
}

/** Guarda un correo nuevo. Del cuerpo solo se guardan los datos que hacen falta. */
async function storeEmail(db: Admin, org: string, mail: MailMessage): Promise<"new" | "ignored" | "dup"> {
  const pdfs = pdfAttachments(mail);
  const { kind, platform } = classify({ from: mail.from, subject: mail.subject, text: mail.text, pdfNames: pdfs.map((p) => p.filename) });
  const base = {
    organization_id: org,
    gmail_message_id: mail.id,
    gmail_thread_id: mail.threadId,
    received_at: mail.receivedAt.toISOString(),
    platform,
    kind,
  };
  let row: Record<string, unknown>;
  if (kind === "otro") {
    // Correo ajeno: ni remitente ni asunto (pueden ser datos personales)
    row = { ...base, status: "ignorado", review_reason: "No es un correo de venta de Vinted ni de Wallapop." };
  } else if (kind === "wallapop_aviso") {
    row = { ...base, from_address: senderAddress(mail.from), subject: mail.subject.slice(0, 200), status: "ignorado", review_reason: "Primer aviso de Wallapop (sin importe): no crea venta." };
  } else {
    const parsed = parseFor(kind, mail.text);
    const extra = kind === "vinted_etiqueta" ? { pdf: pdfs[0] ? { filename: pdfs[0].filename, size: pdfs[0].size } : null } : {};
    row = {
      ...base,
      from_address: senderAddress(mail.from),
      subject: mail.subject.slice(0, 200),
      parsed: parsed ? { ...parsed, ...extra } : extra,
      status: parsed ? "pendiente" : "revision",
      review_reason: parsed ? null : "No se han podido leer los datos del correo (puede que el formato haya cambiado).",
    };
  }
  const { error } = await db.from("email_messages").insert(row);
  if (error) {
    if (error.code === "23505") return "dup"; // ya estaba (otra revisión a la vez)
    throw new Error(`No se ha podido guardar el correo: ${error.message}`);
  }
  // Recordar la cuenta de la plataforma para poder asignarle responsable
  const p = row.parsed as Record<string, string | null> | undefined;
  if (platform && p?.account && p.account_norm) {
    await db
      .from("email_accounts")
      .upsert({ organization_id: org, platform, handle: p.account, handle_norm: p.account_norm }, { onConflict: "organization_id,platform,handle_norm", ignoreDuplicates: true });
  }
  return row.status === "ignorado" ? "ignored" : "new";
}

function parseFor(kind: EmailKind, text: string) {
  if (kind === "vinted_venta") return parseVintedSale(text);
  if (kind === "wallapop_venta") return parseWallapopSale(text);
  if (kind === "vinted_etiqueta") {
    const l = parseVintedLabel(text);
    return l.product || l.transaction_id ? l : null;
  }
  return null;
}

function senderAddress(from: string): string {
  return (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase().slice(0, 120);
}

// ---------------------------------------------------------------------
// Cola de procesamiento
// ---------------------------------------------------------------------

async function processQueue(db: Admin, org: string, gmail: Gmail, summary: SyncSummary, deadline: number) {
  const { data: rows, error } = await db
    .from("email_messages")
    .select("id, gmail_message_id, received_at, platform, kind, status, parsed, attempts, sale_id")
    .eq("organization_id", org)
    .in("status", ["pendiente", "esperando", "error"])
    .in("kind", ["vinted_venta", "wallapop_venta", "vinted_etiqueta"])
    .order("received_at")
    .limit(100);
  if (error) throw new Error(`No se ha podido leer la cola de correos: ${error.message}`);
  const catalog = new Catalog(db, org);
  for (const e of (rows ?? []) as EmailRow[]) {
    if (Date.now() > deadline) break;
    try {
      const r = e.kind === "vinted_etiqueta" ? await processLabel(db, org, gmail, e) : await processSale(db, org, catalog, e);
      if (r === "sale") summary.sales++;
      else if (r === "detected") summary.detected++;
      else if (r === "label") summary.labels++;
      else if (r === "review") summary.review++;
      else if (r === "waiting") summary.waiting++;
    } catch (err) {
      if (err instanceof GmailAuthError) throw err;
      summary.errors++;
      const attempts = e.attempts + 1;
      const msg = err instanceof Error ? err.message : "Error desconocido";
      await db
        .from("email_messages")
        .update({
          attempts,
          last_error: msg.slice(0, 500),
          status: attempts >= MAX_ATTEMPTS ? "revision" : "error",
          review_reason: attempts >= MAX_ATTEMPTS ? `Ha fallado ${attempts} veces: ${msg}`.slice(0, 500) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", org)
        .eq("id", e.id);
    }
  }
}

type Outcome = "sale" | "detected" | "label" | "review" | "waiting" | "noop";

async function toReview(db: Admin, org: string, id: string, reason: string, candidates: unknown = null): Promise<Outcome> {
  await db
    .from("email_messages")
    .update({ status: "revision", review_reason: reason.slice(0, 500), candidates, last_error: null, updated_at: new Date().toISOString() })
    .eq("organization_id", org)
    .eq("id", id);
  return "review";
}

/** Errores de la base de datos que necesitan a una persona (no se arreglan reintentando). */
const NEEDS_PERSON = /No hay stock|Falta el responsable|no existe|plataforma|no tiene un precio|administrador activo/i;

// --- Venta (Vinted primer correo / Wallapop confirmación) -------------

async function processSale(db: Admin, org: string, catalog: Catalog, e: EmailRow): Promise<Outcome> {
  if (e.sale_id) {
    // Ya tenía venta (confirmada o marcada como duplicado): no se crea otra
    await db.from("email_messages").update({ status: "procesado", review_reason: null, last_error: null, updated_at: new Date().toISOString() }).eq("organization_id", org).eq("id", e.id);
    return "noop";
  }
  // No se registra sola: queda en «Ventas detectadas» con el producto sugerido
  // para que el administrador la confirme, la marque como duplicado o la descarte.
  const match = await catalog.match(String(e.parsed.product ?? ""));
  const notes = [e.parsed.doubt ? `${e.parsed.doubt} Revisa el precio antes de confirmar.` : null, "reason" in match ? match.reason : null].filter(Boolean);
  await db
    .from("email_messages")
    .update({
      status: "detectada",
      variant_id: match.variantId,
      candidates: match.candidates.length ? match.candidates : null,
      review_reason: notes.length ? notes.join(" ") : null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", org)
    .eq("id", e.id);
  return "detected";
}

interface VariantInfo {
  id: string;
  label: string;
  keysExact: string[];
  keysNorm: string[];
  tokens: Set<string>;
}

/** Catálogo de productos para identificar el artículo del correo. */
export class Catalog {
  private variants: VariantInfo[] | null = null;
  private aliases: Map<string, string> | null = null;
  constructor(
    private db: Admin,
    private org: string,
  ) {}

  private async load() {
    if (this.variants) return;
    const all: { id: string; name: string; sku: string | null; products: { id: string; name: string; sku: string | null; deleted_at: string | null } }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.db
        .from("product_variants")
        .select("id, name, sku, products!inner(id, name, sku, deleted_at)")
        .eq("organization_id", this.org)
        .is("deleted_at", null)
        .is("products.deleted_at", null)
        .range(from, from + 999);
      if (error) throw new Error(`No se ha podido leer el catálogo: ${error.message}`);
      all.push(...((data ?? []) as unknown as typeof all));
      if (!data || data.length < 1000) break;
    }
    const perProduct = new Map<string, number>();
    for (const v of all) perProduct.set(v.products.id, (perProduct.get(v.products.id) ?? 0) + 1);
    this.variants = all.map((v) => {
      const single = perProduct.get(v.products.id) === 1;
      const full = `${v.products.name} ${v.name}`;
      const exact = [full, `${v.products.name} - ${v.name}`, `${v.products.name} · ${v.name}`];
      if (single) exact.push(v.products.name);
      const skus = [v.sku, single ? v.products.sku : null].filter((s): s is string => !!s);
      return {
        id: v.id,
        label: single ? v.products.name : `${v.products.name} · ${v.name}`,
        keysExact: [...exact, ...skus].map((s) => s.trim()),
        keysNorm: [...new Set([...exact, ...skus].map(normalizeName))],
        tokens: new Set(normalizeName(single ? v.products.name : full).split(" ").filter((t) => t.length > 1)),
      };
    });
    const { data: al } = await this.db.from("product_aliases").select("alias_norm, variant_id").eq("organization_id", this.org);
    this.aliases = new Map((al ?? []).map((a) => [a.alias_norm as string, a.variant_id as string]));
  }

  /**
   * 1) nombre exacto · 2) alias guardado · 3) nombre normalizado.
   * Si no hay una única coincidencia, se manda a revisión con sugerencias.
   */
  async match(name: string): Promise<{ variantId: string; candidates: Candidate[] } | { variantId: null; reason: string; candidates: Candidate[] }> {
    await this.load();
    const vs = this.variants!;
    const trimmed = name.trim();
    const norm = normalizeName(name);
    if (!norm) return { variantId: null, reason: "El correo no trae el nombre del artículo.", candidates: [] };

    const exact = vs.filter((v) => v.keysExact.includes(trimmed));
    if (exact.length === 1) return { variantId: exact[0].id, candidates: [] };

    const alias = this.aliases!.get(norm);
    if (alias && vs.some((v) => v.id === alias)) return { variantId: alias, candidates: [] };

    const normalized = vs.filter((v) => v.keysNorm.includes(norm));
    if (normalized.length === 1) return { variantId: normalized[0].id, candidates: [] };

    const several = exact.length > 1 ? exact : normalized;
    if (several.length > 1) {
      return {
        variantId: null,
        reason: `«${trimmed}» coincide con ${several.length} productos. Elige cuál es.`,
        candidates: several.slice(0, 8).map((v) => ({ variant_id: v.id, label: v.label })),
      };
    }
    return {
      variantId: null,
      reason: `No hay ningún producto que se llame exactamente «${trimmed}». Elige el producto (y marca «recordar» para las próximas veces).`,
      candidates: this.suggest(norm),
    };
  }

  /** Productos parecidos (solo sugerencias: nunca se asignan solos). */
  private suggest(norm: string): Candidate[] {
    const words = new Set(norm.split(" ").filter((t) => t.length > 1));
    return this.variants!.map((v) => {
      let common = 0;
      for (const t of v.tokens) if (words.has(t)) common++;
      return { v, score: v.tokens.size ? common / (v.tokens.size + words.size - common) : 0 };
    })
      .filter((x) => x.score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => ({ variant_id: x.v.id, label: x.v.label }));
  }
}

export interface Candidate {
  variant_id?: string;
  sale_id?: string;
  label: string;
}

// --- Etiqueta de Vinted -----------------------------------------------

interface SaleLite {
  id: string;
  sale_number: string;
  sale_date: string;
  buyer_name: string | null;
  platform_transaction_id: string | null;
  shipping_label_path: string | null;
  source_email_id: string | null;
}

async function vintedPlatformId(db: Admin, org: string): Promise<string | null> {
  const { data } = await db.from("platforms").select("id, name").eq("organization_id", org);
  return (data ?? []).find((p) => normalizeName(p.name) === "vinted")?.id ?? null;
}

/** Busca la venta de la etiqueta: nº de transacción y, si no, el artículo (solo si hay UNA posible). */
export async function findLabelSale(
  db: Admin,
  org: string,
  e: EmailRow,
): Promise<{ sale: SaleLite } | { sale: null; reason: string; candidates: Candidate[]; wait: boolean; saleUnconfirmed?: boolean }> {
  const trx = (e.parsed.transaction_id as string | null) ?? null;
  const productNorm = (e.parsed.product_norm as string | null) ?? null;
  const account = (e.parsed.account_norm as string | null) ?? null;
  const cols = "id, sale_number, sale_date, buyer_name, platform_transaction_id, shipping_label_path, source_email_id";

  if (trx) {
    const { data } = await db.from("sales").select(cols).eq("organization_id", org).eq("platform_transaction_id", trx).eq("status", "activa");
    if (data?.length === 1) return { sale: data[0] as SaleLite };
  }

  // Ventas unidas a un correo de Vinted (confirmadas o marcadas como duplicado) con el mismo artículo y sin etiqueta de correo
  const { data: sameName } = await db
    .from("email_messages")
    .select("id, sale_id, status, parsed, received_at")
    .eq("organization_id", org)
    .eq("kind", "vinted_venta")
    .lte("received_at", e.received_at)
    .eq("parsed->>product_norm", productNorm ?? "__nada__");
  const sameAccount = (sameName ?? []).filter((m) => !account || !m.parsed?.account_norm || m.parsed.account_norm === account);
  const saleIds = sameAccount.filter((m) => m.sale_id).map((m) => m.sale_id as string);
  let free: SaleLite[] = [];
  if (saleIds.length) {
    const { data: sales } = await db.from("sales").select(cols).eq("organization_id", org).in("id", saleIds).eq("status", "activa");
    const { data: taken } = await db.from("email_messages").select("sale_id").eq("organization_id", org).eq("kind", "vinted_etiqueta").eq("status", "procesado").in("sale_id", saleIds);
    const takenSet = new Set((taken ?? []).map((t) => t.sale_id));
    free = ((sales ?? []) as SaleLite[]).filter((s) => !takenSet.has(s.id) && (!trx || !s.platform_transaction_id || s.platform_transaction_id === trx));
  }
  if (free.length === 1) return { sale: free[0] };
  if (free.length > 1) {
    return {
      sale: null,
      wait: false,
      reason: `Hay ${free.length} ventas de «${e.parsed.product ?? "?"}» sin etiqueta. Elige a cuál pertenece.`,
      candidates: free.map((s) => ({ sale_id: s.id, label: saleLabel(s) })),
    };
  }
  // Ninguna: quizá el primer correo aún no ha llegado o está en revisión
  const pendingSale = sameAccount.some((m) => !m.sale_id && m.status !== "ignorado");
  return {
    sale: null,
    wait: true,
    saleUnconfirmed: pendingSale,
    reason: pendingSale
      ? "La venta de este artículo está en «Ventas detectadas» sin confirmar. En cuanto la confirmes, se pondrá la etiqueta sola."
      : "Todavía no hay una venta de Vinted con este artículo. Se volverá a intentar automáticamente.",
    candidates: await recentVintedSales(db, org),
  };
}

function saleLabel(s: SaleLite): string {
  const d = s.sale_date.split("-").reverse().join("/");
  return `${s.sale_number} · ${d}${s.buyer_name ? ` · ${s.buyer_name}` : ""}${s.shipping_label_path ? " · ya tiene etiqueta" : ""}`;
}

/** Ventas de Vinted recientes, activas y sin etiqueta: para vincular a mano. */
export async function recentVintedSales(db: Admin, org: string): Promise<Candidate[]> {
  const vinted = await vintedPlatformId(db, org);
  if (!vinted) return [];
  const since = new Date(Date.now() - 45 * 86400_000).toISOString().slice(0, 10);
  const { data } = await db
    .from("sales")
    .select("id, sale_number, sale_date, buyer_name, platform_transaction_id, shipping_label_path, source_email_id")
    .eq("organization_id", org)
    .eq("platform_id", vinted)
    .eq("status", "activa")
    .is("shipping_label_path", null)
    .gte("sale_date", since)
    .order("sale_date", { ascending: false })
    .limit(30);
  return ((data ?? []) as SaleLite[]).map((s) => ({ sale_id: s.id, label: saleLabel(s) }));
}

async function processLabel(db: Admin, org: string, gmail: Gmail, e: EmailRow): Promise<Outcome> {
  const found = await findLabelSale(db, org, e);
  if (!found.sale) {
    const age = Date.now() - Date.parse(e.received_at);
    // Si la venta está detectada pero sin confirmar, espera lo que haga falta
    if (found.wait && (found.saleUnconfirmed || age < WAIT_LABEL_DAYS * 86400_000)) {
      await db
        .from("email_messages")
        .update({ status: "esperando", review_reason: found.reason, candidates: found.candidates, updated_at: new Date().toISOString() })
        .eq("organization_id", org)
        .eq("id", e.id);
      return "waiting";
    }
    return toReview(db, org, e.id, found.wait ? `Han pasado ${WAIT_LABEL_DAYS} días y no aparece la venta. Vincúlala a mano.` : found.reason, found.candidates);
  }
  return attachLabel(db, org, gmail, e, found.sale.id, { force: false, userClient: null });
}

/**
 * Descarga el PDF del correo, lo comprueba, lo sube al almacén privado y lo
 * vincula a la venta. La ruta del archivo siempre es la misma para un
 * correo, así que repetirlo no crea archivos nuevos.
 */
export async function attachLabel(
  db: Admin,
  org: string,
  gmail: Gmail,
  e: Pick<EmailRow, "id" | "gmail_message_id" | "parsed">,
  saleId: string,
  opts: { force: boolean; userClient: SupabaseClient | null },
): Promise<Outcome> {
  const mail = await gmail.message(e.gmail_message_id);
  const pdf = pdfAttachments(mail)[0];
  if (!pdf) return toReview(db, org, e.id, "El correo no trae la etiqueta en PDF.", [{ sale_id: saleId, label: "Venta encontrada" }]);
  if (pdf.size > 10 * 1024 * 1024) return toReview(db, org, e.id, "El PDF pesa más de 10 MB; no se ha guardado.");
  const buf = pdf.attachmentId ? await gmail.attachment(mail.id, pdf.attachmentId) : Buffer.from(pdf.inlineData ?? "", "base64url");
  const invalid = validatePdf(buf);
  if (invalid) return toReview(db, org, e.id, `${invalid} No se ha guardado. Descárgala de Vinted y súbela a mano.`, [{ sale_id: saleId, label: "Venta encontrada" }]);

  // La venta tiene que ser de esta organización (el archivo va en su carpeta)
  const { data: owned } = await db.from("sales").select("id").eq("organization_id", org).eq("id", saleId).maybeSingle();
  if (!owned) throw new Error("La venta no existe.");
  const path = `${saleId}/vinted-${mail.id.replace(/[^A-Za-z0-9_-]/g, "")}.pdf`;
  const up = await db.storage.from("shipping-labels").upload(path, buf, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new Error(`No se ha podido guardar el PDF: ${up.error.message}`);

  const carrierId = await carrierFromText(db, org, (e.parsed.carrier_text as string | null) ?? null);
  const meta = {
    tracking_number: e.parsed.tracking_number ?? null,
    transaction_id: e.parsed.transaction_id ?? null,
    deadline: e.parsed.deadline ?? null,
    carrier_id: carrierId,
    force: opts.force,
  };
  const client = opts.userClient ?? db;
  const { error } = await client.rpc("email_attach_label", { p_email_id: e.id, p_sale_id: saleId, p_path: path, p_meta: meta });
  if (error) {
    // No se ha vinculado: el PDF no se queda huérfano
    const { data: s } = await db.from("sales").select("shipping_label_path").eq("organization_id", org).eq("id", saleId).maybeSingle();
    if (s?.shipping_label_path !== path) await db.storage.from("shipping-labels").remove([path]);
    if (opts.userClient) throw new Error(error.message);
    if (NEEDS_PERSON.test(error.message) || /etiqueta|envío|anulada|corresponde/i.test(error.message)) {
      return toReview(db, org, e.id, error.message, [{ sale_id: saleId, label: "Venta encontrada" }]);
    }
    throw new Error(error.message);
  }
  return "label";
}

async function carrierFromText(db: Admin, org: string, text: string | null): Promise<string | null> {
  if (!text) return null;
  const t = ` ${normalizeName(text)} `;
  const { data } = await db.from("carriers").select("id, name").eq("organization_id", org).eq("active", true);
  const hits = (data ?? []).filter((c) => t.includes(` ${normalizeName(c.name)} `));
  if (!hits.length) return null;
  // Si una coincidencia contiene a otra («Vinted Go» y «Go»), vale la más larga
  hits.sort((a, b) => b.name.length - a.name.length);
  const best = hits[0];
  const others = hits.slice(1).filter((h) => !normalizeName(best.name).includes(normalizeName(h.name)));
  return others.length ? null : best.id;
}

// ---------------------------------------------------------------------
// Acceso a Gmail para las acciones manuales del administrador
// ---------------------------------------------------------------------

export async function gmailForServer(db: Admin, org: string): Promise<Gmail> {
  const { data } = await db.from("email_integration").select("refresh_token_enc").eq("organization_id", org).maybeSingle();
  if (!data?.refresh_token_enc) throw new GmailAuthError("Gmail no está conectado.");
  let refresh: string;
  try {
    refresh = decryptSecret(data.refresh_token_enc);
  } catch {
    throw new GmailAuthError("No se puede leer el permiso guardado. Vuelve a conectar Gmail.");
  }
  return new Gmail(await refreshAccessToken(refresh));
}

export async function markAuthError(db: Admin, org: string, message: string) {
  await db
    .from("email_integration")
    .update({ status: "error_autorizacion", last_error: message, updated_at: new Date().toISOString() })
    .eq("organization_id", org);
}

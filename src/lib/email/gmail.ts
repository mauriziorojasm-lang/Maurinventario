import "server-only";
import { cleanText, htmlToText } from "./parse";

/**
 * Acceso a Gmail con la API oficial (OAuth 2.0). Solo lectura
 * (permiso gmail.readonly): la aplicación nunca envía, borra ni modifica
 * correos.
 */

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const CENTRAL_ACCOUNT = "maurinventario@gmail.com";

// Direcciones de Google. Solo se cambian en las pruebas automáticas (Gmail simulado).
const AUTH_URL = () => process.env.GOOGLE_OAUTH_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = () => process.env.GOOGLE_OAUTH_TOKEN_URL || "https://oauth2.googleapis.com/token";
const API = () => (process.env.GMAIL_API_BASE || "https://gmail.googleapis.com").replace(/\/$/, "");

/** Google ha retirado el permiso (o ya no vale): hay que volver a conectar. */
export class GmailAuthError extends Error {}
export class GmailError extends Error {}

export function googleCredentials() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return null;
  return { id, secret };
}

export function authorizationUrl(opts: { redirectUri: string; state: string }): string {
  const c = googleCredentials();
  if (!c) throw new Error("Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Vercel.");
  const u = new URL(AUTH_URL());
  u.search = new URLSearchParams({
    client_id: c.id,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    login_hint: CENTRAL_ACCOUNT,
    state: opts.state,
  }).toString();
  return u.toString();
}

async function tokenRequest(body: Record<string, string>) {
  const c = googleCredentials();
  if (!c) throw new GmailAuthError("Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Vercel.");
  const res = await fetch(TOKEN_URL(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, ...body }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, string>;
  if (!res.ok) {
    const code = json.error || `HTTP ${res.status}`;
    if (code === "invalid_grant" || code === "unauthorized_client" || code === "invalid_client" || res.status === 401) {
      throw new GmailAuthError(`Google ha rechazado el permiso (${code}). Vuelve a conectar Gmail.`);
    }
    throw new GmailError(`Google no ha respondido bien (${code}).`);
  }
  return json;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const j = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  return { accessToken: j.access_token, refreshToken: j.refresh_token as string | undefined, scope: j.scope ?? "" };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const j = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  if (!j.access_token) throw new GmailError("Google no ha devuelto el acceso.");
  return j.access_token;
}

export class Gmail {
  constructor(private accessToken: string) {}

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const u = new URL(`${API()}/gmail/v1/users/me/${path}`);
    if (params) for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    let last: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(u, { headers: { authorization: `Bearer ${this.accessToken}` }, cache: "no-store" });
      if (res.ok) return (await res.json()) as T;
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; errors?: { reason?: string }[] } };
      const reason = body.error?.errors?.[0]?.reason ?? "";
      if (res.status === 401 || (res.status === 403 && /insufficient|forbidden|accessNotConfigured|authError/i.test(reason + " " + (body.error?.message ?? "")))) {
        throw new GmailAuthError(
          res.status === 401 ? "Gmail ha rechazado el acceso. Vuelve a conectar Gmail." : `Gmail no da permiso (${reason || res.status}). Vuelve a conectar Gmail.`,
        );
      }
      last = new GmailError(`Gmail ha respondido con un error (${res.status}${reason ? ` ${reason}` : ""}).`);
      if (res.status !== 429 && res.status < 500) break;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
    throw last ?? new GmailError("Gmail no responde.");
  }

  profile() {
    return this.get<{ emailAddress: string; historyId: string }>("profile");
  }

  async list(q: string, max = 300): Promise<{ id: string; threadId: string }[]> {
    const out: { id: string; threadId: string }[] = [];
    let pageToken: string | undefined;
    do {
      const r = await this.get<{ messages?: { id: string; threadId: string }[]; nextPageToken?: string }>("messages", {
        q,
        maxResults: String(Math.min(100, max - out.length)),
        ...(pageToken ? { pageToken } : {}),
      });
      out.push(...(r.messages ?? []));
      pageToken = r.nextPageToken;
    } while (pageToken && out.length < max);
    return out;
  }

  async message(id: string): Promise<MailMessage> {
    const m = await this.get<GmailMessage>(`messages/${encodeURIComponent(id)}`, { format: "full" });
    return toMail(m);
  }

  async attachment(messageId: string, attachmentId: string): Promise<Buffer> {
    const r = await this.get<{ data: string; size: number }>(`messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
    return Buffer.from(r.data, "base64url");
  }
}

// ---------------------------------------------------------------------
// Mensaje de Gmail → datos útiles
// ---------------------------------------------------------------------

interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: string;
  payload: GmailPart;
}

export interface MailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string | null;
  inlineData: string | null;
}

export interface MailMessage {
  id: string;
  threadId: string;
  receivedAt: Date;
  from: string;
  subject: string;
  text: string;
  attachments: MailAttachment[];
}

function decode(data?: string): string {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

export function toMail(m: GmailMessage): MailMessage {
  const headers = m.payload.headers ?? [];
  const h = (name: string) => headers.find((x) => x.name.toLowerCase() === name)?.value ?? "";
  let plain = "";
  let html = "";
  const attachments: MailAttachment[] = [];
  const walk = (p: GmailPart) => {
    const mime = (p.mimeType ?? "").toLowerCase();
    if (p.filename) {
      attachments.push({
        filename: p.filename,
        mimeType: mime,
        size: p.body?.size ?? 0,
        attachmentId: p.body?.attachmentId ?? null,
        inlineData: p.body?.data ?? null,
      });
    } else if (mime === "text/plain") {
      plain += decode(p.body?.data) + "\n";
    } else if (mime === "text/html") {
      html += decode(p.body?.data) + "\n";
    }
    for (const c of p.parts ?? []) walk(c);
  };
  walk(m.payload);
  // El HTML suele ser más completo; si no hay, el texto plano
  const text = html.trim() ? htmlToText(html) : cleanText(plain);
  return {
    id: m.id,
    threadId: m.threadId,
    receivedAt: new Date(Number(m.internalDate)),
    from: h("from"),
    subject: h("subject"),
    text,
    attachments,
  };
}

export function pdfAttachments(m: MailMessage): MailAttachment[] {
  return m.attachments.filter((a) => a.mimeType === "application/pdf" || /\.pdf$/i.test(a.filename));
}

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** ¿Es un PDF de verdad? Cabecera %PDF- y marca de final %%EOF. */
export function validatePdf(buf: Buffer): string | null {
  if (buf.length === 0) return "El PDF está vacío.";
  if (buf.length > MAX_PDF_BYTES) return "El PDF pesa más de 10 MB.";
  if (buf.subarray(0, 1024).indexOf("%PDF-") < 0) return "El archivo no es un PDF.";
  if (buf.subarray(Math.max(0, buf.length - 2048)).indexOf("%%EOF") < 0) return "El PDF está incompleto o dañado.";
  return null;
}

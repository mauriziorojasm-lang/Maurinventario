import { after, NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { CENTRAL_ACCOUNT, exchangeCode, Gmail, GMAIL_SCOPE } from "@/lib/email/gmail";
import { encryptSecret, safeEqual } from "@/lib/email/secret";
import { runSync } from "@/lib/email/sync";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Paso 2: Google vuelve aquí con el permiso. Se guarda cifrado y solo en el servidor. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin" || !user.active) return new NextResponse("No autorizado", { status: 403 });
  const sp = request.nextUrl.searchParams;
  const back = new URL("/correos", request.nextUrl.origin);
  const fail = (msg: string) => {
    back.searchParams.set("error", msg);
    const r = NextResponse.redirect(back);
    r.cookies.delete({ name: "gmail_oauth_state", path: "/api/correo" });
    return r;
  };

  const expected = request.cookies.get("gmail_oauth_state")?.value ?? "";
  const state = sp.get("state") ?? "";
  if (!expected || !state || !safeEqual(expected, state)) return fail("La conexión ha caducado. Pulsa otra vez «Conectar Gmail».");
  if (sp.get("error")) return fail(sp.get("error") === "access_denied" ? "Has cancelado el permiso en Google." : `Google ha devuelto un error (${sp.get("error")}).`);
  const code = sp.get("code");
  if (!code) return fail("Google no ha devuelto el permiso.");

  try {
    const redirectUri = `${request.nextUrl.origin}/api/correo/oauth`;
    const tok = await exchangeCode(code, redirectUri);
    if (!tok.scope.split(" ").includes(GMAIL_SCOPE)) return fail("Hay que marcar la casilla de permiso para leer el correo de Gmail.");
    if (!tok.refreshToken) return fail("Google no ha dado el permiso permanente. Quita el acceso de MaurInventario en tu cuenta de Google y vuelve a conectar.");
    const profile = await new Gmail(tok.accessToken).profile();
    if (profile.emailAddress.toLowerCase() !== CENTRAL_ACCOUNT) {
      return fail(`Has elegido ${profile.emailAddress}. Hay que conectar ${CENTRAL_ACCOUNT}.`);
    }

    const db = createAdminClient();
    const { data: prev } = await db.from("email_integration").select("refresh_token_enc, connected_at").eq("id", true).single();
    const now = new Date().toISOString();
    // Conexión nueva: se empieza desde ahora (las ventas anteriores ya están en la app).
    // Reconexión tras un fallo de permiso: se mantiene el punto de partida para no perder correos.
    const connectedAt = prev?.refresh_token_enc && prev.connected_at ? prev.connected_at : now;
    const { error } = await db
      .from("email_integration")
      .update({
        email: profile.emailAddress.toLowerCase(),
        refresh_token_enc: encryptSecret(tok.refreshToken),
        status: "conectado",
        last_error: null,
        connected_at: connectedAt,
        acting_profile_id: user.id,
        app_url: request.nextUrl.origin,
        lock_until: null,
        updated_at: now,
      })
      .eq("id", true);
    if (error) return fail(`No se ha podido guardar la conexión: ${error.message}`);
    await db.from("audit_log").insert({
      user_id: user.id,
      user_email: user.email,
      action: "conectar_gmail",
      entity: "email_integration",
      summary: `Gmail conectado (${profile.emailAddress})`,
    });

    after(() => runSync("manual").catch(() => undefined));
    back.searchParams.set("ok", "conectado");
    const r = NextResponse.redirect(back);
    r.cookies.delete({ name: "gmail_oauth_state", path: "/api/correo" });
    return r;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "No se ha podido conectar Gmail.");
  }
}

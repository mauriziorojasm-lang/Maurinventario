import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { authorizationUrl, googleCredentials } from "@/lib/email/gmail";

export const dynamic = "force-dynamic";

/** Paso 1 de la conexión: manda al administrador a la pantalla de permiso de Google. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin" || !user.active || !user.orgId || !user.hasAccess) return new NextResponse("No autorizado", { status: 403 });
  const back = new URL("/correos", request.nextUrl.origin);
  if (!googleCredentials()) {
    back.searchParams.set("error", "Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Vercel. Sigue la guía de Ventas por correo.");
    return NextResponse.redirect(back);
  }
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authorizationUrl({ redirectUri: `${request.nextUrl.origin}/api/correo/oauth`, state }));
  // El permiso se guardará en el espacio desde el que se pidió
  res.cookies.set("gmail_oauth_state", `${state}.${user.orgId}`, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/correo",
    maxAge: 600,
  });
  return res;
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Se ejecuta antes de cada página: renueva la sesión de Supabase y envía
 * al login a quien no la tenga.
 */
const PUBLIC = ["/precios", "/privacidad", "/terminos", "/recuperar", "/auth", "/invitacion", "/api/stripe/webhook"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return new NextResponse(
      "Resellap no está configurado: faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Revisa el README.",
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        if (headers) for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  // Panel de administración en su propio subdominio (admin.<dominio>): misma app, solo la parte /admin
  const adminHost = /^admin\./i.test(request.headers.get("host") ?? "");
  const isLogin = path.startsWith("/login") || path.startsWith("/registro");
  // Páginas públicas: presentación, registro, recuperación, invitaciones y webhooks
  const isPublic = isLogin || PUBLIC.some((p) => path === p || path.startsWith(p + "/"));

  if (!data?.claims && !isPublic) {
    const to = request.nextUrl.clone();
    to.search = "";
    if (path === "/" && !adminHost) {
      to.pathname = "/precios";
    } else {
      to.pathname = "/login";
      to.searchParams.set("next", path);
    }
    return NextResponse.redirect(to);
  }
  if (data?.claims && isLogin) {
    const to = request.nextUrl.clone();
    to.pathname = "/";
    to.search = "";
    return NextResponse.redirect(to);
  }
  if (adminHost && !path.startsWith("/admin") && !isPublic && !path.startsWith("/api/")) {
    const to = request.nextUrl.clone();
    to.pathname = path === "/" ? "/admin" : `/admin${path}`;
    const rewrite = NextResponse.rewrite(to, { request });
    for (const c of response.cookies.getAll()) rewrite.cookies.set(c);
    return rewrite;
  }
  return response;
}

export const config = {
  matcher: ["/((?!api/correo/sincronizar|api/stripe/webhook|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

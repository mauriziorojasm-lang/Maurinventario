import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Enlaces de los correos (confirmar la cuenta, recuperar la contraseña,
 * cambiar el email). Crea la sesión y lleva al siguiente paso.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const next = safeNext(sp.get("next") ?? "/");
  const supabase = await createClient();
  const code = sp.get("code");
  const tokenHash = sp.get("token_hash");
  const type = sp.get("type") as EmailOtpType | null;
  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }
  return NextResponse.redirect(new URL(ok ? next : "/login?error=enlace", request.url), { status: 303 });
}

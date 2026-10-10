import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Cerrar sesión (botón del menú). */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}

/**
 * Usuario desactivado: se cierra su sesión y ve el aviso en el login.
 * Solo actúa si de verdad está desactivado (un enlace no puede cerrar la
 * sesión de un usuario activo).
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (user?.active) return NextResponse.redirect(new URL("/", request.url), { status: 303 });
  if (user) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/login?error=inactivo", request.url), { status: 303 });
}

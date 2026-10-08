"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Cliente de Supabase para el navegador, con la sesión del usuario (respeta RLS). */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}

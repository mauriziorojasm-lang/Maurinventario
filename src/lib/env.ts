/**
 * Variables de entorno públicas (se pueden usar en el navegador).
 * Las secretas están en src/lib/supabase/admin.ts y solo se leen en el servidor.
 */
export function supabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error("Falta la variable de entorno NEXT_PUBLIC_SUPABASE_URL");
  return v;
}

export function supabaseAnonKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!v) throw new Error("Falta la variable de entorno NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return v;
}

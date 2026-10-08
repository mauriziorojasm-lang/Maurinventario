import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "../env";

/**
 * Cliente con la secret key (antes «service_role»): SALTA TODOS LOS PERMISOS.
 * Solo se usa en el servidor para gestionar usuarios (crear, desactivar,
 * cambiar contraseña), y siempre después de comprobar que quien lo pide
 * es administrador. Nunca se importa desde el navegador.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Falta la variable de entorno SUPABASE_SECRET_KEY (solo servidor)");
  return createSupabaseClient(supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}

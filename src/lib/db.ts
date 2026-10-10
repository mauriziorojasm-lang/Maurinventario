import "server-only";
import { friendlyError } from "./errors";

type Res<T> = { data: T; error: { message?: string; code?: string } | null; count?: number | null };

/**
 * Comprueba la respuesta de Supabase en las pantallas: si hay error, lo
 * lanza (se ve la pantalla «No se ha podido cargar» con «Reintentar») en
 * vez de mostrar una lista vacía como si no hubiera datos.
 */
export function must<T>(res: Res<T>, what: string): T {
  if (res.error) {
    console.error(`[${what}]`, res.error);
    throw new Error(`No se ha podido cargar ${what}. ${friendlyError(res.error)}`);
  }
  return res.data;
}

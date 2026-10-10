import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type Badges = { reviews: number; shipments: number; emails: number; detected: number; listings: number };
const ZERO: Badges = { reviews: 0, shipments: 0, emails: 0, detected: 0, listings: 0 };

/**
 * Contadores del menú y de «Tareas» (una sola consulta por página; el menú
 * y el inicio comparten el resultado). El vendedor solo ve sus envíos.
 */
export const loadBadges = cache(async (): Promise<Badges> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("nav_badges");
  if (error || !data) return ZERO; // los contadores nunca deben tumbar la pantalla
  const d = data as Partial<Badges>;
  return {
    reviews: Number(d.reviews ?? 0),
    shipments: Number(d.shipments ?? 0),
    emails: Number(d.emails ?? 0),
    detected: Number(d.detected ?? 0),
    listings: Number(d.listings ?? 0),
  };
});

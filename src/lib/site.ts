import "server-only";
import { headers } from "next/headers";

/** Dirección pública de la app (para los enlaces de los correos y de Stripe). */
export async function siteUrl(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export const PRICE_LABEL = "4,99 €";
export const TRIAL_DAYS = 7;

/** Titular del servicio para las páginas legales (se configura en Vercel). */
export const LEGAL = {
  name: process.env.LEGAL_NAME?.trim() || "[Titular pendiente de configurar]",
  taxId: process.env.LEGAL_TAX_ID?.trim() || "[NIF pendiente]",
  address: process.env.LEGAL_ADDRESS?.trim() || "[Dirección pendiente]",
  email: process.env.LEGAL_EMAIL?.trim() || "[email de contacto pendiente]",
};

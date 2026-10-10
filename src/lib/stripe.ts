import "server-only";
import Stripe from "stripe";
import { createAdminClient } from "./supabase/admin";
import { testOnlyEnv } from "./test-env";

/**
 * Pagos con Stripe. Sin STRIPE_SECRET_KEY, STRIPE_PRICE_ID y
 * STRIPE_WEBHOOK_SECRET la app muestra «pendiente de configuración» y no
 * cobra nada. Usa claves de prueba (sk_test_…) hasta estar listo para cobrar.
 */
export function stripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_PRICE_ID?.trim() && process.env.STRIPE_WEBHOOK_SECRET?.trim());
}

/** ¿Claves de prueba? (para avisar en pantalla de que no se cobra de verdad) */
export function stripeTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").trim().startsWith("sk_test_");
}

let client: Stripe | null = null;
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Los pagos aún no están configurados.");
  if (!client) {
    // Solo en las pruebas automáticas: Stripe simulado en local
    const fake = testOnlyEnv("STRIPE_API_BASE");
    const u = fake ? new URL(fake) : null;
    client = new Stripe(key, {
      maxNetworkRetries: 2,
      timeout: 20_000,
      appInfo: { name: "MaurInventario" },
      ...(u ? { host: u.hostname, port: Number(u.port || 80), protocol: u.protocol.replace(":", "") as "http" | "https" } : {}),
    });
  }
  return client;
}

export const ACTIVE_STATUSES = new Set(["trialing", "active", "past_due", "unpaid", "incomplete", "paused"]);

/** Fin del periodo pagado (en la API actual está en la línea de la suscripción). */
function periodEnd(sub: Stripe.Subscription): number | null {
  const ends = sub.items.data.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number");
  return ends.length ? Math.max(...ends) : null;
}

const iso = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);

/**
 * Guarda en la base de datos el estado ACTUAL de la suscripción (se pide a
 * Stripe, no se fía del contenido del evento). Devuelve la organización.
 */
export async function syncSubscription(subscriptionId: string, eventCreated: number): Promise<string | null> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const db = createAdminClient();
  // La organización: la de los metadatos que puso nuestro servidor al crear el pago,
  // comprobando que el cliente de Stripe es el suyo; si no, la que ya tiene ese cliente.
  let org: string | null = sub.metadata?.organization_id ?? null;
  const { data: byCustomer } = await db.from("subscriptions").select("organization_id").eq("stripe_customer_id", customer).maybeSingle();
  if (org) {
    const { data: row } = await db.from("subscriptions").select("stripe_customer_id").eq("organization_id", org).maybeSingle();
    if (!row) org = null;
    else if (row.stripe_customer_id && row.stripe_customer_id !== customer) org = null;
  }
  org = org ?? (byCustomer?.organization_id as string | undefined) ?? null;
  if (!org) return null;
  const { error } = await db.rpc("billing_apply", {
    p_org: org,
    p_status: sub.status,
    p_trial_end: iso(sub.trial_end),
    p_period_end: iso(periodEnd(sub)),
    p_cancel_at_end: sub.cancel_at_period_end || !!sub.cancel_at,
    p_customer: customer,
    p_subscription: sub.id,
    p_event_created: iso(eventCreated),
  });
  if (error) throw new Error(`No se ha podido guardar la suscripción: ${error.message}`);
  return org;
}

/** Identificador de la suscripción a la que se refiere un evento (si lo hay). */
export function subscriptionOfEvent(event: Stripe.Event): string | null {
  const o = event.data.object as unknown as Record<string, unknown>;
  const id = (v: unknown) => (typeof v === "string" ? v : v && typeof v === "object" && "id" in v ? String((v as { id: string }).id) : null);
  if (event.type.startsWith("customer.subscription.")) return id(o.id);
  if (event.type === "checkout.session.completed") return id(o.subscription);
  if (event.type.startsWith("invoice.")) {
    const parent = o.parent as { subscription_details?: { subscription?: unknown } } | null | undefined;
    return id(parent?.subscription_details?.subscription) ?? id(o.subscription);
  }
  return null;
}

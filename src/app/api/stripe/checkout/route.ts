import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { siteUrl } from "@/lib/site";
import { ACTIVE_STATUSES, stripe, stripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Empieza el pago de la suscripción (solo el administrador del espacio). */
export async function POST(request: NextRequest) {
  const base = await siteUrl();
  const back = (q: string) => NextResponse.redirect(new URL(`/suscripcion?${q}`, base), { status: 303 });
  const user = await getCurrentUser();
  if (!user?.active || !user.orgId || user.role !== "admin") return back("error=permiso");
  if (!stripeConfigured()) return back("error=no-configurado");
  if (user.orgStatus !== "activa") return back("error=estado");
  // Mismo origen: que otra web no pueda lanzar el pago
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(base).origin && origin !== request.nextUrl.origin) return back("error=permiso");

  const db = createAdminClient();
  const { data: sub } = await db
    .from("subscriptions")
    .select("status, trial_ends_at, stripe_customer_id, stripe_subscription_id")
    .eq("organization_id", user.orgId)
    .maybeSingle();
  if (!sub) return back("error=estado");
  // Ya tiene una suscripción en Stripe: se gestiona en el portal
  if (sub.stripe_subscription_id && ACTIVE_STATUSES.has(sub.status)) return back("error=ya-suscrito");

  try {
    let customer = sub.stripe_customer_id as string | null;
    if (!customer) {
      const c = await stripe().customers.create(
        { email: user.email, name: user.orgName ?? undefined, metadata: { organization_id: user.orgId } },
        { idempotencyKey: `customer-${user.orgId}` },
      );
      customer = c.id;
      await db.rpc("billing_set_customer", { p_org: user.orgId, p_customer: customer });
    }
    // Lo que quede de prueba se respeta (Stripe exige al menos 48 h)
    const trialEnd = sub.trial_ends_at ? Math.floor(Date.parse(sub.trial_ends_at) / 1000) : 0;
    const keepTrial = trialEnd > Math.floor(Date.now() / 1000) + 48 * 3600;
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: user.orgId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID!.trim(), quantity: 1 }],
      subscription_data: { metadata: { organization_id: user.orgId }, ...(keepTrial ? { trial_end: trialEnd } : {}) },
      metadata: { organization_id: user.orgId },
      locale: "es",
      // Stripe activa por defecto «Managed Payments» (Stripe como vendedor, con comisión
      // extra y códigos fiscales obligatorios). Aquí se usa el cobro normal.
      ...({ managed_payments: { enabled: false } } as object),
      ...(process.env.STRIPE_AUTOMATIC_TAX === "1" ? { automatic_tax: { enabled: true }, customer_update: { address: "auto" as const } } : {}),
      success_url: `${base}/suscripcion?ok=pago`,
      cancel_url: `${base}/suscripcion`,
    });
    if (!session.url) return back("error=stripe");
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (e) {
    // El motivo que da Stripe (sin datos secretos) para poder corregir la configuración
    const msg = e instanceof Error ? e.message.slice(0, 300) : "";
    console.error("Stripe checkout:", msg);
    return back(`error=stripe&detalle=${encodeURIComponent(msg)}`);
  }
}

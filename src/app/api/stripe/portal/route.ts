import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { siteUrl } from "@/lib/site";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Portal de Stripe: tarjeta, facturas y cancelación (solo el administrador). */
export async function POST(request: NextRequest) {
  const base = await siteUrl();
  const back = (q: string) => NextResponse.redirect(new URL(`/suscripcion?${q}`, base), { status: 303 });
  const user = await getCurrentUser();
  if (!user?.active || !user.orgId || user.role !== "admin") return back("error=permiso");
  if (!stripeConfigured()) return back("error=no-configurado");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(base).origin && origin !== request.nextUrl.origin) return back("error=permiso");
  const { data: sub } = await createAdminClient().from("subscriptions").select("stripe_customer_id").eq("organization_id", user.orgId).maybeSingle();
  if (!sub?.stripe_customer_id) return back("error=sin-cliente");
  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      configuration: await portalConfiguration(),
      return_url: `${base}/suscripcion`,
      locale: "es",
    });
    return NextResponse.redirect(session.url, { status: 303 });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "";
    console.error("Stripe portal:", msg);
    return back(`error=stripe&detalle=${encodeURIComponent(msg)}`);
  }
}

/**
 * Configuración del portal: la predeterminada del panel de Stripe si existe;
 * si no, una propia (tarjeta, facturas y cancelar al final del periodo).
 */
async function portalConfiguration(): Promise<string> {
  const list = await stripe().billingPortal.configurations.list({ active: true, limit: 20 });
  const found = list.data.find((c) => c.is_default) ?? list.data.find((c) => c.metadata?.app === "maurinventario");
  if (found) return found.id;
  const created = await stripe().billingPortal.configurations.create({
    business_profile: { headline: "MaurInventario: gestiona tu suscripción" },
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id"] },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
    },
    metadata: { app: "maurinventario" },
  });
  return created.id;
}

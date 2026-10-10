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
    const session = await stripe().billingPortal.sessions.create({ customer: sub.stripe_customer_id, return_url: `${base}/suscripcion`, locale: "es" });
    return NextResponse.redirect(session.url, { status: 303 });
  } catch {
    return back("error=stripe");
  }
}

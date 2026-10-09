import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/email/secret";
import { runSync } from "@/lib/email/sync";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * La llama Supabase cada 5 minutos (pg_cron + pg_net) con un token interno
 * que solo conocen la base de datos y este servidor. No devuelve datos
 * personales: solo los contadores.
 */
export async function POST(request: NextRequest) {
  const token = request.headers.get("x-cron-token") ?? "";
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const db = createAdminClient();
  const { data } = await db.from("email_integration").select("cron_token").eq("id", true).single();
  if (!data?.cron_token || !safeEqual(data.cron_token, token)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const summary = await runSync("auto");
  return NextResponse.json(summary);
}

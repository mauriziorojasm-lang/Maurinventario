import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Descarga de los datos propios del usuario: su perfil, sus ajustes, su
 * historial y sus ventas (las de su responsable). Nunca incluye datos de
 * otros usuarios ni contraseñas: los permisos los aplica la base de datos.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.active) return new NextResponse("No autorizado", { status: 401 });
  const supabase = await createClient();
  const [prefs, activity] = await Promise.all([
    supabase.from("user_preferences").select("prefs, updated_at").eq("user_id", user.id).maybeSingle(),
    supabase.rpc("my_activity", { p_limit: 200 }),
  ]);
  const sales: unknown[] = [];
  if (user.responsibleId) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("sales")
        .select("sale_number, sale_date, status, shipping_status, external_reference, notes, created_at, platforms(name), sale_items(quantity, unit_price, notes, product_variants(name, products(name)))")
        .eq("responsible_id", user.responsibleId)
        .order("sale_date")
        .range(from, from + 999);
      if (error) return new NextResponse("No se han podido preparar tus datos. Inténtalo de nuevo.", { status: 500 });
      sales.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
  }
  await supabase.rpc("log_user_event", { p_action: "exportar_mis_datos", p_summary: "Descarga de mis datos" });
  const body = {
    generado: new Date().toISOString(),
    usuario: { email: user.email, nombre: user.fullName, rol: user.role, responsable: user.responsibleName },
    ajustes: prefs.data?.prefs ?? {},
    actividad: activity.data ?? [],
    ventas: sales,
  };
  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="mis-datos-maurinventario-${stamp}.json"`,
      "cache-control": "no-store",
    },
  });
}

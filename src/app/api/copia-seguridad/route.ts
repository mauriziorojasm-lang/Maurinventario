import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { BACKUP_FORMAT, BACKUP_TABLES, BACKUP_VERSION } from "@/lib/backup";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Copia de seguridad manual (solo administradores): todas las tablas de
 * datos del negocio, completas, en un archivo JSON. Si alguna tabla no se
 * puede leer entera, NO se entrega una copia a medias: se avisa del error.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin" || !user.active) return new NextResponse("No autorizado", { status: 403 });
  const supabase = await createClient();
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const t of BACKUP_TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from(t.name)
        .select(t.select ?? "*")
        .order(t.order)
        .range(from, from + 999);
      if (error) {
        return NextResponse.json({ error: `No se ha podido copiar la tabla «${t.name}»: ${error.message}. No se ha generado la copia.` }, { status: 500 });
      }
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    tables[t.name] = rows;
    counts[t.name] = rows.length;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  await supabase.rpc("log_user_event", { p_action: "copia_seguridad", p_summary: `Copia de seguridad descargada (${BACKUP_TABLES.length} tablas, ${total} registros)` });
  const now = new Date();
  const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" }).format(now).replace(/[: ]/g, "-");
  const body = {
    formato: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    generado: now.toISOString(),
    generado_por: user.email,
    nota: "Contiene todos los datos del negocio. No incluye los archivos de fotos y etiquetas (están en el almacén de Supabase) ni la conexión de Gmail.",
    recuentos: counts,
    tablas: tables,
  };
  return new NextResponse(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="copia-maurinventario-${stamp}.json"`,
      "cache-control": "no-store",
    },
  });
}

import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PlatformStats = Record<
  "organizations" | "users" | "trials_active" | "trials_expired" | "active" | "past_due" | "canceled" | "cancel_scheduled" | "comped" | "suspended" | "deletion_requested" | "new_last_30d",
  number
>;
export type PlatformOrg = {
  id: string;
  name: string;
  created_at: string;
  status: string;
  owner_email: string | null;
  members: number;
  subscription_status: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  comped: boolean | null;
  deletion_requested_at: string | null;
};

/** Datos agregados de la plataforma (la base de datos comprueba que eres administrador de la plataforma). */
export async function loadPlatform() {
  const supabase = await createClient();
  const [stats, orgs] = await Promise.all([supabase.rpc("platform_stats"), supabase.rpc("platform_organizations")]);
  return {
    stats: (stats.data ?? {}) as Partial<PlatformStats>,
    orgs: (orgs.data ?? []) as PlatformOrg[],
    error: stats.error || orgs.error ? "No se han podido cargar los datos." : null,
  };
}

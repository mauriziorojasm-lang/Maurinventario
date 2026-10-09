import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const supabase = await createClient();
  let reviews = 0;
  let shipments = 0;
  let emails = 0;
  if (user.role === "admin") {
    const [{ count: r }, { count: s }, { count: e }] = await Promise.all([
      supabase.from("review_items").select("id", { count: "exact", head: true }).eq("status", "pendiente"),
      supabase.from("sales").select("id", { count: "exact", head: true }).eq("status", "activa").eq("shipping_status", "pendiente"),
      supabase.from("email_messages").select("id", { count: "exact", head: true }).eq("status", "revision"),
    ]);
    emails = e ?? 0;
    reviews = r ?? 0;
    shipments = s ?? 0;
  } else if (user.responsibleId) {
    const { count } = await supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("status", "activa")
      .eq("shipping_status", "pendiente")
      .eq("responsible_id", user.responsibleId);
    shipments = count ?? 0;
  }
  return (
    <Shell role={user.role} userLabel={user.fullName ?? user.responsibleName ?? user.email} badges={{ reviews, shipments, emails }}>
      {children}
    </Shell>
  );
}

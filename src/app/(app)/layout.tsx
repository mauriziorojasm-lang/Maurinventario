import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { loadBadges } from "@/lib/badges";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const badges = await loadBadges();
  return (
    <Shell role={user.role} userLabel={user.fullName ?? user.responsibleName ?? user.email} badges={badges}>
      {children}
    </Shell>
  );
}

import { cookies } from "next/headers";
import { AppearanceSync } from "@/components/appearance-sync";
import { OrgSwitcher } from "@/components/org-switcher";
import { Shell } from "@/components/shell";
import { SubscriptionBanner } from "@/components/subscription-banner";
import { requireUser } from "@/lib/auth";
import { loadBadges } from "@/lib/badges";
import { APPEARANCE_COOKIE, appearanceCookieValue } from "@/lib/preferences";
import { loadPrefs } from "@/lib/user-prefs";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Todo a la vez: usuario, contadores del menú y preferencias
  const [user, badges, prefs, jar] = await Promise.all([requireUser(), loadBadges(), loadPrefs(), cookies()]);
  const myOrgs = user.organizations;
  const a = prefs.appearance;
  // Los contadores del menú respetan los avisos activados en Ajustes → Avisos
  const nf = prefs.notifications;
  const shown = {
    shipments: nf.shipments ? badges.shipments : 0,
    detected: nf.detected ? badges.detected : 0,
    emails: nf.emails ? badges.emails : 0,
    listings: nf.listings ? badges.listings : 0,
    reviews: nf.imports ? badges.reviews : 0,
  };
  const wanted = appearanceCookieValue(a);
  return (
    <Shell
      role={user.role}
      userLabel={user.fullName ?? user.responsibleName ?? user.email}
      badges={shown}
      orgName={user.orgName}
      orgSwitcher={myOrgs.length > 1 ? <OrgSwitcher current={user.orgId} orgs={myOrgs} /> : undefined}
      banner={<SubscriptionBanner user={user} />}
      isPlatformAdmin={user.isPlatformAdmin}
    >
      {jar.get(APPEARANCE_COOKIE)?.value !== wanted && (
        <AppearanceSync mode={a.mode} palette={a.palette} reduceMotion={a.reduceMotion} cookieName={APPEARANCE_COOKIE} cookieValue={wanted} />
      )}
      {children}
    </Shell>
  );
}

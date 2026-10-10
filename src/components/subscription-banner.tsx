import Link from "next/link";
import type { CurrentUser } from "@/lib/auth";
import { date, daysUntil } from "@/lib/format";
import { Notice } from "./ui";

/** Aviso del estado de la prueba o la suscripción. Nunca se oculta un problema de acceso. */
export function SubscriptionBanner({ user }: { user: CurrentUser }) {
  const s = user.subscription;
  if (!s || s.comped) return null;
  const admin = user.role === "admin";
  const go = admin ? (
    <Link href="/suscripcion" className="font-semibold">
      Ir a Suscripción
    </Link>
  ) : (
    <>Avisa al administrador de tu espacio.</>
  );
  if (user.orgStatus === "eliminacion_solicitada") {
    const purge = user.deletionRequestedAt ? new Date(new Date(user.deletionRequestedAt).getTime() + 30 * 86400000).toISOString() : null;
    return (
      <Notice tone="bad" className="mb-4" title="Eliminación del espacio solicitada">
        Puedes consultar y exportar tus datos, pero no registrar cambios. {purge ? `Se borrarán definitivamente a partir del ${date(purge)}.` : ""}{" "}
        {admin && (
          <Link href="/suscripcion" className="font-semibold">
            Anular la eliminación
          </Link>
        )}
      </Notice>
    );
  }
  if (!user.hasAccess) {
    const trialOver = s.status === "trialing";
    return (
      <Notice tone="bad" className="mb-4" title={trialOver ? "Tu prueba gratuita ha terminado" : "La suscripción no está activa"}>
        Tus datos están a salvo y puedes consultarlos y exportarlos, pero no registrar cambios hasta {trialOver ? "suscribirte" : "reactivar la suscripción"}. {go}
      </Notice>
    );
  }
  if (s.status === "trialing" && s.trialEndsAt) {
    const days = daysUntil(s.trialEndsAt);
    return (
      <Notice tone="info" className="mb-4">
        Prueba gratuita: {days === 1 ? "queda 1 día" : `quedan ${days} días`} (hasta el {date(s.trialEndsAt)}). Después, 4,99 € al mes si te suscribes; si no, el espacio queda en solo lectura. {admin && go}
      </Notice>
    );
  }
  if (s.status === "past_due") {
    return (
      <Notice tone="warn" className="mb-4" title="No se ha podido cobrar el último pago">
        Se volverá a intentar en los próximos días. Revisa tu método de pago para no perder el acceso. {go}
      </Notice>
    );
  }
  if (s.cancelAtPeriodEnd && s.currentPeriodEnd) {
    return (
      <Notice tone="warn" className="mb-4">
        La suscripción está cancelada y termina el {date(s.currentPeriodEnd)}. Hasta entonces todo funciona con normalidad. {go}
      </Notice>
    );
  }
  return null;
}

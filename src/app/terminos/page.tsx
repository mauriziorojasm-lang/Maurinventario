import type { Metadata } from "next";
import { LegalPage } from "@/components/public-layout";
import { LEGAL, PRICE_LABEL, TRIAL_DAYS } from "@/lib/site";

export const metadata: Metadata = { title: "Términos" };

export default function TermsPage() {
  return (
    <LegalPage title="Términos" updated="12 de octubre de 2026">
      <h2>El servicio</h2>
      <p>
        MaurInventario es una aplicación web de inventario, compras, ventas y envíos, prestada por {LEGAL.name} ({LEGAL.taxId}). Contacto:{" "}
        {LEGAL.email}.
      </p>
      <h2>Prueba y precio</h2>
      <p>
        Cada organización nueva tiene {TRIAL_DAYS} días de prueba gratis sin tarjeta. Después, la suscripción cuesta {PRICE_LABEL} al mes y se
        renueva automáticamente cada mes hasta que la canceles. El pago lo procesa Stripe.
      </p>
      <h2>Cancelación e impagos</h2>
      <ul>
        <li>Puedes cancelar en cualquier momento desde Suscripción; seguirás teniendo acceso hasta el final del periodo pagado.</li>
        <li>Si la prueba termina o la suscripción deja de estar activa, la cuenta pasa a solo lectura: puedes ver y exportar tus datos, pero no crear ni modificar.</li>
        <li>Cancelar no borra tus datos.</li>
      </ul>
      <h2>Tus datos</h2>
      <p>
        Los datos que introduces son tuyos. Puedes exportarlos cuando quieras. Si solicitas eliminar tu organización, se borrará de forma
        definitiva pasados 30 días; durante ese plazo puedes anular la solicitud.
      </p>
      <h2>Uso aceptable</h2>
      <p>No está permitido usar el servicio para actividades ilegales, intentar acceder a datos de otras organizaciones ni sobrecargar el sistema.</p>
      <h2>Responsabilidad</h2>
      <p>
        El servicio se presta con la diligencia razonable, pero no garantizamos que esté libre de interrupciones. Te recomendamos descargar copias de
        seguridad periódicas desde Ajustes.
      </p>
      <h2>Cambios</h2>
      <p>Avisaremos por email de los cambios relevantes en estos términos o en el precio con al menos 30 días de antelación.</p>
    </LegalPage>
  );
}

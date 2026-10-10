import type { Metadata } from "next";
import { LegalPage } from "@/components/public-layout";
import { LEGAL } from "@/lib/site";

export const metadata: Metadata = { title: "Privacidad" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacidad" updated="12 de octubre de 2026">
      <h2>Responsable</h2>
      <p>
        {LEGAL.name} ({LEGAL.taxId}), {LEGAL.address}. Contacto: {LEGAL.email}.
      </p>
      <h2>Qué datos tratamos</h2>
      <ul>
        <li>Cuenta: nombre, email y contraseña (guardada cifrada por el proveedor de autenticación).</li>
        <li>Datos de tu negocio que introduces: productos, compras, ventas, envíos, proveedores y archivos.</li>
        <li>Facturación: la gestiona Stripe. Nosotros no vemos ni guardamos los datos de tu tarjeta.</li>
        <li>Registros técnicos y de auditoría para seguridad (quién hizo qué cambio y cuándo).</li>
      </ul>
      <h2>Para qué y con qué base</h2>
      <ul>
        <li>Prestar el servicio contratado (ejecución del contrato).</li>
        <li>Cobrar la suscripción y cumplir obligaciones fiscales (obligación legal).</li>
        <li>Seguridad y prevención de abusos (interés legítimo).</li>
      </ul>
      <h2>Aislamiento y acceso</h2>
      <p>
        Los datos de cada organización están separados en la base de datos: ningún otro cliente puede verlos. El personal de la plataforma solo ve
        datos agregados (número de cuentas, estado de las suscripciones), no el contenido de tu negocio. No existe acceso oculto a tu cuenta.
      </p>
      <h2>Encargados del tratamiento</h2>
      <ul>
        <li>Supabase (base de datos, autenticación y archivos).</li>
        <li>Vercel (alojamiento de la aplicación).</li>
        <li>Stripe (pagos).</li>
        <li>Proveedor de envío de correos (verificación de email e invitaciones).</li>
        <li>Si conectas tu correo o usas la generación de textos, Google (Gmail y Gemini) para esas funciones.</li>
      </ul>
      <h2>Conservación</h2>
      <p>
        Mientras tengas cuenta. Si cancelas la suscripción tus datos no se borran: puedes exportarlos. Si pides eliminar tu organización, se borra de
        forma definitiva a partir de 30 días después de la solicitud, salvo los datos de facturación que la ley obliga a conservar.
      </p>
      <h2>Tus derechos</h2>
      <p>
        Puedes acceder, rectificar, exportar, limitar u oponerte al tratamiento, y pedir la supresión escribiendo a {LEGAL.email}. También puedes
        reclamar ante la Agencia Española de Protección de Datos (aepd.es).
      </p>
    </LegalPage>
  );
}

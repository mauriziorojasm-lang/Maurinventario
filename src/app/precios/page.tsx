import type { Metadata } from "next";
import { Check } from "lucide-react";
import Link from "next/link";
import { PublicLayout } from "@/components/public-layout";
import { buttonClass } from "@/components/ui";
import { PRICE_LABEL, TRIAL_DAYS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Precios",
  description: `Inventario, ventas, compras y rentabilidad para revendedores. ${TRIAL_DAYS} días gratis, después ${PRICE_LABEL} al mes.`,
};

const FEATURES = [
  "Inventario por lotes: cada unidad sabe de qué pedido vino y cuánto costó",
  "Ventas en Vinted, Wallapop y el resto de plataformas, con beneficio real",
  "Pedidos a proveedores, devoluciones y salidas de stock",
  "Envíos y etiquetas para el equipo de almacén",
  "Equipo con roles: administrador, vendedor y almacén",
  "Informes, exportación a Excel y copias de seguridad",
  "Tus datos separados de los de cualquier otra empresa",
];

export default function PricingPage() {
  return (
    <PublicLayout>
      <section className="bg-chrome px-5 pb-16 pt-10 text-chrome-ink">
        <div className="mx-auto max-w-5xl">
          <p className="display max-w-3xl text-[44px] uppercase leading-[0.95] sm:text-[64px]">
            Controla tu stock y <span className="text-brand-bright">cuánto ganas</span> con cada venta.
          </p>
          <p className="mt-5 max-w-xl text-chrome-ink/75">
            MaurInventario es el inventario para quien compra por lotes y vende en varias plataformas. Sin hojas de cálculo.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/registro" className={buttonClass("primary", "md")}>
              Empezar {TRIAL_DAYS} días gratis
            </Link>
            <Link href="/login" className="inline-flex h-11 items-center rounded-md px-4 text-sm font-semibold text-chrome-ink/85 hover:text-chrome-ink sm:h-10">
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      </section>
      <section className="mx-auto grid max-w-5xl gap-8 px-5 py-14 md:grid-cols-[1fr_360px]">
        <div>
          <h2 className="display text-[32px] uppercase">Todo incluido</h2>
          <ul className="mt-5 space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[var(--radius)] border border-line bg-surface p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">Plan único</p>
          <p className="mt-2 flex items-baseline gap-1">
            <span className="display text-[56px]">{PRICE_LABEL}</span>
            <span className="text-muted">/ mes</span>
          </p>
          <p className="text-sm text-muted">Cancela cuando quieras.</p>
          <ul className="mt-5 space-y-2 text-sm">
            <li>✓ {TRIAL_DAYS} días de prueba gratis, sin tarjeta</li>
            <li>✓ Usuarios del equipo incluidos</li>
            <li>✓ Si cancelas, tus datos no se borran: puedes exportarlos</li>
          </ul>
          <Link href="/registro" className={buttonClass("primary", "md", "mt-6 w-full")}>
            Crear cuenta
          </Link>
        </div>
      </section>
    </PublicLayout>
  );
}

import type { Metadata } from "next";
import { Check, MailCheck, MapPinned, PackageCheck, ChartColumn, Tag, Users } from "lucide-react";
import Link from "next/link";
import { ModulePattern } from "@/components/auth-layout";
import { CarrierIcon, PlatformIcon } from "@/components/marks";
import { PublicLayout } from "@/components/public-layout";
import { buttonClass } from "@/components/ui";
import { PRICE_LABEL, TRIAL_DAYS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Resellap · Inventario y ventas para revendedores",
  description: `Detecta tus ventas de Vinted y Wallapop, controla el stock, los envíos y el beneficio real. ${TRIAL_DAYS} días gratis, después ${PRICE_LABEL} al mes.`,
};

const FLOW = [
  { n: "1", t: "Resellap detecta", d: "Lee los correos de venta de Vinted y Wallapop: producto, comprador, precio, foto y transportista." },
  { n: "2", t: "Te lo propone", d: "Identifica el producto de tu inventario y te dice por qué. Si hay duda, te enseña las opciones." },
  { n: "3", t: "Tú confirmas", d: "Revisas, corriges si hace falta y confirmas. El stock se descuenta del lote correcto." },
  { n: "4", t: "Envías", d: "Pendientes por transportista, con la etiqueta a mano. Marcas «enviado» y empieza el seguimiento." },
  { n: "5", t: "Sabes lo que ganas", d: "Beneficio real por venta, tiempos de entrega por transportista e informes listos para exportar." },
];

const FEATURES = [
  { icon: Tag, t: "Inventario por lotes", d: "Cada unidad sabe de qué compra vino y cuánto costó. Margen y beneficio por producto." },
  { icon: MailCheck, t: "Ventas detectadas", d: "Las ventas llegan solas desde tu Gmail. Nada se registra sin que lo confirmes." },
  { icon: PackageCheck, t: "Pendientes de envío", d: "Separados por transportista, con etiqueta, fecha límite y foto del artículo." },
  { icon: MapPinned, t: "Seguimiento", d: "Estado de cada paquete, historial completo y avisos de retraso o incidencia." },
  { icon: ChartColumn, t: "Informes", d: "Ventas, inventario, compras, responsables y envíos. A Excel o CSV en un clic." },
  { icon: Users, t: "Equipo", d: "Administrador, vendedor y almacén, con permisos persona a persona." },
];

export default function PricingPage() {
  return (
    <PublicLayout>
      {/* Portada */}
      <section className="relative overflow-hidden bg-[#0B0F0E] px-5 pb-16 pt-12 text-[#F4F6F5] sm:pb-20 sm:pt-16">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="animate-rise">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6FDCA6]">Para quien revende en Vinted, Wallapop y más</p>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-[40px] font-semibold leading-[1.02] tracking-[-0.035em] text-white sm:text-[60px]">
              Sabes lo que tienes, lo que te costó <span className="text-[#36C784]">y lo que ganas.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-[#B4BDB9]">
              Resellap detecta tus ventas en el correo, te propone el producto y el transportista, y sigue cada envío hasta que llega. Sin hojas de cálculo.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/registro" className={buttonClass("primary", "md", "h-12 px-5 text-[15px] sm:h-11")}>
                Empezar {TRIAL_DAYS} días gratis
              </Link>
              <Link href="/login" className="inline-flex h-12 items-center rounded-[10px] border border-[#343C39] px-5 text-[15px] font-semibold text-[#F4F6F5] hover:bg-[#151A18] sm:h-11">
                Ya tengo cuenta
              </Link>
            </div>
            <p className="mt-4 text-[13px] text-[#8A9590]">Sin tarjeta. Después, {PRICE_LABEL} al mes. Cancela cuando quieras.</p>
          </div>

          {/* Vista de ejemplo de la app */}
          <div aria-label="Ejemplo de una venta detectada" className="relative">
            <ModulePattern className="pointer-events-none absolute -right-16 -top-10 w-[520px] max-w-none opacity-30" />
            <div className="relative rounded-[20px] border border-[#222927] bg-[#151A18] p-4 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.8)] sm:p-5" style={{ ["--ink" as string]: "#F4F6F5" }}>
              <div className="flex items-center gap-2 text-[12.5px] text-[#B4BDB9]">
                <PlatformIcon name="Vinted" size={18} />
                <span className="ml-1 rounded-full bg-[#052419] px-2 py-0.5 text-[11.5px] font-semibold text-[#6FDCA6]">Nueva venta detectada</span>
                <span className="ml-auto">ejemplo</span>
              </div>
              <div className="mt-4 flex items-start gap-3">
                <span aria-hidden className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[12px] bg-[#222927]">
                  <svg viewBox="0 0 64 32" width="44" height="22">
                    <rect x="2" y="6" width="24" height="18" rx="9" fill="#343C39" />
                    <rect x="38" y="6" width="24" height="18" rx="9" fill="#343C39" />
                    <rect x="24" y="12" width="16" height="3" rx="1.5" fill="#4B5551" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-semibold text-white">Gafas de sol de ejemplo</p>
                  <p className="text-[13px] text-[#8A9590]">Comprador: lucia_88 · hoy</p>
                </div>
                <p className="num text-[22px] font-semibold text-white">45,00 €</p>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-[#222927] bg-[#222927] text-[13px]">
                <div className="bg-[#151A18] px-3 py-2.5">
                  <dt className="text-[#8A9590]">Producto</dt>
                  <dd className="mt-0.5 font-medium text-white">Identificado · 96 %</dd>
                </div>
                <div className="bg-[#151A18] px-3 py-2.5">
                  <dt className="text-[#8A9590]">Transportista</dt>
                  <dd className="mt-0.5 font-medium text-white">
                    <CarrierIcon name="InPost" size={16} />
                  </dd>
                </div>
                <div className="bg-[#151A18] px-3 py-2.5">
                  <dt className="text-[#8A9590]">Coste del lote</dt>
                  <dd className="num mt-0.5 font-medium text-white">12,00 €</dd>
                </div>
                <div className="bg-[#151A18] px-3 py-2.5">
                  <dt className="text-[#8A9590]">Beneficio</dt>
                  <dd className="num mt-0.5 font-semibold text-[#6FDCA6]">+31,80 €</dd>
                </div>
              </dl>
              <div className="mt-4 flex gap-2">
                <span className="flex h-10 flex-1 items-center justify-center rounded-[10px] bg-[#36C784] text-[14px] font-semibold text-[#0B0F0E]">Confirmar venta</span>
                <span className="flex h-10 items-center justify-center rounded-[10px] border border-[#343C39] px-3 text-[13.5px] text-[#D5DBD8]">Ya estaba apuntada</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-ink">Cómo funciona</p>
        <h2 className="display mt-3 max-w-2xl text-[32px] sm:text-[40px]">Resellap hace el trabajo. Tú solo revisas.</h2>
        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {FLOW.map((f) => (
            <li key={f.n} className="rounded-[var(--radius-md)] border border-line bg-surface p-5">
              <span className="num flex h-8 w-8 items-center justify-center rounded-[8px] bg-ink text-[14px] font-semibold text-paper">{f.n}</span>
              <p className="mt-4 text-[16px] font-semibold">{f.t}</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{f.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Funciones + precio */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            <h2 className="display text-[30px] sm:text-[36px]">Todo incluido</h2>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <li key={f.t} className="flex gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-line bg-paper">
                    <f.icon size={20} strokeWidth={1.75} className="text-brand" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-semibold">{f.t}</span>
                    <span className="mt-0.5 block text-[14px] leading-relaxed text-muted">{f.d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="h-fit rounded-[var(--radius-lg)] border border-line bg-paper p-6 sm:p-7">
            <p className="text-[13px] font-medium text-muted">Plan único</p>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span className="num font-[family-name:var(--font-display)] text-[52px] font-semibold leading-none tracking-[-0.03em]">{PRICE_LABEL}</span>
              <span className="text-muted">/ mes</span>
            </p>
            <p className="mt-1 text-sm text-muted">Sin permanencia. Cancela cuando quieras.</p>
            <ul className="mt-6 space-y-2.5 text-[14.5px]">
              {[`${TRIAL_DAYS} días de prueba gratis, sin tarjeta`, "Usuarios del equipo incluidos", "Si cancelas, tus datos no se borran: puedes exportarlos", "Tus datos separados de los de cualquier otra empresa"].map((x) => (
                <li key={x} className="flex gap-2.5">
                  <Check size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-brand" aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
            <Link href="/registro" className={buttonClass("primary", "md", "mt-7 h-12 w-full text-[15px] sm:h-11")}>
              Crear cuenta gratis
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

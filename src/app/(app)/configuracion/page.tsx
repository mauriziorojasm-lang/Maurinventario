import type { Metadata } from "next";
import Link from "next/link";
import { Bell, ChevronRight, DatabaseBackup, History, LayoutDashboard, List, Palette, Receipt, ShieldCheck, Table2, type LucideIcon } from "lucide-react";
import { PageHeader, Panel, clsx } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { can, type Perm } from "@/lib/permissions";
import { ResetAllButton } from "./reset-all";

export const metadata: Metadata = { title: "Ajustes" };

type Item = { href: string; title: string; text: string; icon: LucideIcon; admin?: boolean; perm?: Perm };
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Personalización",
    items: [
      { href: "/configuracion/panel", title: "Personalizar panel", text: "Widgets del inicio, tamaño, orden y periodo de análisis.", icon: LayoutDashboard, perm: "costes" },
      { href: "/configuracion/aspecto", title: "Personalizar aspecto", text: "Claro u oscuro, tema de color y animaciones.", icon: Palette },
      { href: "/configuracion/tablas", title: "Tablas", text: "Columnas, orden y filas por página de ventas y productos.", icon: Table2, perm: "costes" },
      { href: "/configuracion/ventas", title: "Ventas e inventario", text: "Plataforma predeterminada al registrar una venta.", icon: Receipt },
      { href: "/configuracion/avisos", title: "Avisos", text: "Qué tareas y contadores quieres ver.", icon: Bell },
    ],
  },
  {
    label: "Cuenta y datos",
    items: [
      { href: "/configuracion/seguridad", title: "Seguridad y privacidad", text: "Contraseña, sesiones, tus datos y privacidad.", icon: ShieldCheck },
      { href: "/configuracion/copias", title: "Copias de seguridad", text: "Descargar una copia completa de los datos y comprobarla.", icon: DatabaseBackup, admin: true },
      { href: "/configuracion/actividad", title: "Historial de actividad", text: "Tus exportaciones, copias y cambios de ajustes.", icon: History },
      { href: "/ajustes", title: "Listas", text: "Plataformas, transportistas, móviles, categorías y marcas.", icon: List, perm: "configuracion" },
    ],
  },
];

export default async function SettingsHub() {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  return (
    <>
      <PageHeader title="Ajustes" description="Tus preferencias se guardan en tu usuario: las verás igual en el iPhone, el iPad y el ordenador, y no cambian las de nadie más." />
      <div className="flex flex-col gap-6">
        {GROUPS.map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h2 className="mb-2 px-1 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted">{g.label}</h2>
            <ul className="grid gap-2.5 md:grid-cols-2">
              {g.items
                .filter((i) => (!i.admin || isAdmin) && (!i.perm || can(user, i.perm)))
                .map((i) => (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      className="press flex min-h-16 items-center gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-3.5 shadow-[var(--shadow-card)] hover:border-ink/30"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-brand-soft text-brand-ink">
                        <i.icon size={20} strokeWidth={2.25} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold">{i.title}</span>
                        <span className="block text-[13px] text-muted">{i.text}</span>
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-faint" />
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Formato regional" description="La app trabaja con un único formato; por eso no se puede cambiar aquí.">
            <dl className={clsx("grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm")}>
              <dt className="text-muted">Idioma</dt>
              <dd>Español (es la única traducción disponible)</dd>
              <dt className="text-muted">Moneda</dt>
              <dd>Euro (€). Los importes no se convierten a otras monedas.</dd>
              <dt className="text-muted">Fechas</dt>
              <dd>dd/mm/aaaa</dd>
              <dt className="text-muted">Números</dt>
              <dd>1.234,56</dd>
              <dt className="text-muted">Zona horaria</dt>
              <dd>Hora de Madrid (Europa/Madrid)</dd>
            </dl>
          </Panel>
          <Panel title="Restablecer ajustes" description="Vuelve a la configuración inicial: panel, aspecto, tablas, avisos y preferencias.">
            <p className="mb-3 text-sm text-ink-soft">Solo afecta a tus ajustes. No borra ventas, productos, inventario ni ningún otro dato.</p>
            <ResetAllButton />
          </Panel>
        </div>
      </div>
    </>
  );
}

/**
 * Inicio: «Tareas» pendientes y accesos rápidos. Mismos contadores que el
 * menú (una sola consulta). El vendedor solo ve lo suyo.
 */
import { CheckCheck, ChevronRight, CirclePlus, Mail, MailCheck, Megaphone, PackageMinus, PackageSearch, ShoppingCart, Truck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { clsx } from "@/components/ui";
import type { Badges } from "@/lib/badges";
import type { Prefs } from "@/lib/preferences";

type Task = { href: string; label: string; done: string; n: number; icon: LucideIcon; strong?: boolean };

export function HomeTasks({ badges, admin, notify, lowStock }: { badges: Badges; admin: boolean; notify: Prefs["notifications"]; lowStock: number }) {
  // Cada aviso se puede desactivar en Ajustes → Avisos
  const all: (Task & { on: boolean })[] = admin
    ? [
        { href: "/detectadas", label: "Ventas por confirmar", done: "Sin ventas por confirmar", n: badges.detected, icon: MailCheck, strong: true, on: notify.detected },
        { href: "/envios", label: "Envíos pendientes", done: "Todo enviado", n: badges.shipments, icon: Truck, strong: true, on: notify.shipments },
        { href: "/anuncios?ver=por-retirar", label: "Anuncios por quitar", done: "Ningún anuncio por quitar", n: badges.listings, icon: Megaphone, on: notify.listings },
        { href: "/correos", label: "Correos a revisar", done: "Correos al día", n: badges.emails, icon: Mail, on: notify.emails },
      ]
    : [{ href: "/envios", label: "Envíos pendientes", done: "Todo enviado", n: badges.shipments, icon: Truck, strong: true, on: notify.shipments }];
  if (admin && notify.lowStock) {
    all.push({ href: `/productos?bajo=${notify.lowStockThreshold}`, label: `Stock bajo (≤ ${notify.lowStockThreshold} uds.)`, done: "Sin stock bajo", n: lowStock, icon: PackageMinus, on: true });
  }
  if (admin && notify.imports && badges.reviews > 0) {
    all.push({ href: "/revision", label: "Pendientes de revisar (importación)", done: "", n: badges.reviews, icon: CheckCheck, on: true });
  }
  const tasks: Task[] = all.filter((t) => t.on);
  if (!tasks.length) return null;
  const pending = tasks.filter((t) => t.n > 0);

  return (
    <section aria-labelledby="tareas" className="flex flex-col gap-2.5">
      <h2 id="tareas" className="display text-[22px] uppercase">
        Tareas {pending.length > 0 && <span className="num text-brand">· {pending.reduce((a, t) => a + t.n, 0)}</span>}
      </h2>
      {pending.length === 0 ? (
        <p className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3.5 text-sm font-semibold shadow-[var(--shadow-card)]">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-good-soft text-good-ink">
            <CheckCheck size={18} strokeWidth={2.5} />
          </span>
          Todo al día
        </p>
      ) : (
        <ul className="stagger grid gap-2.5 sm:grid-cols-2">
          {tasks.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className={clsx(
                  "press flex min-h-14 items-center gap-3 rounded-[var(--radius-md)] border p-3 shadow-[var(--shadow-card)]",
                  t.n > 0 && t.strong ? "border-brand/40 bg-brand-soft hover:border-brand" : "border-line bg-surface hover:border-ink/30",
                  t.n === 0 && "opacity-70",
                )}
              >
                <span
                  className={clsx(
                    "display num flex h-10 min-w-10 items-center justify-center rounded-[12px] px-2 text-[21px]",
                    t.n === 0 ? "bg-ink/6 text-muted" : t.strong ? "bg-brand text-on-brand" : "bg-tag text-tag-ink",
                  )}
                >
                  {t.n === 0 ? <t.icon size={18} strokeWidth={2.25} /> : t.n}
                </span>
                <span className="min-w-0 flex-1 text-[15px] font-semibold leading-tight">{t.n === 0 ? <span className="text-muted">{t.done}</span> : t.label}</span>
                <ChevronRight size={20} className="shrink-0 text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function QuickActions({ admin, warehouse = false }: { admin: boolean; warehouse?: boolean }) {
  const items = [
    ...(warehouse
      ? [{ href: "/envios", label: "Preparar envíos", icon: Truck, main: true }]
      : [{ href: "/ventas/nueva", label: "Nueva venta", icon: CirclePlus, main: true }]),
    ...(admin ? [{ href: "/anuncios", label: "Preparar anuncio", icon: Megaphone, main: false }] : []),
    { href: "/productos?only_in_stock=true", label: "Buscar stock", icon: PackageSearch, main: false },
    ...(admin ? [{ href: "/compras/nuevo", label: "Registrar compra", icon: ShoppingCart, main: false }] : []),
  ];
  return (
    <nav aria-label="Accesos rápidos" className={clsx("grid gap-2.5", admin ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2")}>
      {items.map((q) => (
        <Link
          key={q.href}
          href={q.href}
          className={clsx(
            "press flex min-h-12 items-center gap-2.5 rounded-[var(--radius-md)] border px-3.5 py-3 text-[15px] font-semibold shadow-[var(--shadow-card)]",
            q.main ? "border-brand bg-brand text-on-brand hover:bg-brand-strong" : "border-line bg-surface hover:border-ink/30",
          )}
        >
          <q.icon size={20} strokeWidth={2.25} className={q.main ? undefined : "text-brand"} />
          {q.label}
        </Link>
      ))}
    </nav>
  );
}

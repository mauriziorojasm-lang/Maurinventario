"use client";
import { Bell, LayoutGrid, LogOut, Plus, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Logo } from "./brand";
import { IconEnvios, IconInicio, IconVentas, type RsIcon } from "./rs-icons";
import { RememberList, forgetAllLists, useRememberedHref } from "./list-memory";
import { NAV, type BadgeKey, type NavItem } from "./nav";
import { NavProgress } from "./nav-progress";
import { clsx } from "./ui";

export { Logo };

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/ventas") return pathname === "/ventas" || (pathname.startsWith("/ventas/") && !pathname.startsWith("/ventas/nueva"));
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Enlace del menú. El de la sección en la que estás vuelve a la lista con
 * tus filtros; el de cualquier otra sección los olvida todos.
 */
function NavLink({ href, active, onClick, ...props }: Omit<React.ComponentProps<typeof Link>, "href"> & { href: string; active: boolean }) {
  const remembered = useRememberedHref(href);
  return (
    <Link
      {...props}
      href={active ? remembered : href}
      aria-current={active ? "page" : undefined}
      onClick={(e) => {
        if (!active) forgetAllLists();
        onClick?.(e);
      }}
    />
  );
}

/** Contador: verde para lo que espera una acción tuya, rojo para alertas, neutro para lo demás. */
function Counter({ n, k }: { n: number; k?: BadgeKey }) {
  if (n <= 0) return null;
  const tone = k === "alerts" ? "bg-danger text-white" : k === "shipments" || k === "detected" ? "bg-brand text-on-brand" : "bg-subtle text-ink-soft";
  return <span className={clsx("num inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11.5px] font-semibold", tone)}>{n}</span>;
}

const ROLE_LABEL = { admin: "Administrador", vendedor: "Vendedor", almacen: "Almacén" } as const;
type Badges = Record<BadgeKey, number>;

export function Shell({
  children,
  role,
  userLabel,
  badges,
  orgName,
  orgSwitcher,
  banner,
  permissions = [],
}: {
  children: ReactNode;
  role: "admin" | "vendedor" | "almacen";
  userLabel: string;
  badges: Badges;
  orgName: string;
  /** Selector de espacio (solo si el usuario pertenece a varios). */
  orgSwitcher?: ReactNode;
  /** Aviso fijo (prueba, pago pendiente, suscripción inactiva…). */
  banner?: ReactNode;
  /** Permisos efectivos (qué apartados ve). */
  permissions?: string[];
}) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const visible = (i: NavItem) => (!i.adminOnly || role === "admin") && (!i.perm || role === "admin" || permissions.includes(i.perm));
  const canSell = role === "admin" || permissions.includes("ventas_crear");
  const badgeOf = (i: NavItem) => (i.badgeKey ? badges[i.badgeKey] : 0);

  // Cerrar la hoja «Más» al cambiar de página
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMore(false);
  }
  // Hoja «Más»: <dialog> nativo (Escape, foco y fondo los gestiona el navegador)
  const sheet = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = sheet.current;
    if (!d) return;
    if (more && !d.open) d.showModal();
    if (!more && d.open) d.close();
  }, [more]);

  const initials = userLabel
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  const account = (
    <div className="flex items-center gap-2">
      <Link href="/cuenta" className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] p-1 hover:bg-subtle/70">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle text-[13px] font-semibold text-ink-soft">
          {initials || "·"}
        </span>
        <span className="min-w-0 flex-1 text-[13px] leading-tight">
          <span className="block truncate font-semibold text-ink">{userLabel}</span>
          <span className="block truncate text-faint">{ROLE_LABEL[role]} · Mi cuenta</span>
        </span>
      </Link>
      <form action="/auth/salir" method="post">
        <button
          className="press flex h-10 w-10 items-center justify-center rounded-[10px] text-faint hover:bg-subtle hover:text-ink"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <LogOut size={17} strokeWidth={1.75} />
        </button>
      </form>
    </div>
  );

  const itemClass = (active: boolean) =>
    clsx(
      "press group flex min-h-10 items-center gap-3 rounded-[10px] px-3 text-[14px] font-medium",
      active ? "bg-subtle text-ink" : "text-muted hover:bg-subtle/70 hover:text-ink",
    );

  const renderGroup = (items: NavItem[]) => (
    <ul className="flex flex-col gap-0.5">
      {items.map((it) => {
        const active = isActive(pathname, it.href);
        const Icon = it.icon;
        return (
          <li key={it.href}>
            <NavLink href={it.href} active={active} className={itemClass(active)}>
              <Icon size={19} strokeWidth={1.75} className={active ? "text-brand" : "text-faint group-hover:text-ink"} />
              <span className="flex-1 truncate">{it.label}</span>
              <Counter n={badgeOf(it)} k={it.badgeKey} />
            </NavLink>
          </li>
        );
      })}
    </ul>
  );

  // ---------------- Barra lateral (ordenador e iPad en horizontal) ----------------
  const sideGroups = NAV.filter((g) => !g.footer);
  const settingsItems = (NAV.find((g) => g.footer)?.items ?? []).filter(visible).filter((i) => i.href !== "/cuenta");
  const sidebar = (
    <nav aria-label="Principal" className="flex flex-col gap-5 px-3 pb-4">
      {sideGroups.map((g, gi) => {
        const items = g.items.filter(visible).filter((i) => i.href !== "/ventas/nueva");
        if (!items.length) return null;
        return (
          <div key={gi}>
            {g.label && <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{g.label}</p>}
            {renderGroup(items)}
          </div>
        );
      })}
    </nav>
  );

  // ---------------- Barra inferior (móvil y iPad en vertical) ----------------
  const tabs: { href: string; label: string; icon: RsIcon; badge?: number }[] = [
    { href: "/", label: "Inicio", icon: IconInicio },
    { href: "/ventas", label: "Ventas", icon: IconVentas },
    { href: "/envios", label: "Envíos", icon: IconEnvios, badge: badges.shipments },
  ];
  const inTabs = isActive(pathname, "/") || isActive(pathname, "/ventas") || isActive(pathname, "/envios") || pathname.startsWith("/ventas/nueva");
  const tabClass = (active: boolean) =>
    clsx("press relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active ? "text-ink" : "text-faint");
  const pendingMore = badges.reviews + badges.emails + badges.detected + badges.listings + badges.alerts;

  const tabBar = (
    <nav
      aria-label="Accesos rápidos"
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden no-print"
    >
      <ul className="mx-auto flex max-w-xl items-end px-1">
        {tabs.slice(0, 2).map((t) => {
          const active = isActive(pathname, t.href);
          return (
            <li key={t.href} className="flex flex-1">
              <NavLink href={t.href} active={active} className={tabClass(active)}>
                <t.icon size={23} strokeWidth={1.75} className={active ? "text-brand" : undefined} />
                {t.label}
              </NavLink>
            </li>
          );
        })}
        {canSell && (
          <li className="flex flex-1 justify-center">
            <NavLink
              href="/ventas/nueva"
              active={pathname.startsWith("/ventas/nueva")}
              aria-label="Nueva venta"
              className="press -mt-4 mb-1 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-brand text-on-brand shadow-[0_0_0_4px_var(--surface)]"
            >
              <Plus size={26} strokeWidth={2} />
            </NavLink>
          </li>
        )}
        {tabs.slice(2).map((t) => {
          const active = isActive(pathname, t.href);
          return (
            <li key={t.href} className="flex flex-1">
              <NavLink href={t.href} active={active} className={tabClass(active)}>
                <span className="relative">
                  <t.icon size={23} strokeWidth={1.75} className={active ? "text-brand" : undefined} />
                  {!!t.badge && (
                    <span className="num absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-brand px-1 text-center text-[10.5px] font-semibold leading-[18px] text-on-brand ring-2 ring-surface">
                      {t.badge}
                    </span>
                  )}
                </span>
                {t.label}
              </NavLink>
            </li>
          );
        })}
        <li className="flex flex-1">
          <button type="button" onClick={() => setMore(true)} className={tabClass(!inTabs || more)} aria-expanded={more} aria-controls="menu-mas">
            <span className="relative">
              <LayoutGrid size={23} strokeWidth={1.75} className={!inTabs || more ? "text-brand" : undefined} />
              {pendingMore > 0 && <span className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-surface" />}
            </span>
            Más
          </button>
        </li>
      </ul>
    </nav>
  );

  const moreSheet = (
    <dialog
      ref={sheet}
      id="menu-mas"
      aria-label="Menú"
      onClose={() => setMore(false)}
      onClick={(e) => e.target === e.currentTarget && setMore(false)}
      className="mi-sheet max-h-[88dvh] overflow-hidden rounded-t-[var(--radius-lg)] bg-surface p-0 text-ink lg:hidden"
    >
      <div className="safe-bottom max-h-[88dvh] overflow-y-auto px-4 pt-3">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden />
        <div className="mb-4 flex items-center justify-between">
          <Logo size={24} />
          <button
            type="button"
            onClick={() => setMore(false)}
            className="press flex h-10 w-10 items-center justify-center rounded-full bg-subtle"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>
        <div className="flex flex-col gap-5 pb-4">
          {NAV.map((g, gi) => {
            const items = g.items.filter(visible).filter((i) => !["/", "/ventas", "/envios", "/ventas/nueva"].includes(i.href));
            if (!items.length) return null;
            return (
              <section key={gi}>
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{g.label ?? "Día a día"}</p>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {items.map((it) => {
                    const active = isActive(pathname, it.href);
                    const n = badgeOf(it);
                    return (
                      <li key={it.href}>
                        <NavLink
                          href={it.href}
                          active={active}
                          className={clsx(
                            "press relative flex h-full min-h-[84px] flex-col items-start justify-between gap-2 rounded-[14px] border p-3 text-[12.5px] font-medium leading-tight",
                            active ? "border-ink bg-subtle text-ink" : "border-line bg-surface text-ink-soft",
                          )}
                        >
                          <it.icon size={21} strokeWidth={1.75} className={active ? "text-brand" : "text-faint"} />
                          <span>{it.label}</span>
                          {n > 0 && (
                            <span className="absolute right-2 top-2">
                              <Counter n={n} k={it.badgeKey} />
                            </span>
                          )}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {orgSwitcher && <div className="rounded-[14px] border border-line p-3">{orgSwitcher}</div>}
          <div className="rounded-[14px] border border-line p-2">{account}</div>
        </div>
      </div>
    </dialog>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)] 2xl:grid-cols-[264px_minmax(0,1fr)]">
      <Suspense fallback={null}>
        <NavProgress />
      </Suspense>
      {/* Barra lateral (ordenador e iPad en horizontal) */}
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-hidden border-r border-line bg-surface lg:flex no-print">
        <div className="shrink-0">
          <Link href="/" className="block px-6 pb-4 pt-8" aria-label="Resellap, inicio">
            <Logo size={26} />
          </Link>
          <div className="px-3 pb-3">{orgSwitcher ?? <p className="truncate px-3 text-[12.5px] font-medium text-faint">{orgName}</p>}</div>
          {canSell && (
            <div className="px-3 pb-5">
              <NavLink
                href="/ventas/nueva"
                active={pathname.startsWith("/ventas/nueva")}
                className="press flex h-10 items-center justify-center gap-2 rounded-[10px] bg-brand text-[14px] font-semibold text-on-brand hover:bg-brand-strong"
              >
                <Plus size={18} strokeWidth={2} />
                Nueva venta
              </NavLink>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-1">{sidebar}</div>
        <div className="flex shrink-0 flex-col gap-1 border-t border-line bg-surface px-3 py-3">
          {settingsItems.length > 0 && (
            <details className="group/cfg" open={settingsItems.some((i) => isActive(pathname, i.href)) || undefined}>
              <summary className={clsx(itemClass(false), "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
                <Settings size={19} strokeWidth={1.75} className="text-faint" />
                <span className="flex-1">Configuración</span>
                <span aria-hidden className="text-faint transition-transform group-open/cfg:rotate-90">
                  ›
                </span>
              </summary>
              <div className="pb-1 pl-2 pt-0.5">{renderGroup(settingsItems)}</div>
            </details>
          )}
          <div className="pt-1">{account}</div>
        </div>
      </aside>

      {/* Barra superior (móvil y iPad en vertical) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-md lg:hidden no-print">
        <Link href="/" aria-label="Resellap, inicio" className="flex min-h-10 items-center">
          <Logo size={22} />
        </Link>
        <div className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 truncate text-[12.5px] font-medium text-faint">{orgName}</span>
          {badges.alerts > 0 && (
            <Link
              href="/seguimiento?vista=alertas"
              className="press relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-subtle"
              aria-label={`${badges.alerts} ${badges.alerts === 1 ? "alerta" : "alertas"} de envíos`}
            >
              <Bell size={20} strokeWidth={1.75} />
              <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-surface" />
            </Link>
          )}
        </div>
      </header>
      {moreSheet}

      <Suspense fallback={null}>
        <RememberList />
      </Suspense>

      <main className="min-w-0 px-4 pb-32 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-12 lg:pt-8 2xl:px-10">
        <div className="mx-auto w-full max-w-[1440px]">
          {banner}
          {children}
        </div>
      </main>

      {tabBar}
    </div>
  );
}

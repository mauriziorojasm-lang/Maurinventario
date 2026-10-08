"use client";
import { House, LayoutGrid, LogOut, Plus, Receipt, Truck, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { RememberList, forgetAllLists, useRememberedHref } from "./list-memory";
import { NAV, type NavItem } from "./nav";
import { clsx } from "./ui";

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

/** Logo: cuadro «MI» + Maur (naranja) Inventario. */
export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={clsx("flex items-center gap-2.5", className)}>
      <span className="display flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-brand text-[19px] text-on-brand shadow-[0_0_0_2px_var(--chrome),0_0_0_3px_rgb(255_255_255/0.12)]">
        MI
      </span>
      {!compact && (
        <span className="display text-[23px] uppercase tracking-[0.02em] text-chrome-ink">
          <span className="text-brand">Maur</span>Inventario
        </span>
      )}
    </span>
  );
}

function Counter({ n, tone }: { n: number; tone: "brand" | "tag" }) {
  if (n <= 0) return null;
  return (
    <span
      className={clsx(
        "num inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11.5px] font-bold leading-5",
        tone === "brand" ? "bg-brand text-on-brand" : "bg-tag text-tag-ink",
      )}
    >
      {n}
    </span>
  );
}

export function Shell({
  children,
  role,
  userLabel,
  badges,
}: {
  children: ReactNode;
  role: "admin" | "vendedor";
  userLabel: string;
  badges: { reviews: number; shipments: number };
}) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const visible = (i: NavItem) => !i.adminOnly || role === "admin";
  const badgeOf = (i: NavItem) => (i.badgeKey ? badges[i.badgeKey] : 0);

  // Cerrar la hoja «Más» al cambiar de página
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMore(false);
  }
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMore(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [more]);

  const account = (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chrome-2 text-chrome-ink/80">
        <UserRound size={18} strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1 text-[13px]">
        <p className="truncate font-semibold text-chrome-ink">{userLabel}</p>
        <p className="text-chrome-ink/55">
          {role === "admin" ? "Administrador" : "Vendedor"} ·{" "}
          <Link href="/cuenta" className="underline-offset-2 hover:text-chrome-ink hover:underline">
            Mi cuenta
          </Link>
        </p>
      </div>
      <form action="/auth/salir" method="post">
        <button
          className="press flex h-9 w-9 items-center justify-center rounded-full text-chrome-ink/60 hover:bg-chrome-2 hover:text-chrome-ink"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <LogOut size={17} strokeWidth={2.25} />
        </button>
      </form>
    </div>
  );

  // ---------------- Barra lateral (ordenador) ----------------
  const sidebar = (
    <nav aria-label="Principal" className="flex flex-col gap-5 px-3 pb-6">
      {NAV.map((g, gi) => {
        const items = g.items.filter(visible).filter((i) => i.href !== "/ventas/nueva");
        if (!items.length) return null;
        return (
          <div key={gi}>
            {g.label && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-chrome-ink/40">{g.label}</p>}
            <ul className="flex flex-col gap-0.5">
              {items.map((it) => {
                const active = isActive(pathname, it.href);
                const Icon = it.icon;
                return (
                  <li key={it.href}>
                    <NavLink
                      href={it.href}
                      active={active}
                      className={clsx(
                        "press group relative flex items-center gap-3 rounded-[10px] px-3 py-2 text-[14px]",
                        active ? "bg-chrome-2 font-semibold text-chrome-ink" : "text-chrome-ink/70 hover:bg-chrome-2/70 hover:text-chrome-ink",
                      )}
                    >
                      <span
                        aria-hidden
                        className={clsx(
                          "absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand transition-transform duration-200",
                          active ? "scale-y-100" : "scale-y-0",
                        )}
                      />
                      <Icon size={18} strokeWidth={2.25} className={active ? "text-brand" : "text-chrome-ink/55 group-hover:text-chrome-ink/90"} />
                      <span className="flex-1">{it.label}</span>
                      <Counter n={badgeOf(it)} tone={it.badgeKey === "reviews" ? "tag" : "brand"} />
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  // ---------------- Barra inferior (móvil y iPad) ----------------
  const shipments = badges.shipments;
  const tabs: { href: string; label: string; icon: typeof House; badge?: number }[] = [
    { href: "/", label: "Inicio", icon: House },
    { href: "/ventas", label: "Ventas", icon: Receipt },
    { href: "/envios", label: "Envíos", icon: Truck, badge: shipments },
  ];
  const inTabs = isActive(pathname, "/") || isActive(pathname, "/ventas") || isActive(pathname, "/envios") || pathname.startsWith("/ventas/nueva");
  const tabClass = (active: boolean) =>
    clsx("press relative flex flex-1 flex-col items-center gap-0.5 pt-2 text-[11px] font-semibold", active ? "text-brand" : "text-chrome-ink/60");

  const tabBar = (
    <nav
      aria-label="Accesos rápidos"
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-white/8 bg-chrome/95 backdrop-blur-md lg:hidden no-print"
    >
      <ul className="mx-auto flex max-w-xl items-end">
        {tabs.slice(0, 2).map((t) => {
          const active = isActive(pathname, t.href);
          return (
            <li key={t.href} className="flex flex-1">
              <NavLink href={t.href} active={active} className={tabClass(active)}>
                <t.icon size={23} strokeWidth={2.25} />
                {t.label}
              </NavLink>
            </li>
          );
        })}
        <li className="flex flex-1 justify-center">
          <NavLink
            href="/ventas/nueva"
            active={pathname.startsWith("/ventas/nueva")}
            aria-label="Nueva venta"
            className="press -mt-5 flex h-[58px] w-[58px] items-center justify-center rounded-full bg-brand text-on-brand shadow-[0_10px_24px_-8px_var(--brand),0_0_0_5px_var(--chrome)]"
          >
            <Plus size={30} strokeWidth={2.75} />
          </NavLink>
        </li>
        {tabs.slice(2).map((t) => {
          const active = isActive(pathname, t.href);
          return (
            <li key={t.href} className="flex flex-1">
              <NavLink href={t.href} active={active} className={tabClass(active)}>
                <span className="relative">
                  <t.icon size={23} strokeWidth={2.25} />
                  {!!t.badge && (
                    <span className="num absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-brand px-1 text-center text-[10.5px] font-bold leading-[18px] text-on-brand ring-2 ring-chrome">
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
              <LayoutGrid size={23} strokeWidth={2.25} />
              {badges.reviews > 0 && role === "admin" && <span className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-tag ring-2 ring-chrome" />}
            </span>
            Más
          </button>
        </li>
      </ul>
    </nav>
  );

  const moreSheet = more && (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú" id="menu-mas">
      <button className="absolute inset-0 animate-fade bg-black/55" aria-label="Cerrar menú" onClick={() => setMore(false)} />
      <div className="safe-bottom absolute inset-x-0 bottom-0 max-h-[88dvh] animate-sheet overflow-y-auto rounded-t-[var(--radius-lg)] bg-chrome px-4 pt-3 text-chrome-ink">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />
        <div className="mb-4 flex items-center justify-between">
          <Logo />
          <button
            type="button"
            onClick={() => setMore(false)}
            className="press flex h-10 w-10 items-center justify-center rounded-full bg-chrome-2"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>
        <div className="flex flex-col gap-5 pb-4">
          {NAV.map((g, gi) => {
            const items = g.items.filter(visible).filter((i) => !["/", "/ventas", "/envios", "/ventas/nueva"].includes(i.href));
            if (!items.length) return null;
            return (
              <section key={gi}>
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-chrome-ink/40">{g.label ?? "General"}</p>
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
                            "press relative flex h-full min-h-[86px] flex-col items-start justify-between gap-2 rounded-[14px] p-3 text-[12.5px] font-semibold leading-tight",
                            active ? "bg-brand text-on-brand" : "bg-chrome-2 text-chrome-ink/90",
                          )}
                        >
                          <it.icon size={22} strokeWidth={2.25} className={active ? "" : "text-brand"} />
                          <span>{it.label}</span>
                          {n > 0 && (
                            <span className="absolute right-2 top-2">
                              <Counter n={n} tone={it.badgeKey === "reviews" ? "tag" : "brand"} />
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
          <div className="rounded-[14px] bg-chrome-2/60 p-3">{account}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      {/* Barra lateral (ordenador) */}
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto bg-chrome lg:flex">
        <Link href="/" className="px-5 pb-4 pt-5" aria-label="Inicio">
          <Logo />
        </Link>
        <div className="px-3 pb-5">
          <NavLink
            href="/ventas/nueva"
            active={pathname.startsWith("/ventas/nueva")}
            className="press flex h-11 items-center justify-center gap-2 rounded-[12px] bg-brand text-[15px] font-bold text-on-brand shadow-[0_8px_22px_-10px_var(--brand)] hover:bg-brand-strong"
          >
            <Plus size={19} strokeWidth={2.75} />
            Nueva venta
          </NavLink>
        </div>
        {sidebar}
        <div className="mt-auto border-t border-white/8 px-4 py-4">{account}</div>
      </aside>

      {/* Barra superior (móvil y iPad) */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-chrome/95 px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur-md lg:hidden no-print">
        <Link href="/" aria-label="Inicio">
          <Logo />
        </Link>
      </header>
      {moreSheet}

      <Suspense fallback={null}>
        <RememberList />
      </Suspense>

      <main className="min-w-0 px-4 pb-32 pt-5 sm:px-6 lg:py-8 lg:pl-9 lg:pr-5 xl:pr-6">
        <div key={pathname} className="mx-auto max-w-[1720px] animate-fade">
          {children}
        </div>
      </main>

      {tabBar}
    </div>
  );
}

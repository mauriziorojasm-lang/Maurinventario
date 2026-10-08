"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { RememberList, forgetAllLists, useRememberedHref } from "./list-memory";
import { NAV } from "./nav";
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
function NavLink({
  href,
  active,
  onClick,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & {
  href: string;
  active: boolean;
}) {
  const remembered = useRememberedHref(href);
  return (
    <Link
      {...props}
      href={active ? remembered : href}
      onClick={(e) => {
        if (!active) forgetAllLists();
        onClick?.(e);
      }}
    />
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
  const [open, setOpen] = useState(false);

  const nav = (
    <nav aria-label="Principal" className="flex flex-col gap-5 px-3 pb-6">
      {NAV.map((g, gi) => {
        const items = g.items.filter((i) => !i.adminOnly || role === "admin");
        if (!items.length) return null;
        return (
          <div key={gi}>
            {g.label && <p className="mb-1.5 px-2.5 text-xs font-semibold text-white/45">{g.label}</p>}
            <ul className="flex flex-col gap-0.5">
              {items.map((it) => {
                const active = isActive(pathname, it.href);
                const badge = it.badgeKey ? badges[it.badgeKey] : 0;
                return (
                  <li key={it.href}>
                    <NavLink
                      href={it.href}
                      active={active}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={clsx(
                        "flex items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[14px]",
                        active ? "bg-white/12 font-semibold text-white" : "text-white/75 hover:bg-white/6 hover:text-white",
                        it.href === "/ventas/nueva" && !active && "text-tag",
                      )}
                    >
                      <span>{it.label}</span>
                      {badge > 0 && (
                        <span
                          className={clsx(
                            "num rounded-full px-1.5 text-[11.5px] font-bold",
                            it.badgeKey === "reviews" ? "bg-tag text-tag-ink" : "bg-white/15 text-white",
                          )}
                          title={it.badgeKey === "reviews" ? "Pendientes de revisar" : "Envíos pendientes"}
                        >
                          {badge}
                        </span>
                      )}
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

  const brand = (
    <Link href="/" className="flex items-baseline gap-1.5 px-5 py-5 text-white">
      <span className="text-[19px] font-extrabold tracking-[-0.02em]">MaurInventario</span>
    </Link>
  );

  const account = (
    <div className="mt-auto border-t border-white/10 px-5 py-4 text-[13px] text-white/70">
      <p className="truncate font-semibold text-white">{userLabel}</p>
      <p>{role === "admin" ? "Administrador" : "Vendedor"}</p>
      <div className="mt-2 flex gap-3">
        <Link href="/cuenta" className="underline-offset-2 hover:text-white hover:underline">
          Mi cuenta
        </Link>
        <form action="/auth/salir" method="post">
          <button className="underline-offset-2 hover:text-white hover:underline">Cerrar sesión</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-0 hidden h-screen flex-col overflow-y-auto bg-ink lg:flex">
        {brand}
        {nav}
        {account}
      </aside>

      {/* Barra superior (móvil) */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-2.5 lg:hidden">
        <Link href="/" className="text-[17px] font-extrabold tracking-[-0.02em] text-white">
          MaurInventario
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-[var(--radius-sm)] border border-white/20 px-3 py-1.5 text-sm font-semibold text-white"
          aria-expanded={open}
          aria-controls="menu-movil"
        >
          Menú
          {badges.reviews > 0 && role === "admin" && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-tag align-middle" />}
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" id="menu-movil">
          <button className="absolute inset-0 bg-ink/50" aria-label="Cerrar menú" onClick={() => setOpen(false)} />
          <div
            className="absolute inset-y-0 left-0 flex w-[82%] max-w-[300px] flex-col overflow-y-auto bg-ink"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            {brand}
            {nav}
            {account}
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        <RememberList />
      </Suspense>

      <main className="min-w-0 px-4 py-6 pb-24 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-[1280px]">{children}</div>
      </main>

      {/* Acceso rápido en el móvil */}
      {pathname !== "/ventas/nueva" && (
        <Link
          href="/ventas/nueva"
          className="fixed bottom-4 right-4 z-20 rounded-full bg-ledger px-5 py-3 text-sm font-bold text-white shadow-[0_10px_30px_-10px_rgba(30,107,82,0.8)] lg:hidden no-print"
        >
          + Nueva venta
        </Link>
      )}
    </div>
  );
}

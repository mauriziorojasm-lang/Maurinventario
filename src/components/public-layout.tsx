import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./brand";
import { buttonClass } from "./ui";

/** Cabecera y pie de las páginas públicas (precios, privacidad, términos). */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Link href="/precios" aria-label="Resellap" className="flex min-h-10 items-center">
            <Logo size={26} />
          </Link>
          <nav className="flex items-center gap-1.5">
            <Link href="/login" className={buttonClass("ghost", "sm")}>
              Entrar
            </Link>
            <Link href="/registro" className={buttonClass("primary", "sm")}>
              Probar gratis
            </Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-line px-5 py-10 text-sm text-muted">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <span className="flex items-center gap-3">
            <Logo size={18} compact />© {new Date().getFullYear()} Resellap
          </span>
          <span className="flex gap-5">
            <Link href="/precios" className="hover:text-ink">
              Precios
            </Link>
            <Link href="/privacidad" className="hover:text-ink">
              Privacidad
            </Link>
            <Link href="/terminos" className="hover:text-ink">
              Términos
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <PublicLayout>
      <article className="mx-auto max-w-3xl px-5 py-12 leading-relaxed [&_h2]:mt-9 [&_h2]:font-[family-name:var(--font-display)] [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-[-0.015em] [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-3 [&_p]:text-ink-soft [&_ul]:mt-3 [&_ul]:space-y-1">
        <h1 className="display text-[36px] sm:text-[44px]">{title}</h1>
        <p className="text-sm text-muted">Última actualización: {updated}</p>
        {children}
      </article>
    </PublicLayout>
  );
}

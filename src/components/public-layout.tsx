import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClass } from "./ui";
import { Logo } from "./shell";

/** Cabecera y pie de las páginas públicas (precios, privacidad, términos). */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <header className="bg-chrome px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <Link href="/precios" aria-label="MaurInventario">
            <Logo />
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/login" className="rounded-md px-3 py-2 text-sm font-semibold text-chrome-ink/80 hover:text-chrome-ink">
              Entrar
            </Link>
            <Link href="/registro" className={buttonClass("primary", "sm")}>
              Probar gratis
            </Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-line px-5 py-8 text-sm text-muted">
        <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-3">
          <span>© {new Date().getFullYear()} MaurInventario</span>
          <span className="flex gap-4">
            <Link href="/privacidad" className="hover:text-ink">Privacidad</Link>
            <Link href="/terminos" className="hover:text-ink">Términos</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <PublicLayout>
      <article className="mx-auto max-w-3xl px-5 py-12 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:space-y-1">
        <h1 className="display text-[40px] uppercase">{title}</h1>
        <p className="text-sm text-muted">Última actualización: {updated}</p>
        {children}
      </article>
    </PublicLayout>
  );
}

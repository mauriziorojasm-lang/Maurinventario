import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./shell";

/** Diseño común de entrar, registro, recuperación, bienvenida e invitaciones. */
export function AuthLayout({ title, subtitle, children, aside }: { title: string; subtitle?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-chrome lg:grid-cols-[1fr_minmax(440px,540px)] lg:bg-paper">
      <div className="relative flex flex-col justify-between gap-10 overflow-hidden bg-chrome px-6 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))] text-chrome-ink lg:p-12">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand/25 blur-3xl" />
        <Link href="/precios" aria-label="MaurInventario">
          <Logo className="relative" />
        </Link>
        <div className="relative max-w-lg animate-rise">
          {aside ?? (
            <p className="display text-[44px] uppercase leading-[0.95] lg:text-[64px]">
              Cada unidad sabe <span className="text-brand-bright">de qué pedido vino</span>, cuánto costó y quién la vendió.
            </p>
          )}
          <div className="mt-7 flex flex-wrap gap-2">
            <span className="lot-tag">Pedido #3</span>
            <span className="lot-tag">Pedido #4</span>
            <span className="lot-tag">Pedido #7</span>
          </div>
        </div>
        <p className="relative hidden text-sm text-chrome-ink/50 lg:block">Inventario, ventas, compras y rentabilidad.</p>
      </div>
      <div className="flex items-start justify-center rounded-t-[28px] bg-paper px-6 pb-12 pt-9 lg:items-center lg:rounded-none lg:py-12">
        <div className="w-full max-w-sm animate-rise">
          <h1 className="display text-[38px] uppercase">{title}</h1>
          {subtitle && <div className="mb-6 mt-1 text-sm text-muted">{subtitle}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { Logo } from "@/components/shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  const error = sp.error === "inactivo" ? "Tu usuario está desactivado. Habla con el administrador." : null;
  return (
    <div className="grid min-h-dvh bg-chrome lg:grid-cols-[1fr_minmax(440px,540px)] lg:bg-paper">
      <div className="relative flex flex-col justify-between gap-10 overflow-hidden bg-chrome px-6 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))] text-chrome-ink lg:p-12">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand/25 blur-3xl" />
        <Logo className="relative" />
        <div className="relative max-w-lg animate-rise">
          <p className="display text-[44px] uppercase leading-[0.95] lg:text-[64px]">
            Cada unidad sabe <span className="text-brand">de qué pedido vino</span>, cuánto costó y quién la vendió.
          </p>
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
          <h1 className="display text-[38px] uppercase">Entrar</h1>
          <p className="mb-6 mt-1 text-sm text-muted">Usa el email y la contraseña que te dio el administrador.</p>
          <LoginForm next={next} initialError={error} />
        </div>
      </div>
    </div>
  );
}

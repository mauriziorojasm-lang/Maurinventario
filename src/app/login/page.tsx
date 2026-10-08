import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  const error = sp.error === "inactivo" ? "Tu usuario está desactivado. Habla con el administrador." : null;
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(420px,520px)]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-white lg:flex">
        <p className="text-[22px] font-extrabold tracking-[-0.02em]">MaurInventario</p>
        <div className="max-w-md">
          <p className="text-[34px] font-bold leading-[1.15] tracking-[-0.02em]">Cada unidad sabe de qué pedido vino, cuánto costó y quién la vendió.</p>
          <div className="mt-8 flex flex-wrap gap-2">
            <span className="lot-tag">Pedido #3</span>
            <span className="lot-tag">Pedido #4</span>
            <span className="lot-tag">Pedido #7</span>
          </div>
        </div>
        <p className="text-sm text-white/50">Inventario, ventas, compras y rentabilidad.</p>
      </div>
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <p className="mb-8 text-[22px] font-extrabold tracking-[-0.02em] lg:hidden">MaurInventario</p>
          <h1 className="text-[24px] font-bold">Entrar</h1>
          <p className="mb-6 mt-1 text-sm text-muted">Usa el email y la contraseña que te dio el administrador.</p>
          <LoginForm next={next} initialError={error} />
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  const error =
    sp.error === "inactivo"
      ? "Tu usuario está desactivado."
      : sp.error === "enlace"
        ? "El enlace no es válido o ha caducado. Vuelve a intentarlo."
        : null;
  const notice = sp.aviso === "clave" ? "Contraseña cambiada. Ya puedes entrar." : null;
  return (
    <AuthLayout title="Entrar" subtitle="Con tu email y tu contraseña.">
      {notice && <p className="mb-4 rounded-[var(--radius-sm)] bg-good-soft px-3 py-2 text-sm font-semibold text-good-ink">{notice}</p>}
      <LoginForm next={next} initialError={error} />
      <div className="mt-6 flex flex-col gap-2 text-sm">
        <Link href={`/registro${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-ink underline-offset-2 hover:underline">
          ¿No tienes cuenta? Prueba gratis 7 días
        </Link>
        <Link href="/recuperar" className="text-muted underline-offset-2 hover:underline">
          He olvidado mi contraseña
        </Link>
      </div>
    </AuthLayout>
  );
}

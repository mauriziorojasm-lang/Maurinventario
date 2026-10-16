import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LogOut } from "lucide-react";
import { Logo } from "@/components/brand";
import { requireSession } from "@/lib/auth";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = { title: { default: "Administración", template: "%s · Administración de Resellap" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Panel de administración del negocio Resellap, separado de la aplicación.
 * Solo para administradores de la plataforma: a cualquier otra persona se le
 * responde «no existe» (no se revela que la página está aquí). Además, cada
 * función de la base de datos vuelve a comprobarlo; ocultar la página no es
 * la única protección.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireSession();
  if (!me.isPlatformAdmin) notFound();
  return (
    <div className="min-h-dvh bg-paper">
      <header className="sticky top-0 z-30 border-b border-[#222927] bg-[#0B0F0E] px-4 pt-[max(0.5rem,env(safe-area-inset-top))] text-[#F4F6F5] sm:px-6">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-1 py-2.5">
          <Link href="/admin" className="flex min-h-10 items-center gap-2.5" aria-label="Administración de Resellap">
            <Logo size={22} tone="white" />
            <span className="rounded-full border border-[#343C39] px-2 py-0.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#B4BDB9]">Admin</span>
          </Link>
          <AdminNav />
          <div className="ml-auto flex items-center gap-1 text-[13px]">
            <span className="hidden truncate text-[#8A9590] sm:inline">{me.email}</span>
            <Link href="/" className="flex min-h-10 items-center gap-1.5 rounded-[10px] px-3 text-[#D5DBD8] hover:bg-[#151A18]">
              <ArrowLeft size={15} strokeWidth={1.75} />
              App
            </Link>
            <form action="/auth/salir" method="post">
              <button className="flex h-10 w-10 items-center justify-center rounded-[10px] text-[#8A9590] hover:bg-[#151A18] hover:text-white" aria-label="Cerrar sesión" title="Cerrar sesión">
                <LogOut size={16} strokeWidth={1.75} />
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1280px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8">{children}</main>
    </div>
  );
}

import { House, SearchX } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
        <SearchX size={28} strokeWidth={2.25} />
      </span>
      <h1 className="display text-[30px] uppercase">No existe</h1>
      <p className="max-w-sm text-sm text-muted">Esta página no existe. Comprueba el enlace o vuelve al inicio.</p>
      <Link href="/" className={buttonClass("primary", "md")}>
        <House size={17} strokeWidth={2.25} />
        Ir al inicio
      </Link>
    </main>
  );
}

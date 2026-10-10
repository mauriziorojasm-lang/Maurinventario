import { House, SearchX } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center animate-rise">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
        <SearchX size={28} strokeWidth={2.25} />
      </span>
      <h1 className="display text-[30px] uppercase">No existe</h1>
      <p className="text-sm text-muted">Esta página no existe o lo que buscas se ha borrado. Comprueba el enlace o vuelve al inicio.</p>
      <Link href="/" className={buttonClass("primary", "md")}>
        <House size={17} strokeWidth={2.25} />
        Ir al inicio
      </Link>
    </div>
  );
}

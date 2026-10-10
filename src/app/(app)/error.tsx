"use client";
import { House, RotateCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { buttonClass } from "@/components/ui";

/** Si una pantalla falla (sin conexión, base de datos caída…), se explica y se puede reintentar. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  // En producción Next oculta el texto de los errores del servidor; los nuestros empiezan por «No se ha podido…»
  const msg = /^No se ha podido|^No se puede/.test(error.message) ? error.message : null;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center animate-rise" role="alert">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-warn-soft text-warn">
        <TriangleAlert size={28} strokeWidth={2.25} />
      </span>
      <h1 className="display text-[30px] uppercase">No se ha podido cargar</h1>
      <p className="text-sm text-muted">
        {offline ? "Parece que no tienes conexión a internet. Cuando vuelva, pulsa «Reintentar»." : (msg ?? "Ha fallado algo al cargar esta pantalla. Tus datos están a salvo: no se ha guardado ni borrado nada.")}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => retry()} className={buttonClass("primary", "md")}>
          <RotateCw size={17} strokeWidth={2.5} />
          Reintentar
        </button>
        <Link href="/" className={buttonClass("secondary", "md")}>
          <House size={17} strokeWidth={2.25} />
          Ir al inicio
        </Link>
      </div>
      {error.digest && <p className="num text-[11px] text-faint">Código: {error.digest}</p>}
    </div>
  );
}

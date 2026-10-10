"use client";
/**
 * Barra fina verde arriba mientras se cambia de pantalla. Empieza al tocar
 * un enlace interno (o aplicar filtros) y termina cuando llega la página.
 */
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const here = () => location.pathname + location.search;
    const start = () => {
      if (timer.current) clearTimeout(timer.current);
      // Solo si tarda: las navegaciones instantáneas no muestran nada
      timer.current = setTimeout(() => setState("loading"), 120);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname + url.search === here()) return;
      start();
    };
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      if (!e.defaultPrevented && f.method === "get") start();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  // Ha llegado la nueva página: completar y ocultar
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacciona al cambio de dirección
    setState((s) => (s === "loading" ? "done" : "idle"));
    const t = setTimeout(() => setState("idle"), 350);
    return () => clearTimeout(t);
  }, [pathname, search]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]">
      <div className="nav-progress h-full bg-brand shadow-[0_0_8px_var(--brand)]" data-state={state} />
    </div>
  );
}

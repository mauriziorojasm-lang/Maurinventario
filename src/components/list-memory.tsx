"use client";
/**
 * Memoria de filtros de las listas.
 *
 * Cada vez que se abre una lista (Ventas, Productos…) se guarda su
 * dirección con los filtros y la página. Al volver desde una ficha
 * (enlace «‹ Ventas» o el propio menú de esa sección) se recupera.
 * Al cambiar a otra sección desde el menú, se olvida todo: al regresar,
 * la lista aparece sin filtros.
 *
 * Se guarda en sessionStorage: dura mientras la pestaña del navegador
 * esté abierta y no se comparte con nadie.
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { NAV } from "./nav";

const PREFIX = "mi:lista:";
const EVENT = "mi:lista-cambio";

/** Listas cuyos filtros se recuerdan (todas las secciones del menú salvo Inicio y Nueva venta). */
export const LIST_PATHS = new Set(NAV.flatMap((g) => g.items.map((i) => i.href)).filter((h) => h !== "/" && h !== "/ventas/nueva"));

function read(path: string): string | null {
  try {
    return sessionStorage.getItem(PREFIX + path);
  } catch {
    return null;
  }
}

/** Olvida los filtros de todas las listas. */
export function forgetAllLists() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Guarda la dirección actual si es una lista. Va dentro de <Suspense>. */
export function RememberList() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    if (!LIST_PATHS.has(pathname)) return;
    try {
      sessionStorage.setItem(PREFIX + pathname, pathname + (search ? `?${search}` : ""));
    } catch {
      /* sin almacenamiento: no pasa nada */
    }
    window.dispatchEvent(new Event(EVENT));
  }, [pathname, search]);
  return null;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

/** Dirección recordada de una lista (o la lista sin filtros). */
export function useRememberedHref(href: string): string {
  return useSyncExternalStore(
    subscribe,
    () => (LIST_PATHS.has(href) ? (read(href) ?? href) : href),
    () => href,
  );
}

/** Enlace «‹ Ventas» que vuelve a la lista con los filtros que tenías. */
export function BackLink({ href, label }: { href: string; label: string }) {
  const target = useRememberedHref(href);
  return (
    <Link href={target} className="mb-1 inline-block text-[13px] font-medium text-muted hover:text-ink">
      ‹ {label}
    </Link>
  );
}

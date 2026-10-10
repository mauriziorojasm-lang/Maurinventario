"use client";
/**
 * Si este dispositivo aún no conoce el aspecto que el usuario guardó (otro
 * móvil, otro navegador), lo aplica al momento y lo recuerda en una cookie.
 */
import { useEffect } from "react";

export function AppearanceSync({ mode, palette, reduceMotion, cookieName, cookieValue }: { mode: string; palette: string; reduceMotion: boolean; cookieName: string; cookieValue: string }) {
  useEffect(() => {
    const el = document.documentElement;
    const set = (k: string, v: string | undefined) => (v ? el.setAttribute(k, v) : el.removeAttribute(k));
    set("data-mode", mode === "auto" ? undefined : mode);
    set("data-palette", palette === "vinted" ? undefined : palette);
    set("data-motion", reduceMotion ? "reduce" : undefined);
    document.cookie = `${cookieName}=${cookieValue}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  }, [mode, palette, reduceMotion, cookieName, cookieValue]);
  return null;
}

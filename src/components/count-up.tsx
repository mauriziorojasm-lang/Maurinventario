"use client";
/**
 * Cifra que «cuenta» hasta su valor (0,7 s): al aparecer, desde 0; si el
 * valor cambia después (otro periodo, una venta nueva), desde el anterior.
 * El HTML del servidor ya lleva el valor final, así que sin JavaScript o
 * con «reducir movimiento» se ve la cifra correcta directamente.
 */
import { useEffect, useRef, useState } from "react";
import { money, units } from "@/lib/format";

export function CountUp({ value, format = "money" }: { value: number; format?: "money" | "units" }) {
  const fmt = (n: number) => (format === "money" ? money(n) : units(Math.round(n)));
  const [shown, setShown] = useState(value);
  const from = useRef<number | null>(null); // null = primera vez (se cuenta desde 0)

  useEffect(() => {
    const start = from.current ?? 0;
    from.current = value;
    if (start === value || (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduce")) {
      setShown(value);
      return;
    }
    const t0 = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(start + (value - start) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value]);

  return <span className="num">{fmt(shown)}</span>;
}

"use client";
/**
 * Cifra que «cuenta» hasta su valor al aparecer (0,7 s). El HTML del
 * servidor ya lleva el valor final, así que sin JavaScript o con
 * «reducir movimiento» se ve la cifra correcta directamente.
 */
import { useEffect, useRef, useState } from "react";
import { money, units } from "@/lib/format";

export function CountUp({ value, format = "money" }: { value: number; format?: "money" | "units" }) {
  const fmt = (n: number) => (format === "money" ? money(n) : units(Math.round(n)));
  const [shown, setShown] = useState(value);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (!value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className="num">{fmt(shown)}</span>;
}

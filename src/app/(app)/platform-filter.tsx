"use client";
import { useRouter } from "next/navigation";

/** Filtro de plataforma del panel (cambia la dirección; no guarda nada). */
export function PlatformFilter({ value, options, allHref }: { value: string; options: { value: string; label: string; href: string }[]; allHref: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
      <span className="sr-only">Plataforma</span>
      <select
        value={value}
        onChange={(e) => router.push(e.target.value ? (options.find((o) => o.value === e.target.value)?.href ?? allHref) : allHref, { scroll: false })}
        className="h-11 rounded-full border border-line-strong bg-surface px-3 pr-8 text-base font-semibold text-ink focus:border-brand focus:outline-none md:h-9 md:text-[13px]"
      >
        <option value="">Todas las plataformas</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

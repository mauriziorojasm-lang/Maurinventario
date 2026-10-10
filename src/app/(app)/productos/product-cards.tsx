import { ImageOff } from "lucide-react";
import Link from "next/link";
import { clsx } from "@/components/ui";
import { money, units } from "@/lib/format";

export type CardProduct = {
  key: string;
  href: string;
  name: string;
  subtitle: string;
  photo?: string;
  stock: number;
  price: number | null;
  extra?: { label: string; value: string }[];
  warn?: string | null;
};

/** Miniatura de producto (o hueco si no tiene foto). */
export function ProductThumb({ url, size = 56 }: { url?: string; size?: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- enlace temporal de Supabase
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-[12px] border border-line bg-surface-2 object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-[12px] border border-dashed border-line-strong bg-surface-2 text-faint"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <ImageOff size={Math.round(size * 0.36)} strokeWidth={2} />
    </span>
  );
}

/** Productos en tarjetas para el móvil: foto, nombre, stock y precio. */
export function ProductCards({ items }: { items: CardProduct[] }) {
  return (
    <ul className="stagger grid gap-2 lg:hidden">
      {items.map((p) => (
        <li key={p.key}>
          <Link
            href={p.href}
            className={clsx(
              "press flex items-center gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-2.5 pr-3.5 shadow-[var(--shadow-card)] active:border-brand/60",
              p.stock <= 0 && "opacity-70",
            )}
          >
            <ProductThumb url={p.photo} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{p.name}</span>
              <span className="block truncate text-[12.5px] text-muted">{p.subtitle}</span>
              {p.extra && <span className="mt-0.5 block truncate text-[12px] text-muted">{p.extra.map((e) => `${e.label} ${e.value}`).join(" · ")}</span>}
              {p.warn && <span className="mt-0.5 block text-[12px] font-semibold text-warn">{p.warn}</span>}
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className="display num text-[20px]">{p.price !== null ? money(p.price) : "—"}</span>
              <span
                className={clsx("num rounded-full px-2 text-[11.5px] font-bold leading-5", p.stock > 0 ? "bg-good-soft text-good-ink" : "bg-ink/8 text-muted")}
              >
                {p.stock > 0 ? `${units(p.stock)} en stock` : "Sin stock"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

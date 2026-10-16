/**
 * Identificación visual de plataformas y transportistas: icono pequeño
 * (siglas sobre su color) + nombre. En espacios pequeños, solo el icono
 * con el nombre como texto alternativo y tooltip. Funciona sin hover.
 */
import { carrierMark, genericMark, platformMark, type BrandMark } from "@/lib/carriers";
import { clsx } from "./ui";

function Mark({ mark, size, title }: { mark: BrandMark; size: number; title: string }) {
  if (mark.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/logos/${mark.key}.svg`} alt="" width={size} height={size} className="shrink-0 rounded-[6px] object-contain" />;
  }
  const fs = mark.short.length >= 3 ? size * 0.32 : mark.short.length === 2 ? size * 0.4 : size * 0.5;
  return (
    <span
      aria-hidden
      title={title}
      className="inline-flex shrink-0 select-none items-center justify-center rounded-[6px] font-semibold leading-none tracking-[-0.02em]"
      style={{ width: size, height: size, background: mark.bg, color: mark.fg, fontSize: fs, boxShadow: "inset 0 0 0 1px rgb(11 15 14 / 0.06)" }}
    >
      {mark.short}
    </span>
  );
}

type MarkProps = { name: string | null | undefined; size?: number; showName?: boolean; className?: string; muted?: boolean };

function Labeled({ mark, name, size = 20, showName = true, className, muted }: MarkProps & { mark: BrandMark }) {
  const label = name || mark.name;
  return (
    <span className={clsx("inline-flex min-w-0 items-center gap-2", className)} title={showName ? undefined : label}>
      <Mark mark={mark} size={size} title={label} />
      {showName ? <span className={clsx("truncate", muted ? "text-muted" : "text-ink")}>{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  );
}

export function PlatformIcon({ name, ...rest }: MarkProps) {
  if (!name) return null;
  return <Labeled mark={platformMark(name) ?? genericMark(name)} name={name} {...rest} />;
}

export function CarrierIcon({ name, ...rest }: MarkProps) {
  if (!name) return <span className={clsx("text-faint", rest.className)}>Sin transportista</span>;
  return <Labeled mark={carrierMark(name) ?? genericMark(name)} name={name} {...rest} />;
}

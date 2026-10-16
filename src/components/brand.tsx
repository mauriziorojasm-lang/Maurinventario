/**
 * Marca Resellap: el símbolo (una R de cuatro módulos sobre una retícula de
 * 96) y el logotipo horizontal. Geometría oficial del manual de marca v1.0;
 * no se redibuja. Por debajo de 24 px se usa el «corte pequeño».
 *
 * Colores: la parte fija toma `--sym-a` (por defecto, el color del texto) y
 * la diagonal `--sym-b` (por defecto, el Verde Resellap). Así funciona en
 * claro, en oscuro y en una tinta sin duplicar archivos.
 */
import clsx from "clsx";
import type { CSSProperties } from "react";

const A = "M0 0H38V50H0ZM43 0H71A25 25 0 0 1 71 50H43ZM0 55H38V96H0Z";
const B = "M43 55H67L96 96H72Z";
const A_SMALL = "M0 0H36V48H0ZM44 0H72A24 24 0 0 1 72 48H44ZM0 56H36V96H0Z";
const B_SMALL = "M44 56H68L96 96H72Z";

export type SymbolTone = "auto" | "ink" | "white" | "mono";

const toneVars: Record<SymbolTone, CSSProperties> = {
  auto: { ["--sym-a" as string]: "var(--ink)", ["--sym-b" as string]: "var(--brand-mark)" },
  ink: { ["--sym-a" as string]: "#0B0F0E", ["--sym-b" as string]: "#0F9D63" },
  white: { ["--sym-a" as string]: "#FFFFFF", ["--sym-b" as string]: "#36C784" },
  mono: { ["--sym-a" as string]: "currentColor", ["--sym-b" as string]: "currentColor" },
};

export function ResellapSymbol({
  size = 24,
  tone = "auto",
  className,
  title,
}: {
  size?: number;
  tone?: SymbolTone;
  className?: string;
  /** Texto alternativo; sin él, el símbolo es decorativo. */
  title?: string;
}) {
  const small = size <= 24;
  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={clsx("shrink-0", className)}
      style={toneVars[tone]}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path style={{ fill: "var(--sym-a)" }} d={small ? A_SMALL : A} />
      <path style={{ fill: "var(--sym-b)" }} d={small ? B_SMALL : B} data-piece="venta" />
    </svg>
  );
}

/**
 * Logotipo horizontal: símbolo de alto H + «Resellap» en Instrument Sans
 * SemiBold (tracking −3 %, altura de mayúscula 0,52 H, separación 0,3 H).
 */
export function Logo({
  size = 26,
  compact = false,
  tone = "auto",
  className,
}: {
  /** Alto del símbolo en px (H). */
  size?: number;
  /** Solo el símbolo. */
  compact?: boolean;
  tone?: SymbolTone;
  className?: string;
}) {
  return (
    <span
      className={clsx("inline-flex items-center", className)}
      style={{ gap: size * 0.3, ...toneVars[tone] }}
      aria-label={compact ? "Resellap" : undefined}
      role={compact ? "img" : undefined}
    >
      <ResellapSymbol size={size} tone={tone} />
      {!compact && (
        <span
          className="font-[family-name:var(--font-display)] font-semibold leading-none"
          style={{ fontSize: size * 0.723, letterSpacing: "-0.03em", color: "var(--sym-a)", transform: "translateY(0.02em)" }}
        >
          Resellap
        </span>
      )}
    </span>
  );
}

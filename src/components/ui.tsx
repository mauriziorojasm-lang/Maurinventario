/**
 * Componentes visuales básicos (sin estado). Se pueden usar en el
 * servidor y en el cliente.
 */
import clsx from "clsx";
import { BackLink } from "./list-memory";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export { clsx };

// ---------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const buttonBase =
  "press inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] font-semibold disabled:cursor-not-allowed disabled:opacity-55 whitespace-nowrap select-none [&_svg]:shrink-0";
const buttonVariants: Record<Variant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-strong",
  secondary: "bg-surface text-ink border border-line hover:border-line-strong hover:bg-paper",
  ghost: "text-ink-soft hover:bg-subtle hover:text-ink",
  danger: "bg-surface text-danger border border-danger/35 hover:bg-danger-soft",
};
const buttonSizes: Record<Size, string> = {
  sm: "h-11 px-3.5 text-[14px] sm:h-9 sm:px-3 sm:text-[13px]",
  md: "h-11 px-4 text-[14px] sm:h-10",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return clsx(buttonBase, buttonVariants[variant], buttonSizes[size], className);
}

export function Button({ variant = "secondary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="button" {...props} className={buttonClass(variant, size, className)} />;
}

export function LinkButton({ variant = "secondary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...props} className={buttonClass(variant, size, className)} />;
}

// ---------------------------------------------------------------------
// Formularios
// ---------------------------------------------------------------------
// Texto a 16px en el móvil: así el iPhone no hace zoom al escribir
const control =
  "w-full rounded-[var(--radius-sm)] border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-faint transition-[border-color,box-shadow] hover:border-field focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/20 disabled:bg-paper disabled:text-muted sm:text-[14px]";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={clsx(control, "h-11 sm:h-10", props.type === "number" && "num", className)} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select {...props} className={clsx(control, "h-11 pr-8 sm:h-10", className)}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={clsx(control, "min-h-20 py-2", className)} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
  required,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Si se indica, la etiqueta apunta a ese id; si no, envuelve el control. */
  htmlFor?: string;
  required?: boolean;
}) {
  const text = (
    <span className="text-[13px] font-medium text-muted">
      {label}
      {required && <span className="text-danger"> *</span>}
    </span>
  );
  const help = (
    <>
      {hint && !error && <span className="text-xs text-muted">{hint}</span>}
      {error && <span className="text-xs font-medium text-danger">{error}</span>}
    </>
  );
  if (htmlFor !== undefined) {
    return (
      <div className={clsx("flex flex-col gap-1.5", className)}>
        <label htmlFor={htmlFor || undefined}>{text}</label>
        {children}
        {help}
      </div>
    );
  }
  return (
    <label className={clsx("flex flex-col gap-1.5", className)}>
      {text}
      {children}
      {help}
    </label>
  );
}

// ---------------------------------------------------------------------
// Estructura de página
// ---------------------------------------------------------------------
export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-5 flex animate-rise flex-col gap-3 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && <BackLink href={back.href} label={back.label} />}
        <h1 className="display text-[28px] text-ink text-balance sm:text-[34px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-[70ch] text-[14.5px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  padded = true,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={clsx("overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className={clsx(padded && "p-4 sm:p-5")}>{children}</div>
    </section>
  );
}

/** Franja de cifras clave: un solo bloque dividido, no tarjetas sueltas. */
export function Figures({
  items,
  className,
}: {
  items: {
    label: ReactNode;
    value: ReactNode;
    note?: ReactNode;
    tone?: "default" | "good" | "bad";
  }[];
  className?: string;
}) {
  return (
    <dl
      className={clsx(
        "grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-md)] border border-line bg-line max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]",
        className,
      )}
    >
      {items.map((it, i) => (
        <div key={i} className="bg-surface px-4 py-3.5">
          <dt className="text-[13px] text-faint">{it.label}</dt>
          <dd className={clsx("num mt-1 text-[24px] font-semibold tracking-[-0.02em] sm:text-[26px]", it.tone === "good" && "text-good", it.tone === "bad" && "text-danger")}>{it.value}</dd>
          {it.note && <p className="mt-0.5 text-[12.5px] text-faint">{it.note}</p>}
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------
// Tablas
// ---------------------------------------------------------------------
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, num, className }: { children?: ReactNode; num?: boolean; className?: string }) {
  return (
    <th
      scope="col"
      className={clsx(
        "sticky top-0 border-b border-line bg-surface-2 px-3 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-[0.05em] text-faint",
        num && "text-right",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, num, className, colSpan }: { children?: ReactNode; num?: boolean; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={clsx("border-b border-line/70 px-3 py-2.5 align-top", num && "num text-right", className)}>
      {children}
    </td>
  );
}

export function Tr({ children, className, muted }: { children: ReactNode; className?: string; muted?: boolean }) {
  return <tr className={clsx("transition-colors hover:bg-surface-2", muted && "text-muted", className)}>{children}</tr>;
}

// ---------------------------------------------------------------------
// Estados y etiquetas
// ---------------------------------------------------------------------
type Tone = "neutral" | "good" | "warn" | "bad" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-subtle text-muted",
  good: "bg-good-soft text-good-ink",
  warn: "bg-warn-soft text-warn",
  bad: "bg-danger-soft text-danger",
  info: "bg-subtle text-ink-soft",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; /** Punto de estado delante del texto. */ dot?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", tones[tone], className)}>
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-[2px] bg-current" />}
      {children}
    </span>
  );
}

/** Pegatina del pedido/lote de procedencia. */
export function LotTag({ label, origin }: { label: string | null | undefined; origin?: "compra" | "ajuste" | string | null }) {
  if (!label) return <Badge tone="warn">Lote no identificado</Badge>;
  return (
    <span className="lot-tag" data-origin={origin ?? (label.startsWith("Ajuste") ? "ajuste" : "compra")}>
      {label}
    </span>
  );
}

export function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0) return <Badge tone="neutral">Sin stock</Badge>;
  return <span className="num font-semibold">{stock}</span>;
}

export function Notice({ tone = "info", title, children, className }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={clsx(
        "animate-rise rounded-[var(--radius-sm)] border px-3.5 py-2.5 text-sm",
        tone === "bad" && "border-danger/25 bg-danger-soft text-danger",
        tone === "warn" && "border-warn/25 bg-warn-soft text-warn",
        tone === "good" && "border-good/20 bg-good-soft text-good-ink",
        tone === "info" && "border-line bg-surface text-ink-soft",
        tone === "neutral" && "border-line bg-paper text-ink-soft",
        className,
      )}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={clsx(title && "mt-0.5", "text-[13.5px] [&_a]:underline")}>{children}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 px-4 py-12 sm:items-center sm:text-center">
      <span aria-hidden className="mb-1 flex h-11 w-11 items-center justify-center rounded-[12px] border border-line bg-surface-2">
        <svg viewBox="0 0 96 96" width="20" height="20"><path fill="var(--line-strong)" d="M0 0H36V48H0ZM44 0H72A24 24 0 0 1 72 48H44ZM0 56H36V96H0Z" /><path fill="var(--brand-mark)" d="M44 56H68L96 96H72Z" /></svg>
      </span>
      <p className="font-semibold text-ink">{title}</p>
      {children && <p className="max-w-[60ch] text-sm text-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------
// Paginación (con enlaces, funciona sin JavaScript)
// ---------------------------------------------------------------------
export function Pagination({ page, size, total, hrefFor }: { page: number; size: number; total: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1)
    return (
      <p className="px-3 py-3 text-[13px] text-muted">
        {total} resultado{total === 1 ? "" : "s"}
      </p>
    );
  return (
    <nav className="flex items-center justify-between gap-2 px-3 py-3 text-[13px]" aria-label="Paginación">
      <span className="text-muted">
        {(page - 1) * size + 1}–{Math.min(page * size, total)} de {total}
      </span>
      <span className="flex gap-1.5">
        {page > 1 ? (
          <LinkButton size="sm" href={hrefFor(page - 1)}>
            Anterior
          </LinkButton>
        ) : (
          <Button size="sm" disabled>
            Anterior
          </Button>
        )}
        {page < pages ? (
          <LinkButton size="sm" href={hrefFor(page + 1)}>
            Siguiente
          </LinkButton>
        ) : (
          <Button size="sm" disabled>
            Siguiente
          </Button>
        )}
      </span>
    </nav>
  );
}

export function Tabs({ items, current }: { items: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Secciones">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={clsx(
            "-mb-px min-h-10 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
            t.key === current ? "border-ink text-ink" : "border-transparent text-faint hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

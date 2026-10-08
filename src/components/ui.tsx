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
  "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55 whitespace-nowrap";
const buttonVariants: Record<Variant, string> = {
  primary: "bg-ledger text-white hover:bg-ledger-dark",
  secondary: "bg-surface text-ink border border-line-strong hover:border-ink/40 hover:bg-paper",
  ghost: "text-ink-soft hover:bg-ink/5",
  danger: "bg-surface text-danger border border-danger/40 hover:bg-danger-soft",
};
const buttonSizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[13px]",
  md: "h-10 px-3.5 text-sm",
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
const control =
  "w-full rounded-[var(--radius-sm)] border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-faint focus:border-ledger focus:outline-none focus:ring-2 focus:ring-ledger/15 disabled:bg-paper disabled:text-muted";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={clsx(control, "h-10", props.type === "number" && "num", className)} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select {...props} className={clsx(control, "h-10 pr-8", className)}>
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
    <span className="text-[13px] font-semibold text-ink-soft">
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
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && <BackLink href={back.href} label={back.label} />}
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.01em] text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-[70ch] text-sm text-muted">{description}</p>}
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
    <section className={clsx("rounded-[var(--radius-md)] border border-line bg-surface", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            {title && <h2 className="text-[15px] font-bold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className={clsx(padded && "p-4")}>{children}</div>
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
        "grid grid-cols-2 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]",
        className,
      )}
    >
      {items.map((it, i) => (
        <div key={i} className="border-b border-r border-line px-4 py-3 last:border-r-0 sm:border-b-0">
          <dt className="text-[13px] text-muted">{it.label}</dt>
          <dd className={clsx("num mt-1 text-[22px] font-bold leading-tight", it.tone === "good" && "text-ledger", it.tone === "bad" && "text-danger")}>
            {it.value}
          </dd>
          {it.note && <p className="mt-0.5 text-xs text-muted">{it.note}</p>}
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
        "sticky top-0 border-b border-line bg-paper/95 px-3 py-2 text-left text-[12.5px] font-semibold text-muted",
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
  return <tr className={clsx("hover:bg-paper/60", muted && "text-muted", className)}>{children}</tr>;
}

// ---------------------------------------------------------------------
// Estados y etiquetas
// ---------------------------------------------------------------------
type Tone = "neutral" | "good" | "warn" | "bad" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-ink/6 text-ink-soft",
  good: "bg-ledger-soft text-ledger-dark",
  warn: "bg-warn-soft text-warn",
  bad: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", tones[tone], className)}>
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
        "rounded-[var(--radius-sm)] border-l-4 px-3.5 py-2.5 text-sm",
        tone === "bad" && "border-danger bg-danger-soft text-danger",
        tone === "warn" && "border-warn bg-warn-soft text-warn",
        tone === "good" && "border-ledger bg-ledger-soft text-ledger-dark",
        tone === "info" && "border-info bg-info-soft text-info",
        tone === "neutral" && "border-line-strong bg-paper text-ink-soft",
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
    <div className="flex flex-col items-start gap-2 px-4 py-10 sm:items-center sm:text-center">
      <p className="font-semibold text-ink">{title}</p>
      {children && <p className="max-w-[60ch] text-sm text-muted">{children}</p>}
      {action}
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
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold",
            t.key === current ? "border-ledger text-ink" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClass } from "./ui";

export type FilterField =
  | { type: "date"; name: string; label: string }
  | { type: "text"; name: string; label: string; placeholder?: string; width?: string }
  | { type: "number"; name: string; label: string; placeholder?: string }
  | { type: "select"; name: string; label: string; options: { value: string; label: string }[]; empty?: string }
  | { type: "checkbox"; name: string; label: string };

/**
 * Barra de filtros en una sola fila. Funciona con la URL (?from=…), así
 * los filtros se pueden combinar, compartir y exportar tal cual.
 */
export function FilterBar({ fields, values, basePath, extra }: { fields: FilterField[]; values: Record<string, string | undefined>; basePath: string; extra?: ReactNode }) {
  const active = fields.some((f) => values[f.name]);
  return (
    <form method="get" action={basePath} className="mb-4 flex flex-wrap items-end gap-2.5 rounded-[var(--radius-md)] border border-line bg-surface p-3">
      {fields.map((f) => {
        const id = `f-${f.name}`;
        const common = "h-9 rounded-[var(--radius-sm)] border border-line-strong bg-surface px-2.5 text-[13.5px] focus:border-ledger focus:outline-none";
        if (f.type === "checkbox") {
          return (
            <label key={f.name} className="flex h-9 items-center gap-2 text-[13.5px] font-medium">
              <input type="checkbox" name={f.name} value="true" defaultChecked={values[f.name] === "true"} className="h-4 w-4 accent-[var(--color-ledger)]" />
              {f.label}
            </label>
          );
        }
        return (
          <div key={f.name} className="flex flex-col gap-1">
            <label htmlFor={id} className="text-xs font-semibold text-muted">
              {f.label}
            </label>
            {f.type === "select" ? (
              <select id={id} name={f.name} defaultValue={values[f.name] ?? ""} className={`${common} min-w-36 pr-7`}>
                <option value="">{f.empty ?? "Todos"}</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                name={f.name}
                type={f.type === "number" ? "number" : f.type}
                defaultValue={values[f.name] ?? ""}
                placeholder={"placeholder" in f ? f.placeholder : undefined}
                className={`${common} ${f.type === "text" ? (f.width ?? "w-52") : f.type === "number" ? "num w-28" : "num w-[9.5rem]"}`}
              />
            )}
          </div>
        );
      })}
      <div className="flex gap-2">
        <button className={buttonClass("primary", "sm", "h-9")}>Aplicar filtros</button>
        {active && (
          <Link href={basePath} className={buttonClass("ghost", "sm", "h-9")}>
            Quitar filtros
          </Link>
        )}
      </div>
      {extra && <div className="ml-auto flex gap-2">{extra}</div>}
    </form>
  );
}

/** Botones para exportar exactamente lo filtrado. */
export function ExportLinks({ type, filters }: { type: string; filters: Record<string, string> }) {
  const q = new URLSearchParams({ ...filters, tipo: type });
  return (
    <>
      <a className={buttonClass("secondary", "sm", "h-9")} href={`/api/exportar?${q.toString()}&formato=xlsx`}>
        Exportar Excel
      </a>
      <a className={buttonClass("secondary", "sm", "h-9")} href={`/api/exportar?${q.toString()}&formato=csv`}>
        CSV
      </a>
    </>
  );
}

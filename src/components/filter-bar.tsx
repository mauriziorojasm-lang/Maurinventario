import { SlidersHorizontal } from "lucide-react";
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
export function FilterBar({
  fields,
  values,
  basePath,
  extra,
}: {
  fields: FilterField[];
  values: Record<string, string | undefined>;
  basePath: string;
  extra?: ReactNode;
}) {
  const activeCount = fields.filter((f) => values[f.name]).length;
  const active = activeCount > 0;
  const toggleId = `filtros-${basePath.replace(/\W+/g, "")}`;
  return (
    <div className="mb-4">
      {/* En el móvil los filtros se pliegan detrás de un botón (sin JavaScript) */}
      <input type="checkbox" id={toggleId} className="peer sr-only" />
      <label
        htmlFor={toggleId}
        className="press flex h-11 cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-md)] border border-line bg-surface px-4 text-sm font-semibold shadow-[var(--shadow-card)] peer-checked:rounded-b-none peer-focus-visible:outline-2 peer-focus-visible:outline-brand md:hidden"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal size={17} strokeWidth={2.25} className="text-brand" />
          Filtros
          {active && <span className="num rounded-full bg-brand px-1.5 text-[11.5px] font-bold leading-5 text-on-brand">{activeCount}</span>}
        </span>
        <span className="text-[12.5px] font-medium text-muted">{active ? "Cambiar" : "Mostrar"}</span>
      </label>
      <form
        method="get"
        action={basePath}
        className="flex flex-wrap items-end gap-2.5 rounded-[var(--radius-md)] border border-line bg-surface p-3 shadow-[var(--shadow-card)] max-md:hidden max-md:rounded-t-none max-md:border-t-0 max-md:peer-checked:flex max-md:[&>div]:w-full max-md:[&_input:not([type=checkbox])]:w-full max-md:[&_select]:w-full"
      >
        {fields.map((f) => {
          const id = `f-${f.name}`;
          const common =
            "h-11 rounded-[var(--radius-sm)] border border-line-strong bg-surface px-2.5 text-base focus:border-brand focus:outline-none md:h-9 md:text-[13.5px]";
          if (f.type === "checkbox") {
            return (
              <label key={f.name} className="flex h-9 items-center gap-2 text-[13.5px] font-medium">
                <input type="checkbox" name={f.name} value="true" defaultChecked={values[f.name] === "true"} className="h-4 w-4 accent-[var(--color-brand)]" />
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
        <div className="flex gap-2 max-md:w-full">
          <button className={buttonClass("primary", "sm", "h-11 flex-1 md:h-9 md:flex-none")}>Aplicar filtros</button>
          {active && (
            <Link href={basePath} className={buttonClass("ghost", "sm", "h-11 md:h-9")}>
              Quitar filtros
            </Link>
          )}
        </div>
        {extra && <div className="ml-auto flex gap-2 max-md:ml-0">{extra}</div>}
      </form>
    </div>
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

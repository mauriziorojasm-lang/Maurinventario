import type { Column } from "./reports";

/**
 * Celda de texto para un CSV que se abrirá en Excel.
 * Si empieza por = + - @ (o tabulador/retorno), Excel la ejecutaría como
 * fórmula: se le antepone un apóstrofo para que se vea como texto.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV con «;» y coma decimal, para que Excel en español lo abra bien. */
export function toCsv(columns: Column[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map((c) => csvCell(c.label)).join(";")];
  for (const r of rows) {
    lines.push(
      columns
        .map((c) => {
          const v = c.value(r);
          if (v === null || v === undefined) return "";
          if (c.kind === "date") {
            const [y, m, d] = String(v).slice(0, 10).split("-");
            return `${d}/${m}/${y}`;
          }
          // Los números van tal cual (sin apóstrofo) para que Excel pueda sumarlos
          if (c.kind === "int" || c.kind === "money" || c.kind === "money4" || c.kind === "pct") return String(Number(v)).replace(".", ",");
          return csvCell(String(v));
        })
        .join(";"),
    );
  }
  return lines.join("\r\n");
}

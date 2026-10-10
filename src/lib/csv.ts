/**
 * Celda de texto para un CSV que se abrirá en Excel.
 * Si empieza por = + - @ (o tabulador/retorno), Excel la ejecutaría como
 * fórmula: se le antepone un apóstrofo para que se vea como texto.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

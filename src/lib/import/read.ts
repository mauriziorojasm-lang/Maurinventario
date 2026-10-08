/**
 * Lectura de un archivo Excel (.xlsx) con ExcelJS.
 * De las celdas con fórmula se toma el último valor calculado que guardó
 * Excel / Google Sheets (igual que lo que ves en pantalla).
 */
import type ExcelJSNS from "exceljs";
import type { CellValue } from "./normalize";

export type ParsedSheet = {
  name: string;
  /** Filas tal cual, empezando por la fila 1 del Excel (índice 0). */
  rows: CellValue[][];
  /** Celdas con fórmula sin valor calculado guardado. */
  formulasWithoutValue: number;
};

export type ParsedWorkbook = {
  fileName: string;
  sheets: ParsedSheet[];
};

type RawValue = ExcelJSNS.CellValue;

function toCellValue(v: RawValue, counter: { missing: number }): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v || "formula" in v || "sharedFormula" in v) {
      const r = (v as { result?: RawValue }).result;
      if (r === undefined) {
        counter.missing++;
        return null;
      }
      if (r !== null && typeof r === "object" && "error" in (r as object)) return null;
      return toCellValue(r as RawValue, counter);
    }
    if ("richText" in v) return (v as ExcelJSNS.CellRichTextValue).richText.map((t) => t.text).join("");
    if ("text" in v) return String((v as { text: unknown }).text ?? "");
    if ("error" in v) return null;
  }
  return String(v);
}

export async function readWorkbook(data: ArrayBuffer, fileName: string): Promise<ParsedWorkbook> {
  const mod = await import("exceljs");
  const ExcelJS = ((mod as unknown as { default?: typeof ExcelJSNS }).default ?? mod) as typeof ExcelJSNS;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);

  const sheets: ParsedSheet[] = [];
  wb.eachSheet((ws) => {
    const counter = { missing: 0 };
    const rows: CellValue[][] = [];
    const maxCol = Math.min(ws.columnCount || 0, 200);
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values: CellValue[] = [];
      for (let c = 1; c <= maxCol; c++) {
        values.push(toCellValue(row.getCell(c).value, counter));
      }
      rows[rowNumber - 1] = values;
    });
    // Rellenar huecos de filas que ExcelJS no devolvió
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    // Quitar filas vacías del final
    while (rows.length && rows[rows.length - 1].every((v) => v === null || v === "")) rows.pop();
    sheets.push({ name: ws.name, rows, formulasWithoutValue: counter.missing });
  });

  return { fileName, sheets };
}

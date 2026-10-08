/**
 * Detección automática: en qué fila están las cabeceras, qué tipo de
 * hoja es y qué columna corresponde a cada campo.
 */
import { FIELDS, SHEET_TYPES, type SheetType } from "./fields";
import { normHeader, normKey } from "./normalize";
import type { ParsedSheet } from "./read";

export type ColumnMapping = Record<string, number | null>;

export type SheetConfig = {
  sheetName: string;
  type: SheetType;
  /** Índice (desde 0) de la fila de cabeceras. */
  headerRow: number;
  mapping: ColumnMapping;
  /** Explicación de por qué se ha elegido este tipo. */
  reason: string;
};

const IGNORE_HINTS = ["analisis", "beneficio", "reparto", "resumen", "pendientes", "metodo de envio", "categorias", "dashboard", "informe"];

function words(s: string): string[] {
  return s.split(" ").filter(Boolean);
}

/** Relaciona columnas y campos: primero coincidencias exactas, después parciales. */
export function autoMap(type: SheetType, headers: string[]): { mapping: ColumnMapping; exact: number; partial: number } {
  const mapping: ColumnMapping = {};
  if (type === "ignorar") return { mapping, exact: 0, partial: 0 };
  const fields = FIELDS[type];
  const used = new Set<number>();
  let exact = 0;
  let partial = 0;
  for (const f of fields) mapping[f.key] = null;

  // 1) exactas, respetando el orden de preferencia de los sinónimos
  for (const f of fields) {
    for (const syn of f.synonyms) {
      const idx = headers.findIndex((h, i) => !used.has(i) && h === syn);
      if (idx !== -1) {
        mapping[f.key] = idx;
        used.add(idx);
        exact++;
        break;
      }
    }
  }
  // 2) parciales: la cabecera contiene todas las palabras del sinónimo
  for (const f of fields) {
    if (mapping[f.key] !== null) continue;
    for (const syn of f.synonyms) {
      const sw = words(syn);
      if (sw.length === 1 && sw[0].length < 3) continue;
      const idx = headers.findIndex((h, i) => {
        if (used.has(i) || !h) return false;
        const hw = words(h);
        return sw.every((w) => hw.includes(w));
      });
      if (idx !== -1) {
        mapping[f.key] = idx;
        used.add(idx);
        partial++;
        break;
      }
    }
  }
  return { mapping, exact, partial };
}

function nameHint(type: SheetType, sheetName: string): boolean {
  const n = normKey(sheetName);
  const def = SHEET_TYPES.find((t) => t.type === type);
  return !!def?.nameHints.some((h) => n.includes(h));
}

/** Busca la fila de cabeceras entre las 15 primeras. */
export function findHeaderRow(sheet: ParsedSheet): number {
  const allSyn = new Set(Object.values(FIELDS).flatMap((fs) => fs.flatMap((f) => f.synonyms)));
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(15, sheet.rows.length); i++) {
    const headers = (sheet.rows[i] ?? []).map(normHeader);
    const textCells = (sheet.rows[i] ?? []).filter((v) => typeof v === "string" && v.trim() !== "").length;
    const score = headers.filter((h) => h && allSyn.has(h)).length * 10 + textCells;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

export function headersOf(sheet: ParsedSheet, headerRow: number): string[] {
  return (sheet.rows[headerRow] ?? []).map(normHeader);
}

export function detectSheet(sheet: ParsedSheet): SheetConfig {
  const base: SheetConfig = { sheetName: sheet.name, type: "ignorar", headerRow: 0, mapping: {}, reason: "" };
  if (sheet.rows.length < 2) return { ...base, reason: "La hoja está vacía." };

  const sheetKey = normKey(sheet.name);
  if (IGNORE_HINTS.some((h) => sheetKey.includes(h))) {
    return { ...base, reason: "Por su nombre, parece una hoja de cálculos o resúmenes, no de datos." };
  }

  const headerRow = findHeaderRow(sheet);
  const headers = headersOf(sheet, headerRow);

  let best: { type: SheetType; score: number; mapping: ColumnMapping } | null = null;
  for (const t of ["ventas", "compras", "productos", "moviles", "responsables"] as const) {
    const { mapping, exact, partial } = autoMap(t, headers);
    const required = FIELDS[t].filter((f) => f.required);
    const allRequired = required.every((f) => mapping[f.key] !== null);
    if (!allRequired) continue;
    const hint = nameHint(t, sheet.name);
    if (!hint && exact < 2) continue;
    const score = exact * 3 + partial + (hint ? 5 : 0) + required.length;
    if (!best || score > best.score) best = { type: t, score, mapping };
  }

  if (!best) {
    return { ...base, headerRow, reason: "No se han reconocido las columnas necesarias." };
  }
  const label = SHEET_TYPES.find((s) => s.type === best.type)?.label ?? best.type;
  return {
    sheetName: sheet.name,
    type: best.type,
    headerRow,
    mapping: best.mapping,
    reason: `Detectada como «${label}» por sus columnas${nameHint(best.type, sheet.name) ? " y su nombre" : ""}.`,
  };
}

/** Cambia el tipo de una hoja y recalcula la relación de columnas. */
export function withType(sheet: ParsedSheet, cfg: SheetConfig, type: SheetType): SheetConfig {
  const headerRow = cfg.headerRow;
  const { mapping } = autoMap(type, headersOf(sheet, headerRow));
  return { ...cfg, type, mapping, reason: "Tipo elegido manualmente." };
}

export function withHeaderRow(sheet: ParsedSheet, cfg: SheetConfig, headerRow: number): SheetConfig {
  const { mapping } = autoMap(cfg.type, headersOf(sheet, headerRow));
  return { ...cfg, headerRow, mapping };
}

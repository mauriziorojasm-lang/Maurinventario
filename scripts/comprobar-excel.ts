/**
 * Comprueba un Excel SIN tocar ninguna base de datos:
 *   npm run import:check -- ruta/al/archivo.xlsx
 * Muestra qué hojas detecta, el resumen de la importación, los errores,
 * las advertencias y si el stock calculado cuadra con el del Excel.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { detectSheet } from "../src/lib/import/detect";
import { buildPlan, collectProductNames, suggestMerges } from "../src/lib/import/plan";
import { CONFIRMED_MERGES, DEFAULT_OPTIONS } from "../src/lib/import/presets";
import { readWorkbook } from "../src/lib/import/read";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Uso: npm run import:check -- archivo.xlsx");
    process.exit(1);
  }
  const buf = readFileSync(file);
  const wb = await readWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, basename(file));
  const configs = wb.sheets.map(detectSheet);
  console.log("\nHOJAS");
  for (const c of configs) console.log(` · ${c.sheetName.padEnd(22)} → ${c.type.padEnd(12)} (cabeceras en la fila ${c.headerRow + 1}) ${c.reason}`);

  const merges = suggestMerges(collectProductNames(wb, configs), CONFIRMED_MERGES);
  console.log("\nUNIFICACIONES DE PRODUCTOS SUGERIDAS");
  for (const m of merges) console.log(` · ${m.preset ? "[aplicada]" : "[sugerida]"} «${m.from}» → «${m.to}» · ${m.reason}`);

  const plan = buildPlan(wb, configs, { zeroPriceAsExit: DEFAULT_OPTIONS.zeroPriceAsExit, merges: merges.filter((m) => m.preset) });
  console.log("\nRESUMEN");
  console.log(JSON.stringify(plan.summary, null, 2));
  console.log("\nERRORES Y ADVERTENCIAS");
  for (const i of plan.issues.filter((x) => x.level !== "info")) console.log(` · [${i.level}] ${i.sheet}${i.row ? ` fila ${i.row}` : ""}: ${i.message}`);
  console.log("\nINFORMACIÓN");
  for (const i of plan.issues.filter((x) => x.level === "info")) console.log(` · ${i.sheet}${i.row ? ` fila ${i.row}` : ""}: ${i.message}`);
  const bad = plan.stockCheck.filter((s) => s.expected !== s.computed);
  console.log(`\nSTOCK: ${plan.stockCheck.length - bad.length} productos cuadran con el Excel, ${bad.length} no cuadran`);
  for (const b of bad) console.log(` · ${b.product}: Excel ${b.expected}, calculado ${b.computed}`);
  console.log("\nPENDIENTES DE REVISAR");
  for (const r of plan.payload.review_items) console.log(` · ${r.title}${r.details ? ` — ${r.details}` : ""}`);
  if (process.argv.includes("--json")) console.log(JSON.stringify(plan.payload));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

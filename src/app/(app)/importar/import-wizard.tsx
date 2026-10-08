"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, Figures, Notice, Panel, Select, Table, Td, Th, clsx } from "@/components/ui";
import { autoMap, detectSheet, headersOf, withHeaderRow, withType, type SheetConfig } from "@/lib/import/detect";
import { FIELDS, SHEET_TYPES, type SheetType } from "@/lib/import/fields";
import { cleanText } from "@/lib/import/normalize";
import { buildPlan, collectProductNames, suggestMerges, type ImportExisting, type ImportPlan, type IssueLevel, type MergeSuggestion } from "@/lib/import/plan";
import { CONFIRMED_MERGES, DEFAULT_OPTIONS } from "@/lib/import/presets";
import { readWorkbook, type ParsedWorkbook } from "@/lib/import/read";
import { dateTime, money, units } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

type DbResult = {
  batch_id: string;
  dry_run: boolean;
  counts: Record<string, number>;
  errors: { source_ref: string; error: string }[];
  stock_by_product: Record<string, { name: string; stock: number; stock_value: number; created: boolean }>;
  integrity: { check: string; ok: boolean; problems: number; detail: string | null }[];
  lot_costs: { source_ref: string; order_number: number; unit_cost_real: number }[];
  totals: Record<string, number>;
};

const STEPS = ["Archivo", "Hojas y columnas", "Revisión", "Simulación", "Resultado"];

function display(v: unknown) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

export function ImportWizard({ existing, previous }: { existing: ImportExisting; previous: { id: string; file_name: string; created_at: string; summary: Record<string, unknown> }[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [wb, setWb] = useState<ParsedWorkbook | null>(null);
  const [configs, setConfigs] = useState<SheetConfig[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [merges, setMerges] = useState<(MergeSuggestion & { on: boolean })[]>([]);
  const [zeroAsExit, setZeroAsExit] = useState(DEFAULT_OPTIONS.zeroPriceAsExit);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [issueFilter, setIssueFilter] = useState<IssueLevel | "all">("error");
  const [dry, setDry] = useState<DbResult | null>(null);
  const [final, setFinal] = useState<DbResult | null>(null);
  const [running, setRunning] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [openSheet, setOpenSheet] = useState<string | null>(null);

  async function onFile(file: File) {
    setReading(true);
    setReadError(null);
    try {
      const parsed = await readWorkbook(await file.arrayBuffer(), file.name);
      const cfgs = parsed.sheets.map(detectSheet);
      setWb(parsed);
      setConfigs(cfgs);
      setOpenSheet(cfgs.find((c) => c.type !== "ignorar")?.sheetName ?? null);
      setMerges(suggestMerges(collectProductNames(parsed, cfgs), CONFIRMED_MERGES).map((m) => ({ ...m, on: m.preset })));
      setStep(1);
    } catch (e) {
      setReadError(e instanceof Error ? `No se ha podido leer el archivo: ${e.message}` : "No se ha podido leer el archivo.");
    } finally {
      setReading(false);
    }
  }

  function updateConfig(name: string, fn: (c: SheetConfig) => SheetConfig) {
    setConfigs((cs) => cs.map((c) => (c.sheetName === name ? fn(c) : c)));
    setPlan(null);
    setDry(null);
  }

  const missingRequired = useMemo(
    () =>
      configs
        .filter((c) => c.type !== "ignorar")
        .flatMap((c) => FIELDS[c.type as Exclude<SheetType, "ignorar">].filter((f) => f.required && (c.mapping[f.key] ?? null) === null).map((f) => `${c.sheetName}: ${f.label}`)),
    [configs],
  );

  function makePlan() {
    if (!wb) return;
    const p = buildPlan(wb, configs, { zeroPriceAsExit: zeroAsExit, merges: merges.filter((m) => m.on) }, existing);
    setPlan(p);
    setDry(null);
    setConfirmed(false);
    setIssueFilter(p.summary.errors > 0 ? "error" : p.summary.warnings > 0 ? "warning" : "all");
    setStep(2);
  }

  async function runImport(dryRun: boolean) {
    if (!plan) return;
    setRunning(true);
    setDbError(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("import_data", { p: plan.payload, p_dry_run: dryRun });
    setRunning(false);
    if (error) {
      setDbError(error.message);
      return;
    }
    if (dryRun) {
      setDry(data as DbResult);
      setStep(3);
    } else {
      setFinal(data as DbResult);
      setStep(4);
      router.refresh();
    }
  }

  const sheetsInUse = configs.filter((c) => c.type !== "ignorar");

  // Comparación con lo que calculaba el Excel
  const checks = useMemo(() => {
    const r = dry ?? final;
    if (!plan || !r) return null;
    const byRef = new Map(r.lot_costs.map((l) => [l.source_ref, Number(l.unit_cost_real)]));
    const imported = new Set(plan.payload.purchase_orders.map((p) => p.order_number));
    const expected = plan.expectedRealCosts.filter((e) => imported.has(e.order_number));
    const costBad = expected.filter((e) => {
      const got = byRef.get(e.source_ref);
      return got === undefined || Math.abs(got - e.expected) > 0.0001;
    });
    const stockByName = new Map(Object.values(r.stock_by_product).map((s) => [s.name, Number(s.stock)]));
    const stockBad = plan.stockCheck.filter((s) => stockByName.get(s.product) !== s.expected);
    return { costTotal: expected.length, costBad, stockTotal: plan.stockCheck.length, stockBad };
  }, [plan, dry, final]);

  return (
    <div>
      <ol className="mb-6 flex flex-wrap gap-2 text-[13px]" aria-label="Pasos de la importación">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className={clsx(
              "rounded-full border px-3 py-1 font-semibold",
              i === step ? "border-ink bg-ink text-white" : i < step ? "border-ledger/40 bg-ledger-soft text-ledger-dark" : "border-line text-muted",
            )}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <Panel title="Selecciona el archivo Excel">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed border-line-strong bg-paper px-6 py-12 text-center hover:border-ledger">
              <span className="text-base font-semibold">Elige tu archivo .xlsx</span>
              <span className="text-sm text-muted">Se lee en tu navegador. Nada se guarda hasta que confirmes al final.</span>
              <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              <span className="mt-2 rounded-[var(--radius-sm)] bg-ledger px-4 py-2 text-sm font-semibold text-white">{reading ? "Leyendo…" : "Elegir archivo"}</span>
            </label>
            {readError && (
              <Notice tone="bad" className="mt-3">
                {readError}
              </Notice>
            )}
          </Panel>
          <Panel title="Cómo funciona">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-soft">
              <li>MaurInventario lee todas las hojas y detecta qué contiene cada una.</li>
              <li>Relacionas las columnas con los campos (se proponen solas).</li>
              <li>Ves los errores, avisos y el resumen.</li>
              <li>Simulas la importación completa: se calcula todo y se deshace.</li>
              <li>Si cuadra, confirmas y se guarda en una sola operación.</li>
            </ol>
            <p className="mt-3 text-[13px] text-muted">Si vuelves a importar el mismo Excel, lo que ya existe se omite: no se duplican pedidos, ventas ni productos.</p>
          </Panel>
          {previous.length > 0 && (
            <Panel title="Importaciones anteriores" className="lg:col-span-2" padded={false}>
              <Table>
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Archivo</Th>
                    <Th num>Productos</Th>
                    <Th num>Pedidos</Th>
                    <Th num>Ventas</Th>
                    <Th num>Salidas</Th>
                  </tr>
                </thead>
                <tbody>
                  {previous.map((b) => {
                    const c = (b.summary?.counts ?? {}) as Record<string, number>;
                    return (
                      <tr key={b.id}>
                        <Td>{dateTime(b.created_at)}</Td>
                        <Td>{b.file_name}</Td>
                        <Td num>{c.products_created ?? "—"}</Td>
                        <Td num>{c.purchase_orders_created ?? "—"}</Td>
                        <Td num>{c.sales_created ?? "—"}</Td>
                        <Td num>{c.stock_exits_created ?? "—"}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Panel>
          )}
        </div>
      )}

      {step === 1 && wb && (
        <div className="flex flex-col gap-5">
          <Panel title={`Hojas de «${wb.fileName}»`} description="Comprueba el tipo de cada hoja. Las de cálculos o resúmenes no se importan." padded={false}>
            <Table>
              <thead>
                <tr>
                  <Th>Hoja</Th>
                  <Th>Tipo</Th>
                  <Th>Fila de cabeceras</Th>
                  <Th num>Filas</Th>
                  <Th>Detección</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {configs.map((c) => {
                  const sheet = wb.sheets.find((s) => s.name === c.sheetName)!;
                  return (
                    <tr key={c.sheetName} className={clsx(c.type === "ignorar" && "text-muted")}>
                      <Td className="font-semibold">{c.sheetName}</Td>
                      <Td>
                        <Select className="h-9 min-w-52" value={c.type} onChange={(e) => updateConfig(c.sheetName, (cfg) => withType(sheet, cfg, e.target.value as SheetType))}>
                          {SHEET_TYPES.map((t) => (
                            <option key={t.type} value={t.type}>
                              {t.label}
                            </option>
                          ))}
                        </Select>
                      </Td>
                      <Td>
                        {c.type !== "ignorar" && (
                          <Select className="h-9 w-24" value={c.headerRow} onChange={(e) => updateConfig(c.sheetName, (cfg) => withHeaderRow(sheet, cfg, Number(e.target.value)))}>
                            {Array.from({ length: Math.min(15, sheet.rows.length) }, (_, i) => (
                              <option key={i} value={i}>
                                Fila {i + 1}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Td>
                      <Td num>{Math.max(0, sheet.rows.length - c.headerRow - 1)}</Td>
                      <Td className="max-w-80 text-[13px]">{c.reason}</Td>
                      <Td>
                        {c.type !== "ignorar" && (
                          <Button size="sm" variant={openSheet === c.sheetName ? "primary" : "secondary"} onClick={() => setOpenSheet(openSheet === c.sheetName ? null : c.sheetName)}>
                            Columnas
                          </Button>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Panel>

          {sheetsInUse
            .filter((c) => c.sheetName === openSheet)
            .map((c) => {
              const sheet = wb.sheets.find((s) => s.name === c.sheetName)!;
              const headers = (sheet.rows[c.headerRow] ?? []).map((h, i) => ({ i, label: cleanText(h) ?? `Columna ${i + 1}` }));
              const normalized = headersOf(sheet, c.headerRow);
              const auto = autoMap(c.type, normalized).mapping;
              const preview = sheet.rows.slice(c.headerRow + 1, c.headerRow + 6);
              const fields = FIELDS[c.type as Exclude<SheetType, "ignorar">];
              return (
                <Panel key={c.sheetName} title={`Columnas de «${c.sheetName}»`} description="Cada campo de MaurInventario con la columna del Excel de la que se lee. Puedes cambiarla.">
                  <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
                    {fields.map((f) => (
                      <label key={f.key} className="flex flex-col gap-1">
                        <span className="text-[13px] font-semibold text-ink-soft">
                          {f.label}
                          {f.required && <span className="text-danger"> *</span>}
                          {f.verifyOnly && <span className="ml-1 font-normal text-muted">(solo para comprobar)</span>}
                        </span>
                        <Select
                          className={clsx("h-9", f.required && c.mapping[f.key] == null && "border-danger")}
                          value={c.mapping[f.key] ?? ""}
                          onChange={(e) => updateConfig(c.sheetName, (cfg) => ({ ...cfg, mapping: { ...cfg.mapping, [f.key]: e.target.value === "" ? null : Number(e.target.value) } }))}
                        >
                          <option value="">No usar</option>
                          {headers.map((h) => (
                            <option key={h.i} value={h.i}>
                              {h.label}
                              {auto[f.key] === h.i ? " (sugerida)" : ""}
                            </option>
                          ))}
                        </Select>
                        {f.help && <span className="text-xs text-muted">{f.help}</span>}
                      </label>
                    ))}
                  </div>
                  <h3 className="mb-2 mt-5 text-sm font-bold">Vista previa (primeras filas)</h3>
                  <Table>
                    <thead>
                      <tr>
                        {fields
                          .filter((f) => c.mapping[f.key] != null)
                          .map((f) => (
                            <Th key={f.key}>{f.label}</Th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i}>
                          {fields
                            .filter((f) => c.mapping[f.key] != null)
                            .map((f) => (
                              <Td key={f.key} className="max-w-56 truncate text-[13px]">
                                {display(r[c.mapping[f.key]!])}
                              </Td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Panel>
              );
            })}

          {merges.length > 0 && (
            <Panel title="Productos que podrían ser el mismo" description="Si los marcas, se importan como un único producto con todas sus compras y ventas.">
              <ul className="flex flex-col gap-2">
                {merges.map((m, i) => (
                  <li key={i}>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-ledger)]" checked={m.on} onChange={(e) => setMerges((ms) => ms.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
                      <span>
                        «{m.from}» es «{m.to}»
                        <span className="block text-xs text-muted">{m.reason}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Reglas">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-ledger)]" checked={zeroAsExit} onChange={(e) => setZeroAsExit(e.target.checked)} />
              <span>
                Las ventas a 0 € son salidas sin venta (regalo, pérdida…)
                <span className="block text-xs text-muted">No cuentan como ventas ni bajan el ticket medio; su coste se registra como pérdida. Si la nota dice «regalo» o «pérdida» se usa como motivo.</span>
              </span>
            </label>
            <p className="mt-3 text-[13px] text-muted">Si en una venta el importe total y el precio unitario no cuadran, manda el importe total.</p>
          </Panel>

          {missingRequired.length > 0 && <Notice tone="bad" title="Faltan columnas obligatorias">{missingRequired.join("; ")}</Notice>}
          <div className="flex gap-2">
            <Button onClick={() => setStep(0)}>Cambiar archivo</Button>
            <Button variant="primary" disabled={missingRequired.length > 0 || sheetsInUse.length === 0} onClick={makePlan}>
              Validar datos
            </Button>
          </div>
        </div>
      )}

      {step === 2 && plan && (
        <div className="flex flex-col gap-5">
          <Figures
            items={[
              { label: "Filas válidas", value: units(plan.summary.rows.valid), note: `de ${units(plan.summary.rows.total)} (${plan.summary.rows.empty} vacías)` },
              { label: "Filas con errores", value: units(plan.summary.rows.withErrors), tone: plan.summary.rows.withErrors ? "bad" : "default" },
              { label: "Posibles duplicados", value: units(plan.summary.rows.possibleDuplicates) },
              { label: "Productos nuevos", value: units(plan.summary.products.new), note: `${plan.summary.products.existing} ya existen` },
              { label: "Pedidos de compra nuevos", value: units(plan.summary.purchaseOrders.new), note: `${plan.summary.purchaseOrders.duplicated} ya existen` },
              { label: "Ventas nuevas", value: units(plan.summary.sales.new), note: `${money(plan.summary.sales.amount)}${plan.summary.sales.duplicated ? `, ${plan.summary.sales.duplicated} ya importadas` : ""}` },
              { label: "Salidas sin venta", value: units(plan.summary.exits.new), note: plan.summary.exits.pendingReason ? `${plan.summary.exits.pendingReason} sin motivo` : undefined },
              { label: "Pendientes de revisar", value: units(plan.summary.reviewItems) },
            ]}
          />
          {plan.summary.responsibles.new.length > 0 && (
            <Notice tone="info" title="Responsables que se crearán">
              {plan.summary.responsibles.new.join(", ")}
              {plan.summary.responsibles.partners.length > 0 && `. Socios del reparto: ${plan.summary.responsibles.partners.join(", ")}.`}
            </Notice>
          )}
          {plan.summary.platformsNew.length > 0 && <Notice tone="info">Plataformas nuevas: {plan.summary.platformsNew.join(", ")}.</Notice>}

          <Panel
            title="Errores y avisos"
            padded={false}
            actions={
              <div className="flex gap-1">
                {(
                  [
                    ["error", `Errores (${plan.summary.errors})`],
                    ["warning", `Avisos (${plan.summary.warnings})`],
                    ["info", "Información"],
                    ["all", "Todo"],
                  ] as const
                ).map(([k, l]) => (
                  <Button key={k} size="sm" variant={issueFilter === k ? "primary" : "ghost"} onClick={() => setIssueFilter(k)}>
                    {l}
                  </Button>
                ))}
              </div>
            }
          >
            {plan.issues.filter((i) => issueFilter === "all" || i.level === issueFilter).length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">Nada en esta categoría.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Tipo</Th>
                      <Th>Hoja</Th>
                      <Th num>Fila</Th>
                      <Th>Detalle</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.issues
                      .filter((i) => issueFilter === "all" || i.level === issueFilter)
                      .map((i, k) => (
                        <tr key={k}>
                          <Td>{i.level === "error" ? <Badge tone="bad">Error</Badge> : i.level === "warning" ? <Badge tone="warn">Aviso</Badge> : <Badge tone="info">Info</Badge>}</Td>
                          <Td>{i.sheet}</Td>
                          <Td num>{i.row ?? "—"}</Td>
                          <Td className="text-[13.5px]">{i.message}</Td>
                        </tr>
                      ))}
                  </tbody>
                </Table>
              </div>
            )}
          </Panel>

          {plan.stockCheck.length > 0 && (
            <Notice tone={plan.stockCheck.some((s) => s.expected !== s.computed) ? "warn" : "good"}>
              Stock: {plan.stockCheck.filter((s) => s.expected === s.computed).length} de {plan.stockCheck.length} productos cuadran con la columna de stock del Excel.
              {plan.stockCheck
                .filter((s) => s.expected !== s.computed)
                .slice(0, 10)
                .map((s) => (
                  <span key={s.product} className="block">
                    {s.product}: Excel {s.expected}, calculado {s.computed}
                  </span>
                ))}
            </Notice>
          )}

          <Panel title="Pendientes de revisar después" description="Se guardarán en «Pendientes de revisar» para completarlos desde la aplicación." padded={false}>
            {plan.payload.review_items.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted">Ninguno.</p>
            ) : (
              <ul className="max-h-72 divide-y divide-line overflow-y-auto">
                {plan.payload.review_items.map((r, i) => (
                  <li key={i} className="px-4 py-2 text-sm">
                    <span className="font-semibold">{r.title}</span>
                    {r.details && <span className="block text-[13px] text-muted">{r.details}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {dbError && <Notice tone="bad">{dbError}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setStep(1)}>Volver a las columnas</Button>
            <Button variant="primary" disabled={running} onClick={() => runImport(true)}>
              {running ? "Simulando…" : "Simular importación"}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && plan && dry && (
        <div className="flex flex-col gap-5">
          <Notice tone="info" title="Simulación terminada: no se ha guardado nada">
            La base de datos ha hecho la importación completa y la ha deshecho. Este es el resultado que tendrías.
          </Notice>
          <ResultFigures r={dry} />
          <IntegrityPanel r={dry} checks={checks} />
          {dry.errors.length > 0 && <ErrorsPanel r={dry} />}
          <Panel title="Confirmación del administrador">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-ledger)]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              He revisado el resumen, los avisos y la simulación, y quiero importar estos datos.
            </label>
          </Panel>
          {dbError && <Notice tone="bad">{dbError}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setStep(2)}>Volver</Button>
            <Button variant="primary" disabled={!confirmed || running} onClick={() => runImport(false)}>
              {running ? "Importando…" : "Importar definitivamente"}
            </Button>
          </div>
        </div>
      )}

      {step === 4 && final && (
        <div className="flex flex-col gap-5">
          <Notice tone="good" title="Importación completada">
            Los datos ya están en MaurInventario. Los casos pendientes están en <Link href="/revision">Pendientes de revisar</Link>.
          </Notice>
          <ResultFigures r={final} />
          <IntegrityPanel r={final} checks={checks} />
          {final.errors.length > 0 && <ErrorsPanel r={final} />}
          <div className="flex flex-wrap gap-2">
            <Link href="/" className="rounded-[var(--radius-sm)] bg-ledger px-4 py-2 text-sm font-semibold text-white">
              Ir al inicio
            </Link>
            <Link href="/revision" className="rounded-[var(--radius-sm)] border border-line-strong px-4 py-2 text-sm font-semibold">
              Revisar pendientes
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultFigures({ r }: { r: DbResult }) {
  const c = r.counts;
  return (
    <Figures
      items={[
        { label: "Productos", value: units(c.products_created), note: `${c.products_existing} ya existían` },
        { label: "Pedidos de compra", value: units(c.purchase_orders_created), note: `${c.purchase_items_created} líneas, ${c.purchase_orders_duplicated} omitidos` },
        { label: "Ventas", value: units(c.sales_created), note: `${c.sales_duplicated} omitidas, ${c.sales_failed} con error` },
        { label: "Salidas sin venta", value: units(c.stock_exits_created), note: c.stock_exits_failed ? `${c.stock_exits_failed} con error` : undefined },
        { label: "Importe de las ventas", value: money(r.totals.sales_amount) },
        { label: "Stock resultante", value: units(r.totals.stock_units), note: money(r.totals.stock_value) },
        { label: "Pendientes de revisar", value: units(c.review_items_created) },
      ]}
    />
  );
}

function IntegrityPanel({ r, checks }: { r: DbResult; checks: { costTotal: number; costBad: { source_ref: string; product: string; expected: number }[]; stockTotal: number; stockBad: { product: string; expected: number }[] } | null }) {
  return (
    <Panel title="Comprobación de integridad">
      <ul className="flex flex-col gap-1.5 text-sm">
        {r.integrity.map((i) => (
          <li key={i.check} className="flex items-start gap-2">
            {i.ok ? <Badge tone="good">Correcto</Badge> : <Badge tone="warn">{i.problems} pendiente(s)</Badge>}
            <span>
              {i.check}
              {!i.ok && i.detail && <span className="block text-xs text-muted">{i.detail}</span>}
            </span>
          </li>
        ))}
        {checks && checks.costTotal > 0 && (
          <li className="flex items-start gap-2">
            {checks.costBad.length === 0 ? <Badge tone="good">Correcto</Badge> : <Badge tone="warn">{checks.costBad.length} distintos</Badge>}
            <span>
              Coste real por unidad igual que el que calculaba el Excel ({checks.costTotal - checks.costBad.length} de {checks.costTotal} líneas)
              {checks.costBad.slice(0, 5).map((b) => (
                <span key={b.source_ref} className="block text-xs text-muted">
                  {b.source_ref} {b.product}: Excel {b.expected}
                </span>
              ))}
            </span>
          </li>
        )}
        {checks && checks.stockTotal > 0 && (
          <li className="flex items-start gap-2">
            {checks.stockBad.length === 0 ? <Badge tone="good">Correcto</Badge> : <Badge tone="warn">{checks.stockBad.length} distintos</Badge>}
            <span>
              Stock por producto igual que el del Excel ({checks.stockTotal - checks.stockBad.length} de {checks.stockTotal})
            </span>
          </li>
        )}
      </ul>
    </Panel>
  );
}

function ErrorsPanel({ r }: { r: DbResult }) {
  return (
    <Panel title="Filas que la base de datos no ha podido importar" padded={false}>
      <ul className="divide-y divide-line">
        {r.errors.map((e, i) => (
          <li key={i} className="px-4 py-2 text-sm">
            <span className="font-semibold">{e.source_ref}</span>: {e.error}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

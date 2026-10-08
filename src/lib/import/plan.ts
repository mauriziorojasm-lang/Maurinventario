/**
 * Construye el "plan de importación": convierte las filas del Excel en
 * datos estructurados (productos, pedidos de compra con sus lotes,
 * ventas con su lote de procedencia, salidas sin venta…), valida cada
 * fila y prepara el resumen que ve el administrador antes de confirmar.
 *
 * No inventa datos: si algo no se puede determinar, la fila no se
 * importa o se marca como "pendiente de revisar".
 */
import type { SheetConfig } from "./detect";
import { FIELDS } from "./fields";
import {
  brandFromName,
  cleanText,
  hash,
  isInteger,
  normKey,
  round,
  similarity,
  splitShippingMethod,
  toDate,
  toNumber,
  toPhone,
  toYes,
  type CellValue,
} from "./normalize";
import type { ParsedWorkbook } from "./read";

export type IssueLevel = "error" | "warning" | "info";
export type Issue = { level: IssueLevel; sheet: string; row: number | null; message: string };

export type ImportExisting = {
  productNames: string[];
  purchaseOrderNumbers: number[];
  saleFingerprints: string[];
  exitFingerprints: string[];
  responsibles: string[];
  mobileNumbers: number[];
  platforms: { name: string; requires_shipping: boolean }[];
  carriers: string[];
};

export const EMPTY_EXISTING: ImportExisting = {
  productNames: [],
  purchaseOrderNumbers: [],
  saleFingerprints: [],
  exitFingerprints: [],
  responsibles: [],
  mobileNumbers: [1, 2, 3, 4, 5, 6],
  platforms: [
    { name: "Vinted", requires_shipping: true },
    { name: "Wallapop", requires_shipping: true },
    { name: "En persona", requires_shipping: false },
  ],
  carriers: ["InPost", "Seur", "Correos", "DHL", "Vinted Go"],
};

export type ImportOptions = {
  /** Ventas a 0 € → salida sin venta. */
  zeroPriceAsExit: boolean;
  /** Unificaciones de productos: nombre origen → nombre destino. */
  merges: { from: string; to: string }[];
};

export type ExitReason = "regalo" | "perdida" | "otro" | "pendiente";

export type ImportPayload = {
  file_name: string;
  categories: string[];
  brands: string[];
  carriers: string[];
  platforms: { name: string; requires_shipping: boolean }[];
  mobile_devices: { number: number; name: string | null; email: string | null; phone: string | null }[];
  responsibles: { name: string; is_partner: boolean }[];
  products: {
    key: string;
    name: string;
    brand: string | null;
    category: string | null;
    description: string | null;
    sku: string | null;
    normal_sale_price: number | null;
    legacy_code: string | null;
    variant_name: string;
    source_ref: string | null;
  }[];
  purchase_orders: {
    order_number: number;
    order_date: string;
    supplier_name: string | null;
    notes: string | null;
    source_ref: string;
    costs: { cost_type: string; amount: number }[];
    items: { product_key: string; quantity: number; unit_cost: number; notes: string | null; source_ref: string }[];
  }[];
  sales: {
    fingerprint: string;
    sale_date: string;
    responsible: string;
    platform: string;
    carrier: string | null;
    mobile_number: number | null;
    shipping_status: "pendiente" | "enviado" | null;
    external_reference: string | null;
    notes: string | null;
    source_ref: string;
    items: { product_key: string; purchase_order_number: number; quantity: number; unit_price: number; notes: string | null }[];
  }[];
  stock_exits: {
    fingerprint: string;
    exit_date: string;
    product_key: string;
    purchase_order_number: number;
    quantity: number;
    reason: ExitReason;
    responsible: string | null;
    notes: string | null;
    source_ref: string;
  }[];
  review_items: { kind: string; entity_type: string | null; title: string; details: string | null; payload: unknown }[];
};

export type MergeSuggestion = { from: string; to: string; reason: string; preset: boolean };

export type PlanSummary = {
  rows: { total: number; valid: number; withErrors: number; empty: number; possibleDuplicates: number };
  products: { new: number; existing: number; fromPurchasesOnly: number; merged: number };
  purchaseOrders: { new: number; duplicated: number; lines: number; linesSkipped: number };
  sales: { new: number; duplicated: number; withoutLot: number; withErrors: number; units: number; amount: number };
  exits: { new: number; duplicated: number; pendingReason: number };
  responsibles: { new: string[]; partners: string[] };
  platformsNew: string[];
  reviewItems: number;
  errors: number;
  warnings: number;
};

export type ImportPlan = {
  payload: ImportPayload;
  issues: Issue[];
  summary: PlanSummary;
  /** Comprobación: stock que indicaba el Excel frente al calculado (compras − ventas − salidas). */
  stockCheck: { product: string; expected: number; computed: number }[];
  /** Coste unitario real que calculaba el Excel por línea de compra (para comparar). */
  expectedRealCosts: { source_ref: string; order_number: number; product: string; expected: number }[];
};

type RowGetter = (field: string) => CellValue;

function rowsOf(wb: ParsedWorkbook, cfg: SheetConfig) {
  const sheet = wb.sheets.find((s) => s.name === cfg.sheetName);
  if (!sheet) return [];
  const out: { excelRow: number; get: RowGetter; raw: Record<string, CellValue>; empty: boolean }[] = [];
  const fields = cfg.type === "ignorar" ? [] : FIELDS[cfg.type];
  for (let i = cfg.headerRow + 1; i < sheet.rows.length; i++) {
    const r = sheet.rows[i] ?? [];
    const get: RowGetter = (field) => {
      const idx = cfg.mapping[field];
      return idx === null || idx === undefined ? null : (r[idx] ?? null);
    };
    const raw: Record<string, CellValue> = {};
    for (const f of fields) raw[f.key] = get(f.key);
    const empty = fields
      .filter((f) => !f.verifyOnly)
      .every((f) => {
        const v = raw[f.key];
        return v === null || (typeof v === "string" && v.trim() === "");
      });
    out.push({ excelRow: i + 1, get, raw, empty });
  }
  return out;
}

function detectExitReason(notes: string | null): ExitReason {
  const k = normKey(notes);
  if (k.includes("regalo")) return "regalo";
  if (k.includes("perdid") || k.includes("perdi")) return "perdida";
  return "pendiente";
}

function jsonRaw(raw: Record<string, CellValue>) {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = v instanceof Date ? v.toISOString().slice(0, 10) : v;
  return out;
}

/** Todos los nombres de producto que aparecen en las hojas que se van a importar. */
export function collectProductNames(wb: ParsedWorkbook, configs: SheetConfig[]): string[] {
  return configs
    .filter((c) => c.type === "productos" || c.type === "compras" || c.type === "ventas")
    .flatMap((cfg) =>
      rowsOf(wb, cfg)
        .map((r) => cleanText(r.get(cfg.type === "productos" ? "name" : "product_name")))
        .filter((n): n is string => !!n),
    );
}

/** Sugerencias de productos que podrían ser el mismo (p. ej. "X 1" y "X"). */
export function suggestMerges(names: string[], presets: { from: string; to: string }[]): MergeSuggestion[] {
  const unique = Array.from(new Map(names.map((n) => [normKey(n), n])).values());
  const out: MergeSuggestion[] = [];
  const seen = new Set<string>();
  for (const p of presets) {
    if (unique.some((n) => normKey(n) === normKey(p.from))) {
      out.push({ from: p.from, to: p.to, reason: "Confirmado por ti: es el mismo producto.", preset: true });
      seen.add(normKey(p.from));
    }
  }
  for (const a of unique) {
    for (const b of unique) {
      if (a === b || seen.has(normKey(a))) continue;
      const ka = normKey(a);
      const kb = normKey(b);
      const trailingNumber = ka.startsWith(kb + " ") && /^\d+$/.test(ka.slice(kb.length + 1));
      const typo = Math.abs(ka.length - kb.length) <= 2 && ka.length > 8 && similarity(ka, kb) >= 0.93 && ka > kb;
      if (trailingNumber || typo) {
        out.push({
          from: a,
          to: b,
          reason: trailingNumber ? "Solo se diferencian por un número final." : "Los nombres son casi iguales (¿error de escritura?).",
          preset: false,
        });
        seen.add(ka);
      }
    }
  }
  return out;
}

export function buildPlan(
  wb: ParsedWorkbook,
  configs: SheetConfig[],
  options: ImportOptions,
  existing: ImportExisting = EMPTY_EXISTING,
): ImportPlan {
  const issues: Issue[] = [];
  const add = (level: IssueLevel, sheet: string, row: number | null, message: string) => issues.push({ level, sheet, row, message });
  const review: ImportPayload["review_items"] = [];
  const summary: PlanSummary = {
    rows: { total: 0, valid: 0, withErrors: 0, empty: 0, possibleDuplicates: 0 },
    products: { new: 0, existing: 0, fromPurchasesOnly: 0, merged: 0 },
    purchaseOrders: { new: 0, duplicated: 0, lines: 0, linesSkipped: 0 },
    sales: { new: 0, duplicated: 0, withoutLot: 0, withErrors: 0, units: 0, amount: 0 },
    exits: { new: 0, duplicated: 0, pendingReason: 0 },
    responsibles: { new: [], partners: [] },
    platformsNew: [],
    reviewItems: 0,
    errors: 0,
    warnings: 0,
  };

  const mergeMap = new Map<string, string>(); // normKey(from) → nombre destino
  for (const m of options.merges) mergeMap.set(normKey(m.from), m.to);
  const resolveName = (name: string) => mergeMap.get(normKey(name)) ?? name;
  const keyOf = (name: string) => normKey(resolveName(name));

  const existingProducts = new Set(existing.productNames.map(normKey));
  const existingPOs = new Set(existing.purchaseOrderNumbers);
  const existingSaleFp = new Set(existing.saleFingerprints);
  const existingExitFp = new Set(existing.exitFingerprints);
  const existingResp = new Set(existing.responsibles.map(normKey));

  type ProductEntry = ImportPayload["products"][number] & { expectedStock: number | null; fromSheet: string; viaMerge: boolean };
  const products = new Map<string, ProductEntry>();

  const byType = (t: SheetConfig["type"]) => configs.filter((c) => c.type === t);

  const ensureProduct = (rawName: string, sheet: string, ref: string, extra?: Partial<ProductEntry>) => {
    const name = resolveName(rawName);
    const key = normKey(name);
    let entry = products.get(key);
    if (!entry) {
      entry = {
        key,
        name,
        brand: extra?.brand ?? brandFromName(name),
        category: extra?.category ?? null,
        description: extra?.description ?? null,
        sku: extra?.sku ?? null,
        normal_sale_price: extra?.normal_sale_price ?? null,
        legacy_code: extra?.legacy_code ?? null,
        variant_name: "Sin especificar",
        source_ref: ref,
        expectedStock: extra?.expectedStock ?? null,
        fromSheet: sheet,
        viaMerge: normKey(rawName) !== key,
      };
      products.set(key, entry);
    }
    return entry;
  };

  // ------------------------------------------------------------------
  // 1. Productos
  // ------------------------------------------------------------------
  for (const cfg of byType("productos")) {
    for (const r of rowsOf(wb, cfg)) {
      summary.rows.total++;
      if (r.empty) {
        summary.rows.empty++;
        continue;
      }
      const rawName = cleanText(r.get("name"));
      if (!rawName) {
        summary.rows.withErrors++;
        add("error", cfg.sheetName, r.excelRow, "Fila sin nombre de producto: no se importa.");
        continue;
      }
      const key = keyOf(rawName);
      const price = toNumber(r.get("normal_sale_price"));
      if (r.get("normal_sale_price") !== null && (price === null || price < 0)) {
        add("warning", cfg.sheetName, r.excelRow, `Precio de venta no válido para «${rawName}»: se deja vacío.`);
      }
      const expected = toNumber(r.get("expected_stock"));
      const brandCol = cleanText(r.get("brand"));
      const ref = `${cfg.sheetName}!fila ${r.excelRow}`;
      const prev = products.get(key);
      if (prev) {
        if (prev.viaMerge && normKey(rawName) === key) {
          // Llega la fila "propia" del producto destino: sus datos mandan
          prev.viaMerge = false;
          prev.description = cleanText(r.get("description")) ?? prev.description;
          prev.category = cleanText(r.get("category")) ?? prev.category;
          prev.legacy_code = cleanText(r.get("legacy_code")) ?? prev.legacy_code;
          prev.sku = cleanText(r.get("sku")) ?? prev.sku;
          prev.source_ref = ref;
          if (expected !== null) prev.expectedStock = (prev.expectedStock ?? 0) + expected;
          summary.rows.valid++;
          continue;
        }
        if (normKey(rawName) !== normKey(prev.name) || mergeMap.has(normKey(rawName))) {
          summary.products.merged++;
          add("info", cfg.sheetName, r.excelRow, `«${rawName}» se unifica con «${prev.name}».`);
        } else {
          summary.rows.possibleDuplicates++;
          add("warning", cfg.sheetName, r.excelRow, `Producto repetido «${rawName}»: se usa la primera fila (${prev.source_ref}).`);
        }
        if (expected !== null) prev.expectedStock = (prev.expectedStock ?? 0) + expected;
        prev.description ??= cleanText(r.get("description"));
        prev.category ??= cleanText(r.get("category"));
        continue;
      }
      const name = resolveName(rawName);
      if (name !== rawName) {
        summary.products.merged++;
        add("info", cfg.sheetName, r.excelRow, `«${rawName}» se unifica con «${name}».`);
      }
      ensureProduct(rawName, cfg.sheetName, ref, {
        brand: brandCol ?? brandFromName(name),
        category: cleanText(r.get("category")),
        description: cleanText(r.get("description")),
        sku: cleanText(r.get("sku")),
        normal_sale_price: price !== null && price >= 0 ? round(price) : null,
        legacy_code: cleanText(r.get("legacy_code")),
        expectedStock: expected,
      });
      summary.rows.valid++;
    }
  }

  // ------------------------------------------------------------------
  // 2. Compras → pedidos de compra con sus líneas (cada línea = un lote)
  // ------------------------------------------------------------------
  type PO = ImportPayload["purchase_orders"][number] & { dates: Set<string>; suppliers: Set<string>; costMap: Map<string, Set<number>>; sheet: string };
  const pos = new Map<number, PO>();
  const purchased = new Map<string, number>(); // `${key}|${po}` → unidades
  const expectedRealCosts: ImportPlan["expectedRealCosts"] = [];
  const costFields = ["transporte", "aduanas", "aranceles", "comisiones", "gestion", "otros"] as const;

  for (const cfg of byType("compras")) {
    for (const r of rowsOf(wb, cfg)) {
      summary.rows.total++;
      if (r.empty) {
        summary.rows.empty++;
        continue;
      }
      const ref = `${cfg.sheetName}!fila ${r.excelRow}`;
      const errs: string[] = [];
      const num = toNumber(r.get("order_number"));
      const date = toDate(r.get("order_date"));
      const rawName = cleanText(r.get("product_name"));
      const qty = toNumber(r.get("quantity"));
      const cost = toNumber(r.get("unit_cost"));
      if (!isInteger(num) || num <= 0) errs.push("el número de pedido no es válido");
      if (!date) errs.push("la fecha no es válida");
      if (!rawName) errs.push("falta el producto");
      if (cost === null || cost < 0) errs.push("el coste unitario no es válido");
      if (qty === null || !Number.isInteger(qty) || qty < 0) errs.push("las unidades no son un número entero válido");

      if (errs.length) {
        summary.rows.withErrors++;
        add("error", cfg.sheetName, r.excelRow, `No se importa: ${errs.join(", ")}.`);
        review.push({ kind: "fila_con_errores", entity_type: "purchase_orders", title: `Línea de compra no importada (${ref})`, details: errs.join(", "), payload: jsonRaw(r.raw) });
        continue;
      }
      if (qty === 0) {
        summary.purchaseOrders.linesSkipped++;
        add("warning", cfg.sheetName, r.excelRow, `«${rawName}» del pedido #${num} tiene 0 unidades: la línea no se importa.`);
        continue;
      }

      const orderNumber = num as number;
      const product = ensureProduct(rawName!, cfg.sheetName, ref);
      if (product.fromSheet === cfg.sheetName && product.source_ref === ref && byType("productos").length > 0) {
        summary.products.fromPurchasesOnly++;
        add("info", cfg.sheetName, r.excelRow, `«${product.name}» no estaba en la hoja de productos: se crea desde Compras.`);
      }

      let po = pos.get(orderNumber);
      if (!po) {
        po = {
          order_number: orderNumber,
          order_date: date!,
          supplier_name: null,
          notes: null,
          source_ref: ref,
          costs: [],
          items: [],
          dates: new Set(),
          suppliers: new Set(),
          costMap: new Map(),
          sheet: cfg.sheetName,
        };
        pos.set(orderNumber, po);
      }
      po.dates.add(date!);
      const sup = cleanText(r.get("supplier"));
      if (sup) po.suppliers.add(sup);
      for (const cf of costFields) {
        const v = toNumber(r.get(cf));
        if (v !== null && v !== 0) {
          if (v < 0) add("warning", cfg.sheetName, r.excelRow, `Coste de ${cf} negativo: se ignora.`);
          else {
            const set = po.costMap.get(cf) ?? new Set<number>();
            set.add(round(v));
            po.costMap.set(cf, set);
          }
        }
      }
      if (po.items.some((it) => it.product_key === product.key)) {
        add("info", cfg.sheetName, r.excelRow, `«${product.name}» aparece en varias líneas del pedido #${orderNumber}: se mantienen como líneas separadas.`);
      }
      po.items.push({ product_key: product.key, quantity: qty as number, unit_cost: cost as number, notes: cleanText(r.get("notes")), source_ref: ref });
      purchased.set(`${product.key}|${orderNumber}`, (purchased.get(`${product.key}|${orderNumber}`) ?? 0) + (qty as number));
      const expReal = toNumber(r.get("expected_real_unit_cost"));
      if (expReal !== null) expectedRealCosts.push({ source_ref: ref, order_number: orderNumber, product: product.name, expected: expReal });
      summary.rows.valid++;
      summary.purchaseOrders.lines++;
    }
  }

  const payloadPOs: ImportPayload["purchase_orders"] = [];
  for (const po of Array.from(pos.values()).sort((a, b) => a.order_number - b.order_number)) {
    if (po.dates.size > 1) {
      add("warning", po.sheet, null, `El pedido #${po.order_number} tiene varias fechas (${Array.from(po.dates).join(", ")}): se usa la primera, ${po.order_date}.`);
    }
    if (po.suppliers.size > 1) {
      add("warning", po.sheet, null, `El pedido #${po.order_number} tiene varios proveedores (${Array.from(po.suppliers).join(", ")}). Un pedido pertenece a un solo proveedor: se usa «${Array.from(po.suppliers)[0]}».`);
    }
    po.supplier_name = Array.from(po.suppliers)[0] ?? null;
    for (const [cf, set] of po.costMap) {
      const values = Array.from(set);
      if (values.length > 1) {
        add("warning", po.sheet, null, `El pedido #${po.order_number} tiene varios importes de ${cf} (${values.join(", ")}): se usa el primero.`);
      }
      po.costs.push({ cost_type: cf, amount: values[0] });
    }
    if (existingPOs.has(po.order_number)) {
      summary.purchaseOrders.duplicated++;
      add("warning", po.sheet, null, `El pedido de compra #${po.order_number} ya existe en MaurInventario: no se vuelve a importar.`);
      continue;
    }
    if (!po.supplier_name) {
      review.push({
        kind: "proveedor_pendiente",
        entity_type: "purchase_orders",
        title: `Pedido de compra #${po.order_number}: proveedor pendiente de identificar`,
        details: "El Excel no indica el proveedor. Se ha asignado «Proveedor pendiente de identificar».",
        payload: { order_number: po.order_number },
      });
    }
    summary.purchaseOrders.new++;
    payloadPOs.push({
      order_number: po.order_number,
      order_date: po.order_date,
      supplier_name: po.supplier_name,
      notes: null,
      source_ref: po.source_ref,
      costs: po.costs,
      items: po.items,
    });
  }

  // ------------------------------------------------------------------
  // 3. Responsables (socios)
  // ------------------------------------------------------------------
  const partnerKeys = new Set<string>();
  for (const cfg of byType("responsables")) {
    for (const r of rowsOf(wb, cfg)) {
      const n = cleanText(r.get("name"));
      if (n) partnerKeys.add(normKey(n));
    }
  }

  // ------------------------------------------------------------------
  // 4. Móviles
  // ------------------------------------------------------------------
  const mobiles = new Map<number, ImportPayload["mobile_devices"][number]>();
  for (const cfg of byType("moviles")) {
    for (const r of rowsOf(wb, cfg)) {
      summary.rows.total++;
      if (r.empty) {
        summary.rows.empty++;
        continue;
      }
      const n = toNumber(r.get("number"));
      if (!isInteger(n) || n <= 0) {
        summary.rows.withErrors++;
        add("error", cfg.sheetName, r.excelRow, "Número de móvil no válido: la fila no se importa.");
        continue;
      }
      mobiles.set(n, { number: n, name: cleanText(r.get("name")), email: cleanText(r.get("email")), phone: toPhone(r.get("phone")) });
      summary.rows.valid++;
    }
  }
  const knownMobiles = new Set([...existing.mobileNumbers, ...mobiles.keys()]);

  // ------------------------------------------------------------------
  // 5. Ventas (y ventas a 0 € → salidas sin venta)
  // ------------------------------------------------------------------
  const platformsKnown = new Map(existing.platforms.map((p) => [normKey(p.name), p]));
  const platformsNew = new Map<string, { name: string; requires_shipping: boolean }>();
  const carriers = new Map<string, string>(existing.carriers.map((c) => [normKey(c), c]));
  const responsibles = new Map<string, string>();

  type SaleRow = {
    excelRow: number;
    sheet: string;
    date: string;
    responsible: string;
    productKey: string;
    productName: string;
    po: number | null;
    qty: number;
    total: number;
    platform: string;
    carrier: string | null;
    shipped: boolean;
    mobile: number | null;
    notes: string | null;
    externalRef: string | null;
    fingerprintBase: string;
    raw: Record<string, CellValue>;
  };
  const saleRows: SaleRow[] = [];
  const seenBase = new Map<string, number>();

  for (const cfg of byType("ventas")) {
    for (const r of rowsOf(wb, cfg)) {
      summary.rows.total++;
      if (r.empty) {
        summary.rows.empty++;
        continue;
      }
      const ref = `${cfg.sheetName}!fila ${r.excelRow}`;
      const errs: string[] = [];
      const date = toDate(r.get("sale_date"));
      const resp = cleanText(r.get("responsible"));
      const rawName = cleanText(r.get("product_name"));
      const qty = toNumber(r.get("quantity"));
      const totalCell = toNumber(r.get("total_price"));
      const unitCell = toNumber(r.get("unit_price"));
      const poCell = r.get("purchase_order_number");
      const poNum = toNumber(poCell);

      if (!date) errs.push("la fecha no es válida");
      if (!resp) errs.push("falta el responsable");
      if (!rawName) errs.push("falta el producto");
      if (qty === null || !Number.isInteger(qty) || qty <= 0) errs.push("las unidades deben ser un número entero mayor que 0");
      let total: number | null = null;
      if (totalCell !== null) total = totalCell;
      else if (unitCell !== null && qty !== null) total = unitCell * qty;
      if (total === null) errs.push("falta el importe");
      else if (total < 0) errs.push("el importe es negativo");
      if (poCell !== null && cleanText(poCell) !== null && (!isInteger(poNum) || poNum <= 0)) errs.push("el número de pedido de procedencia no es válido");

      const product = rawName ? products.get(keyOf(rawName)) : undefined;
      if (rawName && !product) errs.push(`el producto «${rawName}» no existe ni en Productos ni en Compras`);

      if (errs.length) {
        summary.rows.withErrors++;
        summary.sales.withErrors++;
        add("error", cfg.sheetName, r.excelRow, `No se importa: ${errs.join(", ")}.`);
        review.push({ kind: "venta_no_importada", entity_type: "sales", title: `Venta no importada (${ref})`, details: errs.join(", "), payload: jsonRaw(r.raw) });
        continue;
      }

      if (totalCell !== null && unitCell !== null && qty && Math.abs(totalCell / qty - unitCell) > 0.005) {
        add("warning", cfg.sheetName, r.excelRow, `El precio unitario (${unitCell} €) no cuadra con el total (${totalCell} €) / unidades (${qty}): se usa el total.`);
      }

      // Plataforma y transportista
      const method = cleanText(r.get("shipping_method"));
      let platform: string | null = null;
      let carrier: string | null = null;
      if (method) ({ platform, carrier } = splitShippingMethod(method));
      platform = platform ?? cleanText(r.get("platform"));
      carrier = carrier ?? cleanText(r.get("carrier"));
      if (!platform) {
        platform = "En persona";
        add("warning", cfg.sheetName, r.excelRow, "Sin plataforma ni método de envío: se registra como «En persona».");
      }
      const pk = normKey(platform);
      const known = platformsKnown.get(pk) ?? platformsNew.get(pk);
      if (!known) {
        platformsNew.set(pk, { name: platform, requires_shipping: !!carrier });
        add("info", cfg.sheetName, r.excelRow, `Plataforma nueva «${platform}»: se creará.`);
      } else platform = known.name;
      const requiresShipping = (platformsKnown.get(pk) ?? platformsNew.get(pk))!.requires_shipping;
      if (!requiresShipping) carrier = null;
      if (carrier && normKey(carrier) === normKey(platform)) carrier = null;
      if (carrier) {
        const ck = normKey(carrier);
        if (!carriers.has(ck)) carriers.set(ck, carrier);
        carrier = carriers.get(ck)!;
      }

      // Móvil
      const mobRaw = toNumber(r.get("mobile"));
      let mobile: number | null = null;
      if (mobRaw !== null) {
        if (isInteger(mobRaw) && knownMobiles.has(mobRaw)) mobile = mobRaw;
        else add("warning", cfg.sheetName, r.excelRow, `El móvil «${cleanText(r.get("mobile"))}» no existe: se deja vacío.`);
      }

      const respName = responsibles.get(normKey(resp)) ?? resp!;
      responsibles.set(normKey(resp), respName);
      const notes = cleanText(r.get("notes"));
      const base = [date, normKey(resp), normKey(rawName), qty, round(total!), poNum ?? "", pk, normKey(carrier), normKey(notes)].join("|");
      const occurrence = seenBase.get(base) ?? 0;
      seenBase.set(base, occurrence + 1);
      if (occurrence > 0) {
        summary.rows.possibleDuplicates++;
        add("warning", cfg.sheetName, r.excelRow, "Fila idéntica a otra anterior: se importan ambas, pero revisa si es un duplicado.");
        review.push({ kind: "posible_duplicado", entity_type: "sales", title: `Posible venta duplicada (${ref})`, details: "Hay otra fila exactamente igual en el Excel.", payload: jsonRaw(r.raw) });
      }

      saleRows.push({
        excelRow: r.excelRow,
        sheet: cfg.sheetName,
        date: date!,
        responsible: respName,
        productKey: product!.key,
        productName: product!.name,
        po: isInteger(poNum) ? poNum : null,
        qty: qty as number,
        total: round(total!),
        platform,
        carrier,
        shipped: toYes(r.get("shipped")),
        mobile,
        notes,
        externalRef: cleanText(r.get("external_reference")),
        fingerprintBase: `${base}|${occurrence}`,
        raw: r.raw,
      });
    }
  }

  // Simulación de stock por lote en orden de fecha (como hará la base de datos)
  const available = new Map(purchased);
  const sortedSales = saleRows.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.excelRow - b.excelRow));
  const payloadSales: ImportPayload["sales"] = [];
  const payloadExits: ImportPayload["stock_exits"] = [];
  const consumedBy = new Map<string, number>(); // product key → unidades que salen (ventas + salidas)

  for (const s of sortedSales) {
    const ref = `${s.sheet}!fila ${s.excelRow}`;
    if (s.po === null) {
      summary.sales.withoutLot++;
      add("error", s.sheet, s.excelRow, "Venta sin pedido/lote de procedencia: no se importa y queda como «Lote no identificado» en Revisión.");
      review.push({ kind: "venta_sin_lote", entity_type: "sales", title: `Lote no identificado (${ref})`, details: `${s.qty} x ${s.productName} · ${s.total} €`, payload: jsonRaw(s.raw) });
      continue;
    }
    const lotKey = `${s.productKey}|${s.po}`;
    const isZero = s.total === 0;
    const fingerprint = `${isZero && options.zeroPriceAsExit ? "x" : "v"}:${hash(s.fingerprintBase)}`;

    if (pos.has(s.po) && !existingPOs.has(s.po)) {
      if (!purchased.has(lotKey)) {
        summary.sales.withErrors++;
        summary.rows.withErrors++;
        add("error", s.sheet, s.excelRow, `«${s.productName}» no aparece en el pedido de compra #${s.po}: no se importa.`);
        review.push({ kind: "venta_no_importada", entity_type: "sales", title: `Venta no importada (${ref})`, details: `El producto no está en el pedido #${s.po}`, payload: jsonRaw(s.raw) });
        continue;
      }
      const left = available.get(lotKey) ?? 0;
      if (left < s.qty) {
        summary.sales.withErrors++;
        summary.rows.withErrors++;
        add("error", s.sheet, s.excelRow, `No quedan unidades de «${s.productName}» en el pedido #${s.po} (quedan ${left}): no se importa.`);
        review.push({ kind: "venta_no_importada", entity_type: "sales", title: `Venta no importada (${ref})`, details: `Sin stock en su lote: en el pedido #${s.po} quedan ${left} y se venden ${s.qty}`, payload: jsonRaw(s.raw) });
        continue;
      }
      available.set(lotKey, left - s.qty);
    } else if (!pos.has(s.po) && !existingPOs.has(s.po)) {
      summary.sales.withErrors++;
      summary.rows.withErrors++;
      add("error", s.sheet, s.excelRow, `El pedido de compra #${s.po} no existe: no se importa.`);
      review.push({ kind: "venta_no_importada", entity_type: "sales", title: `Venta no importada (${ref})`, details: `El pedido #${s.po} no existe`, payload: jsonRaw(s.raw) });
      continue;
    }
    consumedBy.set(s.productKey, (consumedBy.get(s.productKey) ?? 0) + s.qty);

    if (isZero && options.zeroPriceAsExit) {
      if (existingExitFp.has(fingerprint)) {
        summary.exits.duplicated++;
        continue;
      }
      const reason = detectExitReason(s.notes);
      if (reason === "pendiente") {
        summary.exits.pendingReason++;
        review.push({
          kind: "motivo_pendiente",
          entity_type: "stock_exits",
          title: `Salida sin venta sin motivo (${ref})`,
          details: `${s.qty} x ${s.productName} del pedido #${s.po}, ${s.date}. Indica si fue regalo, pérdida u otro.`,
          payload: { source_ref: ref, fingerprint },
        });
      }
      add("info", s.sheet, s.excelRow, `Venta a 0 € → salida sin venta (${reason === "pendiente" ? "motivo pendiente" : reason}).`);
      payloadExits.push({
        fingerprint,
        exit_date: s.date,
        product_key: s.productKey,
        purchase_order_number: s.po,
        quantity: s.qty,
        reason,
        responsible: s.responsible,
        notes: s.notes,
        source_ref: ref,
      });
      summary.exits.new++;
      summary.rows.valid++;
      continue;
    }
    if (isZero) {
      add("warning", s.sheet, s.excelRow, "Venta a 0 €: se importa como venta porque la regla «venta a 0 € = salida sin venta» está desactivada.");
    }

    if (existingSaleFp.has(fingerprint)) {
      summary.sales.duplicated++;
      continue;
    }
    payloadSales.push({
      fingerprint,
      sale_date: s.date,
      responsible: s.responsible,
      platform: s.platform,
      carrier: s.carrier,
      mobile_number: s.mobile,
      shipping_status: (platformsKnown.get(normKey(s.platform)) ?? platformsNew.get(normKey(s.platform)))!.requires_shipping
        ? s.shipped
          ? "enviado"
          : "pendiente"
        : null,
      external_reference: s.externalRef,
      notes: null,
      source_ref: ref,
      items: [{ product_key: s.productKey, purchase_order_number: s.po, quantity: s.qty, unit_price: round(s.total / s.qty, 4), notes: s.notes }],
    });
    summary.sales.new++;
    summary.sales.units += s.qty;
    summary.sales.amount = round(summary.sales.amount + s.total);
    summary.rows.valid++;
  }

  // ------------------------------------------------------------------
  // 6. Resultado
  // ------------------------------------------------------------------
  const productList = Array.from(products.values());
  for (const p of productList) {
    if (existingProducts.has(p.key)) summary.products.existing++;
    else summary.products.new++;
  }

  const respPayload = Array.from(responsibles.values()).map((name) => ({ name, is_partner: partnerKeys.has(normKey(name)) }));
  summary.responsibles.new = respPayload.filter((r) => !existingResp.has(normKey(r.name))).map((r) => r.name);
  summary.responsibles.partners = respPayload.filter((r) => r.is_partner).map((r) => r.name);
  summary.platformsNew = Array.from(platformsNew.values()).map((p) => p.name);

  const stockCheck: ImportPlan["stockCheck"] = [];
  for (const p of productList) {
    if (p.expectedStock === null) continue;
    let bought = 0;
    for (const [k, v] of purchased) if (k.startsWith(`${p.key}|`)) bought += v;
    const computed = bought - (consumedBy.get(p.key) ?? 0);
    stockCheck.push({ product: p.name, expected: p.expectedStock, computed });
  }

  const payload: ImportPayload = {
    file_name: wb.fileName,
    categories: Array.from(new Set(productList.map((p) => p.category).filter((c): c is string => !!c))),
    brands: Array.from(new Set(productList.map((p) => p.brand).filter((b): b is string => !!b))),
    carriers: Array.from(carriers.values()),
    platforms: Array.from(platformsNew.values()),
    mobile_devices: Array.from(mobiles.values()),
    responsibles: respPayload,
    products: productList.map((p) => ({
      key: p.key,
      name: p.name,
      brand: p.brand,
      category: p.category,
      description: p.description,
      sku: p.sku,
      normal_sale_price: p.normal_sale_price,
      legacy_code: p.legacy_code,
      variant_name: p.variant_name,
      source_ref: p.source_ref,
    })),
    purchase_orders: payloadPOs,
    sales: payloadSales,
    stock_exits: payloadExits,
    review_items: review,
  };

  summary.reviewItems = review.length;
  summary.errors = issues.filter((i) => i.level === "error").length;
  summary.warnings = issues.filter((i) => i.level === "warning").length;

  return {
    payload,
    issues,
    summary,
    stockCheck,
    expectedRealCosts,
  };
}

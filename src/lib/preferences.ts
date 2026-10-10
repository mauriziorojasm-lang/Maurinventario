/**
 * Preferencias personales de cada usuario (panel, aspecto, tablas, avisos…).
 * Se guardan en la base de datos (tabla user_preferences, una fila por
 * usuario) y se leen con valores por defecto para todo lo no personalizado.
 * Este archivo no depende del servidor: lo usan también las pantallas.
 */
import { z } from "zod";

// ---------------------------------------------------------------------
// Widgets del inicio
// ---------------------------------------------------------------------
export type WidgetSize = "1x1" | "2x1" | "2x2";
export type WidgetGroup = "Indicadores" | "Análisis comercial" | "Inventario y actividad";

export type WidgetDef = {
  id: string;
  title: string;
  group: WidgetGroup;
  description: string;
  sizes: WidgetSize[];
  /** Si no se puede calcular con los datos de la app, el motivo (y no se puede añadir). */
  unavailable?: string;
};

export const WIDGETS: WidgetDef[] = [
  { id: "ventas", title: "Ventas", group: "Indicadores", description: "Número de ventas y unidades del periodo.", sizes: ["1x1", "2x1"] },
  { id: "ingresos", title: "Ingresos", group: "Indicadores", description: "Lo vendido en el periodo, descontando devoluciones.", sizes: ["1x1", "2x1"] },
  { id: "beneficio_bruto", title: "Beneficio bruto", group: "Indicadores", description: "Ingresos menos el coste real de cada unidad (su lote).", sizes: ["1x1", "2x1"] },
  {
    id: "beneficio_neto",
    title: "Beneficio neto",
    group: "Indicadores",
    description: "Beneficio después de todos los gastos del negocio.",
    sizes: ["1x1"],
    unavailable: "La app no registra los gastos del negocio (envíos, comisiones, cuotas…). Sin ellos el beneficio neto no se puede calcular de verdad; usa «Beneficio bruto».",
  },
  { id: "margen", title: "Margen bruto", group: "Indicadores", description: "Beneficio bruto ÷ ingresos, en porcentaje.", sizes: ["1x1", "2x1"] },
  { id: "ticket", title: "Ticket medio", group: "Indicadores", description: "Ingresos ÷ número de ventas.", sizes: ["1x1", "2x1"] },
  { id: "stock", title: "Stock disponible", group: "Indicadores", description: "Unidades en el almacén hoy.", sizes: ["1x1", "2x1"] },
  { id: "valor_inventario", title: "Valor del inventario", group: "Indicadores", description: "Capital invertido en stock (coste medio) y valor potencial de venta.", sizes: ["1x1", "2x1"] },
  {
    id: "gastos",
    title: "Gastos del negocio",
    group: "Indicadores",
    description: "Gastos que no son compra de producto.",
    sizes: ["1x1"],
    unavailable: "La app todavía no tiene un registro de gastos, así que no hay datos reales que mostrar.",
  },
  { id: "evolucion", title: "Evolución de las ventas", group: "Análisis comercial", description: "Ingresos y beneficio bruto por día, semana o mes.", sizes: ["2x1", "2x2"] },
  { id: "mas_vendidos", title: "Artículos más vendidos", group: "Análisis comercial", description: "Por unidades vendidas en el periodo.", sizes: ["2x1", "2x2"] },
  { id: "por_plataforma", title: "Ventas por plataforma", group: "Análisis comercial", description: "Ingresos y ventas de cada plataforma en el periodo.", sizes: ["2x1", "2x2"] },
  { id: "rentabilidad", title: "Rentabilidad por artículo", group: "Análisis comercial", description: "Beneficio bruto y margen de cada artículo en el periodo.", sizes: ["2x1", "2x2"] },
  { id: "envios_pendientes", title: "Ventas pendientes de envío", group: "Análisis comercial", description: "Paquetes por enviar ahora mismo.", sizes: ["1x1", "2x1"] },
  { id: "antiguedad", title: "Más tiempo en stock", group: "Inventario y actividad", description: "Lotes que más tiempo llevan en el almacén.", sizes: ["2x1", "2x2"] },
  { id: "actividad", title: "Actividad reciente", group: "Inventario y actividad", description: "Últimos movimientos de stock.", sizes: ["2x1", "2x2"] },
];
export const WIDGET_BY_ID = new Map(WIDGETS.map((w) => [w.id, w]));

export type WidgetItem = { id: string; size: WidgetSize };

export const DEFAULT_WIDGETS: WidgetItem[] = [
  { id: "ingresos", size: "2x1" },
  { id: "beneficio_bruto", size: "1x1" },
  { id: "margen", size: "1x1" },
  { id: "ventas", size: "1x1" },
  { id: "ticket", size: "1x1" },
  { id: "stock", size: "1x1" },
  { id: "valor_inventario", size: "1x1" },
  { id: "evolucion", size: "2x2" },
  { id: "mas_vendidos", size: "2x2" },
  { id: "por_plataforma", size: "2x1" },
  { id: "envios_pendientes", size: "2x1" },
  { id: "rentabilidad", size: "2x2" },
  { id: "antiguedad", size: "2x2" },
  { id: "actividad", size: "2x2" },
];

export const PERIODS = { dia: "Hoy", semana: "Esta semana", mes: "Este mes", anio: "Este año" } as const;
export type Period = keyof typeof PERIODS;
export const GRANULARITIES = { dia: "Por día", semana: "Por semana", mes: "Por mes" } as const;

// ---------------------------------------------------------------------
// Aspecto
// ---------------------------------------------------------------------
export const PALETTES = {
  vinted: { label: "Verde Vinted", swatch: "#007782" },
  oceano: { label: "Océano", swatch: "#1d5fa8" },
  bosque: { label: "Bosque", swatch: "#2f6b3f" },
  ciruela: { label: "Ciruela", swatch: "#7a3e8f" },
  teja: { label: "Teja", swatch: "#b5471b" },
  grafito: { label: "Grafito", swatch: "#3d4650" },
} as const;
export type Palette = keyof typeof PALETTES;
export const MODES = { auto: "Automático (como el dispositivo)", light: "Claro", dark: "Oscuro" } as const;

// ---------------------------------------------------------------------
// Tablas
// ---------------------------------------------------------------------
export const SALES_COLUMNS = {
  fecha: "Fecha",
  venta: "Venta",
  producto: "Producto",
  lote: "Lote",
  uds: "Uds.",
  precio: "Precio",
  importe: "Importe",
  beneficio: "Beneficio",
  responsable: "Responsable",
  plataforma: "Plataforma",
  envio: "Envío",
} as const;
export type SalesColumn = keyof typeof SALES_COLUMNS;

export const PRODUCT_COLUMNS = {
  producto: "Producto",
  categoria: "Categoría",
  stock: "Stock",
  coste: "Coste medio",
  precio: "Precio normal",
  precio_medio: "Precio medio venta",
  vendidas: "Vendidas",
  valor: "Valor almacén",
} as const;
/** Columnas que no se pueden ocultar (identifican la fila). */
export const FIXED_COLUMNS = new Set<string>(["producto", "venta"]);
export type ProductColumn = keyof typeof PRODUCT_COLUMNS;

export const PRODUCT_SORTS = {
  stock: "Más stock primero",
  nombre: "Nombre (A-Z)",
  recientes: "Añadidos recientemente",
  valor: "Más valor en stock",
  vendidas: "Más vendidos",
} as const;
export type ProductSort = keyof typeof PRODUCT_SORTS;

export const PAGE_SIZES = [25, 50, 100] as const;

const columnsSchema = <K extends string>(keys: readonly K[]) =>
  z
    .array(z.object({ key: z.enum(keys as unknown as [K, ...K[]]), visible: z.boolean() }))
    .max(keys.length)
    .optional();

// ---------------------------------------------------------------------
// Esquema completo (lo que se guarda). Todo es opcional: lo que falta
// toma el valor por defecto al leer.
// ---------------------------------------------------------------------
const salesKeys = Object.keys(SALES_COLUMNS) as SalesColumn[];
const productKeys = Object.keys(PRODUCT_COLUMNS) as ProductColumn[];

export const prefsSchema = z.object({
  dashboard: z
    .object({
      widgets: z
        .array(z.object({ id: z.string().max(40), size: z.enum(["1x1", "2x1", "2x2"]) }))
        .max(40)
        .optional(),
      period: z.enum(["dia", "semana", "mes", "anio"]).optional(),
      compare: z.boolean().optional(),
      granularity: z.enum(["dia", "semana", "mes"]).optional(),
      platformId: z.uuid().nullable().optional(),
    })
    .optional(),
  appearance: z
    .object({
      mode: z.enum(["auto", "light", "dark"]).optional(),
      palette: z.enum(Object.keys(PALETTES) as [Palette, ...Palette[]]).optional(),
      reduceMotion: z.boolean().optional(),
    })
    .optional(),
  tables: z
    .object({
      ventas: z.object({ columns: columnsSchema(salesKeys), pageSize: z.number().int().optional() }).optional(),
      productos: z
        .object({
          columns: columnsSchema(productKeys),
          pageSize: z.number().int().optional(),
          sort: z.enum(Object.keys(PRODUCT_SORTS) as [ProductSort, ...ProductSort[]]).optional(),
        })
        .optional(),
    })
    .optional(),
  notifications: z
    .object({
      shipments: z.boolean().optional(),
      detected: z.boolean().optional(),
      emails: z.boolean().optional(),
      listings: z.boolean().optional(),
      imports: z.boolean().optional(),
      lowStock: z.boolean().optional(),
      lowStockThreshold: z.number().int().min(1).max(100).optional(),
    })
    .optional(),
  sales: z.object({ defaultPlatformId: z.uuid().nullable().optional() }).optional(),
});
export type StoredPrefs = z.infer<typeof prefsSchema>;

export type Prefs = {
  dashboard: { widgets: WidgetItem[]; period: Period; compare: boolean; granularity: keyof typeof GRANULARITIES; platformId: string | null };
  appearance: { mode: keyof typeof MODES; palette: Palette; reduceMotion: boolean };
  tables: {
    ventas: { columns: { key: SalesColumn; visible: boolean }[]; pageSize: number };
    productos: { columns: { key: ProductColumn; visible: boolean }[]; pageSize: number; sort: ProductSort };
  };
  notifications: { shipments: boolean; detected: boolean; emails: boolean; listings: boolean; imports: boolean; lowStock: boolean; lowStockThreshold: number };
  sales: { defaultPlatformId: string | null };
};

export const DEFAULT_PREFS: Prefs = {
  dashboard: { widgets: DEFAULT_WIDGETS, period: "mes", compare: true, granularity: "mes", platformId: null },
  appearance: { mode: "auto", palette: "vinted", reduceMotion: false },
  tables: {
    ventas: { columns: salesKeys.map((key) => ({ key, visible: true })), pageSize: 50 },
    productos: { columns: productKeys.map((key) => ({ key, visible: true })), pageSize: 50, sort: "stock" },
  },
  notifications: { shipments: true, detected: true, emails: true, listings: true, imports: true, lowStock: false, lowStockThreshold: 1 },
  sales: { defaultPlatformId: null },
};

/** Completa las columnas guardadas: respeta su orden y añade al final las nuevas. */
function mergeColumns<K extends string>(saved: { key: K; visible: boolean }[] | undefined, all: K[]) {
  if (!saved?.length) return all.map((key) => ({ key, visible: true }));
  const seen = new Set<K>();
  const out: { key: K; visible: boolean }[] = [];
  for (const c of saved) {
    if (!all.includes(c.key) || seen.has(c.key)) continue;
    seen.add(c.key);
    out.push({ key: c.key, visible: c.visible });
  }
  for (const k of all) if (!seen.has(k)) out.push({ key: k, visible: true });
  for (const c of out) if (FIXED_COLUMNS.has(c.key)) c.visible = true;
  // Siempre queda al menos una columna visible
  if (!out.some((c) => c.visible)) out[0].visible = true;
  return out;
}

/** Widgets válidos, sin repetir y con un tamaño permitido. */
export function cleanWidgets(list: { id: string; size: string }[] | undefined): WidgetItem[] {
  if (!list) return DEFAULT_WIDGETS;
  const seen = new Set<string>();
  const out: WidgetItem[] = [];
  for (const w of list) {
    const def = WIDGET_BY_ID.get(w.id);
    if (!def || def.unavailable || seen.has(w.id)) continue;
    seen.add(w.id);
    out.push({ id: w.id, size: (def.sizes as string[]).includes(w.size) ? (w.size as WidgetSize) : def.sizes[0] });
  }
  return out;
}

/** Preferencias completas a partir de lo guardado (lo que no valga, por defecto). */
export function resolvePrefs(raw: unknown): Prefs {
  const parsed = prefsSchema.safeParse(raw ?? {});
  const p: StoredPrefs = parsed.success ? parsed.data : {};
  const d = DEFAULT_PREFS;
  const pageSize = (n: number | undefined, def: number) => ((PAGE_SIZES as readonly number[]).includes(n ?? -1) ? (n as number) : def);
  return {
    dashboard: {
      widgets: cleanWidgets(p.dashboard?.widgets),
      period: p.dashboard?.period ?? d.dashboard.period,
      compare: p.dashboard?.compare ?? d.dashboard.compare,
      granularity: p.dashboard?.granularity ?? d.dashboard.granularity,
      platformId: p.dashboard?.platformId ?? null,
    },
    appearance: {
      mode: p.appearance?.mode ?? d.appearance.mode,
      palette: p.appearance?.palette ?? d.appearance.palette,
      reduceMotion: p.appearance?.reduceMotion ?? d.appearance.reduceMotion,
    },
    tables: {
      ventas: { columns: mergeColumns(p.tables?.ventas?.columns, salesKeys), pageSize: pageSize(p.tables?.ventas?.pageSize, 50) },
      productos: {
        columns: mergeColumns(p.tables?.productos?.columns, productKeys),
        pageSize: pageSize(p.tables?.productos?.pageSize, 50),
        sort: p.tables?.productos?.sort ?? d.tables.productos.sort,
      },
    },
    notifications: { ...d.notifications, ...stripUndefined(p.notifications ?? {}) },
    sales: { defaultPlatformId: p.sales?.defaultPlatformId ?? null },
  };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Nombre de la cookie con el aspecto (para pintar la página ya con el tema correcto). */
export const APPEARANCE_COOKIE = "mi-aspecto";
export function appearanceCookieValue(a: Prefs["appearance"]): string {
  return `${a.mode}.${a.palette}.${a.reduceMotion ? "1" : "0"}`;
}
export function parseAppearanceCookie(v: string | undefined): Prefs["appearance"] {
  const [mode, palette, rm] = (v ?? "").split(".");
  return {
    mode: Object.hasOwn(MODES, mode) ? (mode as Prefs["appearance"]["mode"]) : "auto",
    palette: Object.hasOwn(PALETTES, palette) ? (palette as Palette) : "vinted",
    reduceMotion: rm === "1",
  };
}

/**
 * Definición de los informes: qué columnas tiene cada uno. La misma
 * definición se usa para la pantalla y para exportar a Excel/CSV, así
 * lo exportado es exactamente lo que se ve (con los mismos filtros).
 */
import { EXIT_REASONS, PO_STATUS } from "./format";

export type ColumnKind = "text" | "date" | "int" | "money" | "money4" | "pct";
export type Column = { key: string; label: string; kind: ColumnKind; value: (row: Record<string, unknown>) => unknown };

const v = (k: string) => (r: Record<string, unknown>) => r[k];
const variant = (r: Record<string, unknown>) => (r.variant_name === "Única" || r.variant_name === "Sin especificar" ? "" : r.variant_name);

export type ReportType = "ventas" | "inventario" | "compras" | "responsables" | "salidas";

export const REPORTS: Record<ReportType, { title: string; rpc: string; columns: Column[]; fileName: string }> = {
  ventas: {
    title: "Informe de ventas",
    rpc: "report_sale_lines",
    fileName: "ventas",
    columns: [
      { key: "sale_date", label: "Fecha", kind: "date", value: v("sale_date") },
      { key: "sale_number", label: "Nº venta", kind: "text", value: v("sale_number") },
      { key: "responsible_name", label: "Responsable", kind: "text", value: v("responsible_name") },
      { key: "product_name", label: "Producto", kind: "text", value: v("product_name") },
      { key: "variant_name", label: "Variante", kind: "text", value: variant },
      { key: "category_name", label: "Categoría", kind: "text", value: v("category_name") },
      { key: "net_quantity", label: "Unidades", kind: "int", value: v("net_quantity") },
      { key: "unit_price", label: "Precio", kind: "money", value: v("unit_price") },
      { key: "net_amount", label: "Importe", kind: "money", value: v("net_amount") },
      { key: "cost_amount", label: "Coste", kind: "money", value: v("cost_amount") },
      { key: "profit", label: "Beneficio", kind: "money", value: v("profit") },
      { key: "platform_name", label: "Plataforma", kind: "text", value: v("platform_name") },
      { key: "purchase_order_number", label: "Pedido", kind: "int", value: v("purchase_order_number") },
      { key: "lot_label", label: "Lote", kind: "text", value: v("lot_label") },
      { key: "refunded_amount", label: "Reembolsado", kind: "money", value: v("refunded_amount") },
      { key: "line_notes", label: "Detalle", kind: "text", value: v("line_notes") },
    ],
  },
  inventario: {
    title: "Informe de inventario",
    rpc: "report_inventory",
    fileName: "inventario",
    columns: [
      { key: "product_name", label: "Producto", kind: "text", value: v("product_name") },
      { key: "variant_name", label: "Variante", kind: "text", value: variant },
      { key: "sku", label: "SKU", kind: "text", value: v("sku") },
      { key: "category_name", label: "Categoría", kind: "text", value: v("category_name") },
      { key: "brand_name", label: "Marca", kind: "text", value: v("brand_name") },
      { key: "stock", label: "Stock", kind: "int", value: v("stock") },
      { key: "weighted_avg_cost", label: "Coste medio ponderado", kind: "money4", value: v("weighted_avg_cost") },
      { key: "stock_value", label: "Valor almacén", kind: "money", value: v("stock_value") },
      { key: "potential_unit_price", label: "Precio venta", kind: "money", value: v("potential_unit_price") },
      { key: "potential_is_estimated", label: "Precio estimado (precio medio)", kind: "text", value: (r) => (r.potential_is_estimated ? "Sí" : "") },
      { key: "potential_value", label: "Valor potencial", kind: "money", value: v("potential_value") },
      { key: "potential_profit", label: "Beneficio potencial", kind: "money", value: v("potential_profit") },
      { key: "units_sold", label: "Unidades vendidas", kind: "int", value: v("units_sold") },
      { key: "lot_labels", label: "Lotes con stock", kind: "text", value: (r) => (Array.isArray(r.lot_labels) ? (r.lot_labels as string[]).join(", ") : "") },
    ],
  },
  compras: {
    title: "Informe de compras",
    rpc: "report_purchase_lines",
    fileName: "compras",
    columns: [
      { key: "order_number", label: "Pedido", kind: "int", value: v("order_number") },
      { key: "order_date", label: "Fecha", kind: "date", value: v("order_date") },
      { key: "po_status", label: "Estado", kind: "text", value: (r) => PO_STATUS[String(r.po_status)] ?? r.po_status },
      { key: "supplier_name", label: "Proveedor", kind: "text", value: v("supplier_name") },
      { key: "product_name", label: "Producto", kind: "text", value: v("product_name") },
      { key: "variant_name", label: "Variante", kind: "text", value: variant },
      { key: "qty_basis", label: "Unidades", kind: "int", value: v("qty_basis") },
      { key: "unit_cost", label: "Coste unitario", kind: "money4", value: v("unit_cost") },
      { key: "merchandise_cost", label: "Coste mercancía", kind: "money", value: v("merchandise_cost") },
      { key: "transporte", label: "Transporte", kind: "money", value: v("transporte") },
      { key: "aduanas", label: "Aduanas", kind: "money", value: v("aduanas") },
      { key: "aranceles", label: "Aranceles", kind: "money", value: v("aranceles") },
      { key: "comisiones", label: "Comisiones", kind: "money", value: v("comisiones") },
      { key: "gestion", label: "Gestión", kind: "money", value: v("gestion") },
      { key: "otros", label: "Otros costes", kind: "money", value: v("otros") },
      { key: "real_unit_cost", label: "Coste real unitario", kind: "money4", value: v("real_unit_cost") },
      { key: "real_total_cost", label: "Coste real total", kind: "money", value: v("real_total_cost") },
    ],
  },
  responsables: {
    title: "Informe de responsables",
    rpc: "report_responsibles",
    fileName: "responsables",
    columns: [
      { key: "ranking", label: "Ranking", kind: "int", value: v("ranking") },
      { key: "responsible_name", label: "Responsable", kind: "text", value: v("responsible_name") },
      { key: "units", label: "Unidades", kind: "int", value: v("units") },
      { key: "orders", label: "Pedidos", kind: "int", value: v("orders") },
      { key: "revenue", label: "Facturación", kind: "money", value: v("revenue") },
      { key: "avg_ticket", label: "Ticket medio", kind: "money", value: v("avg_ticket") },
      { key: "revenue_pct", label: "% de las ventas", kind: "pct", value: v("revenue_pct") },
      { key: "profit", label: "Beneficio", kind: "money", value: v("profit") },
    ],
  },
  salidas: {
    title: "Salidas sin venta",
    rpc: "",
    fileName: "salidas-sin-venta",
    columns: [
      { key: "exit_date", label: "Fecha", kind: "date", value: v("exit_date") },
      { key: "product_name", label: "Producto", kind: "text", value: v("product_name") },
      { key: "variant_name", label: "Variante", kind: "text", value: variant },
      { key: "lot_label", label: "Lote", kind: "text", value: v("lot_label") },
      { key: "quantity", label: "Unidades", kind: "int", value: v("quantity") },
      { key: "cost_amount", label: "Coste perdido", kind: "money", value: v("cost_amount") },
      { key: "reason", label: "Motivo", kind: "text", value: (r) => EXIT_REASONS[String(r.reason)] ?? r.reason },
      { key: "responsible_name", label: "Responsable", kind: "text", value: v("responsible_name") },
      { key: "notes", label: "Notas", kind: "text", value: v("notes") },
    ],
  },
};

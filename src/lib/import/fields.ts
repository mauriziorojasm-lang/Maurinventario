/**
 * Qué tipos de hoja sabe importar MaurInventario y qué campos tiene cada uno.
 * Los "sinónimos" sirven para relacionar automáticamente las columnas del
 * Excel con los campos, aunque los nombres no coincidan exactamente.
 * El administrador siempre puede cambiar la relación a mano.
 */

export type SheetType = "productos" | "compras" | "ventas" | "moviles" | "responsables" | "ignorar";

export type FieldDef = {
  key: string;
  label: string;
  required?: boolean;
  /** Solo se usa para comprobar que los datos cuadran; no se importa. */
  verifyOnly?: boolean;
  help?: string;
  synonyms: string[];
};

export const SHEET_TYPES: { type: SheetType; label: string; description: string; nameHints: string[] }[] = [
  {
    type: "productos",
    label: "Productos / catálogo",
    description: "Un producto por fila: nombre, categoría, descripción…",
    nameHints: ["almacen", "productos", "catalogo", "articulos", "inventario"],
  },
  {
    type: "compras",
    label: "Compras (líneas de pedidos de compra)",
    description: "Una fila por producto comprado, con su número de pedido, unidades y coste.",
    nameHints: ["gastos", "compras", "pedidos", "proveedores"],
  },
  {
    type: "ventas",
    label: "Ventas",
    description: "Una fila por producto vendido, con fecha, responsable y pedido de procedencia.",
    nameHints: ["ventas", "venta"],
  },
  {
    type: "moviles",
    label: "Móviles",
    description: "Los móviles desde los que se vende.",
    nameHints: ["moviles", "movil"],
  },
  {
    type: "responsables",
    label: "Responsables (socios del reparto)",
    description: "Los responsables que aparecen aquí se marcan como socios del reparto 50/50.",
    nameHints: ["responsables"],
  },
  {
    type: "ignorar",
    label: "No importar",
    description: "Hojas de cálculos, resúmenes o vacías.",
    nameHints: [],
  },
];

export const FIELDS: Record<Exclude<SheetType, "ignorar">, FieldDef[]> = {
  productos: [
    { key: "name", label: "Nombre del producto", required: true, synonyms: ["nombre", "producto", "articulo", "nombre producto", "nombre del producto"] },
    { key: "description", label: "Descripción", synonyms: ["descripcion", "detalle", "detalles"] },
    { key: "category", label: "Categoría", synonyms: ["categoria", "familia", "tipo"] },
    { key: "brand", label: "Marca", help: "Si no hay columna de marca, se deduce de nombres tipo «Marca - Modelo».", synonyms: ["marca"] },
    { key: "sku", label: "SKU / referencia", synonyms: ["sku", "referencia", "ref", "codigo", "ean"] },
    { key: "normal_sale_price", label: "Precio normal de venta", synonyms: ["precio venta", "precio de venta", "pvp", "precio normal", "precio normal de venta"] },
    { key: "legacy_code", label: "ID antiguo (solo referencia)", synonyms: ["id producto", "id", "codigo interno"] },
    { key: "expected_stock", label: "Stock actual (para comprobar)", verifyOnly: true, synonyms: ["stock actual", "stock"] },
  ],
  compras: [
    { key: "order_number", label: "Nº de pedido de compra", required: true, synonyms: ["referencia pedido", "refencia pedido", "n pedido", "num pedido", "numero pedido", "numero de pedido", "pedido"] },
    { key: "order_date", label: "Fecha", required: true, synonyms: ["fecha", "fecha pedido", "fecha compra"] },
    { key: "product_name", label: "Producto", required: true, synonyms: ["articulo", "producto", "nombre"] },
    { key: "quantity", label: "Unidades", required: true, synonyms: ["unidades", "cantidad", "uds"] },
    { key: "unit_cost", label: "Coste unitario (mercancía)", required: true, synonyms: ["coste unitario", "coste", "precio compra", "coste unidad", "precio unitario"] },
    { key: "supplier", label: "Proveedor", synonyms: ["proveedor"] },
    { key: "notes", label: "Descripción / notas", synonyms: ["descripcion", "notas", "observaciones"] },
    { key: "transporte", label: "Transporte / gastos de envío (del pedido)", help: "Importe total del pedido; basta con ponerlo en una de sus filas.", synonyms: ["gastos de envio", "envio", "transporte", "porte", "portes"] },
    { key: "aduanas", label: "Aduanas (del pedido)", synonyms: ["aduanas", "aduana"] },
    { key: "aranceles", label: "Aranceles (del pedido)", synonyms: ["aranceles", "arancel"] },
    { key: "comisiones", label: "Comisiones (del pedido)", synonyms: ["comisiones", "comision"] },
    { key: "gestion", label: "Gestión (del pedido)", synonyms: ["gestion"] },
    { key: "otros", label: "Otros costes (del pedido)", synonyms: ["otros costes", "otros"] },
    { key: "expected_real_unit_cost", label: "Coste unitario real (para comprobar)", verifyOnly: true, synonyms: ["coste unitario neto", "coste real", "coste real unitario"] },
  ],
  ventas: [
    { key: "sale_date", label: "Fecha", required: true, synonyms: ["fecha", "fecha venta"] },
    { key: "responsible", label: "Responsable", required: true, synonyms: ["responsable", "vendedor"] },
    { key: "product_name", label: "Producto", required: true, synonyms: ["producto", "articulo", "nombre"] },
    { key: "quantity", label: "Unidades", required: true, synonyms: ["cantidad vendida", "cantidad", "unidades", "uds"] },
    { key: "total_price", label: "Importe total de la línea", help: "Si existe, manda sobre el precio unitario.", synonyms: ["precio total", "importe", "total", "importe total"] },
    { key: "unit_price", label: "Precio unitario", synonyms: ["precio unitario", "precio"] },
    { key: "purchase_order_number", label: "Pedido / lote de procedencia", synonyms: ["referencia pedido", "pedido", "n pedido", "lote", "pedido de procedencia"] },
    { key: "shipping_method", label: "Método de envío («Plataforma - Transportista»)", synonyms: ["metodo de envio", "metodo envio", "envio"] },
    { key: "platform", label: "Plataforma", synonyms: ["aplicacion", "plataforma", "app"] },
    { key: "carrier", label: "Empresa de transporte", synonyms: ["por donde se envia", "transportista", "empresa de transporte"] },
    { key: "shipped", label: "Enviado (sí/no)", synonyms: ["enviado", "estado envio"] },
    { key: "mobile", label: "Móvil utilizado (número)", synonyms: ["movil", "movil utilizado"] },
    { key: "notes", label: "Detalles / notas", synonyms: ["detalles del producto", "detalles", "notas", "observaciones"] },
    { key: "external_reference", label: "Referencia de la venta", synonyms: ["referencia venta", "n venta", "numero venta"] },
  ],
  moviles: [
    { key: "number", label: "Número de móvil", required: true, synonyms: ["n", "num", "numero movil", "id"] },
    { key: "name", label: "Nombre del móvil", required: true, synonyms: ["movil", "nombre", "modelo"] },
    { key: "email", label: "Correo de la cuenta", synonyms: ["correo", "email", "mail"] },
    { key: "phone", label: "Teléfono", synonyms: ["numero", "telefono", "tlf"] },
  ],
  responsables: [{ key: "name", label: "Responsable", required: true, synonyms: ["responsable", "nombre", "vendedor"] }],
};

export function fieldsFor(type: SheetType): FieldDef[] {
  return type === "ignorar" ? [] : FIELDS[type];
}

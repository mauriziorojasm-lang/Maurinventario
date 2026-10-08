/**
 * Excel de PRUEBA generado en memoria para los tests del importador.
 * Sus datos son ficticios y nunca se cargan en la aplicación.
 */
import ExcelJS from "exceljs";
import { readWorkbook } from "../../src/lib/import/read";

export async function makeWorkbook() {
  const wb = new ExcelJS.Workbook();
  const almacen = wb.addWorksheet("Almacen");
  almacen.addRow([]);
  almacen.addRow(["", "", "", "Periodo"]);
  almacen.addRow([]);
  almacen.addRow([]);
  almacen.addRow(["ID Producto", "Nombre", "Descripcion", "Categoría", "Precio Unitario (€)", "Histórico Stock", "Stock Actual"]);
  almacen.addRow(["0001", "Marca X - Modelo A 1", "desc A1", "Gafas", 10, 2, 0]);
  almacen.addRow(["0002", "Marca X - Modelo A", "desc A", "Gafas", 10, 3, 2]);
  almacen.addRow(["0003", "Producto sin ventas", null, "Perfumes ", null, 0, 0]);

  const gastos = wb.addWorksheet("Gastos");
  gastos.addRow(["Refencia pedido", "Fecha", "Articulo", "Proveedor ", "Descripción", "Coste Unitario (€)", "Unidades", "Gastos de envio (€)", "Coste unitario neto"]);
  gastos.addRow([1, new Date(Date.UTC(2026, 0, 10)), "Marca X - Modelo A 1", null, null, 10, 2, 10, 11]);
  gastos.addRow([1, new Date(Date.UTC(2026, 0, 10)), "Marca X - Modelo A", null, null, 20, 2, null, 22]);
  gastos.addRow([1, new Date(Date.UTC(2026, 0, 10)), "Marca X - Modelo B", null, null, 5, 0, null, null]);

  const ventas = wb.addWorksheet("Ventas");
  ventas.addRow(["Fecha", "Responsable", "Producto", "Cantidad Vendida", "Precio Total (€)", "Precio Unitario", "Referencia pedido", "Metodo de envio ", "Detalles del producto", "Enviado", "Por donde se envia", "Movil", "Aplicacion"]);
  ventas.addRow([new Date(Date.UTC(2026, 0, 20)), "Persona Uno", "Marca X - Modelo A 1", 1, 45, 42, 1, "Vinted - InPost", "negras", "si", null, 2, null]);
  ventas.addRow([new Date(Date.UTC(2026, 0, 21)), "Persona Dos", "Marca X - Modelo A", 1, 0, 0, 1, "En persona", "de regalo", "si", null, null, null]);
  ventas.addRow([new Date(Date.UTC(2026, 0, 22)), "Persona Uno", "Marca X - Modelo A", 1, 30, 30, null, "Wallapop - Correos", null, null, null, 9, null]);
  ventas.addRow([new Date(Date.UTC(2026, 0, 23)), "Persona Uno", "Marca X - Modelo A", 5, 100, 20, 1, "Wallapop - Correos", null, null, null, null, null]);
  ventas.addRow([new Date(Date.UTC(2026, 0, 24)), "Persona Dos", "Marca X - Modelo A", 1, 0, 0, 1, "En persona", null, "si", null, null, null]);

  const resp = wb.addWorksheet("Responsables");
  resp.addRow(["", "Periodo"]);
  resp.addRow([]);
  resp.addRow([]);
  resp.addRow(["Responsable", "Ventas totales", "Importe Ventas"]);
  resp.addRow(["Persona Uno", 1, 45]);
  resp.addRow(["Persona Dos", 0, 0]);
  resp.addRow(["Totales"]);

  const an = wb.addWorksheet("Analisis");
  an.addRow(["Producto", "Unidades Vendidas"]);
  an.addRow(["Marca X - Modelo A", 2]);

  const buf = await wb.xlsx.writeBuffer();
  return readWorkbook(buf as ArrayBuffer, "prueba.xlsx");
}

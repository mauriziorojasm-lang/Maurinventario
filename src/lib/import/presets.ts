/**
 * Decisiones confirmadas por Mauri el 08/10/2026 al revisar el análisis
 * del Excel "INVENTARIO.xlsx". El importador las aplica por defecto
 * (y las muestra en pantalla para poder desactivarlas).
 *
 * 1. "Oakley - Encoder 1" y "Oakley - Encoder" son el mismo producto.
 * 2. El pedido 1 tiene 12 unidades a 19,16 €/u (es lo que ya calcula el Excel).
 * 3. Las ventas a 0 € son "salidas sin venta" (regalo, pérdida…), no ventas.
 * 4. Fila 78 de Ventas: el precio correcto es el total, 45 €
 *    (regla general: si total y precio unitario no cuadran, manda el total).
 * 5. El reparto entre Francesca y Maurizio es el 50 % del total para cada uno.
 */
export const CONFIRMED_MERGES: { from: string; to: string }[] = [{ from: "Oakley - Encoder 1", to: "Oakley - Encoder" }];

export const DEFAULT_OPTIONS = {
  zeroPriceAsExit: true,
  totalWinsOverUnitPrice: true,
};

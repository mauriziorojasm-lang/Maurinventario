import { describe, expect, it } from "vitest";
import {
  classify,
  htmlToText,
  normalizeName,
  parseEuro,
  parseSpanishDate,
  madridToIso,
  parseVintedLabel,
  parseVintedSale,
  parseWallapopSale,
} from "@/lib/email/parse";

// Ejemplos con la estructura descrita en las instrucciones (datos inventados
// solo para la prueba; no se guardan en ningún sitio).
const VINTED_VENTA = `Hola, mauri_shop:

lucia_88 ha comprado
Oakley Encoder Rosadas
45,00 €

Transferiremos el pago del comprador a tu saldo Vinted cuando haya finalizado la transacción.

Envía el pedido en los próximos 5 días.

Instrucciones:
Ve a la conversación con el comprador para generar la etiqueta de envío.

Tu equipo de Vinted`;

const VINTED_ETIQUETA = `Hola, mauri_shop:

Encontrarás tu etiqueta de envío adjunta a este mensaje.

Información de envío:

Pedido: Oakley Encoder Rosadas
Tamaño del paquete: Pequeño (hasta 2 kg)
N.º de seguimiento: 3SABCD123456789
Fecha límite de envío: 14/10/2026 23:59
N.º de transacción: 15234567890

InPost: lleva el paquete a cualquier punto InPost o Locker.

Tu equipo de Vinted`;

const WALLAPOP_VENTA = `Hola, Mauri, aquí tienes la confirmación de tu venta.

Comprado por: Carlos G.

LEGO 75159 Death Star

55.00 €

Enviar desde un punto de entrega

0.00 €

Total 55.00 €

Fecha de compra: 08/10/2026

Ver instrucciones de envío`;

const WALLAPOP_AVISO = `Has hecho una nueva venta

Carlos G. ha comprado LEGO 75159 Death Star.

Selecciona un método de envío para continuar.`;

describe("clasificación de correos", () => {
  it("Vinted: venta y etiqueta", () => {
    expect(classify({ from: "Vinted <no-reply@vinted.es>", subject: "Has vendido un artículo en Vinted", text: VINTED_VENTA })).toEqual({
      kind: "vinted_venta",
      platform: "vinted",
    });
    expect(classify({ from: "Vinted <no-reply@vinted.es>", subject: "Tu etiqueta de envío", text: VINTED_ETIQUETA })).toEqual({
      kind: "vinted_etiqueta",
      platform: "vinted",
    });
  });

  it("Wallapop: la confirmación es venta y el primer aviso NO", () => {
    expect(classify({ from: "Wallapop <noreply@wallapop.com>", subject: "Confirmación de tu venta", text: WALLAPOP_VENTA }).kind).toBe("wallapop_venta");
    expect(classify({ from: "Wallapop <noreply@wallapop.com>", subject: "¡Has hecho una nueva venta!", text: WALLAPOP_AVISO }).kind).toBe("wallapop_aviso");
  });

  it("un correo reenviado a mano se reconoce por el bloque reenviado", () => {
    const text = `---------- Forwarded message ---------
De: Vinted <no-reply@vinted.es>
Date: mié, 8 oct 2026 a las 10:12
Subject: Has vendido un artículo en Vinted
To: <cuenta@gmail.com>

${VINTED_VENTA}`;
    expect(classify({ from: "Mauri <cuenta@gmail.com>", subject: "Fwd: Has vendido un artículo en Vinted", text }).kind).toBe("vinted_venta");
    expect(parseVintedSale(text)?.product).toBe("Oakley Encoder Rosadas");
  });

  it("otros correos no se tocan", () => {
    expect(classify({ from: "Banco <info@banco.es>", subject: "Tu extracto", text: "Hola, tu extracto ya está disponible." }).kind).toBe("otro");
    expect(classify({ from: "Vinted <no-reply@vinted.es>", subject: "Novedades", text: "Hola, mira estas ofertas" }).kind).toBe("otro");
  });
});

describe("Vinted · venta", () => {
  it("extrae comprador, artículo, precio y cuenta", () => {
    expect(parseVintedSale(VINTED_VENTA)).toEqual({
      account: "mauri_shop",
      account_norm: "mauri shop",
      buyer: "lucia_88",
      product: "Oakley Encoder Rosadas",
      product_norm: "oakley encoder rosadas",
      price: 45,
    });
  });

  it("funciona con el HTML del correo", () => {
    const html = `<html><head><style>p{color:red}</style></head><body><table><tr><td><p>Hola, mauri_shop:</p></td></tr>
      <tr><td><b>lucia_88</b> ha comprado</td></tr><tr><td>Oakley Encoder Rosadas</td></tr><tr><td>1.045,50&nbsp;&euro;</td></tr>
      <tr><td>Transferiremos el pago…</td></tr></table></body></html>`;
    const s = parseVintedSale(htmlToText(html));
    expect(s?.buyer).toBe("lucia_88");
    expect(s?.product).toBe("Oakley Encoder Rosadas");
    expect(s?.price).toBe(1045.5);
  });

  it("sin precio no hay venta (no se inventa)", () => {
    expect(parseVintedSale("Hola, x:\n\nlucia ha comprado\nGafas\n\nTu equipo de Vinted")).toBeNull();
  });
});

describe("Vinted · etiqueta", () => {
  it("extrae pedido, seguimiento, transacción, fecha límite y transportista", () => {
    const l = parseVintedLabel(VINTED_ETIQUETA);
    expect(l.product).toBe("Oakley Encoder Rosadas");
    expect(l.package_size).toBe("Pequeño (hasta 2 kg)");
    expect(l.tracking_number).toBe("3SABCD123456789");
    expect(l.transaction_id).toBe("15234567890");
    expect(l.deadline).toBe("2026-10-14T21:59:00.000Z"); // 23:59 en Madrid (horario de verano)
    expect(l.carrier_text).toMatch(/^InPost/);
  });

  it("acepta los valores en la línea siguiente (tablas HTML) y «Nº»", () => {
    const l = parseVintedLabel("Hola, a:\nPedido:\nGafas Oakley\nNº de seguimiento\nAB12345\nNº de transacción:\n987654\nFecha límite de envío:\n3 de noviembre de 2026 a las 10:30");
    expect(l.product).toBe("Gafas Oakley");
    expect(l.tracking_number).toBe("AB12345");
    expect(l.transaction_id).toBe("987654");
    expect(l.deadline).toBe("2026-11-03T09:30:00.000Z"); // horario de invierno
  });

  it("si faltan datos se quedan vacíos", () => {
    const l = parseVintedLabel("Hola:\nEncontrarás tu etiqueta de envío adjunta a este mensaje.");
    expect(l.product).toBeNull();
    expect(l.transaction_id).toBeNull();
  });
});

describe("Wallapop · confirmación", () => {
  it("toma el precio del artículo, no el total ni el envío", () => {
    const w = parseWallapopSale(WALLAPOP_VENTA)!;
    expect(w.account).toBe("Mauri");
    expect(w.buyer).toBe("Carlos G.");
    expect(w.product).toBe("LEGO 75159 Death Star");
    expect(w.price).toBe(55);
    expect(w.shipping).toBe(0);
    expect(w.total).toBe(55);
    expect(w.sale_date).toBe("2026-10-08");
    expect(w.doubt).toBeNull();
  });

  it("con envío pagado: precio = artículo, sin sumar dos veces", () => {
    const w = parseWallapopSale(WALLAPOP_VENTA.replace("0.00 €", "3,49 €").replace("Total 55.00 €", "Total 58,49 €"))!;
    expect(w.price).toBe(55);
    expect(w.shipping).toBe(3.49);
    expect(w.total).toBe(58.49);
    expect(w.doubt).toBeNull();
  });

  it("si los importes no cuadran, se marca para revisar", () => {
    const w = parseWallapopSale(WALLAPOP_VENTA.replace("Total 55.00 €", "Total 61.00 €"))!;
    expect(w.doubt).toMatch(/no cuadran/);
  });

  it("si aparece un importe desconocido, se marca para revisar", () => {
    const w = parseWallapopSale(WALLAPOP_VENTA.replace("Total 55.00 €", "Comisión\n\n2.00 €\n\nTotal 57.00 €"))!;
    expect(w.price).toBe(55);
    expect(w.doubt).toMatch(/más importes/);
  });

  it("el primer aviso de Wallapop no se puede leer como venta", () => {
    expect(parseWallapopSale(WALLAPOP_AVISO)).toBeNull();
  });
});

describe("utilidades", () => {
  it("importes", () => {
    expect(parseEuro("55.00 €")).toBe(55);
    expect(parseEuro("55,00 €")).toBe(55);
    expect(parseEuro("1.234,50 €")).toBe(1234.5);
    expect(parseEuro("€12")).toBe(12);
    expect(parseEuro("12 EUR")).toBe(12);
    expect(parseEuro("sin importe")).toBeNull();
  });

  it("fechas", () => {
    expect(parseSpanishDate("8 oct. 2026, 14:05")).toEqual({ y: 2026, m: 10, d: 8, hh: 14, mi: 5 });
    expect(parseSpanishDate("31/02/2026")).toBeNull();
    expect(madridToIso({ y: 2026, m: 1, d: 15, hh: 12, mi: 0 })).toBe("2026-01-15T11:00:00.000Z");
  });

  it("normalización", () => {
    expect(normalizeName("Oakley - Encoder · Rosas")).toBe("oakley encoder rosas");
    expect(normalizeName("  Millésime  Impérial ")).toBe("millesime imperial");
  });
});

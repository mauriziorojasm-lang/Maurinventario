import { describe, expect, it } from "vitest";
import { csvCell } from "@/lib/csv";

describe("csvCell: textos seguros para Excel", () => {
  it("neutraliza fórmulas", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+34 600")).toBe("'+34 600");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tx")).toBe("'\tx");
  });
  it("escapa separadores, comillas y saltos de línea", () => {
    expect(csvCell("Gafas; rosas")).toBe('"Gafas; rosas"');
    expect(csvCell("línea\nnueva")).toBe('"línea\nnueva"');
  });
  it("deja igual el texto normal", () => {
    expect(csvCell("normal")).toBe("normal");
  });
});

describe("toCsv: columnas numéricas", () => {
  it("los enteros negativos siguen siendo números (Excel puede sumarlos)", async () => {
    const { toCsv } = await import("@/lib/csv");
    const csv = toCsv(
      [
        { key: "u", label: "Unidades", kind: "int", value: (r) => r.u },
        { key: "n", label: "Nota", kind: "text", value: (r) => r.n },
        { key: "p", label: "Precio", kind: "money", value: (r) => r.p },
      ],
      [{ u: -3, n: "-3", p: -1.5 }],
    );
    expect(csv.split("\r\n")[1]).toBe("-3;'-3;-1,5");
  });
});

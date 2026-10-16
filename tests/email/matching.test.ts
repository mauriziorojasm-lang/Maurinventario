import { describe, expect, it } from "vitest";
import { matchProduct, scoreExistingSale, type MatchVariant } from "@/lib/email/matching";

const v = (id: string, productName: string, variantName = "Única", extra: Partial<MatchVariant> = {}): MatchVariant => ({
  id,
  label: variantName === "Única" ? productName : `${productName} · ${variantName}`,
  productName,
  variantName,
  single: variantName === "Única",
  skus: [],
  normalPrice: null,
  stock: 1,
  listings: [],
  aliases: [],
  ...extra,
});

describe("identificación del producto", () => {
  it("el título de tu anuncio en esa plataforma lo identifica aunque el nombre del inventario sea otro", () => {
    const r = matchProduct({ name: "Gafas de sol Oakley perfectas", price: 40, platform: "vinted" }, [
      v("a", "Oakley - Plate", "Única", { listings: [{ platform: "vinted", title: "Gafas de sol Oakley perfectas", price: 40, active: true }] }),
      v("b", "Oakley - Latch"),
    ]);
    expect(r.variantId).toBe("a");
    expect(r.reasons[0]).toMatch(/anuncio de Vinted/);
  });

  it("nombre casi igual (orden, plural, mayúsculas): se elige solo", () => {
    const r = matchProduct({ name: "Gafas Hstn oakley marrones", price: 40, platform: "vinted" }, [
      v("hstn", "Oakley - HSTN", "Marrón", { single: false }),
      v("holb", "Oakley - Holbrook", "Negro", { single: false }),
      v("enc", "Oakley - Encoder", "Rosas", { single: false }),
    ]);
    expect(r.variantId).toBe("hstn");
    expect(r.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("casos reales: «Gafas Hstn oakley marrones» y «Gafas Oakley Highland»", () => {
    const cat = [v("hstn", "Oakley - HSTN"), v("metal", "Oakley - HSTN Metal"), v("high", "Oakley - Highland"), v("holb", "Oakley - Holbrook")];
    expect(matchProduct({ name: "Gafas Hstn oakley marrones", price: 40, platform: "vinted" }, cat).variantId).toBe("hstn");
    expect(matchProduct({ name: "Gafas Oakley Highland", price: 55, platform: "wallapop" }, cat).variantId).toBe("high");
  });

  it("dos variantes igual de probables: no elige y explica la duda", () => {
    const r = matchProduct({ name: "Oakley HSTN", price: 40, platform: "vinted" }, [
      v("m", "Oakley - HSTN", "Marrón", { single: false }),
      v("n", "Oakley - HSTN", "Negro", { single: false }),
    ]);
    expect(r.variantId).toBeNull();
    expect(r.doubt).toMatch(/Elige|parecidos/);
    expect(r.candidates.map((c) => c.variant_id).sort()).toEqual(["m", "n"]);
  });

  it("el número de modelo manda: 42083 no es 42115", () => {
    const r = matchProduct({ name: "LEGO Technic 42083 Bugatti Chiron", price: 300, platform: "wallapop" }, [
      v("bug", "42083 Bugatti Chiron"),
      v("lam", "42115 Lamborghini Sián"),
    ]);
    expect(r.variantId).toBe("bug");
    expect(r.reasons.join(" ")).toMatch(/42083/);
  });

  it("sin stock no se elige solo", () => {
    const r = matchProduct({ name: "Oakley Encoder", price: 50, platform: "vinted" }, [v("e", "Oakley Encoder", "Única", { stock: 0 })]);
    expect(r.variantId).toBeNull();
    expect(r.doubt).toMatch(/no tiene stock/);
  });

  it("nada parecido: lo dice y no inventa", () => {
    const r = matchProduct({ name: "Bicicleta estática", price: 90, platform: "wallapop" }, [v("x", "Oakley Encoder")]);
    expect(r.variantId).toBeNull();
    expect(r.candidates).toEqual([]);
  });

  it("un nombre recordado (alias) gana siempre", () => {
    const r = matchProduct({ name: "Gafas Oakley Highland", price: 55, platform: "wallapop" }, [
      v("a", "Oakley - Holbrook", "Única", { aliases: ["gafas oakley highland"] }),
      v("b", "Oakley - Highland"),
    ]);
    expect(r.variantId).toBe("a");
  });
});

describe("¿ya estaba apuntada?", () => {
  const base = { date: "2026-10-13", price: 75, buyer: "juan_88", platform: "vinted", variantId: "p1", name: "Oakley HSTN", reference: null };
  it("mismo producto, comprador, precio y día: casi seguro", () => {
    const s = scoreExistingSale(base, { id: "s1", date: "2026-10-13", price: 75, buyer: "Juan_88", platform: "vinted", variantIds: ["p1"], productNames: ["Oakley HSTN"], reference: null });
    expect(s.score).toBeGreaterThanOrEqual(0.9);
    expect(s.reasons).toEqual(expect.arrayContaining(["Mismo producto", "Mismo comprador", "Mismo precio", "Mismo día"]));
  });
  it("mismo nº de transacción: seguro", () => {
    const s = scoreExistingSale({ ...base, reference: "2311" }, { id: "s", date: "2026-09-01", price: 1, buyer: null, platform: "vinted", variantIds: [], productNames: [], reference: "2311" });
    expect(s.score).toBe(1);
  });
  it("otro producto y otra fecha: poco probable", () => {
    const s = scoreExistingSale(base, { id: "s2", date: "2026-09-20", price: 30, buyer: null, platform: "vinted", variantIds: ["p9"], productNames: ["Lego 42083"], reference: null });
    expect(s.score).toBeLessThan(0.2);
  });
});

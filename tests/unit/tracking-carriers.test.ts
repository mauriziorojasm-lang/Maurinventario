import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { registerNumbers } from "@/lib/tracking/seventeen";

/** Simula 17TRACK: acepta el número solo con el transportista correcto. */
function fakeFetch(correct: Record<string, number>) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { number: string; carrier?: number }[];
    const accepted: { number: string }[] = [];
    const rejected: { number: string; error: { code: number; message: string } }[] = [];
    for (const it of body) {
      if (it.carrier === correct[it.number]) accepted.push({ number: it.number });
      else rejected.push({ number: it.number, error: { code: -18019902, message: "Carrier cannot be detected." } });
    }
    return new Response(JSON.stringify({ data: { accepted, rejected }, code: 0 }), { status: 200 });
  });
}

describe("registro en 17TRACK con varios códigos por transportista", () => {
  beforeEach(() => {
    vi.stubEnv("TRACK17_API_KEY", "test-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("prueba el siguiente código hasta que 17TRACK acepta el número", async () => {
    const f = fakeFetch({ "ABC123": 100430 });
    vi.stubGlobal("fetch", f);
    const res = await registerNumbers([{ number: "ABC123", tag: "1", carriers: [100392, 100430, 7041] }]);
    expect(res.get("ABC123")).toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("devuelve el error si ningún código del transportista acepta el número", async () => {
    vi.stubGlobal("fetch", fakeFetch({}));
    const res = await registerNumbers([{ number: "XYZ999", tag: "2", carriers: [100594, 100043] }]);
    expect(res.get("XYZ999")).toBe("Carrier cannot be detected.");
  });

  it("da de alta sin transportista cuando no hay códigos conocidos", async () => {
    const f = fakeFetch({ "NOCAR1": 0 });
    vi.stubGlobal("fetch", f);
    const res = await registerNumbers([{ number: "NOCAR1", tag: "3", carriers: [] }]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(res.get("NOCAR1")).toBe("Carrier cannot be detected.");
  });
});

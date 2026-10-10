import { describe, expect, it } from "vitest";
import { date } from "@/lib/format";

describe("date", () => {
  it("las fechas sin hora se muestran tal cual", () => {
    expect(date("2026-10-09")).toBe("09/10/2026");
  });
  it("los instantes se pasan a la hora de Madrid", () => {
    expect(date("2026-10-09T22:30:00Z")).toBe("10/10/2026");
    expect(date("2026-01-15T22:30:00+00:00")).toBe("15/01/2026");
  });
  it("vacío", () => {
    expect(date(null)).toBe("—");
  });
});

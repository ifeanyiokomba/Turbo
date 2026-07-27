import { describe, it, expect } from "vitest";
import {
  naira,
  nairaCompact,
  parseKobo,
  generateReference,
  maskAccount,
  maskPan,
} from "@/lib/money";

describe("Money formatting", () => {
  it("should format kobo to naira", () => {
    expect(naira(100000)).toBe("₦1,000.00");
    expect(naira(0)).toBe("₦0.00");
    expect(naira(50500)).toBe("₦505.00");
  });
  it("should format compact", () => {
    // nairaCompact takes kobo. 100M kobo = 1M naira → "M" suffix.
    // 100K kobo = 1K naira → "K" suffix.
    expect(nairaCompact(100_000_000)).toContain("M");
    expect(nairaCompact(100_000)).toContain("K");
  });
  it("should parse naira to kobo", () => {
    expect(parseKobo("1000")).toBe(100000);
    expect(parseKobo("50.50")).toBe(5050);
    expect(parseKobo("0")).toBe(0);
    expect(parseKobo("invalid")).toBe(0);
  });
});

describe("Reference generation", () => {
  it("should generate unique references", () => {
    const r1 = generateReference();
    const r2 = generateReference();
    expect(r1).not.toBe(r2);
    expect(r1).toMatch(/^TP-/);
  });
  it("should use custom prefix", () => {
    expect(generateReference("AIR")).toMatch(/^AIR-/);
  });
});

describe("Masking", () => {
  it("should mask account numbers", () => {
    expect(maskAccount("1234567890")).toBe("••••7890");
  });
  it("should mask PAN", () => {
    expect(maskPan("4242")).toContain("••••");
    expect(maskPan("4242")).toContain("4242");
  });
});

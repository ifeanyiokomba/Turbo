import { describe, it, expect } from "vitest";
import { jaroWinkler } from "@/lib/turbocore/compliance/screen";

describe("Jaro-Winkler similarity", () => {
  it("should return 1 for identical strings", () => {
    expect(jaroWinkler("John Doe", "John Doe")).toBe(1);
  });
  it("should return 0 for completely different strings", () => {
    expect(jaroWinkler("abc", "xyz")).toBe(0);
  });
  it("should return high score for similar names", () => {
    expect(jaroWinkler("John Doe", "Jon Doe")).toBeGreaterThan(0.85);
  });
  it("should be case-insensitive", () => {
    expect(jaroWinkler("JOHN", "john")).toBe(1);
  });
  it("should handle empty strings", () => {
    // Empty vs non-empty returns 0 (the function short-circuits after
    // lowercasing + stripping non-alphanumerics when either side is empty).
    expect(jaroWinkler("", "abc")).toBe(0);
    expect(jaroWinkler("abc", "")).toBe(0);
  });
});

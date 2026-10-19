import { describe, expect, it } from "vitest";
import { VERDICT_STYLES } from "./DealBadge";
import { formatKm, formatPrice } from "./format";

describe("formatPrice", () => {
  it("formats EUR amounts", () => {
    expect(formatPrice(1234.5)).toBe("1,235 €");
    expect(formatPrice(0)).toBe("0 €");
  });

  it("shows a dash for missing values", () => {
    expect(formatPrice(null)).toBe("—");
    expect(formatPrice(undefined)).toBe("—");
  });
});

describe("formatKm", () => {
  it("formats mileage", () => {
    expect(formatKm(120000)).toBe("120,000 km");
    expect(formatKm(null)).toBe("—");
  });
});

describe("verdict styles", () => {
  it("covers every deal verdict", () => {
    for (const verdict of ["cheap", "fair", "overpriced", "suspicious"]) {
      expect(VERDICT_STYLES[verdict]).toBeTruthy();
    }
  });
});

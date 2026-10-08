import { describe, expect, it } from "vitest";
import { formatCurrency, formatNumber, formatPercent } from "../lib/format.ts";

describe("shared value formatting", () => {
  it("formats large rupee values in crores and lakhs", () => {
    expect(formatCurrency(388_800_000)).toBe("₹38.88 Cr");
    expect(formatCurrency(1_250_000)).toBe("₹12.5 L");
    expect(formatCurrency(12_345)).toBe("₹12,345");
  });

  it("uses consistent Indian grouping and percentage precision", () => {
    expect(formatNumber(123_456)).toBe("1,23,456");
    expect(formatPercent(0.357)).toBe("35.7%");
  });
});

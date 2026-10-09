import { describe, expect, it } from "vitest";
import { healthStatus } from "../lib/metrics/overview-summary.ts";

describe("overview health status", () => {
  it("marks deals and team tiles Watch when at least one lead is overdue", () => {
    expect(healthStatus("deals", undefined, 1)).toBe("watch");
    expect(healthStatus("team", undefined, 1)).toBe("watch");
  });

  it("keeps overdue-related tiles Good when no leads are overdue", () => {
    expect(healthStatus("deals", undefined, 0)).toBe("good");
    expect(healthStatus("team", "low", 0)).toBe("good");
  });

  it("preserves stronger alert severity", () => {
    expect(healthStatus("deals", "high", 1)).toBe("act");
    expect(healthStatus("team", "medium", 0)).toBe("watch");
  });
});

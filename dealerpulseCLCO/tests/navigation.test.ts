import { describe, expect, it } from "vitest";
import { buildHref } from "../lib/navigation.ts";

describe("buildHref", () => {
  it("drops Lead Explorer filters when navigating to another page", () => {
    expect(buildHref("/funnel", "rep=r1&stage=contacted&sort=customer&from=2025-01-01&branch=b1"))
      .toBe("/funnel?from=2025-01-01&branch=b1");
  });

  it("keeps only global filters across pages", () => {
    expect(buildHref("/delivery", "from=2025-01-01&to=2025-01-31&range=custom&branch=b1&source=web&model=m1&basis=event&status=lost"))
      .toBe("/delivery?from=2025-01-01&to=2025-01-31&range=custom&branch=b1&source=web&model=m1&basis=event");
  });

  it("retains an explicitly set rep in a deliberate deep link to Lead Explorer", () => {
    expect(buildHref("/leads", "rep=incidental&from=2025-01-01&stage=lost", { rep: "r2" }))
      .toBe("/leads?from=2025-01-01&rep=r2");
  });

  it("preserves a hash while dropping unrelated parameters", () => {
    expect(buildHref("/deals#step-contacted-test-drive", "sort=customer&branch=b1"))
      .toBe("/deals?branch=b1#step-contacted-test-drive");
  });
});

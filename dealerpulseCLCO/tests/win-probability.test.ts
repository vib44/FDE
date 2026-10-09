import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { THRESHOLDS } from "../lib/config.ts";
import { normalize } from "../lib/data/normalize.ts";
import { expectedValue, winProbability } from "../lib/metrics/win-probability.ts";

const dataset = normalize(JSON.parse(readFileSync("data/dealership_data.json", "utf8")));
const closed = dataset.leads.filter((lead) =>
  (lead.status === "delivered" || lead.status === "lost") &&
  lead.reached.test_drive !== null);

describe("win probability", () => {
  it("falls back to the stage-only rate when the source has too few closed leads", () => {
    const sparseSource = closed.slice(0, THRESHOLDS.minClosedLeadsForSourceWinProbability - 1).map((lead) => ({
      ...lead,
      source: "sparse-source",
    }));
    const pool = [...closed, ...sparseSource];
    const result = winProbability(pool, "test_drive", "sparse-source");
    const stageClosed = pool.filter((lead) =>
      (lead.status === "delivered" || lead.status === "lost") &&
      lead.reached.test_drive !== null);

    expect(result.basis).toBe("stage only");
    expect(result.probability).toBe(
      stageClosed.filter((lead) => lead.status === "delivered").length / stageClosed.length,
    );
  });

  it("uses the source rate once the configured closed-lead minimum is met", () => {
    const sourceLeads = closed.slice(0, THRESHOLDS.minClosedLeadsForSourceWinProbability).map((lead) => ({
      ...lead,
      source: "qualified-source",
    }));
    const result = winProbability(sourceLeads, "test_drive", "qualified-source");

    expect(result.basis).toBe("stage + source");
    expect(result.probability).toBe(
      sourceLeads.filter((lead) => lead.status === "delivered").length / sourceLeads.length,
    );
  });

  it("returns no expected value for delivered or lost leads", () => {
    const delivered = dataset.leads.find((lead) => lead.status === "delivered")!;
    const lost = dataset.leads.find((lead) => lead.status === "lost")!;
    const openLead = dataset.leads.find((lead) =>
      lead.status !== "delivered" && lead.status !== "lost")!;

    expect(expectedValue(delivered, dataset.leads)).toBeNull();
    expect(expectedValue(lost, dataset.leads)).toBeNull();
    expect(expectedValue(openLead, dataset.leads)).not.toBeNull();

    const openValue = dataset.leads.reduce((sum, lead) =>
      sum + (expectedValue(lead, dataset.leads) ?? 0), 0);
    const openLeads = dataset.leads.filter((lead) =>
      lead.status !== "delivered" && lead.status !== "lost");
    expect(openValue).toBe(openLeads.reduce((sum, lead) =>
      sum + (expectedValue(lead, dataset.leads) ?? 0), 0));
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalize } from "../lib/data/normalize.ts";
import {
  lostAtStage,
  openAtStage,
  stageConversion,
  timeToNextStage,
  winRateFromStage,
} from "../lib/metrics/stage-progression.ts";
import type { Lead } from "../lib/types.ts";

const dataset = normalize(JSON.parse(readFileSync("data/dealership_data.json", "utf8")));

function testLead(
  id: string,
  status: string,
  overrides: Partial<Lead> = {},
): Lead {
  const base = dataset.leads[0]!;
  return {
    ...base,
    id,
    status,
    branchId: "branch-a",
    branchName: "Branch A",
    repId: "rep-a",
    dealValue: 100_000,
    reached: {
      ...base.reached,
      contacted: 1_000,
      test_drive: null,
      negotiation: null,
      order_placed: null,
      delivered: null,
    },
    history: [],
    lostStage: null,
    lastActivityAt: 5_000,
    ...overrides,
  };
}

describe("stage progression metrics", () => {
  it("calculates conversion overall and when the same function is scoped by branch or rep", () => {
    const leads = [
      testLead("a1", "delivered", {
        branchId: "branch-a",
        repId: "rep-a",
        reached: { ...testLead("x", "open").reached, contacted: 1, test_drive: 2 },
      }),
      testLead("a2", "lost", {
        branchId: "branch-a",
        repId: "rep-b",
        reached: { ...testLead("x", "open").reached, contacted: 1 },
      }),
      testLead("b1", "open", {
        branchId: "branch-b",
        repId: "rep-c",
        reached: { ...testLead("x", "open").reached, contacted: 1, test_drive: 2 },
      }),
    ];

    expect(stageConversion(leads, "contacted", "test_drive")).toBeCloseTo(2 / 3);
    expect(stageConversion(leads.filter((lead) => lead.branchId === "branch-a"), "contacted", "test_drive"))
      .toBe(0.5);
    expect(stageConversion(leads.filter((lead) => lead.repId === "rep-a"), "contacted", "test_drive"))
      .toBe(1);
  });

  it("returns median and 75th percentile stage times", () => {
    const leads = [
      testLead("two-days", "delivered", {
        reached: { ...testLead("x", "open").reached, contacted: 0, test_drive: 2 * 86_400_000 },
      }),
      testLead("four-days", "lost", {
        reached: { ...testLead("x", "open").reached, contacted: 0, test_drive: 4 * 86_400_000 },
      }),
      testLead("not-reached", "open"),
    ];

    expect(timeToNextStage(leads, "contacted", "test_drive")).toEqual({
      count: 2,
      medianDays: 3,
      percentile75Days: 4,
    });
  });

  it("calculates delivered probability from closed leads only", () => {
    const leads = [
      testLead("won", "delivered", {
        reached: { ...testLead("x", "open").reached, contacted: 1 },
      }),
      testLead("lost", "lost", {
        reached: { ...testLead("x", "open").reached, contacted: 1 },
      }),
      testLead("open", "contacted"),
    ];

    expect(winRateFromStage(leads, "contacted")).toBe(0.5);
  });

  it("groups stage losses by reason and branch and marks configured controllable reasons", () => {
    const leads = [
      testLead("lost-a", "lost", {
        branchId: "branch-a",
        branchName: "Branch A",
        lostStage: "negotiation",
        lostReason: "Dissatisfied with test drive",
      }),
      testLead("lost-b", "lost", {
        branchId: "branch-a",
        branchName: "Branch A",
        lostStage: "negotiation",
        lostReason: "Dissatisfied with test drive",
        dealValue: 200_000,
      }),
      testLead("lost-c", "lost", {
        branchId: "branch-b",
        branchName: "Branch B",
        lostStage: "negotiation",
        lostReason: "Unmapped reason",
      }),
    ];
    const result = lostAtStage(leads, "negotiation");

    expect(result.count).toBe(3);
    expect(result.value).toBe(400_000);
    expect(result.reasons[0]).toMatchObject({ reason: "Dissatisfied with test drive", count: 2, value: 300_000, controllable: true });
    expect(result.reasons[1]).toMatchObject({ reason: "Unmapped reason", controllable: false });
    expect(result.branches.map((row) => row.branchId)).toEqual(["branch-a", "branch-b"]);
  });

  it("lists currently open leads with days in stage and since last activity", () => {
    const lead = testLead("waiting", "contacted", {
      reached: { ...testLead("x", "open").reached, contacted: 2 * 86_400_000 },
      lastActivityAt: 4 * 86_400_000,
      history: [{ status: "contacted", ts: 2 * 86_400_000, note: "" }],
    });
    const rows = openAtStage([lead, testLead("already-lost", "lost")], "contacted", 10 * 86_400_000);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      lead,
      daysInStage: 8,
      daysSinceLastActivity: 6,
    });
  });
});

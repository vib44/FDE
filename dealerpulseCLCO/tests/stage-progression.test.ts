import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalize } from "../lib/data/normalize.ts";
import {
  dealProgressionMetrics,
  lostAtStage,
  openAtStage,
  overdueAtStage,
  inProgressPipeline,
  stageConversion,
  testDriveLift,
  timeToNextStage,
  winRateFromStage,
  weakestSalesStep,
} from "../lib/metrics/stage-progression.ts";
import type { Lead } from "../lib/types.ts";
import { EMPTY_FILTERS } from "../lib/types.ts";

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
  it("calculates the unordered pipeline and weakest sales step", () => {
    const leads = [
      testLead("new", "new"),
      testLead("contacted", "contacted", { dealValue: 200_000 }),
      testLead("ordered", "order_placed", { dealValue: 300_000 }),
      testLead("delivered", "delivered"),
      testLead("lost", "lost"),
    ];

    expect(inProgressPipeline(leads)).toEqual({ count: 2, value: 300_000 });
    expect(weakestSalesStep(0.767, 0.82)).toEqual({
      label: "booking a test drive",
      rate: 0.767,
    });
    expect(weakestSalesStep(0.82, 0.767)).toEqual({
      label: "moving from negotiation to an order",
      rate: 0.767,
    });
  });

  it("calculates test-drive lift from closed conversion rates, not the raw test-drive win rate", () => {
    const leads = [
      ...Array.from({ length: 10 }, (_, index) => testLead(
        `test-drive-${index}`,
        index < 6 ? "delivered" : "lost",
        { reached: { ...testLead("base", "new").reached, contacted: 1, test_drive: 2 } },
      )),
      ...Array.from({ length: 10 }, (_, index) => testLead(
        `contacted-${index}`,
        index < 2 ? "delivered" : "lost",
        { reached: { ...testLead("base", "new").reached, contacted: 1 } },
      )),
    ];

    expect(winRateFromStage(leads, "test_drive")).toBe(0.6);
    expect(testDriveLift(leads)).toBeCloseTo(0.2);
    expect(testDriveLift(leads)).not.toBeCloseTo(0.6);
  });

  it("records the supplied dataset summary, Step 2 lift, typical stage times and branch conversion rates", () => {
    const pipeline = inProgressPipeline(dataset.leads);
    const lift = testDriveLift(dataset.leads);
    const bookingTime = timeToNextStage(dataset.leads, "contacted", "test_drive");
    const closingTime = timeToNextStage(dataset.leads, "negotiation", "order_placed");
    const branchRates = dataset.branches.map((branch) => {
      const leads = dataset.leads.filter((lead) => lead.branchId === branch.id);
      return {
        branch: branch.name,
        booking: stageConversion(leads, "contacted", "test_drive"),
        closing: stageConversion(leads, "negotiation", "order_placed"),
      };
    });
    expect(pipeline).toEqual({ count: 24, value: 65_680_000 });
    expect(lift).toBeCloseTo(0.1534, 4);
    expect(bookingTime).toMatchObject({
      count: 300,
      medianDays: 5.899098368055556,
      percentile75Days: 7.959628043981481,
    });
    expect(closingTime).toMatchObject({
      count: 198,
      medianDays: 8.20861546875,
      percentile75Days: 11.170198958333334,
    });
    expect(stageConversion(dataset.leads, "contacted", "test_drive")).toBeCloseTo(0.7673, 4);
    expect(stageConversion(dataset.leads, "negotiation", "order_placed")).toBeCloseTo(0.8426, 4);
    expect(weakestSalesStep(
      stageConversion(dataset.leads, "contacted", "test_drive"),
      stageConversion(dataset.leads, "negotiation", "order_placed"),
    )).toEqual({ label: "booking a test drive", rate: 0.7672634271099744 });
    expect(branchRates).toEqual([
      { branch: "Downtown Toyota", booking: 0.8625, closing: 0.8679245283018868 },
      { branch: "Highway Toyota", booking: 0.7441860465116279, closing: 0.7962962962962963 },
      { branch: "Lakeside Toyota", booking: 0.5869565217391305, closing: 0.7142857142857143 },
      { branch: "Central Toyota", booking: 0.8, closing: 0.8333333333333334 },
      { branch: "Eastside Toyota", booking: 0.7676767676767676, closing: 0.8939393939393939 },
    ]);
  });

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

  it("computes Deals in progress KPI rates, order values, timing, and shared overdue rows", () => {
    const day = 86_400_000;
    const completed = [1, 2, 3, 4].map((testDriveDay, index) => testLead(
      `completed-${index}`,
      index < 2 ? "order_placed" : "test_drive",
      {
        dealValue: (index + 1) * 100_000,
        reached: {
          ...testLead("base", "new").reached,
          contacted: 0,
          test_drive: testDriveDay * day,
          negotiation: (testDriveDay + 1) * day,
          order_placed: index < 2 ? (testDriveDay + 2) * day : null,
        },
      },
    ));
    const leads = [
      ...completed,
      testLead("waiting-overdue", "contacted", {
        reached: { ...testLead("base", "new").reached, contacted: 0 },
        lastActivityAt: 14 * day,
      }),
      testLead("waiting-not-overdue", "contacted", {
        reached: { ...testLead("base", "new").reached, contacted: 19 * day },
        lastActivityAt: 19 * day,
      }),
      testLead("negotiation-overdue", "negotiation", {
        reached: { ...testLead("base", "new").reached, contacted: 0, test_drive: day, negotiation: 13 * day },
        lastActivityAt: 13 * day,
      }),
      testLead("negotiation-not-overdue", "negotiation", {
        reached: { ...testLead("base", "new").reached, contacted: 0, test_drive: day, negotiation: 19 * day },
        lastActivityAt: 19 * day,
      }),
    ];
    const metrics = dealProgressionMetrics(leads, EMPTY_FILTERS, 20 * day);

    expect(metrics.bookingRate).toBe(6 / 8);
    expect(metrics.testDriveOrderRate).toBe(2 / 6);
    expect(metrics.closingRate).toBe(2 / 6);
    expect(metrics.testDriveCount).toBe(6);
    expect(metrics.negotiationCount).toBe(6);
    expect(metrics.orderCount).toBe(2);
    expect(metrics.orderValue).toBe(300_000);
    expect(metrics.orderValue / metrics.orderCount).toBe(150_000);
    expect(metrics.bookingTime.medianDays).toBe(1.5);
    expect(metrics.testDriveOrderTime.medianDays).toBe(2);
    expect(metrics.bookingOverdueRows).toEqual(overdueAtStage(
      metrics.bookingOpenRows,
      metrics.bookingTime.percentile75Days,
    ));
    expect(metrics.closingOverdueRows).toEqual(overdueAtStage(
      metrics.closingOpenRows,
      metrics.closingTime.percentile75Days,
    ));
    expect(metrics.bookingOverdueRows.map(({ lead }) => lead.id)).toEqual(["waiting-overdue"]);
    expect(metrics.closingOverdueRows.map(({ lead }) => lead.id)).toEqual(["negotiation-overdue"]);
    expect(metrics.bookingOverdueRows.length).toBe(1);
    expect(metrics.closingOverdueRows.length).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalize } from "../lib/data/normalize.ts";
import { closedWinRate, funnel, lostWithoutEvent, stageConversion } from "../lib/metrics/funnel.ts";
import { medianFirstResponse } from "../lib/metrics/response.ts";
import {
  awaitingOrders,
  branchDeliveryScorecardTotals,
  coldLeads,
  delayStats,
  deliverySectionData,
  overdueOpen,
} from "../lib/metrics/delivery.ts";
import { attainment } from "../lib/metrics/targets.ts";
import { filterLeads } from "../lib/metrics/filters.ts";
import { mad, median, robustZ } from "../lib/metrics/stats.ts";
import { EMPTY_FILTERS } from "../lib/types.ts";
import { toDay, toMonth } from "../lib/dates.ts";
import { periodLabel } from "../lib/period.ts";
import { scopeSummary } from "../lib/metrics/summary.ts";
import { overviewVM } from "../lib/metrics/overview.ts";
import { actNowInsights } from "../lib/metrics/insights.ts";
import { branchAlertData } from "../lib/metrics/branch-alert-data.ts";
import { localPriorityAlerts } from "../lib/metrics/local-alerts.ts";
import { lastContactByRepresentative } from "../lib/metrics/last-contact.ts";
import { filterOpenLeads, OPEN_LEAD_AGE_BUCKETS, openLeadBuckets, openLeadsByBranch } from "../lib/metrics/open-leads.ts";
import {
  branchScorecard,
  conversionFunnel,
  delayReasonsPareto,
  funnelByBranch,
  leadFlowByMonth,
  sourceQuality,
  targetActualByBranch,
  undeliveredOrderAging,
} from "../lib/metrics/dashboard-charts.ts";
import { LOST, ORDER_STAGE, STAGES, THRESHOLDS } from "../lib/config.ts";
import type { BranchDeliveryScorecardRow } from "../lib/metrics/delivery.ts";
import { branchDetailData } from "../lib/metrics/branch-detail.ts";
import { leadValueCeiling } from "../lib/metrics/lead-value-ceiling.ts";

const ds = normalize(JSON.parse(readFileSync("data/dealership_data.json", "utf8"))), L = ds.leads;
const count = (s: string) => L.filter((l) => l.status === s).length;
const branch = (name: string) => L.filter((l) => ds.branchById[l.branchId]!.name.startsWith(name));
const pct = (x: number | null) => Math.round((x ?? 0) * 100);

// Ground-truth numbers below are FIXTURES only; they never appear in UI code.
describe("ground truth", () => {
  it("lead counts, revenue, orders, asOf", () => {
    expect([L.length, count("delivered"), count("lost")]).toEqual([510, 160, 288]);
    expect(L.filter((l) => l.status === "delivered").reduce((s, l) => s + l.dealValue, 0)).toBe(388_760_000);
    expect(funnel(L).find((r) => r.stage === "order_placed")!.count).toBe(198);
    expect(new Date(ds.asOf).toISOString()).toBe("2025-12-31T19:10:00.000Z");
  });
  it("targets", () => {
    expect(ds.targets.reduce((s, t) => s + t.units, 0)).toBe(1426);
    expect(ds.targets.reduce((s, t) => s + t.revenue, 0)).toBe(3_130_141_531);
  });
  it("compares lead-volume value ceiling with revenue and unit targets overall and by branch", () => {
    const result = leadValueCeiling(ds, EMPTY_FILTERS);
    expect(result.leadCount).toBe(L.length);
    expect(result.leadValue).toBe(L.reduce((sum, lead) => sum + lead.dealValue, 0));
    expect(result.targetUnits).toBe(ds.targets.reduce((sum, target) => sum + target.units, 0));
    expect(result.targetRevenue).toBe(ds.targets.reduce((sum, target) => sum + target.revenue, 0));
    expect(result.ceilingPct).toBeCloseTo(result.leadValue / result.targetRevenue);
    expect(result.branches).toHaveLength(ds.branches.length);
    expect(result.branches).toEqual([...result.branches].sort((a, b) =>
      (a.ceilingPct ?? Number.POSITIVE_INFINITY) - (b.ceilingPct ?? Number.POSITIVE_INFINITY) ||
      a.branchName.localeCompare(b.branchName)));
    expect(result.branches.reduce((sum, row) => sum + row.leadCount, 0)).toBe(result.leadCount);
    expect(result.branches.reduce((sum, row) => sum + row.leadValue, 0)).toBe(result.leadValue);
    expect(Math.round((result.ceilingPct ?? 0) * 1000) / 10).toBe(39.5);
    expect(result.branches.map((row) => Math.round((row.ceilingPct ?? 0) * 1000) / 10))
      .toEqual([33.9, 35.7, 40.5, 43.4, 44.5]);

    const selectedBranchId = ds.branches[0]!.id;
    const scoped = leadValueCeiling(ds, { ...EMPTY_FILTERS, branch: selectedBranchId });
    expect(scoped.branches).toHaveLength(1);
    expect(scoped.branches[0]!.branchId).toBe(selectedBranchId);
    expect(scoped.leadCount).toBe(L.filter((lead) => lead.branchId === selectedBranchId).length);
    expect(scoped.leadValue).toBe(L.filter((lead) => lead.branchId === selectedBranchId)
      .reduce((sum, lead) => sum + lead.dealValue, 0));
  });
  it("closed win rate by branch and source", () => {
    const lake = branch("Lakeside");
    expect(lake.filter((l) => l.status === "delivered").length).toBe(6);
    expect(lake.filter((l) => l.status === "lost").length).toBe(69);
    expect(pct(closedWinRate(lake))).toBe(8);
    for (const b of ds.branches.filter((b) => !b.name.startsWith("Lakeside")))
      expect(pct(closedWinRate(L.filter((l) => l.branchId === b.id)))).toBeGreaterThanOrEqual(38);
    expect(pct(closedWinRate(L.filter((l) => l.source === "walk_in")))).toBe(56);
    expect(pct(closedWinRate(L.filter((l) => l.source === "social_media")))).toBe(15);
  });
  it("test-drive to order and first response", () => {
    expect(pct(stageConversion(branch("Lakeside"), "test_drive", "order_placed"))).toBe(37);
    for (const b of ds.branches) {
      const h = medianFirstResponse(L.filter((l) => l.branchId === b.id))!;
      expect(h).toBeGreaterThan(43); expect(h).toBeLessThan(51);
    }
  });
  it("builds branch detail metrics and tables from the selected branch scope", () => {
    const selected = ds.branches.find((item) => item.name.startsWith("Lakeside"))!;
    const selectedLeads = L.filter((lead) => lead.branchId === selected.id);
    const detail = branchDetailData(ds, selected.id, EMPTY_FILTERS)!;
    const closed = selectedLeads.filter((lead) => lead.status === "delivered" || lead.status === "lost");
    const contacted = selectedLeads.filter((lead) => lead.reached.contacted !== null);
    const testDrives = selectedLeads.filter((lead) => lead.reached.test_drive !== null);
    const delayed = selectedLeads.filter((lead) => lead.delivery !== null && lead.delivery.delayReason !== null);
    const openValue = selectedLeads.filter((lead) => lead.status !== "delivered" && lead.status !== "lost")
      .reduce((sum, lead) => sum + lead.dealValue, 0);

    expect(detail.leads.every((lead) => lead.branchId === selected.id)).toBe(true);
    expect(detail.stats.contactRate).toBeCloseTo(contacted.length / selectedLeads.length);
    expect(detail.stats.testDriveToOrder).toBeCloseTo(
      testDrives.filter((lead) => lead.reached.order_placed !== null).length / testDrives.length,
    );
    expect(detail.stats.winRate).toBeCloseTo(
      selectedLeads.filter((lead) => lead.status === "delivered").length / closed.length,
    );
    expect(detail.stats.delayRate).toBeCloseTo(delayed.length /
      selectedLeads.filter((lead) => lead.delivery !== null).length);
    expect(detail.stats.workload).toBeCloseTo(selectedLeads.length /
      ds.reps.filter((rep) => rep.branchId === selected.id).length);
    expect(detail.stats.firstResponseHours).toBeCloseTo(medianFirstResponse(selectedLeads)!);
    expect(detail.pipeline.openValue).toBe(openValue);
    expect(detail.funnelRows.map((row) => row.count)).toEqual(STAGES.map((stage) =>
      selectedLeads.filter((lead) => lead.reached[stage] !== null).length));
    expect(detail.lossRows.reduce((sum, row) => sum + row.count, 0)).toBe(
      selectedLeads.filter((lead) => lead.status === "lost").length,
    );
    expect(detail.sourceRows.reduce((sum, row) => sum + row.volume, 0)).toBe(selectedLeads.length);
    expect(detail.repRows.every((row) => row.leadCount > 0)).toBe(true);
    expect(branchDetailData(ds, "missing-branch", EMPTY_FILTERS)).toBeNull();
  });
  it("awaiting orders and delays", () => {
    const aw = awaitingOrders(L, ds.asOf);
    expect(aw.length).toBe(38);
    expect(aw.reduce((s, a) => s + a.value, 0) / 1e7).toBeCloseTo(8.59, 1);
    expect(aw.filter((a) => a.idleDays >= 30).length).toBe(24);
    const d = delayStats(L);
    expect(d.avgDelayedDays!).toBeCloseTo(25, 0); expect(d.avgOnTimeDays!).toBeCloseTo(13, 0);
    expect(pct(delayStats(branch("Central")).delayRate)).toBe(26);
  });
  it("counts only current order_placed leads without a delivery as awaiting", () => {
    const base = L[0]!;
    const orderAwaitingDelivery = {
      ...base,
      id: "awaiting-delivery",
      status: ORDER_STAGE,
      delivery: null,
      reached: { ...base.reached, [ORDER_STAGE]: ds.asOf - 86_400_000 },
    };
    const lostAfterOrdering = {
      ...orderAwaitingDelivery,
      id: "lost-after-order",
      status: LOST,
      history: [
        ...base.history,
        { status: ORDER_STAGE, ts: ds.asOf - 86_400_000, note: "" },
        { status: LOST, ts: ds.asOf, note: "" },
      ],
    };
    const deliveredLead = {
      ...orderAwaitingDelivery,
      id: "already-delivered",
      status: "delivered",
      delivery: L.find((lead) => lead.delivery)?.delivery ?? null,
    };

    expect(awaitingOrders([orderAwaitingDelivery, lostAfterOrdering, deliveredLead], ds.asOf)
      .map(({ lead }) => lead.id)).toEqual(["awaiting-delivery"]);
  });
  it("computes scorecard totals with a delivery-weighted overall average", () => {
    const rows: BranchDeliveryScorecardRow[] = [
      {
        branchId: "north",
        branchName: "North",
        managerName: "North manager",
        deliveries: 2,
        averageDays: 10,
        medianDays: 9,
        revenueDelivered: 3_000_000,
        ordersAwaiting: 2,
        valueAwaiting: 1_200_000,
      },
      {
        branchId: "south",
        branchName: "South",
        managerName: "South manager",
        deliveries: 1,
        averageDays: 7,
        medianDays: 7,
        revenueDelivered: 2_000_000,
        ordersAwaiting: 1,
        valueAwaiting: 800_000,
      },
    ];

    expect(branchDeliveryScorecardTotals(rows)).toEqual({
      deliveries: 3,
      averageDays: 9,
      revenueDelivered: 5_000_000,
      ordersAwaiting: 3,
      valueAwaiting: 2_000_000,
    });
  });
  it("uses the latest status history event instead of a stale top-level status", () => {
    const staleOrder = {
      ...L[0]!,
      status: "order_placed",
      history: [
        ...L[0]!.history,
        { status: "lost", ts: ds.asOf, note: "Closed after follow-up" },
      ],
    };
    const normalized = normalize({
      ...JSON.parse(readFileSync("data/dealership_data.json", "utf8")),
      leads: [staleOrder],
    });

    expect(normalized.leads[0]!.status).toBe("lost");
    expect(awaitingOrders(normalized.leads, ds.asOf)).toHaveLength(0);
  });
  it("builds delivery tables and age buckets from the active scope", () => {
    const section = deliverySectionData(ds, EMPTY_FILTERS);
    expect(section.deliveredCount).toBe(delayStats(L).total);
    expect(section.delayedCount).toBe(delayStats(L).delayed);
    expect(section.averageDelayedDays).toBeCloseTo(delayStats(L).avgDelayedDays!);
    expect(section.averageOnTimeDays).toBeCloseTo(delayStats(L).avgOnTimeDays!);
    expect(section.awaitingCount).toBe(awaitingOrders(L, ds.asOf).length);
    const deliveries = L.filter((lead) => lead.delivery);
    const fastestDays = Math.min(...deliveries.map((lead) => lead.delivery!.daysToDeliver));
    const highestValue = Math.max(...deliveries.map((lead) => lead.dealValue));
    expect(section.medianDeliveryDays).toBe(median(deliveries.map((lead) => lead.delivery!.daysToDeliver)));
    expect(section.fastestDeliveryDays).toBe(fastestDays);
    expect(section.fastestDeliveries).toHaveLength(
      deliveries.filter((lead) => lead.delivery!.daysToDeliver === fastestDays).length,
    );
    expect(section.highestDeliveryValue).toBe(highestValue);
    expect(section.highestValueDeliveries).toHaveLength(deliveries.filter((lead) => lead.dealValue === highestValue).length);
    expect(section.mostDeliveredModel?.count).toBeGreaterThan(0);
    expect(section.awaitingIdleCount).toBe(
      awaitingOrders(L, ds.asOf).filter((row) => row.idleDays >= THRESHOLDS.staleOrderDays).length,
    );
    expect(section.ageBuckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(section.awaitingCount);
    expect(section.ageBuckets.reduce((sum, bucket) => sum + bucket.value, 0)).toBeCloseTo(section.awaitingValue);
    expect(section.reasons.reduce((sum, row) => sum + row.count, 0)).toBe(section.delayedCount);
    expect(section.branchCycles.reduce((sum, row) => sum + row.count, 0)).toBe(section.deliveredCount);
    expect(section.branchSpeedRows.length).toBeLessThanOrEqual(5);
    expect(section.branchSpeedRows.every((row, index, rows) =>
      index === 0 || rows[index - 1]!.medianDays <= row.medianDays)).toBe(true);
    expect(section.branchSpeedRows.every((row) =>
      row.belowMinimumSample === (row.count < THRESHOLDS.minDeliveriesForBranchRank))).toBe(true);
    expect(section.closedLostCount).toBe(288);
    expect(section.closedLostValue).toBe(L.filter((lead) => lead.status === "lost").reduce((sum, lead) => sum + lead.dealValue, 0));
    expect(section.closedLostRows.length).toBe(288);
    expect(section.reasons[0]!.count).toBeGreaterThanOrEqual(section.reasons.at(-1)!.count);
    expect(section.branchCycles[0]!.averageDays).toBeGreaterThanOrEqual(section.branchCycles.at(-1)!.averageDays);
    expect(section.awaitingRows.every((row, index, rows) =>
      index === 0 || rows[index - 1]!.daysWaiting >= row.daysWaiting)).toBe(true);

    const lakeside = deliverySectionData(ds, { ...EMPTY_FILTERS, branch: ds.branches[0]!.id });
    expect(lakeside.branchCycles.every((row) => row.branchId === ds.branches[0]!.id)).toBe(true);
    expect(lakeside.awaitingRows.every((row) => row.lead.branchId === ds.branches[0]!.id)).toBe(true);

    const firstBranch = ds.branches[0]!;
    const secondBranch = ds.branches[1]!;
    const tieFixture = {
      ...ds,
      leads: [firstBranch, secondBranch].map((branchItem, index) => ({
        ...L.find((lead) => lead.branchId === branchItem.id)!,
        branchId: branchItem.id,
        branchName: branchItem.name,
        status: "delivered",
        delivery: {
          leadId: `tie-${index}`,
          orderAt: ds.asOf - 20 * 86_400_000,
          deliveredAt: ds.asOf,
          daysToDeliver: 10,
          delayReason: index === 0 ? null : "Parts delay",
        },
      })),
    };
    expect(deliverySectionData(tieFixture, EMPTY_FILTERS).branchSpeedRows.map((row) => row.branchId))
      .toEqual([firstBranch.id, secondBranch.id]);
  });
  it("data quality", () => {
    expect(lostWithoutEvent(L).length).toBe(14);
    expect(overdueOpen(L, ds.asOf).length).toBe(30);
  });
  it("attainment is shown, not rescaled", () => {
    const a = attainment(ds, EMPTY_FILTERS, "deliveries");
    expect(a.bestRevenuePct!).toBeLessThan(0.35);
  });
});

describe("edge cases", () => {
  it("filters real open leads by activity age and groups cumulative deal value by last status", () => {
    expect(filterOpenLeads(ds, EMPTY_FILTERS).length).toBeGreaterThan(0);
    const ages = [0, 2, 7, 23, 1, 4];
    const leads = L.slice(0, ages.length).map((lead, index) => ({
      ...lead,
      status: ["new", "order_placed", "contacted", "negotiation", "delivered", "lost"][index]!,
      lastActivityAt: ds.asOf - ages[index]! * 86_400_000,
      dealValue: (index + 1) * 100,
    }));
    const fixture = { ...ds, leads };
    const openLeads = filterOpenLeads(fixture, EMPTY_FILTERS);
    const allAges = OPEN_LEAD_AGE_BUCKETS.map((bucket) => bucket.key);
    const buckets = openLeadBuckets(openLeads, ds.asOf, allAges, null);

    expect(openLeads.map((lead) => lead.status)).toEqual(["new", "order_placed", "contacted", "negotiation"]);
    expect(buckets.map((bucket) => [bucket.ageBucketKey, bucket.lastStatus, bucket.count, bucket.cumulativeDealValue]))
      .toEqual([
        ["today", "new", 1, 100],
        ["1-3", "order_placed", 1, 200],
        ["4-8", "contacted", 1, 300],
        ["over-20", "negotiation", 1, 400],
      ]);
    expect(openLeadBuckets(openLeads, ds.asOf, ["1-3", "4-8"], "contacted"))
      .toEqual([{ ageBucketKey: "4-8", ageBucketLabel: "4–8 days", lastStatus: "contacted", count: 1, cumulativeDealValue: 300 }]);

    const branchLeads = openLeads.map((lead, index) => ({
      ...lead,
      branchId: index < 2 ? "branch-a" : "branch-b",
    }));
    expect(openLeadsByBranch(branchLeads, ds.asOf, allAges, null)).toEqual([
      { branchId: "branch-a", count: 2, cumulativeDealValue: 300, lastStatuses: ["new", "order_placed"] },
      { branchId: "branch-b", count: 2, cumulativeDealValue: 700, lastStatuses: ["contacted", "negotiation"] },
    ]);
  });

  it("labels full and month-bounded reporting periods", () => {
    expect(periodLabel(ds, { from: null, to: null })).toMatch(/^Full period: .+ – .+$/);
    expect(periodLabel(ds, {
      from: Date.UTC(2025, 0, 1),
      to: Date.UTC(2025, 1, 0, 23, 59, 59, 999),
    })).toBe("Period: Jan 2025");
  });

  it("groups last-contact activity into disjoint day buckets by latest lead status", () => {
    const ages = [1, 4, 9, 13, 21, 0];
    const leads = L.slice(0, ages.length).map((lead, index) => ({
      ...lead,
      status: index % 2 === 0 ? "delivered" : "new",
      lastActivityAt: ds.asOf - ages[index]! * 86_400_000,
    }));
    const fixture = { ...ds, leads };
    const all = lastContactByRepresentative(fixture, EMPTY_FILTERS);
    expect(all.buckets.map((bucket) => bucket.count)).toEqual([1, 1, 1, 1, 1]);
    expect(all.totalCount).toBe(5);
    expect(all.reps.reduce((sum, rep) => sum + rep.totalCount, 0)).toBe(5);
    expect(all.branches.flatMap((item) => item.reps)
      .reduce((sum, rep) => sum + rep.totalCount, 0)).toBe(5);

    const delivered = lastContactByRepresentative(fixture, EMPTY_FILTERS, "delivered");
    expect(delivered.buckets.map((bucket) => bucket.count)).toEqual([1, 0, 1, 0, 1]);
  });

  it("builds chart view models with scoped branch and month data", () => {
    const target = targetActualByBranch(ds, EMPTY_FILTERS);
    expect(target.data).toHaveLength(ds.branches.length);
    expect(target.data.reduce((sum, point) => sum + point.actual, 0)).toBe(198);
    expect(target.data.reduce((sum, point) => sum + point.target, 0)).toBe(1426);
    expect(target.title).toContain("?");
    expect(target.takeaway).not.toContain("\n");

    const scorecard = branchScorecard(ds, EMPTY_FILTERS);
    expect(scorecard.metrics).toHaveLength(4);
    expect(scorecard.data).toHaveLength(ds.branches.length);
    expect(scorecard.data.every((point) => point.values[0] !== null &&
      point.values[0]! >= 0 && point.values[0]! <= 1)).toBe(true);

    const funnelView = conversionFunnel(ds, EMPTY_FILTERS);
    expect(funnelView.data.map((point) => point.count)).toEqual(funnel(L).map((point) => point.count));
    expect(funnelByBranch(ds, EMPTY_FILTERS).data).toHaveLength(ds.branches.length);

    const flow = leadFlowByMonth(ds, EMPTY_FILTERS);
    expect(flow.data.reduce((sum, point) => sum + point.count, 0)).toBe(L.length);
    expect(undeliveredOrderAging(ds, EMPTY_FILTERS).data.reduce((sum, point) =>
      sum + point.under7 + point.days7to14 + point.days15to30 + point.over30, 0)).toBe(awaitingOrders(L, ds.asOf).length);
    expect(delayReasonsPareto(ds, EMPTY_FILTERS).data.reduce((sum, point) => sum + point.count, 0)).toBe(delayStats(L).delayed);
    expect(sourceQuality(ds, EMPTY_FILTERS).data.reduce((sum, point) => sum + point.leads, 0)).toBe(L.length);
  });

  it("returns empty-safe chart view models for an unknown branch", () => {
    const filters = { ...EMPTY_FILTERS, branch: "unknown-branch" };
    expect(targetActualByBranch(ds, filters).data).toEqual([]);
    expect(conversionFunnel(ds, filters).data.every((point) => point.count === 0)).toBe(true);
    expect(leadFlowByMonth(ds, filters).data).toEqual([]);
    expect(sourceQuality(ds, filters).data).toEqual([]);
    expect(delayReasonsPareto(ds, filters).data).toEqual([]);
    expect(undeliveredOrderAging(ds, filters).data).toEqual([]);
  });

  it("buckets timestamps by UTC day and month", () => {
    const timestamp = Date.parse("2025-01-01T00:30:00+05:30");
    expect(toDay(timestamp)).toBe("2024-12-31");
    expect(toMonth(timestamp)).toBe("2024-12");
  });
  it("summarizes the filtered scope", () => {
    expect(scopeSummary(L)).toEqual({ leadCount: 510, branchCount: 5 });
  });
  it("builds the overview from the metrics layer", () => {
    const { kpis, verdict } = overviewVM(ds, EMPTY_FILTERS);
    const value = (id: string) => kpis.find((kpi) => kpi.id === id)!.value;
    expect(value("revenue")).toBe(388_760_000);
    expect(value("deliveries")).toBe(160);
    expect(value("orders")).toBe(198);
    expect(value("pipelineValue")).toBe(L
      .filter((lead) => ["new", "contacted", "test_drive", "negotiation"].includes(lead.status))
      .reduce((sum, lead) => sum + lead.dealValue, 0));
    expect(value("awaitingDeliveryValue")).toBe(L
      .filter((lead) => lead.status === "order_placed" && lead.delivery === null)
      .reduce((sum, lead) => sum + lead.dealValue, 0));
    expect(value("winRate")).toBeCloseTo(160 / (160 + 288));
    expect(kpis).toHaveLength(8);
    expect(kpis.every((kpi) => kpi.trend.length === 6)).toBe(true);
    expect(verdict.title).not.toBe("");
    expect(verdict.summary).not.toBe("");
  });
  it("builds privacy-safe AI alert aggregates for every branch, including when one branch is selected", () => {
    const selectedBranchFilters = { ...EMPTY_FILTERS, branch: ds.branches[0]!.id };
    const summaries = branchAlertData(ds, selectedBranchFilters);
    expect(summaries.map((summary) => summary.branchId)).toEqual(ds.branches.map((branch) => branch.id));
    expect(summaries.every((summary) => summary.leadCount > 0)).toBe(true);
    expect(summaries[0]!.leadCount).toBe(L.filter((lead) => lead.branchId === ds.branches[0]!.id).length);
    expect(summaries[0]).not.toHaveProperty("customerName");
    expect(summaries[0]).not.toHaveProperty("repName");
  });
  it("builds deterministic local priority alerts from branch aggregates", () => {
    const alerts = localPriorityAlerts([
      {
        branchId: "B-1", branchName: "North", city: "City", leadCount: 10,
        openPipelineCount: 4, openPipelineValue: 20_000_000,
        stalePreOrderCount: 2, stalePreOrderValue: 8_000_000,
        awaitingDeliveryCount: 1, awaitingDeliveryValue: 5_000_000,
        overdueLeadCount: 1, overdueLeadValue: 3_000_000,
        deliveredCount: 2, lostCount: 1, deliveredRevenue: 10_000_000,
        revenueTarget: 20_000_000, revenueAttainment: 0.5,
      },
      {
        branchId: "B-2", branchName: "South", city: "City", leadCount: 5,
        openPipelineCount: 1, openPipelineValue: 500_000,
        stalePreOrderCount: 0, stalePreOrderValue: 0,
        awaitingDeliveryCount: 0, awaitingDeliveryValue: 0,
        overdueLeadCount: 0, overdueLeadValue: 0,
        deliveredCount: 1, lostCount: 0, deliveredRevenue: 1_000_000,
        revenueTarget: 2_000_000, revenueAttainment: 0.5,
      },
    ]);

    expect(alerts.map((alert) => alert.id)).toEqual([
      "stale-B-1", "delivery-B-1", "overdue-B-1", "target-B-1",
    ]);
    expect(alerts.every((alert) => alert.branchName === "North")).toBe(true);
    expect(alerts.every((alert) => alert.task.length <= 280)).toBe(true);
  });
  it("builds a ranked, capped Act Now list from configured thresholds", () => {
    const insights = actNowInsights(ds, EMPTY_FILTERS);
    const severityRank = { high: 3, medium: 2, low: 1 } as const;
    expect(insights.length).toBeLessThanOrEqual(5);
    expect(insights.map((item) => item.id)).toContain("orders-beyond-median-delivery");
    expect(insights.map((item) => item.id)).toContain("branches-below-target");
    expect(insights.some((item) => item.id.startsWith("conversion-"))).toBe(true);
    expect(insights.some((item) => item.id.startsWith("source-quality-"))).toBe(true);
    expect(insights.every((item) => item.headline && item.evidence && item.action && item.leadIds.length > 0)).toBe(true);
    expect(insights).toEqual([...insights].sort((a, b) =>
      severityRank[b.severity] - severityRank[a.severity] ||
      b.rupeeImpact - a.rupeeImpact ||
      a.headline.localeCompare(b.headline)));

    const staleCandidate = L.find((lead) => ["new", "contacted", "test_drive", "negotiation"].includes(lead.status))!;
    const staleLead = {
      ...staleCandidate,
      lastActivityAt: ds.asOf - (THRESHOLDS.coldLeadDays + 1) * 86_400_000,
      dealValue: 10_000_000_000,
    };
    const staleDataset = {
      ...ds,
      leads: ds.leads.map((lead) => lead.id === staleLead.id ? staleLead : lead),
    };
    expect(actNowInsights(staleDataset, EMPTY_FILTERS).map((item) => item.id)).toContain("cold-preorder-leads");
  });
  it("keeps delivery KPIs on delivery event dates with the created-date basis selected", () => {
    const sample = L.find((lead) => lead.delivery && toDay(lead.createdAt) !== toDay(lead.delivery.deliveredAt))!;
    const day = toDay(sample.delivery!.deliveredAt);
    const from = Date.parse(`${day}T00:00:00.000Z`);
    const to = from + 86_400_000 - 1;
    const view = overviewVM(ds, { ...EMPTY_FILTERS, from, to });
    const expected = L.filter((lead) =>
      lead.status === "delivered" && lead.delivery !== null &&
      lead.delivery.deliveredAt >= from && lead.delivery.deliveredAt <= to).length;
    expect(view.kpis.find((kpi) => kpi.id === "deliveries")!.value).toBe(expected);
  });

  it("empty filters result: no NaN, null ratios", () => {
    const none = filterLeads(ds, { ...EMPTY_FILTERS, branch: "does-not-exist" });
    expect(none).toEqual([]);
    expect(closedWinRate(none)).toBeNull();
    expect(medianFirstResponse(none)).toBeNull();
    expect(funnel(none).every((r) => r.count === 0 && !Number.isNaN(r.value))).toBe(true);
    expect(delayStats(none).delayRate).toBeNull();
    expect(coldLeads(none, ds.asOf, 14)).toEqual([]);
  });
  it("zero denominators", () => {
    expect(median([])).toBeNull(); expect(mad([])).toBeNull(); expect(robustZ(5, [])).toBe(0);
    expect(robustZ(5, [1, 1, 1])).toBe(0); // MAD = 0
    const onlyNew = L.filter((l) => l.status === "new");
    expect(closedWinRate(onlyNew)).toBeNull();
  });
  it("single-event histories", () => {
    const raw = { branches: [{ id: "B", name: "X", city: "C" }], sales_reps: [{ id: "R", name: "Y", branch_id: "B", role: "rep" }],
      targets: [], deliveries: [], leads: [{ id: "L1", customer_name: "A", phone: "999", source: "s", model_interested: "m",
        status: "new", assigned_to: "R", branch_id: "B", created_at: "2025-01-01T00:00:00Z",
        last_activity_at: "2025-01-01T00:00:00Z", status_history: [{ status: "new", timestamp: "2025-01-01T00:00:00Z", note: "" }],
        expected_close_date: null, deal_value: 100, lost_reason: null }] };
    const one = normalize(raw);
    expect(medianFirstResponse(one.leads)).toBeNull();
    expect(one.leads[0]!.reached.contacted).toBeNull();
    expect(one.leads[0]!.hasLostEvent).toBe(false);
    expect("phone" in one.leads[0]!).toBe(false); // phones stripped
    expect(one.asOf).toBe(Date.parse("2025-01-01T00:00:00Z"));
  });
  it("lost lead with missing lost event still gets a stage of loss", () => {
    for (const l of lostWithoutEvent(L)) expect(l.lostStage).not.toBeNull();
  });
});

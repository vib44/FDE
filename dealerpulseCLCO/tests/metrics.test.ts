import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalize } from "../lib/data/normalize.ts";
import { closedWinRate, funnel, lostWithoutEvent, stageConversion } from "../lib/metrics/funnel.ts";
import { medianFirstResponse } from "../lib/metrics/response.ts";
import { awaitingOrders, coldLeads, delayStats, overdueOpen } from "../lib/metrics/delivery.ts";
import { attainment } from "../lib/metrics/targets.ts";
import { filterLeads } from "../lib/metrics/filters.ts";
import { mad, median, robustZ } from "../lib/metrics/stats.ts";
import { EMPTY_FILTERS } from "../lib/types.ts";
import { toDay, toMonth } from "../lib/dates.ts";
import { scopeSummary } from "../lib/metrics/summary.ts";
import { overviewVM } from "../lib/metrics/overview.ts";
import { actNowInsights } from "../lib/metrics/insights.ts";
import { branchAlertData } from "../lib/metrics/branch-alert-data.ts";
import { localPriorityAlerts } from "../lib/metrics/local-alerts.ts";
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
import { THRESHOLDS } from "../lib/config.ts";

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
  it("awaiting orders and delays", () => {
    const aw = awaitingOrders(L, ds.asOf);
    expect(aw.length).toBe(38);
    expect(aw.reduce((s, a) => s + a.value, 0) / 1e7).toBeCloseTo(8.59, 1);
    expect(aw.filter((a) => a.idleDays >= 30).length).toBe(24);
    const d = delayStats(L);
    expect(d.avgDelayedDays!).toBeCloseTo(25, 0); expect(d.avgOnTimeDays!).toBeCloseTo(13, 0);
    expect(pct(delayStats(branch("Central")).delayRate)).toBe(26);
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
    expect(value("winRate")).toBeCloseTo(160 / (160 + 288));
    expect(kpis).toHaveLength(7);
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

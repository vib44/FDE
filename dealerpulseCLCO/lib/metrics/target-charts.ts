import { DELIVERED_STAGE, LOST, ORDER_STAGE } from "../config.ts";
import type {
  BranchScorecardVM,
  Dataset,
  FilterState,
  ScorecardPoint,
  TargetActualVM,
} from "../types.ts";
import { inMonthRange, dimensionMatch, leadInCreatedScope, withinRange } from "./dashboard-chart-scope.ts";
import { toMonth } from "../dates.ts";
import { ratio } from "./stats.ts";

function targetActualRows(ds: Dataset, filters: FilterState): TargetActualVM["data"] {
  const targets = ds.targets.filter((target) =>
    (!filters.branch || target.branchId === filters.branch) && inMonthRange(target.month, filters));
  const actuals = new Map<string, number>();
  for (const lead of ds.leads) {
    if (!dimensionMatch(ds, filters, lead.id)) continue;
    const timestamp = lead.reached[ORDER_STAGE];
    if (timestamp === null || !inMonthRange(toMonth(timestamp), filters)) continue;
    const key = `${lead.branchId}|${toMonth(timestamp)}`;
    actuals.set(key, (actuals.get(key) ?? 0) + 1);
  }
  const branches = new Map<string, { actual: number; target: number }>();
  for (const target of targets) {
    const row = branches.get(target.branchId) ?? { actual: 0, target: 0 };
    row.actual += actuals.get(`${target.branchId}|${target.month}`) ?? 0;
    row.target += target.units;
    branches.set(target.branchId, row);
  }
  return [...branches].map(([branchId, row]) => ({
    branchId,
    branchName: ds.branchById[branchId]?.name ?? branchId,
    actual: row.actual,
    target: row.target,
    attainment: ratio(row.actual, row.target),
  }));
}

function topBranchTakeaway(
  data: TargetActualVM["data"],
  measure: string,
): string {
  if (!data.length) return "No branch target data matches these filters.";
  const top = data.reduce((best, row) => row.attainment !== null &&
    (best === null || row.attainment > best.attainment!) ? row : best, null as typeof data[number] | null);
  return top?.attainment === null || !top
    ? "Targets are unavailable for the selected scope."
    : `${top.branchName} leads at ${Math.round(top.attainment * 100)}% of ${measure} target.`;
}

export function targetActualByBranch(ds: Dataset, filters: FilterState): TargetActualVM {
  const data = targetActualRows(ds, filters);
  return {
    title: "Which branches are meeting their order targets?",
    takeaway: topBranchTakeaway(data, "order"),
    data,
  };
}

function branchDeliveryMetrics(ds: Dataset, filters: FilterState, branchId: string) {
  const rows = ds.leads.filter((lead) => lead.branchId === branchId &&
    dimensionMatch(ds, filters, lead.id) && leadInCreatedScope(lead, filters));
  const closed = rows.filter((lead) => lead.status === DELIVERED_STAGE || lead.status === LOST)
    .filter((lead) => filters.timeBasis !== "event" ||
      withinRange(lead.status === DELIVERED_STAGE ? lead.delivery?.deliveredAt ?? null :
        lead.history.filter((event) => event.status === LOST).at(-1)?.ts ?? null, filters));
  const delivered = rows.filter((lead) => lead.delivery !== null)
    .filter((lead) => filters.timeBasis !== "event" || withinRange(lead.delivery!.deliveredAt, filters));
  const wonCount = closed.filter((lead) => lead.status === DELIVERED_STAGE).length;
  const onTimeCount = delivered.filter((lead) => lead.delivery?.delayReason === null).length;
  return {
    leadCount: rows.length,
    closedCount: closed.length,
    wonCount,
    winRate: ratio(wonCount, closed.length),
    deliveryCount: delivered.length,
    onTimeCount,
    onTime: ratio(onTimeCount, delivered.length),
  };
}

export function branchScorecard(ds: Dataset, filters: FilterState): BranchScorecardVM {
  const targetRows = new Map(targetActualRows(ds, filters).map((row) => [row.branchId, row]));
  const volumeBaseline = Math.max(0, ...ds.branches.map((branch) =>
    branchDeliveryMetrics(ds, { ...filters, branch: null }, branch.id).leadCount));
  const metrics: BranchScorecardVM["metrics"] = [
    { key: "leadVolume", label: "Lead volume index" },
    { key: "winRate", label: "Closed win rate" },
    { key: "orderAttainment", label: "Order target attainment" },
    { key: "onTimeDelivery", label: "On-time delivery" },
  ];
  const points: ScorecardPoint[] = ds.branches
    .filter((branch) => !filters.branch || branch.id === filters.branch)
    .map((branch) => {
      const performance = branchDeliveryMetrics(ds, filters, branch.id);
      const attainment = targetRows.get(branch.id)?.attainment ?? null;
      return {
        branchId: branch.id,
        branchName: branch.name,
        leadCount: performance.leadCount,
        values: [performance.leadCount, performance.winRate, attainment, performance.onTime],
      };
    });
  for (const point of points) {
    point.values[0] = volumeBaseline ? point.leadCount / volumeBaseline : null;
  }
  const selectedMetrics = ds.branches
    .filter((branch) => !filters.branch || branch.id === filters.branch)
    .map((branch) => branchDeliveryMetrics(ds, filters, branch.id));
  const closedCount = selectedMetrics.reduce((sum, metric) => sum + metric.closedCount, 0);
  const wonCount = selectedMetrics.reduce((sum, metric) => sum + metric.wonCount, 0);
  const deliveryCount = selectedMetrics.reduce((sum, metric) => sum + metric.deliveryCount, 0);
  const onTimeCount = selectedMetrics.reduce((sum, metric) => sum + metric.onTimeCount, 0);
  const selectedTargets = [...targetRows.values()];
  const totalTarget = selectedTargets.reduce((sum, row) => sum + row.target, 0);
  const totalActual = selectedTargets.reduce((sum, row) => sum + row.actual, 0);
  const summary: ScorecardPoint = {
    branchId: filters.branch ?? "all",
    branchName: filters.branch ? ds.branchById[filters.branch]?.name ?? "Selected branch" : "All selected branches",
    leadCount: points.reduce((sum, point) => sum + point.leadCount, 0),
    values: [
      points.length && volumeBaseline
        ? points.reduce((sum, point) => sum + (point.values[0] ?? 0), 0) / points.length
        : null,
      ratio(wonCount, closedCount),
      ratio(totalActual, totalTarget),
      ratio(onTimeCount, deliveryCount),
    ],
  };
  const bestBranch = points.reduce<ScorecardPoint | null>((best, point) => {
    const value = point.values[1];
    const bestValue = best?.values[1];
    return value !== null && value !== undefined &&
      (best === null || bestValue === null || bestValue === undefined || value > bestValue) ? point : best;
  }, null);
  return {
    title: "Which branches have the healthiest scorecard?",
    takeaway: bestBranch
      ? `${bestBranch.branchName} has the strongest closed win rate at ${Math.round(bestBranch.values[1]! * 100)}%.`
      : "No closed leads match these filters.",
    metrics,
    data: points,
    summary,
  };
}

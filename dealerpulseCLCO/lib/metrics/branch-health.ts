import type { Dataset, FilterState, OverviewStatus } from "../types.ts";
import { branchScorecard } from "./dashboard-charts.ts";
import { attainment } from "./targets.ts";

export function branchHealthRows(ds: Dataset, filters: FilterState) {
  const revenue = attainment(ds, filters, "deliveries");
  const scorecard = branchScorecard(ds, filters);
  return revenue.rows.map((row) => {
    const score = scorecard.data.find((point) => point.branchId === row.branchId);
    const status: OverviewStatus = row.revenuePct === null
      ? "neutral"
      : row.revenuePct >= 1 ? "good" : "risk";
    return {
      ...row,
      branchName: ds.branchById[row.branchId]?.name ?? row.branchId,
      winRate: score?.values[1] ?? null,
      status,
    };
  }).sort((a, b) =>
    (a.revenuePct ?? Number.POSITIVE_INFINITY) - (b.revenuePct ?? Number.POSITIVE_INFINITY) ||
    (a.winRate ?? Number.POSITIVE_INFINITY) - (b.winRate ?? Number.POSITIVE_INFINITY) ||
    b.revenue - a.revenue);
}

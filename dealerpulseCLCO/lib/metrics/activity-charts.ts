import { ORDER_STAGE } from "../config.ts";
import { toMonth } from "../dates.ts";
import type { Dataset, DelayParetoVM, FilterState, MonthlyLeadFlowVM, OrderAgingVM } from "../types.ts";
import { dimensionMatch, leadInCreatedScope, withinRange } from "./dashboard-chart-scope.ts";
import { DAY } from "./stats.ts";

export function leadFlowByMonth(ds: Dataset, filters: FilterState): MonthlyLeadFlowVM {
  const counts = new Map<string, number>();
  for (const lead of ds.leads) {
    if (!dimensionMatch(ds, filters, lead.id)) continue;
    const timestamp = filters.timeBasis === "event" ? lead.reached.new ?? lead.createdAt : lead.createdAt;
    if (!withinRange(timestamp, filters)) continue;
    const month = toMonth(timestamp);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  const data = [...counts].sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));
  const peak = data.reduce<typeof data[number] | null>((best, row) =>
    best === null || row.count > best.count ? row : best, null);
  const peakMonth = peak
    ? new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${peak.month}-01T00:00:00.000Z`))
    : null;
  return {
    title: "Monthly leads received",
    takeaway: peak
      ? `${peakMonth} brought the most leads (${peak.count}) in the selected period.`
      : "No lead creation activity matches these filters.",
    data,
  };
}

export function undeliveredOrderAging(ds: Dataset, filters: FilterState): OrderAgingVM {
  const branches = new Map(ds.branches.map((branch) => [branch.id, {
    branchId: branch.id, branchName: branch.name, under7: 0, days7to14: 0, days15to30: 0, over30: 0,
  }]));
  for (const lead of ds.leads) {
    if (lead.status !== ORDER_STAGE || lead.delivery ||
      !dimensionMatch(ds, filters, lead.id) || !leadInCreatedScope(lead, filters)) continue;
    const orderAt = lead.reached[ORDER_STAGE];
    if (filters.timeBasis === "event" && !withinRange(orderAt, filters)) continue;
    const age = Math.max(0, (ds.asOf - (orderAt ?? lead.lastActivityAt)) / DAY);
    const row = branches.get(lead.branchId);
    if (!row) continue;
    if (age < 7) row.under7 += 1;
    else if (age < 15) row.days7to14 += 1;
    else if (age <= 30) row.days15to30 += 1;
    else row.over30 += 1;
  }
  const data = [...branches.values()].filter((row) => !filters.branch || row.branchId === filters.branch);
  const aged = data.reduce((sum, row) => sum + row.days15to30 + row.over30, 0);
  const total = data.reduce((sum, row) =>
    sum + row.under7 + row.days7to14 + row.days15to30 + row.over30, 0);
  return {
    title: "Which branches have the oldest undelivered orders?",
    takeaway: total
      ? `${aged} of ${total} open orders have been waiting more than 14 days.`
      : "No undelivered orders match these filters.",
    data,
  };
}

export function delayReasonsPareto(ds: Dataset, filters: FilterState): DelayParetoVM {
  const counts = new Map<string, number>();
  for (const lead of ds.leads) {
    if (!lead.delivery || !dimensionMatch(ds, filters, lead.id) ||
      !leadInCreatedScope(lead, filters) ||
      (filters.timeBasis === "event" && !withinRange(lead.delivery.deliveredAt, filters)) ||
      lead.delivery.delayReason === null) continue;
    const reason = lead.delivery.delayReason;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const sorted = [...counts].sort(([, a], [, b]) => b - a);
  const total = sorted.reduce((sum, [, count]) => sum + count, 0);
  let running = 0;
  const data = sorted.map(([reason, count]) => {
    running += count;
    return { reason, count, cumulativePct: total ? running / total : 0 };
  });
  const leading = data[0];
  return {
    title: "Which delay reasons account for most delayed deliveries?",
    takeaway: leading
      ? `${leading.reason} is the leading delay reason (${Math.round(leading.cumulativePct * 100)}% of recorded delays).`
      : "No recorded delivery delays match these filters.",
    data,
  };
}

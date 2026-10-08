import { DELIVERED_STAGE, LOST, ORDER_STAGE, STAGES } from "../config.ts";
import { toMonth } from "../dates.ts";
import type {
  BranchScorecardVM,
  Dataset,
  DelayParetoVM,
  FilterState,
  FunnelVM,
  MonthlyLeadFlowVM,
  OrderAgingVM,
  ScorecardPoint,
  SourceQualityVM,
  TargetActualVM,
} from "../types.ts";
import { firstResponseHours } from "./response.ts";
import { DAY, median, ratio } from "./stats.ts";

const dimensionMatch = (ds: Dataset, f: FilterState, leadId: string) => {
  const lead = ds.leadById[leadId];
  return Boolean(lead && (!f.branch || lead.branchId === f.branch) &&
    (!f.rep || lead.repId === f.rep) && (!f.source || lead.source === f.source) &&
    (!f.model || lead.model === f.model));
};

const withinRange = (ts: number | null, f: FilterState) =>
  ts !== null && (f.from === null || ts >= f.from) && (f.to === null || ts <= f.to);

const leadInCreatedScope = (lead: Dataset["leads"][number], f: FilterState) =>
  (f.timeBasis === "event" || withinRange(lead.createdAt, f));

const inMonthRange = (month: string, f: FilterState) =>
  (f.from === null || month >= toMonth(f.from)) &&
  (f.to === null || month <= toMonth(f.to));

function targetActualRows(ds: Dataset, f: FilterState, basis: "orders" | "deliveries") {
  const targets = ds.targets.filter((target) =>
    (!f.branch || target.branchId === f.branch) && inMonthRange(target.month, f));
  const actuals = new Map<string, number>();
  for (const lead of ds.leads) {
    if (!dimensionMatch(ds, f, lead.id)) continue;
    const timestamp = basis === "orders"
      ? lead.reached[ORDER_STAGE]
      : lead.status === DELIVERED_STAGE ? lead.delivery?.deliveredAt ?? null : null;
    if (timestamp === null || !inMonthRange(toMonth(timestamp), f)) continue;
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
  data: { branchName: string; actual: number; target: number; attainment: number | null }[],
  measure: string,
): string {
  if (!data.length) return "No branch target data matches these filters.";
  const top = data.reduce((best, row) => row.attainment !== null &&
    (best === null || row.attainment > best.attainment!) ? row : best, null as typeof data[number] | null);
  return top?.attainment === null || !top
    ? "Targets are unavailable for the selected scope."
    : `${top.branchName} leads at ${Math.round(top.attainment * 100)}% of ${measure} target.`;
}

export function targetActualByBranch(ds: Dataset, f: FilterState): TargetActualVM {
  const data = targetActualRows(ds, f, "orders");
  return {
    title: "Which branches are meeting their order targets?",
    takeaway: topBranchTakeaway(data, "order"),
    data,
  };
}

function branchDeliveryMetrics(ds: Dataset, f: FilterState, branchId: string) {
  const rows = ds.leads.filter((lead) => lead.branchId === branchId &&
    dimensionMatch(ds, f, lead.id) && leadInCreatedScope(lead, f));
  const closed = rows.filter((lead) => lead.status === DELIVERED_STAGE || lead.status === LOST)
    .filter((lead) => f.timeBasis !== "event" ||
      withinRange(lead.status === DELIVERED_STAGE ? lead.delivery?.deliveredAt ?? null :
        lead.history.filter((event) => event.status === LOST).at(-1)?.ts ?? null, f));
  const delivered = rows.filter((lead) => lead.delivery !== null)
    .filter((lead) => f.timeBasis !== "event" || withinRange(lead.delivery!.deliveredAt, f));
  return {
    leadCount: rows.length,
    closedCount: closed.length,
    wonCount: closed.filter((lead) => lead.status === DELIVERED_STAGE).length,
    winRate: ratio(closed.filter((lead) => lead.status === DELIVERED_STAGE).length, closed.length),
    deliveryCount: delivered.length,
    onTimeCount: delivered.filter((lead) => lead.delivery?.delayReason === null).length,
    onTime: ratio(delivered.filter((lead) => lead.delivery?.delayReason === null).length, delivered.length),
  };
}

export function branchScorecard(ds: Dataset, f: FilterState): BranchScorecardVM {
  const targetRows = new Map(targetActualRows(ds, f, "orders").map((row) => [row.branchId, row]));
  const volumeBaseline = Math.max(0, ...ds.branches.map((branch) =>
    branchDeliveryMetrics(ds, { ...f, branch: null }, branch.id).leadCount));
  const metrics: BranchScorecardVM["metrics"] = [
    { key: "leadVolume", label: "Lead volume index" },
    { key: "winRate", label: "Closed win rate" },
    { key: "orderAttainment", label: "Order target attainment" },
    { key: "onTimeDelivery", label: "On-time delivery" },
  ];
  const points: ScorecardPoint[] = ds.branches
    .filter((branch) => !f.branch || branch.id === f.branch)
    .map((branch) => {
      const performance = branchDeliveryMetrics(ds, f, branch.id);
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
    .filter((branch) => !f.branch || branch.id === f.branch)
    .map((branch) => branchDeliveryMetrics(ds, f, branch.id));
  const closedCount = selectedMetrics.reduce((sum, metric) => sum + metric.closedCount, 0);
  const wonCount = selectedMetrics.reduce((sum, metric) => sum + metric.wonCount, 0);
  const deliveryCount = selectedMetrics.reduce((sum, metric) => sum + metric.deliveryCount, 0);
  const onTimeCount = selectedMetrics.reduce((sum, metric) => sum + metric.onTimeCount, 0);
  const selectedTargets = [...targetRows.values()];
  const totalTarget = selectedTargets.reduce((sum, row) => sum + row.target, 0);
  const totalActual = selectedTargets.reduce((sum, row) => sum + row.actual, 0);
  const summary: ScorecardPoint = {
    branchId: f.branch ?? "all",
    branchName: f.branch ? ds.branchById[f.branch]?.name ?? "Selected branch" : "All selected branches",
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

export function conversionFunnel(ds: Dataset, f: FilterState): FunnelVM {
  const leads = ds.leads.filter((lead) => dimensionMatch(ds, f, lead.id) && leadInCreatedScope(lead, f));
  const rows = STAGES.map((stage) => {
    const count = leads.filter((lead) => lead.reached[stage] !== null &&
      (f.timeBasis !== "event" || withinRange(lead.reached[stage], f))).length;
    return { stage, count };
  });
  const data = rows.map((row, index) => ({
    ...row,
    conversion: index === 0 ? null : ratio(row.count, rows[index - 1]!.count),
  }));
  const first = data[0]?.count ?? 0;
  const last = data[data.length - 1]?.count ?? 0;
  return {
    title: "Where does the lead funnel lose the most momentum?",
    takeaway: first
      ? `${Math.round((1 - last / first) * 100)}% of leads reaching new have not yet reached delivery.`
      : "No funnel activity matches these filters.",
    data,
  };
}

export function funnelByBranch(ds: Dataset, f: FilterState): FunnelVM {
  const data = ds.branches.map((branch) => {
    const leads = ds.leads.filter((lead) => lead.branchId === branch.id &&
      dimensionMatch(ds, f, lead.id) && leadInCreatedScope(lead, f));
    return {
      stage: branch.name,
      count: leads.filter((lead) => lead.reached[ORDER_STAGE] !== null &&
        (f.timeBasis !== "event" || withinRange(lead.reached[ORDER_STAGE], f))).length,
      conversion: ratio(
        leads.filter((lead) => lead.reached[ORDER_STAGE] !== null &&
          (f.timeBasis !== "event" || withinRange(lead.reached[ORDER_STAGE], f))).length,
        leads.filter((lead) => lead.reached.new !== null &&
          (f.timeBasis !== "event" || withinRange(lead.reached.new, f))).length,
      ),
    };
  }).filter((point) => !f.branch || ds.branches.find((branch) => branch.name === point.stage)?.id === f.branch);
  const best = data.reduce<typeof data[number] | null>((winner, row) => row.conversion !== null &&
    (winner === null || row.conversion > winner.conversion!) ? row : winner, null);
  return {
    title: "Which branches convert the most new leads into orders?",
    takeaway: best
      ? `${best.stage} converts ${Math.round(best.conversion! * 100)}% of new leads to orders.`
      : "No new-to-order conversion data matches these filters.",
    data,
  };
}

export function leadFlowByMonth(ds: Dataset, f: FilterState): MonthlyLeadFlowVM {
  const counts = new Map<string, number>();
  for (const lead of ds.leads) {
    if (!dimensionMatch(ds, f, lead.id)) continue;
    const timestamp = f.timeBasis === "event" ? lead.reached.new ?? lead.createdAt : lead.createdAt;
    if (!withinRange(timestamp, f)) continue;
    const month = toMonth(timestamp);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  const data = [...counts].sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));
  const peak = data.reduce<typeof data[number] | null>((best, row) =>
    best === null || row.count > best.count ? row : best, null);
  return {
    title: "How has lead flow changed month by month?",
    takeaway: peak
      ? `${peak.month} brought the most leads (${peak.count}) in the selected period.`
      : "No lead creation activity matches these filters.",
    data,
  };
}

export function undeliveredOrderAging(ds: Dataset, f: FilterState): OrderAgingVM {
  const branches = new Map(ds.branches.map((branch) => [branch.id, {
    branchId: branch.id, branchName: branch.name, under7: 0, days7to14: 0, days15to30: 0, over30: 0,
  }]));
  for (const lead of ds.leads) {
    if (lead.status !== ORDER_STAGE || lead.delivery ||
      !dimensionMatch(ds, f, lead.id) || !leadInCreatedScope(lead, f)) continue;
    const orderAt = lead.reached[ORDER_STAGE];
    if (f.timeBasis === "event" && !withinRange(orderAt, f)) continue;
    const age = Math.max(0, (ds.asOf - (orderAt ?? lead.lastActivityAt)) / DAY);
    const row = branches.get(lead.branchId);
    if (!row) continue;
    if (age < 7) row.under7 += 1;
    else if (age < 15) row.days7to14 += 1;
    else if (age <= 30) row.days15to30 += 1;
    else row.over30 += 1;
  }
  const data = [...branches.values()].filter((row) => !f.branch || row.branchId === f.branch);
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

export function delayReasonsPareto(ds: Dataset, f: FilterState): DelayParetoVM {
  const counts = new Map<string, number>();
  for (const lead of ds.leads) {
    if (!lead.delivery || !dimensionMatch(ds, f, lead.id) ||
      !leadInCreatedScope(lead, f) ||
      (f.timeBasis === "event" && !withinRange(lead.delivery.deliveredAt, f)) ||
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

export function sourceQuality(ds: Dataset, f: FilterState): SourceQualityVM {
  const sources = f.source ? [f.source] : ds.sources;
  const data = sources.map((source) => {
    const leads = ds.leads.filter((lead) => lead.source === source &&
      dimensionMatch(ds, f, lead.id) && leadInCreatedScope(lead, f));
    const closed = leads.filter((lead) => lead.status === DELIVERED_STAGE || lead.status === LOST)
      .filter((lead) => f.timeBasis !== "event" ||
        withinRange(lead.status === DELIVERED_STAGE ? lead.delivery?.deliveredAt ?? null :
          lead.history.filter((event) => event.status === LOST).at(-1)?.ts ?? null, f));
    const won = closed.filter((lead) => lead.status === DELIVERED_STAGE);
    return {
      source,
      leads: leads.length,
      winRate: ratio(won.length, closed.length),
      medianResponseHours: median(leads.map(firstResponseHours)
        .filter((hours): hours is number => hours !== null)),
      revenue: won.reduce((sum, lead) => sum + lead.dealValue, 0),
    };
  }).filter((point) => point.leads > 0);
  const best = data.reduce<typeof data[number] | null>((winner, point) => point.winRate !== null &&
    (winner === null || point.winRate > winner.winRate!) ? point : winner, null);
  return {
    title: "Which lead sources bring the best-quality opportunities?",
    takeaway: best
      ? `${best.source.replaceAll("_", " ")} leads with a ${Math.round(best.winRate! * 100)}% closed win rate.`
      : "No closed lead sources match these filters.",
    data,
  };
}

import { DELIVERED_STAGE, LOST, ORDER_STAGE, STAGES } from "../config.ts";
import type { Dataset, FilterState, FunnelVM, SourceQualityVM } from "../types.ts";
import { dimensionMatch, leadInCreatedScope, withinRange } from "./dashboard-chart-scope.ts";
import { firstResponseHours } from "./response.ts";
import { median, ratio } from "./stats.ts";

export function conversionFunnel(ds: Dataset, filters: FilterState): FunnelVM {
  const leads = ds.leads.filter((lead) =>
    dimensionMatch(ds, filters, lead.id) && leadInCreatedScope(lead, filters));
  const rows = STAGES.map((stage) => ({
    stage,
    count: leads.filter((lead) => lead.reached[stage] !== null &&
      (filters.timeBasis !== "event" || withinRange(lead.reached[stage], filters))).length,
  }));
  const data = rows.map((row, index) => ({
    ...row,
    conversion: index === 0 ? null : ratio(row.count, rows[index - 1]!.count),
  }));
  const first = data[0]?.count ?? 0;
  const last = data[data.length - 1]?.count ?? 0;
  return {
    title: "Leads reaching each funnel stage",
    takeaway: first
      ? `${Math.round((1 - last / first) * 100)}% of leads reaching new have not yet reached delivery.`
      : "No funnel activity matches these filters.",
    data,
  };
}

export function funnelByBranch(ds: Dataset, filters: FilterState): FunnelVM {
  const data = ds.branches.map((branch) => {
    const leads = ds.leads.filter((lead) => lead.branchId === branch.id &&
      dimensionMatch(ds, filters, lead.id) && leadInCreatedScope(lead, filters));
    const ordered = leads.filter((lead) => lead.reached[ORDER_STAGE] !== null &&
      (filters.timeBasis !== "event" || withinRange(lead.reached[ORDER_STAGE], filters))).length;
    const newLeads = leads.filter((lead) => lead.reached.new !== null &&
      (filters.timeBasis !== "event" || withinRange(lead.reached.new, filters))).length;
    return { stage: branch.name, count: ordered, conversion: ratio(ordered, newLeads) };
  }).filter((point) => !filters.branch ||
    ds.branches.find((branch) => branch.name === point.stage)?.id === filters.branch);
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

export function sourceQuality(ds: Dataset, filters: FilterState): SourceQualityVM {
  const sources = filters.source ? [filters.source] : ds.sources;
  const data = sources.map((source) => {
    const leads = ds.leads.filter((lead) => lead.source === source &&
      dimensionMatch(ds, filters, lead.id) && leadInCreatedScope(lead, filters));
    const closed = leads.filter((lead) => lead.status === DELIVERED_STAGE || lead.status === LOST)
      .filter((lead) => filters.timeBasis !== "event" ||
        withinRange(lead.status === DELIVERED_STAGE ? lead.delivery?.deliveredAt ?? null :
          lead.history.filter((event) => event.status === LOST).at(-1)?.ts ?? null, filters));
    const won = closed.filter((lead) => lead.status === DELIVERED_STAGE);
    return {
      source,
      leads: leads.length,
      closedLeads: closed.length,
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

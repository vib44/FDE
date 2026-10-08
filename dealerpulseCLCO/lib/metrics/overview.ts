import { DELIVERED_STAGE, LOST, ORDER_STAGE, PRE_ORDER_STAGES, THRESHOLDS } from "../config.ts";
import type { Dataset, FilterState, Lead, OverviewFormat, OverviewKPI, OverviewStatus, OverviewVM } from "../types.ts";
import { attainment } from "./targets.ts";
import { closedWinRate } from "./funnel.ts";
import { medianDaysToDeliver } from "./delivery.ts";
import { ratio } from "./stats.ts";
import { filterLeads } from "./filters.ts";
import { toMonth } from "../dates.ts";
import { formatCurrency, formatPercent } from "../format.ts";

type MetricId = OverviewKPI["id"];

const isOpen = (lead: Lead) =>
  (PRE_ORDER_STAGES as readonly string[]).includes(lead.status) || lead.status === ORDER_STAGE;

function metricTimestamp(id: MetricId, lead: Lead, filters: FilterState): number | null {
  const alwaysEventBased = id === "revenue" || id === "deliveries" || id === "orders" ||
    id === "deliveryDays" || id === "attainment";
  return alwaysEventBased || filters.timeBasis === "event" ? eventTimestamp(id, lead) : lead.createdAt;
}

function eventTimestamp(id: MetricId, lead: Lead): number | null {
  if (id === "orders") return lead.reached[ORDER_STAGE];
  if (id === "revenue" || id === "deliveries" || id === "deliveryDays" || id === "attainment")
    return lead.delivery?.deliveredAt ?? lead.reached[DELIVERED_STAGE];
  if (id === "winRate") {
    if (lead.status === DELIVERED_STAGE) return lead.reached[DELIVERED_STAGE];
    if (lead.status === LOST) {
      const lostEvent = [...lead.history].reverse().find((event) => event.status === LOST);
      return lostEvent?.ts ?? lead.history.at(-1)?.ts ?? null;
    }
  }
  if (id === "pipelineValue" && isOpen(lead)) return lead.lastActivityAt;
  return null;
}

function sumRevenueAttainment(ds: Dataset, filters: FilterState, from: number | null, to: number | null): number | null {
  const result = attainment(ds, { ...filters, from, to }, "deliveries");
  const actualRevenue = result.rows.reduce((sum, row) => sum + row.revenue, 0);
  const targetRevenue = result.rows.reduce((sum, row) => sum + row.targetRevenue, 0);
  return ratio(actualRevenue, targetRevenue);
}

function metricValue(
  id: MetricId,
  ds: Dataset,
  filters: FilterState,
  candidates: Lead[],
  from: number | null,
  to: number | null,
): number | null {
  if (id === "attainment") return sumRevenueAttainment(ds, filters, from, to);
  const leads = candidates.filter((lead) => {
    const timestamp = metricTimestamp(id, lead, filters);
    return timestamp !== null && (from === null || timestamp >= from) && (to === null || timestamp <= to);
  });
  switch (id) {
    case "revenue":
      return leads.filter((lead) => lead.status === DELIVERED_STAGE)
        .reduce((sum, lead) => sum + lead.dealValue, 0);
    case "deliveries":
      return leads.filter((lead) => lead.status === DELIVERED_STAGE).length;
    case "orders":
      return leads.filter((lead) => lead.reached[ORDER_STAGE] !== null).length;
    case "winRate":
      return closedWinRate(leads.filter((lead) => lead.status === DELIVERED_STAGE || lead.status === LOST));
    case "pipelineValue":
      return leads.filter(isOpen).reduce((sum, lead) => sum + lead.dealValue, 0);
    case "deliveryDays":
      return medianDaysToDeliver(leads.filter((lead) => lead.delivery !== null));
  }
}

function metricStatus(id: MetricId, value: number | null, delta: number | null): OverviewStatus {
  if (value === null) return "neutral";
  if (id === "attainment") {
    if (value < THRESHOLDS.recalibrationPct) return "risk";
    if (value < THRESHOLDS.lowAttainmentPct) return "watch";
    return "good";
  }
  if (id === "pipelineValue" || delta === null || delta === 0) return "neutral";
  const improving = id === "deliveryDays" ? delta < 0 : delta > 0;
  return improving ? "good" : "watch";
}

const formats: Record<MetricId, OverviewFormat> = {
  revenue: "currency",
  deliveries: "number",
  orders: "number",
  winRate: "percent",
  pipelineValue: "currency",
  deliveryDays: "days",
  attainment: "percent",
};

const labels: Record<MetricId, string> = {
  revenue: "Delivered revenue",
  deliveries: "Deliveries",
  orders: "Orders booked",
  winRate: "Closed win rate",
  pipelineValue: "Active pipeline",
  deliveryDays: "Median days to deliver",
  attainment: "Revenue target attainment",
};

const notes: Record<MetricId, string> = {
  revenue: "Deal value of delivered leads",
  deliveries: "Delivered leads, filtered by delivery date",
  orders: "Leads that reached order placed",
  winRate: "Delivered ÷ (delivered + lost)",
  pipelineValue: "Deal value in open pre-order and order stages",
  deliveryDays: "Median days to deliver in this view",
  attainment: "Delivered revenue ÷ target revenue",
};

const trendBucketCount = 6;

function buildKPI(id: MetricId, ds: Dataset, filters: FilterState, candidates: Lead[]): OverviewKPI {
  const value = metricValue(id, ds, filters, candidates, filters.from, filters.to);
  if (id === "attainment") {
    const months = [...new Set(ds.targets.map((target) => target.month))]
      .filter((month) =>
        (filters.from === null || month >= toMonth(filters.from)) &&
        (filters.to === null || month <= toMonth(filters.to)))
      .sort()
      .slice(-trendBucketCount);
    const trend = months.map((month) => {
      const from = Date.parse(`${month}-01T00:00:00.000Z`);
      const nextMonth = new Date(from);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      return metricValue(id, ds, filters, candidates, from, nextMonth.getTime() - 1);
    });
    let previousValue: number | null = null;
    if (filters.from !== null && filters.to !== null) {
      const duration = filters.to - filters.from + 1;
      previousValue = metricValue(id, ds, filters, candidates, filters.from - duration, filters.from - 1);
    }
    const delta = value !== null && previousValue !== null ? value - previousValue : null;
    return {
      id,
      label: labels[id],
      value,
      previousValue,
      delta,
      deltaPct: delta !== null && previousValue !== null && previousValue !== 0
        ? delta / Math.abs(previousValue)
        : null,
      format: formats[id],
      trend,
      status: metricStatus(id, value, null),
      note: notes[id],
    };
  }
  let trendFrom = filters.from;
  let trendTo = filters.to;
  if (trendFrom === null || trendTo === null) {
    const timestamps = candidates.flatMap((lead) => {
      const timestamp = metricTimestamp(id, lead, filters);
      return timestamp === null ? [] : [timestamp];
    });
    trendFrom ??= timestamps.length ? Math.min(...timestamps) : ds.asOf;
    trendTo ??= ds.asOf;
  }
  const span = Math.max(1, trendTo - trendFrom + 1);
  const trend = Array.from({ length: trendBucketCount }, (_, index) => {
    const from = trendFrom! + Math.floor(span * index / trendBucketCount);
    const to = index === trendBucketCount - 1
      ? trendTo!
      : trendFrom! + Math.floor(span * (index + 1) / trendBucketCount) - 1;
    return metricValue(id, ds, filters, candidates, from, to);
  });

  let previousValue: number | null = null;
  if (filters.from !== null && filters.to !== null) {
    const duration = filters.to - filters.from + 1;
    previousValue = metricValue(id, ds, filters, candidates, filters.from - duration, filters.from - 1);
  }
  const delta = value !== null && previousValue !== null ? value - previousValue : null;
  const deltaPct = delta !== null && previousValue !== null && previousValue !== 0
    ? delta / Math.abs(previousValue)
    : null;
  return {
    id,
    label: labels[id],
    value,
    previousValue,
    delta,
    deltaPct,
    format: formats[id],
    trend,
    status: metricStatus(id, value, delta),
    note: notes[id],
  };
}

const percentage = formatPercent;

/** Build the overview KPIs and executive narrative from the filtered metric scope. */
export function overviewVM(ds: Dataset, filters: FilterState): OverviewVM {
  const candidates = filterLeads(ds, { ...filters, from: null, to: null });
  const ids: MetricId[] = ["revenue", "deliveries", "orders", "winRate", "pipelineValue", "deliveryDays", "attainment"];
  const kpis = ids.map((id) => buildKPI(id, ds, filters, candidates));
  const attainmentKPI = kpis.find((kpi) => kpi.id === "attainment")!;
  const winRateKPI = kpis.find((kpi) => kpi.id === "winRate")!;
  const pipelineKPI = kpis.find((kpi) => kpi.id === "pipelineValue")!;

  let status = attainmentKPI.status;
  let title = "Performance snapshot for this view";
  let targetSummary = "No revenue target is available for the selected filters.";
  if (attainmentKPI.value !== null) {
    if (attainmentKPI.status === "risk") {
      title = "Targets may need recalibration";
      targetSummary = `Delivery revenue attainment is ${percentage(attainmentKPI.value)}, below the recalibration threshold.`;
    } else if (attainmentKPI.status === "watch") {
      title = "Delivery revenue is below target";
      targetSummary = `The selected view has reached ${percentage(attainmentKPI.value)} of its delivery revenue target.`;
    } else {
      title = "Delivery revenue is tracking against target";
      targetSummary = `The selected view has reached ${percentage(attainmentKPI.value)} of its delivery revenue target.`;
    }
  } else {
    status = "neutral";
  }
  const winRateSummary = winRateKPI.value === null
    ? "No leads have closed in this view yet."
    : `Closed win rate is ${percentage(winRateKPI.value)}.`;
  const pipelineSummary = pipelineKPI.value === null
    ? "There is no active pipeline in this view."
    : `Active pipeline is ${formatCurrency(pipelineKPI.value)}.`;

  return {
    kpis,
    verdict: { status, title, summary: `${targetSummary} ${winRateSummary} ${pipelineSummary}` },
  };
}

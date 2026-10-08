"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { EChartsCoreOption } from "echarts/core";
import { DELIVERED_STAGE, ORDER_STAGE, THRESHOLDS } from "../lib/config.ts";
import { toMonth } from "../lib/dates.ts";
import { formatCurrency, formatNumber, formatPercent } from "../lib/format.ts";
import { medianDaysToDeliver } from "../lib/metrics/delivery.ts";
import { actNowInsights } from "../lib/metrics/insights.ts";
import { filterLeads } from "../lib/metrics/filters.ts";
import { attainment } from "../lib/metrics/targets.ts";
import { EMPTY_FILTERS, type Dataset, type FilterState } from "../lib/types.ts";
import { ChartPanel } from "./chart-panel.tsx";
import { useChartTokens } from "./use-chart-tokens.ts";
import { InsightStrip } from "./insight-strip.tsx";
import { useDataset } from "./dataset-provider.tsx";
import { Card, CardHeader, PageContainer, PageHeader, PremiumTable } from "./shared-ui.tsx";
import { useSearchParams } from "next/navigation";

const DAY = 86_400_000;

function dayStart(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function filtersFromParams(params: URLSearchParams): FilterState {
  const start = dayStart(params.get("from"));
  const end = dayStart(params.get("to"));
  return {
    ...EMPTY_FILTERS,
    from: start,
    to: end === null ? null : end + DAY - 1,
    branch: params.get("branch"),
    source: params.get("source"),
    model: params.get("model"),
    rep: params.get("rep"),
    timeBasis: params.get("basis") === "event" ? "event" : "created",
  };
}

function dimensionsMatch(ds: Dataset, filters: FilterState, leadId: string): boolean {
  const lead = ds.leadById[leadId];
  return Boolean(lead &&
    (!filters.branch || lead.branchId === filters.branch) &&
    (!filters.source || lead.source === filters.source) &&
    (!filters.model || lead.model === filters.model) &&
    (!filters.rep || lead.repId === filters.rep));
}

function monthRangeMatches(month: string, filters: FilterState): boolean {
  return (filters.from === null || month >= toMonth(filters.from)) &&
    (filters.to === null || month <= toMonth(filters.to));
}

function monthEnd(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return Date.UTC(year!, monthNumber!, 0, 23, 59, 59, 999);
}

function buildTrend(ds: Dataset, filters: FilterState) {
  const leads = filterLeads(ds, { ...filters, timeBasis: "created" });
  const cycleDays = medianDaysToDeliver(leads);
  const months = [...new Set([
    ...ds.months.filter((month) => monthRangeMatches(month, filters)),
    ...leads.map((lead) => toMonth(lead.createdAt)),
  ])].filter((month) => monthRangeMatches(month, filters)).sort();
  const data = months.map((month) => {
    const cohort = leads.filter((lead) => toMonth(lead.createdAt) === month);
    const stillMaturing = cycleDays !== null && ds.asOf - monthEnd(month) < cycleDays * DAY;
    return {
      month,
      leads: cohort.length,
      orders: cohort.filter((lead) => lead.reached[ORDER_STAGE] !== null).length,
      deliveries: cohort.filter((lead) => lead.status === DELIVERED_STAGE && lead.delivery !== null).length,
      stillMaturing,
    };
  });
  return { data, cycleDays };
}

function monthlyTargetRows(ds: Dataset, filters: FilterState) {
  return ds.targets
    .filter((target) => (!filters.branch || target.branchId === filters.branch) &&
      monthRangeMatches(target.month, filters))
    .map((target) => {
      const orders = ds.leads.filter((lead) => dimensionsMatch(ds, filters, lead.id) &&
        lead.reached[ORDER_STAGE] !== null &&
        toMonth(lead.reached[ORDER_STAGE]!) === target.month &&
        lead.branchId === target.branchId);
      const actualRevenue = orders.reduce((sum, lead) => sum + lead.dealValue, 0);
      return {
        branchId: target.branchId,
        branchName: ds.branchById[target.branchId]?.name ?? target.branchId,
        month: target.month,
        targetUnits: target.units,
        actualUnits: orders.length,
        targetRevenue: target.revenue,
        actualRevenue,
        pacing: target.revenue ? actualRevenue / target.revenue : null,
      };
    })
    .sort((a, b) => (a.pacing ?? Number.POSITIVE_INFINITY) - (b.pacing ?? Number.POSITIVE_INFINITY) ||
      a.branchName.localeCompare(b.branchName) || a.month.localeCompare(b.month));
}

export function SalesPage() {
  const { dataset } = useDataset();
  const searchParams = useSearchParams();
  const tokens = useChartTokens();
  const query = searchParams.toString();
  const filters = useMemo(
    () => filtersFromParams(new URLSearchParams(query)),
    [query],
  );
  const progress = useMemo(() => attainment(dataset, filters, "orders").rows
    .map((row) => ({
      ...row,
      branchName: dataset.branchById[row.branchId]?.name ?? row.branchId,
    }))
    .sort((a, b) => (a.revenuePct ?? Number.POSITIVE_INFINITY) -
      (b.revenuePct ?? Number.POSITIVE_INFINITY) || a.branchName.localeCompare(b.branchName)),
  [dataset, filters]);
  const monthlyRows = useMemo(() => monthlyTargetRows(dataset, filters), [dataset, filters]);
  const trend = useMemo(() => buildTrend(dataset, filters), [dataset, filters]);
  const modelRows = useMemo(() => {
    const leads = filterLeads(dataset, filters).filter((lead) => lead.status === DELIVERED_STAGE &&
      lead.delivery !== null &&
      (filters.timeBasis !== "event" ||
        (filters.from === null || lead.delivery.deliveredAt >= filters.from) &&
        (filters.to === null || lead.delivery.deliveredAt <= filters.to)));
    const revenueByModel = new Map<string, { revenue: number; deliveries: number }>();
    for (const lead of leads) {
      const row = revenueByModel.get(lead.model) ?? { revenue: 0, deliveries: 0 };
      row.revenue += lead.dealValue;
      row.deliveries += 1;
      revenueByModel.set(lead.model, row);
    }
    const totalRevenue = [...revenueByModel.values()].reduce((sum, row) => sum + row.revenue, 0);
    return [...revenueByModel].map(([model, row]) => ({
      model,
      ...row,
      share: totalRevenue ? row.revenue / totalRevenue : null,
    })).sort((a, b) => b.revenue - a.revenue || a.model.localeCompare(b.model));
  }, [dataset, filters]);
  const sectionInsights = useMemo(
    () => actNowInsights(dataset, filters).filter((insight) => insight.id === "branches-below-target").slice(0, 3),
    [dataset, filters],
  );
  const trendOption: EChartsCoreOption = useMemo(() => ({
    aria: { enabled: true },
    tooltip: { trigger: "axis", triggerOn: "mousemove|click" },
    grid: { left: 40, right: 20, top: 16, bottom: 36, containLabel: true },
    xAxis: { type: "category", boundaryGap: false, data: trend.data.map((row) => row.month) },
    yAxis: { type: "value", minInterval: 1 },
    series: [
      {
        name: "Leads",
        type: "line",
        smooth: true,
        data: trend.data.map((row) => row.leads),
        itemStyle: { color: tokens?.accent },
        lineStyle: { color: tokens?.accent, width: 2 },
        areaStyle: { color: tokens?.accent, opacity: 0.08 },
        symbol: "none",
      },
      {
        name: "Orders",
        type: "line",
        smooth: true,
        data: trend.data.map((row) => row.orders),
        itemStyle: { color: tokens?.context },
        lineStyle: { color: tokens?.context, width: 2 },
        symbol: "none",
      },
      {
        name: "Deliveries",
        type: "line",
        smooth: true,
        data: trend.data.map((row) => row.deliveries),
        itemStyle: { color: tokens?.muted },
        lineStyle: { color: tokens?.muted, width: 2, type: "dashed" },
        symbol: "none",
      },
    ],
  }), [tokens, trend.data]);
  const maturingMonths = trend.data.filter((row) => row.stillMaturing).map((row) => row.month);
  const totalTargets = monthlyRows.reduce((sum, row) => sum + row.targetUnits, 0);
  const totalOrders = monthlyRows.reduce((sum, row) => sum + row.actualUnits, 0);
  const bestAttainment = progress.reduce<number | null>((best, row) =>
    row.revenuePct !== null && (best === null || row.revenuePct > best) ? row.revenuePct : best, null);
  const targetRealism = bestAttainment !== null && bestAttainment < THRESHOLDS.recalibrationPct
    ? `Even the strongest branch is at ${formatPercent(bestAttainment)} of its recorded revenue target. Review target assumptions; actual results are shown without rescaling.`
    : null;

  return (
    <PageContainer className="section-page section-targets">
      <PageHeader eyebrow="Targets & Revenue" title="Are we on track?" className="section-page-header">
        <p className="section-verdict">
          {formatNumber(totalOrders)} orders are recorded against {formatNumber(totalTargets)} target units in this scope.
          {bestAttainment === null ? " Target attainment is not available." : ` The strongest branch is at ${formatPercent(bestAttainment)} of its revenue target.`}
        </p>
        <p className="section-question">
          Revenue is compared with the original branch targets; each month below shows the recorded order result and pacing.
        </p>
      </PageHeader>

      <InsightStrip
        insights={sectionInsights}
        query={query}
        title="What to do"
        emptyMessage="No target-specific action matches the current filters."
      />

      <Card className="sales-velocity-placeholder">
        <CardHeader
          title="Sales velocity"
          takeaway="Revenue per day combines closed win rate, delivered deal value and time from lead creation to delivery."
        />
        <p className="branch-phase-placeholder">Phase 3 placeholder: the tested sales-velocity metric is not available yet.</p>
      </Card>

      {targetRealism && (
        <Card className="target-realism-callout">
          <CardHeader title="Target realism" takeaway={targetRealism} />
        </Card>
      )}

      <Card className="target-progress-card">
        <CardHeader
          title="Order target progress by branch"
          takeaway="Bars show recorded order revenue against the sum of each branch's selected monthly targets."
        />
        <ul className="target-progress-list">
          {progress.map((row) => (
            <li key={row.branchId}>
              <Link href={`/branch/${encodeURIComponent(row.branchId)}${query ? `?${query}` : ""}`}>
                <span className="target-progress-name" title={row.branchName}>{row.branchName}</span>
                <span className="target-progress-track" aria-hidden="true">
                  <span
                    className={`target-progress-fill${(row.revenuePct ?? 0) < THRESHOLDS.lowAttainmentPct ? " is-low" : ""}`}
                    style={{ width: `${Math.max(0, Math.min(100, (row.revenuePct ?? 0) * 100))}%` }}
                  />
                </span>
                <span className="target-progress-value">{row.revenuePct === null ? "No target" : formatPercent(row.revenuePct)}</span>
                <span className="target-progress-context">
                  {formatCurrency(row.revenue)} / {formatCurrency(row.targetRevenue)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <ChartPanel
        title="Monthly sales by lead-creation cohort"
        takeaway={maturingMonths.length
          ? `Leads, orders and deliveries are grouped by lead-creation month. ${maturingMonths.join(", ")} ${maturingMonths.length === 1 ? "is" : "are"} still maturing.`
          : "Leads, orders and deliveries are grouped by lead-creation month; all visible cohorts have passed the typical delivery cycle."}
        label="Monthly leads, orders and deliveries by lead-creation cohort"
        period="Lead-creation month"
        option={trendOption}
        empty={!trend.data.length}
        emptyMessage="No monthly cohorts match the current date and branch filters."
        control={(
          <p className="chart-series-key" aria-label="Chart series">
            <span style={{ color: tokens?.accent }}>Leads</span>
            <span style={{ color: tokens?.context }}>Orders</span>
            <span style={{ color: tokens?.muted }}>Deliveries</span>
          </p>
        )}
      />

      <PremiumTable
        title="Target vs actual by branch and month"
        takeaway="Rows are ordered from the lowest revenue pacing to the highest; pacing uses recorded order revenue and the original target."
        rows={monthlyRows}
        rowKey={(row) => `${row.branchId}-${row.month}`}
        rowHref={(row) => `/branch/${encodeURIComponent(row.branchId)}${query ? `?${query}` : ""}`}
        emptyMessage="No branch targets match this period. Reset filters to see all available months."
        emptyAction={{ label: "Reset filters", href: "/targets" }}
        columns={[
          { label: "Branch", render: (row) => row.branchName },
          { label: "Month", render: (row) => row.month },
          { label: "Target units", align: "right", render: (row) => formatNumber(row.targetUnits) },
          { label: "Orders", align: "right", render: (row) => formatNumber(row.actualUnits) },
          { label: "Target revenue", align: "right", render: (row) => formatCurrency(row.targetRevenue) },
          { label: "Actual order revenue", align: "right", render: (row) => formatCurrency(row.actualRevenue) },
          {
            label: "Pacing",
            align: "right",
            render: (row) => (
              <span className="table-bar-value">
                <span className="table-inline-bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(0, Math.min(100, (row.pacing ?? 0) * 100))}%` }} />
                </span>
                {row.pacing === null ? "—" : formatPercent(row.pacing)}
              </span>
            ),
          },
        ]}
      />

      <PremiumTable
        title="Delivered revenue by model"
        takeaway="Models are ranked by delivered revenue; share is each model's portion of total delivered revenue in this scope."
        rows={modelRows}
        rowKey={(row) => row.model}
        emptyMessage="No delivered revenue matches these filters. Reset filters to see all models."
        emptyAction={{ label: "Reset filters", href: "/targets" }}
        columns={[
          { label: "Model", render: (row) => row.model },
          { label: "Delivered revenue", align: "right", render: (row) => formatCurrency(row.revenue) },
          { label: "Share of revenue", align: "right", render: (row) => row.share === null ? "—" : formatPercent(row.share) },
          { label: "Deliveries", align: "right", render: (row) => formatNumber(row.deliveries) },
        ]}
      />
    </PageContainer>
  );
}

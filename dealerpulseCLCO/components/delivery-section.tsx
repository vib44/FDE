"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { EMPTY_FILTERS } from "../lib/types.ts";
import type { FilterState } from "../lib/types.ts";
import { toDay } from "../lib/dates.ts";
import { formatCurrency, formatNumber, formatPercent } from "../lib/format.ts";
import { periodLabel } from "../lib/period.ts";
import { deliverySectionData } from "../lib/metrics/delivery.ts";
import { actNowInsights } from "../lib/metrics/insights.ts";
import { useDataset } from "./dataset-provider.tsx";
import { ChartPanel } from "./chart-panel.tsx";
import { deliveryAgingChartOption } from "./dashboard-chart-options.ts";
import { InsightStrip } from "./insight-strip.tsx";
import { useChartTokens } from "./use-chart-tokens.ts";
import { PageContainer, PageHeader, PremiumTable } from "./shared-ui.tsx";

function dayStart(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && toDay(timestamp) === value ? timestamp : null;
}

function filtersFromParams(params: URLSearchParams): FilterState {
  const start = dayStart(params.get("from"));
  const end = dayStart(params.get("to"));
  return {
    ...EMPTY_FILTERS,
    from: start,
    to: end === null ? null : end + 86_400_000 - 1,
    branch: params.get("branch"),
    source: params.get("source"),
    model: params.get("model"),
    timeBasis: params.get("basis") === "event" ? "event" : "created",
  };
}

function leadDetailsHref(query: string, leadIds: string[]): string {
  const params = new URLSearchParams(query);
  params.set("leadIds", leadIds.join(","));
  return `/leads?${params.toString()}`;
}

export function DeliverySection() {
  const { dataset } = useDataset();
  const searchParams = useSearchParams();
  const tokens = useChartTokens();
  const query = searchParams.toString();
  const filters = useMemo(
    () => filtersFromParams(new URLSearchParams(query)),
    [query],
  );
  const period = periodLabel(dataset, filters);
  const metrics = useMemo(
    () => deliverySectionData(dataset, filters),
    [dataset, filters],
  );
  const insights = useMemo(
    () => actNowInsights(dataset, filters)
      .filter((insight) => insight.id === "orders-beyond-median-delivery")
      .slice(0, 3),
    [dataset, filters],
  );
  const chartOption = useMemo(
    () => deliveryAgingChartOption(metrics.ageBuckets, tokens),
    [metrics.ageBuckets, tokens],
  );
  const onTimeComparison = metrics.averageDelayedDays === null || metrics.averageOnTimeDays === null
    ? "Average delivery times are not available for this selection yet."
    : metrics.averageDelayedDays > metrics.averageOnTimeDays
      ? `Delayed deliveries take far longer on average (${metrics.averageDelayedDays.toFixed(1)} days versus ${metrics.averageOnTimeDays.toFixed(1)} days for on-time deliveries).`
      : `Delayed deliveries average ${metrics.averageDelayedDays.toFixed(1)} days, compared with ${metrics.averageOnTimeDays.toFixed(1)} days for on-time deliveries.`;
  const oldestOrderDays = metrics.awaitingRows[0]?.daysWaiting ?? null;

  return (
    <PageContainer className="section-page section-delivery">
      <PageHeader eyebrow="Delivery" title="Delivery" className="section-page-header">
        <p className="section-question">Are we delivering what we sell?</p>
        <p className="section-verdict">
          Of {formatNumber(metrics.deliveredCount)} completed deliveries, {formatNumber(metrics.delayedCount)} were delayed ({metrics.delayRate === null ? "—" : formatPercent(metrics.delayRate)}).
        </p>
        <p className="section-verdict">{onTimeComparison}</p>
        <p className="section-verdict">
          {formatNumber(metrics.awaitingCount)} orders are awaiting delivery, worth {formatCurrency(metrics.awaitingValue)}
          {oldestOrderDays === null ? "." : `; the longest-waiting order has waited ${formatNumber(oldestOrderDays)} days.`}
        </p>
        <p className="section-period">{period}</p>
      </PageHeader>

      <InsightStrip
        insights={insights}
        query={query}
        emptyMessage="No delivery follow-up action matches the current filters."
        title="What to do"
      />

      <ChartPanel
        title="Orders awaiting delivery by age"
        takeaway={`${formatNumber(metrics.awaitingCount)} orders worth ${formatCurrency(metrics.awaitingValue)} are grouped by time waiting.`}
        label="Sorted bars of orders awaiting delivery by age, with rupee value labels"
        period={period}
        option={chartOption}
        empty={!metrics.awaitingCount}
        emptyMessage="No orders are awaiting delivery in this selection."
      />

      <PremiumTable
        title="Delay reasons ranked"
        takeaway={`Ranked by delayed order count. Average extra days is measured against the ${metrics.averageOnTimeDays === null ? "unavailable" : `${metrics.averageOnTimeDays.toFixed(1)}-day`} on-time average; controllability remains a marked placeholder until reasons are mapped.`}
        rows={metrics.reasons}
        columns={[
          { label: "Delay reason", render: (row) => row.reason },
          { label: "Delayed orders", align: "right", render: (row) => formatNumber(row.count) },
          {
            label: "Average extra days",
            align: "right",
            render: (row) => row.averageExtraDays === null
              ? "—"
              : `${row.averageExtraDays > 0 ? "+" : ""}${row.averageExtraDays.toFixed(1)} days`,
          },
          { label: "Controllable vs not", render: () => "Placeholder — not mapped" },
        ]}
        rowKey={(row) => row.reason}
        rowHref={(row) => leadDetailsHref(query, row.leadIds)}
        highlightRow={(row) => row === metrics.reasons[0]}
        emptyMessage="No recorded delay reasons match these filters."
      />

      <PremiumTable
        title="Order-to-delivery days by branch"
        takeaway="Branches with the longest average delivery time appear first."
        rows={metrics.branchCycles}
        columns={[
          { label: "Branch", render: (row) => row.branchName },
          { label: "Completed deliveries", align: "right", render: (row) => formatNumber(row.count) },
          { label: "Average days", align: "right", render: (row) => `${row.averageDays.toFixed(1)} days` },
        ]}
        rowKey={(row) => row.branchId}
        rowHref={(row) => leadDetailsHref(query, row.leadIds)}
        highlightRow={(row) => row === metrics.branchCycles[0]}
        emptyMessage="No completed deliveries match these filters."
      />

      <PremiumTable
        title="Undelivered orders aging by branch"
        takeaway={`${formatNumber(metrics.awaitingCount)} open orders worth ${formatCurrency(metrics.awaitingValue)} are grouped by branch and waiting-time bucket.`}
        rows={metrics.agingRows}
        columns={[
          { label: "Branch", render: (row) => row.branchName },
          { label: "Age bucket", render: (row) => row.bucket },
          { label: "Orders", align: "right", render: (row) => formatNumber(row.count) },
          { label: "Rupees at stake", align: "right", render: (row) => formatCurrency(row.value) },
        ]}
        rowKey={(row) => `${row.branchId}-${row.bucket}`}
        rowHref={(row) => leadDetailsHref(query, row.leadIds)}
        highlightRow={(row) => row.bucketIndex === 3}
        emptyMessage="No undelivered orders match these filters."
      />

      <PremiumTable
        title="Closed lost revenue"
        takeaway={`${formatNumber(metrics.closedLostCount)} lost deals are separated from open orders and delivery activity.`}
        rows={metrics.closedLostRows}
        columns={[
          { label: "Customer", render: (row) => row.lead.customerName },
          { label: "Branch", render: (row) => row.lead.branchName },
          { label: "Model", render: (row) => row.lead.model },
          { label: "Loss reason", render: (row) => row.lead.lostReason ?? "Uncategorized" },
          { label: "Lost on", align: "right", render: (row) => toDay(row.lostAt) },
          { label: "Deal value", align: "right", render: (row) => formatCurrency(row.lead.dealValue) },
        ]}
        rowKey={(row) => row.lead.id}
        rowHref={(row) => leadDetailsHref(query, [row.lead.id])}
        emptyMessage="No lost deals match the current filters."
      />

      <PremiumTable
        title="Orders awaiting delivery"
        takeaway="Sorted from longest to shortest wait."
        rows={metrics.awaitingRows}
        columns={[
          { label: "Customer", render: (row) => row.lead.customerName },
          { label: "Branch", render: (row) => row.lead.branchName },
          { label: "Model", render: (row) => row.lead.model },
          { label: "Representative", render: (row) => row.lead.repName },
          { label: "Days waiting", align: "right", render: (row) => formatNumber(row.daysWaiting) },
          { label: "Order value", align: "right", render: (row) => formatCurrency(row.value) },
        ]}
        rowKey={(row) => row.lead.id}
        rowHref={(row) => leadDetailsHref(query, [row.lead.id])}
        highlightRow={(row) => row.daysWaiting >= 30}
        emptyMessage="No orders are awaiting delivery in this selection."
      />
    </PageContainer>
  );
}

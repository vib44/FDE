"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, Clock3, TriangleAlert } from "lucide-react";
import { THRESHOLDS } from "../lib/config.ts";
import { EMPTY_FILTERS } from "../lib/types.ts";
import type { FilterState } from "../lib/types.ts";
import { toDay } from "../lib/dates.ts";
import { formatCurrency, formatNumber, formatPercent } from "../lib/format.ts";
import { periodLabel } from "../lib/period.ts";
import { deliverySectionData } from "../lib/metrics/delivery.ts";
import { useDataset } from "./dataset-provider.tsx";
import { ChartPanel } from "./chart-panel.tsx";
import { deliveryAgingChartOption } from "./dashboard-chart-options.ts";
import { useChartTokens } from "./use-chart-tokens.ts";
import { Card, CardHeader, Grid, PageContainer, PageHeader, PremiumTable, TagList } from "./shared-ui.tsx";
import { RankListCard } from "./rank-list-card.tsx";

function formatDays(value: number): string {
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value)} days`;
}

function DeliveryTieDetails({
  label,
  deliveries,
}: {
  label: string;
  deliveries: { leadId: string; model: string; branchName: string }[];
}) {
  if (deliveries.length < 2) return null;
  return (
    <details className="delivery-tie-details">
      <summary>{label}</summary>
      <ul>
        {deliveries.map((delivery) => (
          <li key={delivery.leadId}>{delivery.model} · {delivery.branchName}</li>
        ))}
      </ul>
    </details>
  );
}

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
  function targetBranchHref(branchId: string): string {
    const params = new URLSearchParams(query);
    params.set("branch", branchId);
    return `/targets?${params.toString()}`;
  }
  const filters = useMemo(
    () => filtersFromParams(new URLSearchParams(query)),
    [query],
  );
  const period = periodLabel(dataset, filters);
  const metrics = useMemo(
    () => deliverySectionData(dataset, filters),
    [dataset, filters],
  );
  const agingByBranch = useMemo(() => {
    const branches = new Map<string, {
      branchId: string;
      branchName: string;
      count: number;
      value: number;
      oldestBucketIndex: number;
      oldestBucket: string;
      oldestBucketCount: number;
    }>();
    for (const row of metrics.agingRows) {
      const branch = branches.get(row.branchId) ?? {
        branchId: row.branchId,
        branchName: row.branchName,
        count: 0,
        value: 0,
        oldestBucketIndex: -1,
        oldestBucket: "",
        oldestBucketCount: 0,
      };
      branch.count += row.count;
      branch.value += row.value;
      if (row.bucketIndex > branch.oldestBucketIndex) {
        branch.oldestBucketIndex = row.bucketIndex;
        branch.oldestBucket = row.bucket;
        branch.oldestBucketCount = row.count;
      }
      branches.set(row.branchId, branch);
    }
    return [...branches.values()].sort((a, b) =>
      b.oldestBucketIndex - a.oldestBucketIndex ||
      b.oldestBucketCount - a.oldestBucketCount ||
      b.count - a.count ||
      b.value - a.value ||
      a.branchName.localeCompare(b.branchName));
  }, [metrics.agingRows]);
  const chartOption = useMemo(
    () => deliveryAgingChartOption(metrics.ageBuckets, tokens),
    [metrics.ageBuckets, tokens],
  );
  const maxBranchMedian = Math.max(0, ...metrics.branchSpeedRows.map((row) => row.medianDays));
  const fastestBranch = metrics.scorecardRows
    .filter((row) => row.averageDays !== null)
    .sort((a, b) => a.averageDays! - b.averageDays! || a.branchName.localeCompare(b.branchName))[0];
  const largestAwaitingValue = Math.max(0, ...metrics.scorecardRows.map((row) => row.valueAwaiting));
  const maxAverageDays = Math.max(0, ...metrics.scorecardRows.map((row) => row.averageDays ?? 0));
  const backlogBranches = metrics.scorecardRows
    .filter((row) => row.valueAwaiting > row.revenueDelivered)
    .map((row) => row.branchName);
  const scorecardSummary = `${fastestBranch
    ? `${fastestBranch.branchName} delivers fastest at ${formatNumber(fastestBranch.averageDays!, 1)} days on average`
    : "No branch has completed deliveries"}; ${
    backlogBranches.length
      ? `${backlogBranches.join(", ")}: backlog bigger than delivered`
      : "no branch has backlog bigger than delivered"
  }.`;

  return (
    <PageContainer className="section-page section-delivery">
      <Grid className="delivery-headline-grid" aria-label="Delivery performance highlights">
        <Grid className="delivery-kpi-grid">
          <Card className="delivery-kpi-card">
            <div className="delivery-kpi-body">
              <p className="delivery-kpi-label">Median delivery time</p>
              <strong className="delivery-kpi-value">
                {metrics.medianDeliveryDays === null ? "—" : formatDays(metrics.medianDeliveryDays)}
              </strong>
              <p className="delivery-kpi-subline">
                {metrics.fastestDeliveryDays === null
                  ? "Fastest: —"
                  : `Fastest: ${formatNumber(metrics.fastestDeliveryDays)} days`}
                {metrics.fastestDeliveries.length > 1 && (
                  <> · {formatNumber(metrics.fastestDeliveries.length)} deliveries</>
                )}
              </p>
            </div>
            <div className="delivery-kpi-footer">
              <DeliveryTieDetails label="View tied deliveries" deliveries={metrics.fastestDeliveries} />
            </div>
          </Card>
          <Card className="delivery-kpi-card">
            <div className="delivery-kpi-body">
              <p className="delivery-kpi-label">Highest-value delivery</p>
              <strong className="delivery-kpi-value">
                {metrics.highestDeliveryValue === null ? "—" : formatCurrency(metrics.highestDeliveryValue)}
              </strong>
              <p className="delivery-kpi-subline">
                {metrics.highestValueDeliveries[0]
                  ? `${metrics.highestValueDeliveries[0].model} · ${metrics.highestValueDeliveries[0].branchName}`
                  : "No completed delivery in this selection"}
                {metrics.highestValueDeliveries.length > 1 && (
                  <> · {formatNumber(metrics.highestValueDeliveries.length)} tied</>
                )}
              </p>
            </div>
            <div className="delivery-kpi-footer">
              <DeliveryTieDetails label="View tied deliveries" deliveries={metrics.highestValueDeliveries} />
            </div>
          </Card>
          <Card className="delivery-kpi-card">
            <div className="delivery-kpi-body">
              <p className="delivery-kpi-label">Most delivered model</p>
              <strong className="delivery-kpi-value delivery-kpi-text">
                {metrics.mostDeliveredModel?.model ?? "—"}
              </strong>
              <p className="delivery-kpi-subline">
                {metrics.mostDeliveredModel
                  ? `${formatNumber(metrics.mostDeliveredModel.count)} deliveries · ${formatPercent(metrics.mostDeliveredModel.count / metrics.deliveredCount, 0)} of all`
                  : "No completed deliveries in this selection"}
              </p>
            </div>
          </Card>
          <Card className={`delivery-kpi-card${metrics.awaitingIdleCount ? " delivery-kpi-card-risk" : ""}`}>
            <div className="delivery-kpi-body">
              <p className="delivery-kpi-label">Ordered deal value</p>
              <strong className="delivery-kpi-value">
                {formatCurrency(metrics.awaitingValue)}
              </strong>
              <p className="delivery-kpi-subline">
                {metrics.awaitingIdleCount > 0 && (
                  <TriangleAlert aria-label="Idle orders need attention" className="delivery-idle-icon" />
                )}
                <span>At stake · {formatNumber(metrics.awaitingCount)} orders · {formatNumber(metrics.awaitingIdleCount)} idle {formatNumber(THRESHOLDS.staleOrderDays)}+ days</span>
              </p>
            </div>
          </Card>
          <Card className="delivery-kpi-card">
            <div className="delivery-kpi-body">
              <p className="delivery-kpi-label">Delayed deliveries</p>
              <strong className="delivery-kpi-value">
                {metrics.delayRate === null ? "—" : formatPercent(metrics.delayRate)}
              </strong>
              <p className="delivery-kpi-subline">
                {metrics.deliveredCount
                  ? `${formatNumber(metrics.delayedCount)} of ${formatNumber(metrics.deliveredCount)} · avg ${metrics.medianDelayedDays === null ? "—" : formatNumber(metrics.medianDelayedDays, 1)} days vs ${metrics.medianOnTimeDays === null ? "—" : formatNumber(metrics.medianOnTimeDays, 1)} on time`
                  : "No completed deliveries in this selection"}
              </p>
            </div>
          </Card>
        </Grid>
      </Grid>

      <Grid className="delivery-focus-grid" aria-label="Delivery follow-up overview">
        <RankListCard
          className="delivery-branch-rank-card"
          title="Fastest to deliver"
          takeaway="Median days from order to delivery."
          rows={metrics.branchSpeedRows.map((row) => ({
            id: row.branchId,
            name: row.branchName,
            href: targetBranchHref(row.branchId),
            value: formatDays(row.medianDays),
            valueDetail: row.belowMinimumSample ? `${formatNumber(row.count)} deliveries · small sample` : undefined,
            secondary: `${formatNumber(row.count)} deliveries`,
            barValue: maxBranchMedian ? row.medianDays / maxBranchMedian : 0,
            barLabel: `Delays: ${formatPercent(row.delayRate, 0)}`,
          }))}
          emptyMessage="No completed deliveries in this selection."
        />
        <ChartPanel
          title="Orders awaiting delivery by age"
          takeaway={`${formatNumber(metrics.awaitingCount)} orders worth ${formatCurrency(metrics.awaitingValue)} are grouped by time waiting.`}
          label="Sorted bars of orders awaiting delivery by age, with rupee value labels"
          period={period}
          option={chartOption}
          fillHeight
          empty={!metrics.awaitingCount}
          emptyMessage="No orders are awaiting delivery in this selection."
        />
      </Grid>

 <PremiumTable
        className="delivery-scorecard"
        title="Branch delivery scorecard"
        takeaway={scorecardSummary}
        rows={metrics.scorecardRows}
        sortable
        initialSort={{ column: "Ordered deal value", direction: "desc" }}
        totalsRow={[
          "Total",
          "",
          formatNumber(metrics.scorecardTotals.deliveries),
          metrics.scorecardTotals.averageDays === null
            ? "—"
            : `${formatNumber(metrics.scorecardTotals.averageDays, 1)} days`,
          formatCurrency(metrics.scorecardTotals.revenueDelivered),
          formatNumber(metrics.scorecardTotals.ordersAwaiting),
          formatCurrency(metrics.scorecardTotals.valueAwaiting),
        ]}
        columns={[
          {
            label: "Branch",
            tooltip: "Branch location associated with these delivery results",
            sortValue: (row) => row.branchName,
            render: (row) => row.branchName,
          },
          {
            label: "Branch manager",
            tooltip: "Sales representative assigned the branch manager role",
            sortValue: (row) => row.managerName,
            render: (row) => <TagList value={row.managerName} />,
          },
          {
            label: "Deliveries done",
            align: "right",
            tooltip: "Leads with a delivery record in the selected period",
            sortValue: (row) => row.deliveries,
            render: (row) => formatNumber(row.deliveries),
          },
          {
            label: "Avg. days to deliver",
            align: "right",
            tooltip: "Mean days between order and delivery; the cell also shows the median",
            sortValue: (row) => row.averageDays,
            render: (row) => (
              <span
                className={`delivery-scorecard-days${row.averageDays !== null && row.averageDays === fastestBranch?.averageDays ? " is-fastest" : ""}`}
                title={row.medianDays === null ? undefined : `Typical: ${formatNumber(row.medianDays, 1)} days`}
              >
                {row.averageDays === null ? "—" : (
                  <>
                    <span className="table-inline-bar" aria-hidden="true">
                      <span style={{ width: `${maxAverageDays ? row.averageDays / maxAverageDays * 100 : 0}%` }} />
                    </span>
                    {formatNumber(row.averageDays, 1)} days
                    {row.averageDays === fastestBranch?.averageDays && <Check aria-hidden="true" />}
                  </>
                )}
                {row.deliveries < THRESHOLDS.minDeliveriesForBranchRank && (
                  <span
                    className="delivery-small-sample-chip"
                    title={`${formatNumber(row.deliveries)} deliveries; average less reliable`}
                  >
                    Small sample
                  </span>
                )}
              </span>
            ),
          },
          {
            label: "Revenue delivered",
            align: "right",
            tooltip: "Value of cars handed over to customers",
            sortValue: (row) => row.revenueDelivered,
            render: (row) => formatCurrency(row.revenueDelivered),
          },
          {
            label: "Orders awaiting delivery",
            align: "right",
            tooltip: "Booked, not yet handed over",
            sortValue: (row) => row.ordersAwaiting,
            render: (row) => formatNumber(row.ordersAwaiting),
          },
          {
            label: "Ordered deal value",
            align: "right",
            tooltip: "Revenue at stake until these cars are delivered",
            sortValue: (row) => row.valueAwaiting,
            render: (row) => (
              <span className={`delivery-scorecard-awaiting${row.valueAwaiting === largestAwaitingValue && largestAwaitingValue > 0 ? " is-largest" : ""}`}>
                <span className="table-inline-bar" aria-hidden="true">
                  <span style={{ width: `${largestAwaitingValue ? row.valueAwaiting / largestAwaitingValue * 100 : 0}%` }} />
                </span>
                {formatCurrency(row.valueAwaiting)}
                {row.valueAwaiting === largestAwaitingValue && largestAwaitingValue > 0 && <Clock3 aria-hidden="true" />}
              </span>
            ),
          },
        ]}
        rowKey={(row) => row.branchId}
        rowHref={(row) => targetBranchHref(row.branchId)}
        emptyMessage="No branch delivery data matches these filters."
      />
      <PremiumTable
        title="Delay reasons ranked"
        takeaway={`Ranked by delayed order count. Average extra days is measured against the ${metrics.averageOnTimeDays === null ? "unavailable" : `${metrics.averageOnTimeDays.toFixed(1)}-day`} on-time average; controllability remains a marked placeholder until reasons are mapped.`}
        rows={metrics.reasons}
        columns={[
          { label: "Delay reason", render: (row) => <TagList value={row.reason} separator=";" /> },
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
        title="Closed lost revenue"
        takeaway={`${formatNumber(metrics.closedLostCount)} lost deals are separated from open orders and delivery activity.`}
        rows={metrics.closedLostRows}
        columns={[
          { label: "Customer", render: (row) => row.lead.customerName },
          { label: "Branch", render: (row) => row.lead.branchName },
          { label: "Model", render: (row) => row.lead.model },
          { label: "Loss reason", render: (row) => <TagList value={row.lead.lostReason ?? "Uncategorized"} separator=";" /> },
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

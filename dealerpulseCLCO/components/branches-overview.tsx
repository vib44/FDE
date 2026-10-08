"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { EChartsCoreOption } from "echarts/core";
import { EMPTY_FILTERS, type FilterState } from "../lib/types.ts";
import { toDay } from "../lib/dates.ts";
import { formatCurrency, formatNumber, formatPercent } from "../lib/format.ts";
import { branchDetailData } from "../lib/metrics/branch-detail.ts";
import { actNowInsights } from "../lib/metrics/insights.ts";
import type { BranchDetailMetricSet } from "../lib/metrics/branch-detail.ts";
import { ChartPanel } from "./chart-panel.tsx";
import { useChartTokens } from "./use-chart-tokens.ts";
import { InsightStrip } from "./insight-strip.tsx";
import { useDataset } from "./dataset-provider.tsx";
import { Card, CardHeader, Grid, PageContainer, PageHeader, PremiumTable } from "./shared-ui.tsx";

function dayStart(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && toDay(timestamp) === value ? timestamp : null;
}

function filtersFromParams(params: URLSearchParams, branchId: string): FilterState {
  const start = dayStart(params.get("from"));
  const end = dayStart(params.get("to"));
  return {
    ...EMPTY_FILTERS,
    from: start,
    to: end === null ? null : end + 86_400_000 - 1,
    branch: branchId,
    rep: params.get("rep"),
    source: params.get("source"),
    model: params.get("model"),
    timeBasis: params.get("basis") === "event" ? "event" : "created",
  };
}

function stageLabel(stage: string | null): string {
  return stage ? stage.replaceAll("_", " ") : "Unknown";
}

function metricValue(key: keyof BranchDetailMetricSet, value: number): string {
  if (key === "contactRate" || key === "testDriveToOrder" || key === "winRate" || key === "delayRate") {
    return formatPercent(value);
  }
  if (key === "firstResponseHours") return `${value.toFixed(1)} hours`;
  return `${value.toFixed(1)} leads per rep`;
}

function pointDescription(label: string, key: keyof BranchDetailMetricSet, value: number, peer: number): string {
  const delta = value - peer;
  const deltaLabel = key === "contactRate" || key === "testDriveToOrder" || key === "winRate" || key === "delayRate"
    ? `${Math.abs(delta * 100).toFixed(1)} percentage points`
    : key === "firstResponseHours"
      ? `${Math.abs(delta).toFixed(1)} hours`
      : `${Math.abs(delta).toFixed(1)} leads per rep`;
  const relation = delta === 0 ? "matches" : delta > 0 ? "is above" : "is below";
  return `${label}: ${metricValue(key, value)} ${relation} the company median of ${metricValue(key, peer)} (${deltaLabel} difference).`;
}

function relativeDifference(value: number, peer: number): number {
  return Math.abs(value - peer) / Math.max(Math.abs(peer), 0.01);
}

export function BranchesOverview() {
  const { dataset } = useDataset();

  return (
    <PageContainer id="branches-overview" className="section-page branch-overview-page">
      <PageHeader eyebrow="Branch performance" title="Branches" className="section-page-header">
        <p className="section-question">Compare every branch with the company median and review its performance breakdown.</p>
        <p className="section-period">{formatNumber(dataset.branches.length)} branches in this overview.</p>
      </PageHeader>
      <nav className="branch-overview-jump-links" aria-label="Branch overview">
        {dataset.branches.map((branch) => (
          <Link key={branch.id} href={`#branch-${encodeURIComponent(branch.id)}`}>{branch.name}</Link>
        ))}
      </nav>
      {dataset.branches.map((branch) => (
        <BranchBreakdown key={branch.id} branchId={branch.id} />
      ))}
    </PageContainer>
  );
}

function BranchBreakdown({ branchId }: { branchId: string }) {
  const { dataset } = useDataset();
  const searchParams = useSearchParams();
  const tokens = useChartTokens();
  const filters = useMemo(
    () => filtersFromParams(new URLSearchParams(searchParams.toString()), branchId),
    [branchId, searchParams],
  );
  const detail = useMemo(() => branchDetailData(dataset, branchId, filters), [dataset, branchId, filters]);
  const insights = useMemo(() => {
    const scoped = actNowInsights(dataset, filters);
    return scoped.filter((insight) => insight.filters.branch === branchId ||
      (insight.leadIds.length > 0 && insight.leadIds.every((id) =>
        dataset.leadById[id]?.branchId === branchId))).slice(0, 3);
  }, [dataset, filters, branchId]);

  if (!detail) {
    return (
      <section className="branch-detail-page">
        <PageHeader eyebrow="Branches" title="Branch not found" className="section-page-header">
          <p className="section-verdict">This branch is not available in the current dataset.</p>
        </PageHeader>
      </section>
    );
  }

  const { branch, stats, peerMedian } = detail;
  const currentRate = stats.winRate;
  const peerRate = peerMedian.winRate;
  const verdict = currentRate === null || peerRate === null
    ? "There is not enough closed sales data to compare this branch with its peers."
    : currentRate >= peerRate
      ? `${branch.name} is ${formatPercent(currentRate - peerRate)} above the company median for closed wins.`
      : `${branch.name} is ${formatPercent(peerRate - currentRate)} below the company median for closed wins.`;

  const comparisonDefinitions: {
    key: keyof BranchDetailMetricSet;
    label: string;
    higherIsBetter: boolean;
  }[] = [
    { key: "contactRate", label: "Contact rate", higherIsBetter: true },
    { key: "testDriveToOrder", label: "Test-drive to order", higherIsBetter: true },
    { key: "winRate", label: "Closed win rate", higherIsBetter: true },
    { key: "delayRate", label: "Delay rate", higherIsBetter: false },
    { key: "firstResponseHours", label: "First response", higherIsBetter: false },
  ];
  const comparisons: {
    key: keyof BranchDetailMetricSet;
    label: string;
    value: number;
    peer: number;
    favorable: boolean;
    size: number;
  }[] = comparisonDefinitions.flatMap((definition) => {
    const value = stats[definition.key];
    const peer = peerMedian[definition.key];
    return value === null || peer === null ? [] : [{
      ...definition,
      value,
      peer,
      favorable: definition.higherIsBetter ? value >= peer : value <= peer,
      size: relativeDifference(value, peer),
    }];
  });
  const workload = stats.workload;
  const medianWorkload = peerMedian.workload;
  const workloadComparison = workload !== null && medianWorkload !== null
    ? {
      key: "workload" as const,
      label: "Workload",
      value: workload,
      peer: medianWorkload,
      size: relativeDifference(workload, medianWorkload),
      favorable: stats.winRate !== null && peerRate !== null && stats.winRate >= peerRate
        ? workload <= medianWorkload
        : stats.winRate !== null && peerRate !== null && stats.winRate < peerRate
          ? workload > medianWorkload
          : false,
    }
    : null;
  if (workloadComparison) comparisons.push(workloadComparison);
  const working = comparisons.filter((item) => item.favorable)
    .sort((a, b) => b.size - a.size).slice(0, 3);
  const hurting = comparisons.filter((item) => !item.favorable)
    .sort((a, b) => b.size - a.size).slice(0, 3);
  const query = searchParams.toString();
  const chartRows = currentRate !== null && peerRate !== null
    ? [
      { name: "This branch", rate: currentRate },
      { name: "Company median", rate: peerRate },
    ]
    : [];
  const winRateOption: EChartsCoreOption = {
    aria: { enabled: true },
    tooltip: { trigger: "axis", triggerOn: "mousemove|click", axisPointer: { type: "shadow" } },
    grid: { left: 112, right: 48, top: 12, bottom: 12, containLabel: true },
    xAxis: { type: "value", min: 0, max: 100, axisLabel: { formatter: "{value}%" } },
    yAxis: { type: "category", inverse: true, data: chartRows.map((row) => row.name) },
    series: [{
      type: "bar",
      data: chartRows.map((row, index) => ({
        value: row.rate * 100,
        itemStyle: { color: index === 0 ? tokens?.accent : tokens?.context },
      })),
      barMaxWidth: 18,
      itemStyle: { borderRadius: [0, 5, 5, 0] },
      label: { show: true, position: "right", formatter: ({ value }: { value: number }) => `${Math.round(value)}%` },
    }],
  };
  const leadHref = (leadId: string) => {
    const params = new URLSearchParams(query);
    params.set("branch", branchId);
    params.set("leadIds", leadId);
    return `/leads?${params.toString()}`;
  };
  const branchQuery = query ? `?${query}` : "";
  const overviewHref = `/branches${branchQuery}#branches-overview`;

  return (
    <section id={`branch-${encodeURIComponent(branchId)}`} className="branch-detail-page">
      <PageHeader
        eyebrow={`${branch.city} · Branch`}
        title={branch.name}
        className="section-page-header"
        actions={(
          <div className="branch-section-actions">
            <nav className="branch-breadcrumb" aria-label={`Breadcrumb for ${branch.name}`}>
              <Link href="/">Company</Link>
              <span aria-hidden="true">/</span>
              <Link href={`/branches${branchQuery}`}>Branches</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{branch.name}</span>
            </nav>
            <Link className="section-back-link" href={overviewHref}>Back to branch overview</Link>
          </div>
        )}
      >
        <p className="section-verdict">{verdict}</p>
        <p className="section-question">
          {formatNumber(detail.leads.length)} leads in scope; compare performance with the company median before choosing where to act.
        </p>
      </PageHeader>

      <Grid className="branch-comparison-grid">
        <Card>
          <CardHeader title="What's working" takeaway="The strongest branch results versus the company median." />
          {working.length ? (
            <ul className="branch-comparison-list">
              {working.map((item) => (
                <li key={item.key}>{pointDescription(item.label, item.key, item.value, item.peer)}</li>
              ))}
            </ul>
          ) : <p>No measured result is ahead of the peer median in the current scope.</p>}
        </Card>
        <Card>
          <CardHeader title="What's hurting" takeaway="The largest gaps against the company median." />
          {hurting.length ? (
            <ul className="branch-comparison-list">
              {hurting.map((item) => (
                <li key={item.key}>{pointDescription(item.label, item.key, item.value, item.peer)}</li>
              ))}
            </ul>
          ) : <p>No measured result is below the peer median in the current scope.</p>}
        </Card>
      </Grid>

      <InsightStrip
        insights={insights}
        query={query}
        title="What to do"
        emptyMessage="No branch-specific actions match the current filters."
      />

      <ChartPanel
        title="Closed win rate versus company median"
        takeaway={currentRate === null || peerRate === null
          ? "There is not enough closed sales data for a comparison."
          : `${formatPercent(currentRate)} for this branch versus ${formatPercent(peerRate)} for the company median.`}
        label="This branch's closed win rate compared with the company median"
        period="Current filter scope"
        option={winRateOption}
        empty={!chartRows.length}
        emptyMessage="Closed sales data is not available in this scope."
      />

      <Card className="branch-pipeline-card">
        <CardHeader
          title="Pipeline coverage"
          takeaway="Current open pipeline compared with the remaining target gap; this is not a forecast."
        />
        <dl className="branch-pipeline-grid">
          <div><dt>Units still needed</dt><dd>{detail.pipeline.remainingUnits === null ? "No target" : formatNumber(detail.pipeline.remainingUnits)}</dd></div>
          <div><dt>Revenue still needed</dt><dd>{detail.pipeline.remainingRevenue === null ? "No target" : formatCurrency(detail.pipeline.remainingRevenue)}</dd></div>
          <div><dt>Open pipeline value</dt><dd>{formatCurrency(detail.pipeline.openValue)}</dd></div>
          <div><dt>Coverage</dt><dd>{detail.pipeline.coverage === null
            ? detail.pipeline.remainingRevenue === 0 ? "Target met" : "Not available"
            : `${detail.pipeline.coverage.toFixed(1)}×`}</dd></div>
        </dl>
        <p className="branch-phase-placeholder">Current month: {detail.month}. Coverage uses open deal value divided by the remaining revenue target.</p>
      </Card>

      <PremiumTable
        title="What's driving losses"
        takeaway={detail.lossCount
          ? `${formatNumber(detail.lossCount)} lost leads in this branch; rows are ranked by loss count and show the last funnel stage reached.`
          : "No lost leads match the current branch scope."}
        rows={detail.lossRows}
        rowKey={(row) => `${row.reason}-${row.stage}`}
        columns={[
          { label: "Loss reason", render: (row) => row.reason },
          { label: "Lost leads", align: "right", render: (row) => formatNumber(row.count) },
          { label: "Deal value", align: "right", render: (row) => formatCurrency(row.value) },
          { label: "Last funnel stage", render: (row) => stageLabel(row.stage) },
        ]}
        emptyMessage="No loss reasons are available for this branch and filter scope."
      />
      <p className="branch-phase-placeholder">
        Phase 3 placeholder: loss-reason controllability labels will be added when the reason taxonomy is classified.
      </p>

      <PremiumTable
        title="Branch funnel"
        takeaway={`${formatNumber(detail.funnelRows[0]?.count ?? 0)} leads reached new; follow each stage to see where this branch loses volume.`}
        rows={detail.funnelRows}
        rowKey={(row) => row.stage}
        columns={[
          { label: "Stage", render: (row) => stageLabel(row.stage) },
          { label: "Leads", align: "right", render: (row) => formatNumber(row.count) },
          { label: "From previous stage", align: "right", render: (row) => row.conversion === null ? "—" : formatPercent(row.conversion) },
          { label: "Deal value", align: "right", render: (row) => formatCurrency(row.value) },
        ]}
        emptyMessage="No funnel activity matches the current branch scope."
      />

      <PremiumTable
        title="Representative leaderboard"
        takeaway={detail.repRows.length
          ? `${formatNumber(detail.repRows.length)} representatives have assigned leads in this branch; the lowest closed win rates appear first.`
          : "No representatives have assigned leads in this branch scope."}
        rows={detail.repRows}
        rowKey={(row) => row.rep.id}
        columns={[
          { label: "Representative", render: (row) => row.rep.name },
          { label: "Leads", align: "right", render: (row) => formatNumber(row.leadCount) },
          { label: "Closed win rate", align: "right", render: (row) => row.winRate === null ? "—" : formatPercent(row.winRate) },
          { label: "Revenue", align: "right", render: (row) => formatCurrency(row.revenue) },
          { label: "Cold pre-order leads", align: "right", render: (row) => formatNumber(row.coldCount) },
        ]}
        emptyMessage="No representative results are available for this branch and filter scope."
      />

      <PremiumTable
        title="Cold pre-order leads"
        takeaway={`${formatNumber(detail.coldRows.length)} open pre-order leads have been idle for more than the configured cold-lead threshold.`}
        rows={detail.coldRows}
        rowKey={(row) => row.lead.id}
        rowHref={(row) => leadHref(row.lead.id)}
        columns={[
          { label: "Customer", render: (row) => row.lead.customerName },
          { label: "Representative", render: (row) => row.lead.repName },
          { label: "Stage", render: (row) => stageLabel(row.lead.status) },
          { label: "Idle days", align: "right", render: (row) => formatNumber(Math.floor(row.idleDays)) },
          { label: "Deal value", align: "right", render: (row) => formatCurrency(row.value) },
        ]}
        emptyMessage="No cold pre-order leads match the current branch scope."
      />

      <PremiumTable
        title="Undelivered orders"
        takeaway={`${formatNumber(detail.undeliveredRows.length)} orders are still awaiting delivery in this branch.`}
        rows={detail.undeliveredRows}
        rowKey={(row) => row.lead.id}
        rowHref={(row) => leadHref(row.lead.id)}
        columns={[
          { label: "Customer", render: (row) => row.lead.customerName },
          { label: "Representative", render: (row) => row.lead.repName },
          { label: "Days waiting", align: "right", render: (row) => formatNumber(Math.floor(row.ageDays)) },
          { label: "Deal value", align: "right", render: (row) => formatCurrency(row.value) },
        ]}
        emptyMessage="No undelivered orders match the current branch scope."
      />

      <PremiumTable
        title="Source effectiveness"
        takeaway={detail.sourceRows.some((row) => row.highVolumeLowConverting)
          ? "Highlighted sources have above-median lead volume but below-median closed win rate; review spend before shifting or cutting it."
          : "Compare closed win rate and delivered revenue before shifting or cutting source spend."}
        rows={detail.sourceRows}
        rowKey={(row) => row.source}
        highlightRow={(row) => row.highVolumeLowConverting}
        columns={[
          { label: "Lead source", render: (row) => row.source.replaceAll("_", " ") },
          { label: "Lead volume", align: "right", render: (row) => formatNumber(row.volume) },
          { label: "Closed win rate", align: "right", render: (row) => row.winRate === null ? "—" : formatPercent(row.winRate) },
          { label: "Delivered revenue", align: "right", render: (row) => formatCurrency(row.revenue) },
          { label: "Spend signal", render: (row) => row.highVolumeLowConverting ? "Review spend" : "—" },
        ]}
        emptyMessage="No lead sources match the current branch scope."
      />
      <p className="branch-phase-placeholder">
        A highlighted source is a relative signal within this branch, not a forecast of future returns.
      </p>
    </section>
  );
}

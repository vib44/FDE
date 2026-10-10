"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, CircleX, TriangleAlert } from "lucide-react";
import { EMPTY_FILTERS } from "../lib/types.ts";
import { buildHref } from "../lib/navigation.ts";
import type { OverviewKPI, OverviewStatus } from "../lib/types.ts";
import { toDay } from "../lib/dates.ts";
import { periodLabel } from "../lib/period.ts";
import { formatCurrency, formatNumber, formatPercent } from "../lib/format.ts";
import { overviewVM } from "../lib/metrics/overview.ts";
import { actNowInsights } from "../lib/metrics/insights.ts";
import { branchHealthRows } from "../lib/metrics/branch-health.ts";
import { overdueOpen } from "../lib/metrics/delivery.ts";
import { filterLeads } from "../lib/metrics/filters.ts";
import { healthKeyNumbers, healthStatus, kpiSublines, type HealthArea } from "../lib/metrics/overview-summary.ts";
import { overviewInsights } from "../lib/insights/index.ts";
import { useDataset } from "./dataset-provider.tsx";
import { OverviewInsightBlocks } from "./overview-insights.tsx";
import { Card, Grid, PageContainer, PageHeader, PremiumTable } from "./shared-ui.tsx";

function dayStart(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && toDay(timestamp) === value ? timestamp : null;
}

function dayEnd(value: string | null): number | null {
  const start = dayStart(value);
  return start === null ? null : start + 86_400_000 - 1;
}

function formatValue(value: number | null, format: OverviewKPI["format"]): string {
  if (value === null) return "—";
  switch (format) {
    case "currency": return formatCurrency(value);
    case "number": return formatNumber(value);
    case "percent": return formatPercent(value);
    case "days": return `${value.toFixed(1)} days`;
  }
}

function formatDelta(kpi: OverviewKPI): string | null {
  if (kpi.delta === null) return null;
  const sign = kpi.delta > 0 ? "+" : "";
  let delta: string;
  switch (kpi.format) {
    case "currency": delta = `${sign}${formatCurrency(kpi.delta)}`; break;
    case "number": delta = `${sign}${formatNumber(kpi.delta)}`; break;
    case "percent": delta = `${sign}${(kpi.delta * 100).toFixed(1)} pp`; break;
    case "days": delta = `${sign}${kpi.delta.toFixed(1)} days`; break;
  }
  const relative = kpi.deltaPct === null ? "" : ` (${sign}${(kpi.deltaPct * 100).toFixed(1)}%)`;
  return `${delta}${relative} vs previous period`;
}

const statusLabels: Record<OverviewStatus, string> = {
  good: "Favorable",
  watch: "Watch",
  risk: "At risk",
  neutral: "No comparison",
};

const healthSections = [
  { label: "Targets & Revenue", area: "targets", href: "/targets", matches: (id: string) => id === "branches-below-target" },
  { label: "Funnel", area: "funnel", href: "/funnel#lead-sources", matches: (id: string) =>
    id.startsWith("conversion-") || id.startsWith("source-quality-") },
  { label: "Delivery", area: "delivery", href: "/delivery", matches: (id: string) => id === "orders-beyond-median-delivery" },
  { label: "Deals in progress", area: "deals", href: "/deals", matches: (id: string) => id === "cold-preorder-leads" },
  { label: "Team", area: "team", href: "/team", matches: (id: string) => id === "cold-preorder-leads" },
] as const satisfies readonly { label: string; area: HealthArea; href: string; matches: (id: string) => boolean }[];

export default function Dashboard() {
  const { dataset } = useDataset();
  const searchParams = useSearchParams();
  const filters = useMemo(() => ({
    ...EMPTY_FILTERS,
    from: dayStart(searchParams.get("from")),
    to: dayEnd(searchParams.get("to")),
    branch: searchParams.get("branch"),
    source: searchParams.get("source"),
    model: searchParams.get("model"),
    timeBasis: searchParams.get("basis") === "event" ? "event" as const : "created" as const,
  }), [searchParams]);
  const overview = useMemo(() => overviewVM(dataset, filters), [dataset, filters]);
  const insights = useMemo(() => actNowInsights(dataset, filters), [dataset, filters]);
  const branchRows = useMemo(() => branchHealthRows(dataset, filters), [dataset, filters]);
  const overviewBlocks = useMemo(() => overviewInsights(dataset, filters), [dataset, filters]);
  const healthNumbers = useMemo(() => healthKeyNumbers(dataset, filters), [dataset, filters]);
  const overdueLeadCount = useMemo(
    () => overdueOpen(filterLeads(dataset, filters), dataset.asOf).length,
    [dataset, filters],
  );
  const rankedBranchRows = useMemo(
    () => branchRows.map((row, index) => ({ ...row, rank: index + 1 })),
    [branchRows],
  );
  const period = periodLabel(dataset, filters);
  const weakestWinRate = branchRows.reduce<(typeof branchRows)[number] | null>((weakest, row) =>
    row.winRate !== null && (weakest === null || row.winRate < weakest.winRate!)
      ? row
      : weakest, null);
  const revenueKPI = overview.kpis.find((kpi) => kpi.id === "revenue");
  const deliveriesKPI = overview.kpis.find((kpi) => kpi.id === "deliveries");
  const attainmentKPI = overview.kpis.find((kpi) => kpi.id === "attainment");
  const verdictTitle = overview.verdict.status === "risk"
    ? "Business performance is below target"
    : overview.verdict.status === "watch"
      ? "Business performance needs attention"
      : overview.verdict.status === "good"
        ? "Business performance is on track"
        : "Business performance snapshot";
  const weakestBranch = weakestWinRate && weakestWinRate.winRate !== null
    ? `The weakest branch by win rate is ${weakestWinRate.branchName} at ${formatPercent(weakestWinRate.winRate)}.`
    : "No branch has a closed win rate in this view.";
  const verdictSummary = `${formatCurrency(revenueKPI?.value ?? 0)} in revenue was delivered across ${formatNumber(deliveriesKPI?.value ?? 0)} cars. ${weakestBranch}`;
  const sublines = kpiSublines(dataset, filters);
  const cards = [
    {
      id: "revenue",
      label: "Revenue delivered",
      tooltip: "Deal value from cars delivered in the selected view.",
      subline: attainmentKPI?.value === null || attainmentKPI?.value === undefined
        ? "Target unavailable"
        : `${formatPercent(attainmentKPI.value)} of target`,
    },
    {
      id: "orders",
      label: "Orders booked",
      tooltip: "Number of leads that reached the order-placed stage in the selected view.",
      subline: sublines.orders,
    },
    {
      id: "winRate",
      label: "Closed win rate",
      tooltip: "Delivered leads divided by all delivered and lost leads in the selected view.",
      subline: sublines.winRate,
    },
    {
      id: "pipelineValue",
      label: "Unordered deal value",
      tooltip: "Deal value of open leads before an order is placed.",
      subline: sublines.pipelineValue,
    },
    {
      id: "awaitingDeliveryValue",
      label: "Ordered deal value",
      tooltip: "Deal value of orders placed but not yet delivered.",
      subline: sublines.awaitingDeliveryValue,
    },
  ].map((card) => {
    const kpi = overview.kpis.find((item) => item.id === card.id);
    if (!kpi) throw new Error(`Missing overview KPI: ${card.id}`);
    return {
      ...kpi,
      displayLabel: card.label,
      tooltip: card.tooltip,
      subline: card.subline,
    };
  });

  function pageHref(path: string): string {
    return buildHref(path, searchParams.toString());
  }

  function branchHref(branchId: string): string {
    return buildHref("/targets", searchParams.toString(), { branch: branchId });
  }

  return (
   <PageContainer className="overview-dashboard">
           <section className="overview-top-row" aria-label="Business status and key results">
         <p className="as-of">{period} · {filters.timeBasis === "created" ? "By lead created date" : "By event date"}</p>
        <Card className={`executive-verdict status-${overview.verdict.status}`} aria-live="polite">
          <div className="verdict-heading">
            <span className="verdict-indicator" aria-hidden="true" />
            <p className="card-label">Business verdict</p>
            <span className="status-label">{statusLabels[overview.verdict.status]}</span>
          </div>
          <h2>{verdictTitle}</h2>
          <p>{verdictSummary}</p>
        </Card>
        <Grid className="overview-kpis" role="group" aria-label="Key results">
          {cards.map((card) => (
            <Card key={card.id} className={`kpi-card status-${card.status}`} title={card.tooltip}>
              <div className="kpi-topline">
                <span className="card-label">{card.displayLabel}</span>
                <span className="kpi-status" aria-label={statusLabels[card.status]} title={statusLabels[card.status]}>
                  <span className="status-shape" aria-hidden="true" />
                </span>
              </div>
              <strong className="kpi-value">{formatValue(card.value, card.format)}</strong>
              {card.subline && <p className="kpi-subline">{card.subline}</p>}
              {card.delta !== null && <p className="kpi-delta">{formatDelta(card)}</p>}
            </Card>
          ))}
        </Grid>
      </section>

      <Grid className="overview-health-check" role="group" aria-label="Section health check">
        {healthSections.map((section) => {
          const insight = insights.find((item) => section.matches(item.id));
          const status = healthStatus(section.area, insight?.severity, overdueLeadCount);
          const StatusIcon = status === "good" ? Check : status === "watch" ? TriangleAlert : CircleX;
          const statusLabel = status === "good" ? "Good" : status === "watch" ? "Watch" : "Act";
          return (
            <Card key={section.label} className={`health-check-card health-${status}`}>
              <div className="health-check-heading">
                <span className="health-check-status" aria-label={statusLabel}>
                  <StatusIcon aria-hidden="true" />
                  {statusLabel}
                </span>
                <span className="card-label">{section.label}</span>
              </div>
              <div className="health-check-insight">
                <strong className="health-key-number">{healthNumbers[section.area]}</strong>
              </div>
              <Link className="health-check-link" href={pageHref(section.href)}>
                View<span aria-hidden="true"> →</span>
              </Link>
            </Card>
          );
        })}
      </Grid>

      <PremiumTable
        title="Branch health"
        takeaway="Compare delivered revenue, progress to target and closed outcomes."
        rows={rankedBranchRows}
        rowKey={(row) => row.branchId}
        rowHref={(row) => branchHref(row.branchId)}
        highlightRow={(row) => row.branchId === weakestWinRate?.branchId}
        emptyMessage="No branch results match the current filters."
        emptyAction={{
          label: "Reset filters",
          href: buildHref("/", searchParams.toString(), {
            from: null, to: null, range: null, branch: null, source: null, model: null, basis: null,
          }),
        }}
        columns={[
          { label: "Rank", align: "right", render: (row) => formatNumber(row.rank) },
          { label: "Branch", render: (row) => row.branchName },
          { label: "Revenue", align: "right", render: (row) => formatCurrency(row.revenue) },
          {
            label: "Attainment (delivered revenue)",
            align: "right",
            tooltip: "Delivered deal value divided by target revenue for the selected branch-months.",
            render: (row) => row.revenuePct === null ? "—" : formatPercent(row.revenuePct),
          },
          {
            label: "Win rate",
            align: "right",
            render: (row) => row.winRate === null ? "—" : (
              <span className={`overview-win-rate${row.branchId === weakestWinRate?.branchId ? " is-weakest" : ""}`}>
                <span className="overview-win-rate-bar" aria-hidden="true">
                  <span style={{ width: `${row.winRate * 100}%` }} />
                </span>
                {formatPercent(row.winRate)}
                {row.branchId === weakestWinRate?.branchId && <small>Weakest</small>}
              </span>
            ),
          },
          {
            label: "Status",
            render: (row) => (
              <span className={`branch-status status-${row.status}`}>
                <span className="status-shape" aria-hidden="true" />{statusLabels[row.status]}
              </span>
            ),
          },
        ]}
      />

      <OverviewInsightBlocks overview={overviewBlocks} query={searchParams.toString()} />
    </PageContainer>
    
  );
}

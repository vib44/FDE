"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { EMPTY_FILTERS } from "../lib/types.ts";
import type { OverviewKPI, OverviewStatus } from "../lib/types.ts";
import { toDay } from "../lib/dates.ts";
import { periodLabel } from "../lib/period.ts";
import { formatCurrency, formatNumber, formatPercent } from "../lib/format.ts";
import { overviewVM } from "../lib/metrics/overview.ts";
import { actNowInsights } from "../lib/metrics/insights.ts";
import { branchHealthRows } from "../lib/metrics/branch-health.ts";
import { targetActualByBranch } from "../lib/metrics/dashboard-charts.ts";
import { useDataset } from "./dataset-provider.tsx";
import { Card, CardHeader, Grid, PageContainer, PageHeader, PremiumTable } from "./shared-ui.tsx";

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

const digestSections = [
  { label: "Targets", href: "/targets", matches: (id: string) => id === "branches-below-target" },
  { label: "Funnel", href: "/funnel", matches: (id: string) => id.startsWith("conversion-") || id.startsWith("source-quality-") },
  { label: "Delivery", href: "/delivery", matches: (id: string) => id.includes("order") || id.includes("delivery") },
  { label: "Branches", href: "/branches", matches: (id: string) => id.includes("branch") },
  { label: "Team", href: "/team", matches: (id: string) => id.includes("cold") },
] as const;

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
  const rankedBranchRows = useMemo(
    () => branchRows.map((row, index) => ({ ...row, rank: index + 1 })),
    [branchRows],
  );
  const orderTargets = useMemo(() => targetActualByBranch(dataset, filters), [dataset, filters]);
  const period = periodLabel(dataset, filters);
  const primaryInsight = insights[0];
  const lowestAttainment = branchRows.find((row) => row.revenuePct !== null);
  const verdictTitle = overview.verdict.status === "risk"
    ? "Business performance is below target"
    : overview.verdict.status === "watch"
      ? "Business performance needs attention"
      : overview.verdict.status === "good"
        ? "Business performance is on track"
        : "Business performance snapshot";
  const verdictSummary = [
    lowestAttainment
      ? `${lowestAttainment.branchName} has the lowest revenue attainment at ${formatPercent(lowestAttainment.revenuePct!)}.`
      : null,
    primaryInsight ? `Priority: ${primaryInsight.headline}${/[.!?]$/.test(primaryInsight.headline) ? "" : "."}` : null,
    overview.kpis.find((kpi) => kpi.id === "winRate")?.value == null
      ? "No leads have closed in this view yet."
      : `Closed win rate is ${formatPercent(overview.kpis.find((kpi) => kpi.id === "winRate")!.value!)}.`,
  ].filter(Boolean).join(" ");
  const attainmentKPI = overview.kpis.find((kpi) => kpi.id === "attainment");
  const labels = {
    revenue: "Revenue",
    deliveries: "Deliveries",
    winRate: "Closed win rate",
    pipelineValue: "Active pipeline",
    attainment: "Target attainment",
  } as const;
  const cards = overview.kpis
    .filter((kpi) => kpi.id in labels)
    .map((kpi) => ({ ...kpi, displayLabel: labels[kpi.id as keyof typeof labels] }));

  function pageHref(path: string): string {
    const query = searchParams.toString();
    return query ? `${path}?${query}` : path;
  }

  function branchHref(branchId: string): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("branch", branchId);
    return `/branches?${params.toString()}#branch-${encodeURIComponent(branchId)}`;
  }

  return (
    <PageContainer className="overview-dashboard">
      <PageHeader eyebrow="Performance overview" title="Business overview" className="dashboard-header">
        <p className="as-of">{period} · {filters.timeBasis === "created" ? "By lead created date" : "By event date"}</p>
      </PageHeader>

      <section className="overview-top-row" aria-label="Business status and key results">
        <Card className={`executive-verdict status-${overview.verdict.status}`} aria-live="polite">
          <div className="verdict-heading">
            <span className="verdict-indicator" aria-hidden="true" />
            <p className="card-label">Business verdict</p>
            <span className="status-label">{statusLabels[overview.verdict.status]}</span>
          </div>
          <h2>{verdictTitle}</h2>
          <p>{verdictSummary || overview.verdict.summary}</p>
          {overview.verdict.title === "Targets may need recalibration" &&
            attainmentKPI?.value !== null && attainmentKPI?.value !== undefined && (
            <p className="verdict-note">
              Review whether targets need recalibration; current delivery revenue attainment is {formatPercent(attainmentKPI.value)}.
            </p>
          )}
        </Card>
        <Grid className="overview-kpis" role="group" aria-label="Key results">
          {cards.map((card) => (
            <Card key={card.id} className={`kpi-card status-${card.status}`}>
              <div className="kpi-topline">
                <span className="card-label">{card.displayLabel}</span>
                <span className="kpi-status" aria-label={statusLabels[card.status]} title={statusLabels[card.status]}>
                  <span className="status-shape" aria-hidden="true" />
                </span>
              </div>
              <strong className="kpi-value">{formatValue(card.value, card.format)}</strong>
              {card.delta !== null && <p className="kpi-delta">{formatDelta(card)}</p>}
            </Card>
          ))}
        </Grid>
      </section>

      <Card className="overview-digest" aria-label="Section priorities">
        <CardHeader title="At a glance" takeaway="The top current priority in each area." />
        <ul>
          {digestSections.map((section) => {
            const insight = insights.find((item) => section.matches(item.id));
            return (
              <li key={section.label}>
                <span>{section.label}</span>
                <Link href={pageHref(section.href)}>
                  {insight
                    ? `${insight.headline}${/[.!?]$/.test(insight.headline) ? "" : "."} ${insight.evidence}`
                    : "No priority action flagged for these filters."}
                  <span className="digest-arrow" aria-hidden="true">→</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="target-progress-card">
        <CardHeader
          title="Orders booked against target"
          takeaway={orderTargets.takeaway}
        />
        {orderTargets.data.length ? (
          <ul className="target-progress-list">
            {orderTargets.data
              .slice()
              .sort((a, b) => (a.attainment ?? -1) - (b.attainment ?? -1))
              .map((row) => {
                const percent = row.attainment === null ? null : row.attainment * 100;
                return (
                  <li key={row.branchId}>
                    <Link href={branchHref(row.branchId)} title={`View ${row.branchName} branch`}>
                      <span className="target-progress-name">{row.branchName}</span>
                      <span className="target-progress-track" aria-hidden="true">
                        <span
                          className={`target-progress-fill${percent !== null && percent < 50 ? " is-low" : ""}`}
                          style={{ width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }}
                        />
                      </span>
                      <span className="target-progress-value">
                        {row.attainment === null ? "No target" : formatPercent(row.attainment)}
                      </span>
                      <span className="target-progress-context">
                        {formatNumber(row.actual)} / {formatNumber(row.target)} orders
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        ) : (
          <p className="premium-table-empty">No order targets match the selected filters.</p>
        )}
      </Card>

      <PremiumTable
        title="Branch health"
        takeaway="Compare delivered revenue, progress to target and closed outcomes."
        rows={rankedBranchRows}
        rowKey={(row) => row.branchId}
        rowHref={(row) => branchHref(row.branchId)}
        highlightRow={(row) => row.branchId === branchRows[0]?.branchId}
        emptyMessage="No branch results match the current filters."
        emptyAction={{ label: "Reset filters", href: "/" }}
        columns={[
          { label: "Rank", align: "right", render: (row) => formatNumber(row.rank) },
          { label: "Branch", render: (row) => row.branchName },
          { label: "Revenue", align: "right", render: (row) => formatCurrency(row.revenue) },
          {
            label: "Attainment",
            align: "right",
            render: (row) => row.revenuePct === null ? "—" : formatPercent(row.revenuePct),
          },
          { label: "Win rate", align: "right", render: (row) => row.winRate === null ? "—" : formatPercent(row.winRate) },
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
    </PageContainer>
  );
}

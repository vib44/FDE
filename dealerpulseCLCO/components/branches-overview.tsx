"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { EMPTY_FILTERS, type FilterState } from "../lib/types.ts";
import { toDay } from "../lib/dates.ts";
import { formatCurrency, formatNumber, formatPercent } from "../lib/format.ts";
import { branchDetailData } from "../lib/metrics/branch-detail.ts";
import { branchHealthRows } from "../lib/metrics/branch-health.ts";
import { actNowInsights } from "../lib/metrics/insights.ts";
import { median } from "../lib/metrics/stats.ts";
import { DashboardCharts } from "./dashboard-charts.tsx";
import { useDataset } from "./dataset-provider.tsx";
import { InsightStrip } from "./insight-strip.tsx";
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
    rep: params.get("rep"),
    source: params.get("source"),
    model: params.get("model"),
    timeBasis: params.get("basis") === "event" ? "event" : "created",
  };
}

function displayRate(value: number | null): string {
  return value === null ? "—" : formatPercent(value);
}

export function BranchesOverview() {
  const { dataset } = useDataset();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const filters = useMemo(
    () => filtersFromParams(new URLSearchParams(query)),
    [query],
  );
  const branchRows = useMemo(() => {
    const health = new Map(branchHealthRows(dataset, filters).map((row) => [row.branchId, row]));
    const base = dataset.branches.flatMap((branch) => {
      const detail = branchDetailData(dataset, branch.id, filters);
      const target = health.get(branch.id);
      if (!detail || !target) return [];
      return [{
        branchId: branch.id,
        branchName: branch.name,
        revenue: target.revenue,
        attainment: target.revenuePct,
        winRate: detail.stats.winRate,
        contactRate: detail.stats.contactRate,
        testDriveToOrder: detail.stats.testDriveToOrder,
        delayRate: detail.stats.delayRate,
        leadsPerRep: detail.stats.workload,
      }];
    });
    const benchmark = {
      winRate: median(base.map((row) => row.winRate).filter((value): value is number => value !== null)),
      attainment: median(base.map((row) => row.attainment).filter((value): value is number => value !== null)),
      contactRate: median(base.map((row) => row.contactRate).filter((value): value is number => value !== null)),
      testDriveToOrder: median(base.map((row) => row.testDriveToOrder).filter((value): value is number => value !== null)),
      delayRate: median(base.map((row) => row.delayRate).filter((value): value is number => value !== null)),
    };
    const rows = base.map((row) => {
      const helpScore = [
        row.winRate !== null && benchmark.winRate !== null && row.winRate < benchmark.winRate,
        row.attainment !== null && benchmark.attainment !== null && row.attainment < benchmark.attainment,
        row.contactRate !== null && benchmark.contactRate !== null && row.contactRate < benchmark.contactRate,
        row.testDriveToOrder !== null && benchmark.testDriveToOrder !== null &&
          row.testDriveToOrder < benchmark.testDriveToOrder,
        row.delayRate !== null && benchmark.delayRate !== null && row.delayRate > benchmark.delayRate,
      ].filter(Boolean).length;
      return { ...row, helpScore };
    });
    const weakest = rows.reduce<typeof rows[number] | null>((selected, row) =>
      row.winRate !== null && (selected === null || selected.winRate === null ||
        row.winRate < selected.winRate) ? row : selected, null);
    rows.sort((a, b) => b.helpScore - a.helpScore ||
      (a.winRate ?? Number.POSITIVE_INFINITY) - (b.winRate ?? Number.POSITIVE_INFINITY) ||
      (b.delayRate ?? Number.NEGATIVE_INFINITY) - (a.delayRate ?? Number.NEGATIVE_INFINITY) ||
      a.branchName.localeCompare(b.branchName));
    return { rows, weakest };
  }, [dataset, filters]);
  const insights = useMemo(() => actNowInsights(dataset, filters)
    .filter((insight) => insight.id.startsWith("conversion-") ||
      insight.id === "branches-below-target")
    .slice(0, 3), [dataset, filters]);
  const branchCount = branchRows.rows.length;
  const weakest = branchRows.weakest;
  const queryString = query ? `?${query}` : "";

  return (
    <PageContainer id="branches-overview" className="section-page branch-overview-page">
      <PageHeader eyebrow="Branches" title="Which branch needs help?" className="section-page-header">
        <p className="section-verdict">
          {branchCount
            ? weakest?.winRate === null || !weakest
              ? `${formatNumber(branchCount)} branches are in scope; no branch has enough closed results for a win-rate comparison.`
              : `${weakest.branchName} has the lowest win rate at ${formatPercent(weakest.winRate)} across ${formatNumber(branchCount)} branches.`
            : "No branches match the current filters."}
        </p>
        <p className="section-question">
          The comparison is ordered by the number of results below the company midpoint, then by win rate.
        </p>
        <p className="branch-phase-placeholder">
          Phase 3 placeholder: the workload-versus-result diagnosis will compare leads per rep with branch win rate.
        </p>
      </PageHeader>

      <InsightStrip
        insights={insights}
        query={query}
        title="What to do"
        emptyMessage="No branch-specific action matches the current filters."
      />

      <DashboardCharts dataset={dataset} filters={filters} view="branches" />

      <PremiumTable
        title="Company branch comparison"
        takeaway={weakest?.winRate === null || !weakest
          ? "Rows needing the most attention appear first; win rate is unavailable where no leads have closed."
          : `${weakest.branchName} is the outlier to review first, with a ${formatPercent(weakest.winRate)} win rate.`}
        rows={branchRows.rows}
        rowKey={(row) => row.branchId}
        rowHref={(row) => `/branch/${encodeURIComponent(row.branchId)}${queryString}`}
        highlightRow={(row) => row.branchId === weakest?.branchId}
        emptyMessage="No branch results match these filters. Reset filters to see the full company comparison."
        emptyAction={{ label: "Reset filters", href: "/branches" }}
        columns={[
          { label: "Branch", render: (row) => row.branchName },
          {
            label: "Revenue / target",
            align: "right",
            render: (row) => (
              <span>
                {formatCurrency(row.revenue)}
                <small> · {row.attainment === null ? "No target" : formatPercent(row.attainment)}</small>
              </span>
            ),
          },
          { label: "Win rate", align: "right", render: (row) => displayRate(row.winRate) },
          { label: "Contact rate", align: "right", render: (row) => displayRate(row.contactRate) },
          { label: "Test-drive to order", align: "right", render: (row) => displayRate(row.testDriveToOrder) },
          { label: "Delay rate", align: "right", render: (row) => displayRate(row.delayRate) },
          {
            label: "Leads per rep",
            align: "right",
            render: (row) => row.leadsPerRep === null ? "—" : formatNumber(row.leadsPerRep),
          },
        ]}
      />
    </PageContainer>
  );
}

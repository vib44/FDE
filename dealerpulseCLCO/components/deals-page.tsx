"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ORDER_STAGE, PRE_ORDER_STAGES, THRESHOLDS } from "../lib/config.ts";
import { buildHref } from "../lib/navigation.ts";
import type { Stage } from "../lib/config.ts";
import { toDay } from "../lib/dates.ts";
import { formatCurrency, formatNumber, formatPercent } from "../lib/format.ts";
import { overdueOpen } from "../lib/metrics/delivery.ts";
import { filterLeads } from "../lib/metrics/filters.ts";
import { filterOpenLeads } from "../lib/metrics/open-leads.ts";
import { stageConversion } from "../lib/metrics/stage-progression.ts";
import { EMPTY_FILTERS, type FilterState, type Lead } from "../lib/types.ts";
import { DealProgressionSection } from "./deal-progression-section.tsx";
import { useDataset } from "./dataset-provider.tsx";
import { Card, PageContainer, PageHeader, PremiumTable } from "./shared-ui.tsx";

const DAY = 86_400_000;

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

function stageCohort(leads: Lead[], stage: Stage, filters: FilterState): Lead[] {
  return leads.filter((lead) => {
    const timestamp = lead.reached[stage];
    return timestamp !== null && (filters.timeBasis !== "event" ||
      ((filters.from === null || timestamp >= filters.from) &&
        (filters.to === null || timestamp <= filters.to)));
  });
}

function rateText(value: number | null): string {
  return value === null ? "—" : formatPercent(value);
}

function BranchRate({
  value,
  count,
  weakest,
}: {
  value: number | null;
  count: number;
  weakest: boolean;
}) {
  const width = value === null ? 0 : Math.max(0, Math.min(100, value * 100));
  return (
    <div className={`deals-branch-rate${weakest ? " is-weakest" : ""}`}>
      <div className="deals-branch-rate-value">
        <span>{rateText(value)}</span>
        {weakest && <span className="branch-lowest-chip">Weakest</span>}
        {count < THRESHOLDS.minLeadsForStageRate && (
          <span
            className="branch-small-sample-chip"
            title={`${formatNumber(count)} observations; fewer than ${formatNumber(THRESHOLDS.minLeadsForStageRate)} required for a stable comparison.`}
          >
            Small sample
          </span>
        )}
      </div>
      <span className="deals-branch-rate-track" aria-hidden="true">
        <span style={{ width: `${width}%` }} />
      </span>
    </div>
  );
}

export function DealsPage() {
  const { dataset } = useDataset();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const filters = useMemo(
    () => filtersFromParams(new URLSearchParams(query)),
    [query],
  );
  const scopedLeads = useMemo(
    () => filterLeads(dataset, { ...filters, timeBasis: "created" }),
    [dataset, filters],
  );
  const openLeads = useMemo(
    () => filterOpenLeads(dataset, filters),
    [dataset, filters],
  );
  const overdueDeals = useMemo(() => overdueOpen(
    filterLeads(dataset, filters),
    dataset.asOf,
  ).flatMap((lead) => {
    if (lead.expectedCloseAt === null) return [];
    const dueDay = Date.parse(`${toDay(lead.expectedCloseAt)}T00:00:00.000Z`);
    const asOfDay = Date.parse(`${toDay(dataset.asOf)}T00:00:00.000Z`);
    return [{
      lead,
      daysOverdue: Math.floor((asOfDay - dueDay) / DAY),
    }];
  }).sort((a, b) => b.daysOverdue - a.daysOverdue ||
    b.lead.dealValue - a.lead.dealValue ||
    a.lead.customerName.localeCompare(b.lead.customerName)), [dataset, filters]);
  const overdueUnorderedValue = overdueDeals
    .filter(({ lead }) => (PRE_ORDER_STAGES as readonly string[]).includes(lead.status))
    .reduce((sum, { lead }) => sum + lead.dealValue, 0);
  const overdueOrderedValue = overdueDeals
    .filter(({ lead }) => lead.status === ORDER_STAGE)
    .reduce((sum, { lead }) => sum + lead.dealValue, 0);
  const view = useMemo(() => {
    const bookingCohort = stageCohort(scopedLeads, "contacted", filters);
    const closingCohort = stageCohort(scopedLeads, "negotiation", filters);
    const bookingRate = stageConversion(bookingCohort, "contacted", "test_drive");
    const closingRate = stageConversion(closingCohort, "negotiation", "order_placed");
    const branches = dataset.branches.map((branch) => {
      const branchLeads = scopedLeads.filter((lead) => lead.branchId === branch.id);
      const branchBooking = stageCohort(branchLeads, "contacted", filters);
      const branchClosing = stageCohort(branchLeads, "negotiation", filters);
      return {
        branchId: branch.id,
        branchName: branch.name,
        bookingRate: stageConversion(branchBooking, "contacted", "test_drive"),
        bookingCount: branchBooking.length,
        closingRate: stageConversion(branchClosing, "negotiation", "order_placed"),
        closingCount: branchClosing.length,
      };
    });
    const weakestBooking = branches.reduce<typeof branches[number] | null>((weakest, row) =>
      row.bookingRate !== null && (weakest === null || row.bookingRate < (weakest.bookingRate ?? Infinity))
        ? row
        : weakest, null);
    const weakestClosing = branches.reduce<typeof branches[number] | null>((weakest, row) =>
      row.closingRate !== null && (weakest === null || row.closingRate < (weakest.closingRate ?? Infinity))
        ? row
        : weakest, null);
    return {
      bookingRate,
      closingRate,
      branches,
      weakestBooking,
      weakestClosing,
    };
  }, [dataset, filters, openLeads, scopedLeads]);
  const branchHref = (branchId: string) => {
    return buildHref(`/branch/${branchId}`, query, { branch: branchId });
  };
  const branchTable = (
    <Card className="deals-by-branch" aria-label="Deal conversion by branch">
      <header className="card-header">
        <div className="card-header-copy">
          <h2>By branch</h2>
          <p>Compare booking after contact and order closing after negotiation.</p>
        </div>
      </header>
      <div className="deals-branch-table-wrap">
        <table className="premium-table deals-branch-table">
          <colgroup>
            <col className="deals-branch-name-column" />
            <col className="deals-branch-rate-column" />
            <col className="deals-branch-rate-column" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Branch</th>
              <th scope="col" className="is-numeric">Test-drive booking rate</th>
              <th scope="col" className="is-numeric">Negotiation closing rate</th>
            </tr>
          </thead>
          <tbody>
            {view.branches.map((row) => (
              <tr key={row.branchId}>
                <th scope="row">
                  <Link href={branchHref(row.branchId)}>{row.branchName}</Link>
                </th>
                <td className={`is-numeric${row.branchId === view.weakestBooking?.branchId ? " is-weakest" : ""}`}>
                  <BranchRate
                    value={row.bookingRate}
                    count={row.bookingCount}
                    weakest={row.branchId === view.weakestBooking?.branchId}
                  />
                </td>
                <td className={`is-numeric${row.branchId === view.weakestClosing?.branchId ? " is-weakest" : ""}`}>
                  <BranchRate
                    value={row.closingRate}
                    count={row.closingCount}
                    weakest={row.branchId === view.weakestClosing?.branchId}
                  />
                </td>
              </tr>
            ))}
            {!view.branches.length && (
              <tr><td colSpan={3} className="premium-table-empty">No branch results match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
  return (
    <PageContainer className="deals-page">
      <PageHeader
        eyebrow="Deals in progress"
        title="Deals in progress"
        tagline="Are interested customers turning into orders?"
        className="section-page-header"
      >
      </PageHeader>
      <DealProgressionSection dataset={dataset} filters={filters} query={query} byBranch={branchTable} />
      <PremiumTable
        title="Open deals past expected close date"
        takeaway={`${formatNumber(overdueDeals.length)} overdue deals · ${formatCurrency(overdueUnorderedValue)} unordered · ${formatCurrency(overdueOrderedValue)} ordered. Overdue means an open deal's expected close date is before the dataset as-of date.`}
        rows={overdueDeals}
        columns={[
          { label: "Branch", render: (row) => row.lead.branchName },
          { label: "Customer", render: (row) => row.lead.customerName },
          { label: "Representative", render: (row) => row.lead.repName },
          { label: "Latest status", render: (row) => row.lead.status.replaceAll("_", " ") },
          {
            label: "Expected close date",
            tooltip: "Expected close date from the supplied dealership data. The deal is overdue if this date is before the dataset as-of date and the deal remains open.",
            render: (row) => row.lead.expectedCloseAt === null ? "—" : toDay(row.lead.expectedCloseAt),
          },
          {
            label: "Days overdue",
            align: "right",
            tooltip: "Whole UTC calendar days since the expected close date.",
            render: (row) => formatNumber(row.daysOverdue),
          },
          { label: "Last activity", render: (row) => toDay(row.lead.lastActivityAt) },
          { label: "Deal value", align: "right", render: (row) => formatCurrency(row.lead.dealValue) },
        ]}
        rowKey={(row) => row.lead.id}
        rowHref={(row) => buildHref("/leads", query, { leadIds: row.lead.id })}
        sortable
        initialSort={{ column: "Days overdue", direction: "desc" }}
        emptyMessage="No open deals are past their expected close date in this selection."
      />
    </PageContainer>
  );
}

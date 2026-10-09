"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ORDER_STAGE, PRE_ORDER_STAGES, THRESHOLDS } from "../lib/config.ts";
import type { Stage } from "../lib/config.ts";
import { toDay } from "../lib/dates.ts";
import { formatCurrency, formatNumber, formatPercent } from "../lib/format.ts";
import { filterLeads } from "../lib/metrics/filters.ts";
import { filterOpenLeads } from "../lib/metrics/open-leads.ts";
import { stageConversion } from "../lib/metrics/stage-progression.ts";
import { EMPTY_FILTERS, type FilterState, type Lead } from "../lib/types.ts";
import { DealProgressionSection } from "./deal-progression-section.tsx";
import { useDataset } from "./dataset-provider.tsx";
import { Card, PageContainer, PageHeader } from "./shared-ui.tsx";

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
    () => filterOpenLeads(dataset, filters).filter((lead) =>
      (PRE_ORDER_STAGES as readonly string[]).includes(lead.status) ||
      (lead.status === ORDER_STAGE && lead.delivery === null)),
    [dataset, filters],
  );
  const view = useMemo(() => {
    const liveDeals = openLeads.filter((lead) =>
      (PRE_ORDER_STAGES as readonly string[]).includes(lead.status));
    const awaiting = openLeads.filter((lead) =>
      lead.status === ORDER_STAGE && lead.delivery === null);
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
    const weakestStep = bookingRate === null && closingRate === null
      ? "no measurable step"
      : bookingRate === null || (closingRate !== null && closingRate < bookingRate)
        ? `Negotiation → Order at ${rateText(closingRate)}`
        : `Contacted → Test drive at ${rateText(bookingRate)}`;
    const totalInProgress = liveDeals.length + awaiting.length;
    const totalInProgressValue = [...liveDeals, ...awaiting]
      .reduce((sum, lead) => sum + lead.dealValue, 0);
    return {
      liveDeals,
      awaiting,
      bookingRate,
      closingRate,
      branches,
      weakestBooking,
      weakestClosing,
      weakestStep,
      totalInProgress,
      totalInProgressValue,
    };
  }, [dataset, filters, openLeads, scopedLeads]);
  const summary = `${formatNumber(view.totalInProgress)} deals worth ${formatCurrency(view.totalInProgressValue)} are in progress. The weakest step between test drive and order is ${view.weakestStep}.`;
  return (
    <PageContainer className="deals-page">
      <PageHeader
        eyebrow="Deals in progress"
        title="Deals in progress"
        tagline="Are interested customers turning into orders?"
        className="section-page-header"
      >
        <p className="section-verdict">{summary}</p>
      </PageHeader>
      <DealProgressionSection dataset={dataset} filters={filters} query={query} />
      <Card className="deals-by-branch" aria-label="Deal conversion by branch">
        <header className="card-header">
          <div className="card-header-copy">
            <h2>By branch</h2>
            <p>Compare booking after contact and order closing after negotiation.</p>
          </div>
        </header>
        <div className="premium-table-scroll">
          <table className="premium-table deals-branch-table">
            <thead>
              <tr>
                <th scope="col">Branch</th>
                <th scope="col" className="is-numeric">Test-drive booking rate</th>
                <th scope="col" className="is-numeric">Negotiation closing rate</th>
              </tr>
            </thead>
            <tbody>
              {view.branches.map((row) => (
                <tr
                  key={row.branchId}
                  className={row.branchId === view.weakestBooking?.branchId ||
                    row.branchId === view.weakestClosing?.branchId ? "is-highlighted" : undefined}
                >
                  <th scope="row">{row.branchName}</th>
                  <td className="is-numeric">
                    {rateText(row.bookingRate)}
                    {row.branchId === view.weakestBooking?.branchId &&
                      <span className="branch-lowest-chip">Weakest</span>}
                    {row.bookingCount < THRESHOLDS.minLeadsForStageRate &&
                      <span className="branch-small-sample-chip">
                        Small sample · {formatNumber(row.bookingCount)}
                      </span>}
                  </td>
                  <td className="is-numeric">
                    {rateText(row.closingRate)}
                    {row.branchId === view.weakestClosing?.branchId &&
                      <span className="branch-lowest-chip">Weakest</span>}
                    {row.closingCount < THRESHOLDS.minLeadsForStageRate &&
                      <span className="branch-small-sample-chip">
                        Small sample · {formatNumber(row.closingCount)}
                      </span>}
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
    </PageContainer>
  );
}

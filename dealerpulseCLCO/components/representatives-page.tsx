"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EMPTY_FILTERS } from "../lib/types.ts";
import type { FilterState } from "../lib/types.ts";
import { formatNumber } from "../lib/format.ts";
import { periodLabel } from "../lib/period.ts";
import { LAST_CONTACT_BUCKETS, lastContactByRepresentative } from "../lib/metrics/last-contact.ts";
import { actNowInsights } from "../lib/metrics/insights.ts";
import { useDataset } from "./dataset-provider.tsx";
import { InsightStrip } from "./insight-strip.tsx";
import { PageContainer, PageHeader, PremiumTable } from "./shared-ui.tsx";

function dayStart(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function withStatus(params: URLSearchParams, value: string): string {
  if (value === "all") params.delete("status");
  else params.set("status", value);
  return params.toString();
}

export function RepresentativesPage() {
  const { dataset } = useDataset();
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const statuses = useMemo(() => [...new Set(dataset.leads.map((lead) => lead.status))].sort(), [dataset.leads]);
  const requestedStatus = params.get("status");
  const status = requestedStatus && statuses.includes(requestedStatus) ? requestedStatus : "all";
  const start = dayStart(params.get("from"));
  const end = dayStart(params.get("to"));
  const filters = useMemo<FilterState>(() => ({
    ...EMPTY_FILTERS,
    from: start,
    to: end === null ? null : end + 86_400_000 - 1,
    branch: params.get("branch"),
    source: params.get("source"),
    model: params.get("model"),
    timeBasis: params.get("basis") === "event" ? "event" : "created",
  }), [params, start, end]);
  const paramsWithoutTeamFilters = new URLSearchParams(params.toString());
  paramsWithoutTeamFilters.delete("status");
  const period = periodLabel(dataset, filters);
  const view = useMemo(
    () => lastContactByRepresentative(dataset, filters, status === "all" ? null : status),
    [dataset, filters, status],
  );
  const teamInsights = useMemo(
    () => actNowInsights(dataset, filters).filter((insight) => insight.id === "cold-preorder-leads").slice(0, 3),
    [dataset, filters],
  );
  const rows = view.reps
    .filter((rep) => rep.totalCount > 0)
    .map((rep) => ({
      ...rep,
      staleCount: rep.counts["over-20"],
      watchCount: rep.counts["13-20"],
    }))
    .sort((a, b) => b.staleCount - a.staleCount || b.totalCount - a.totalCount);
  const staleTotal = rows.reduce((sum, rep) => sum + rep.staleCount, 0);
  const branchScope = filters.branch
    ? dataset.branchById[filters.branch]?.name ?? filters.branch
    : "all branches";

  function rowHref(repId: string): string {
    const next = new URLSearchParams(params.toString());
    next.set("rep", repId);
    return `/leads?${next.toString()}`;
  }

  return (
    <PageContainer className="representatives-page section-page">
      <PageHeader eyebrow="Team" title="Who needs coaching?" className="section-page-header">
        <p className="section-verdict">
          {formatNumber(view.totalCount)} assigned leads across {branchScope}; {formatNumber(staleTotal)} have gone more than {LAST_CONTACT_BUCKETS.at(-1)?.min} days without activity.
        </p>
        <p className="section-period">{period} · {status === "all" ? "All lead statuses" : status.replaceAll("_", " ")}</p>
      </PageHeader>

      <InsightStrip
        insights={teamInsights}
        query={params.toString()}
        emptyMessage="No stale pre-order leads match the current filters."
      />

      <section className="representative-filters" aria-label="Team filters">
        <label>
          <span>Lead status</span>
          <select
            aria-label="Lead status"
            value={status}
            onChange={(event) => {
              const query = withStatus(new URLSearchParams(params.toString()), event.target.value);
              router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
            }}
          >
            <option value="all">All statuses</option>
            {statuses.map((item) => (
              <option key={item} value={item}>{item.replaceAll("_", " ")}</option>
            ))}
          </select>
        </label>
        <Link className="insight-link" href={paramsWithoutTeamFilters.size ? `/?${paramsWithoutTeamFilters}` : "/"}>
          View overview
        </Link>
      </section>

      <PremiumTable
        title="Representative follow-up"
        takeaway="Sorted by the number of leads idle for more than 20 days. Select a row to review assigned leads."
        rows={rows}
        rowKey={(row) => row.repId}
        rowHref={(row) => rowHref(row.repId)}
        emptyMessage="No assigned leads match these filters. Reset filters to see all representatives."
        emptyAction={{ label: "Reset filters", href: "/team" }}
        columns={[
          { label: "Representative", render: (row) => row.repName },
          { label: "Branch", render: (row) => row.branchName },
          { label: "Assigned leads", align: "right", render: (row) => formatNumber(row.totalCount) },
          {
            label: "Idle 13–20 days",
            align: "right",
            render: (row) => formatNumber(row.watchCount),
          },
          {
            label: "Idle over 20 days",
            align: "right",
            render: (row) => (
              <span className="table-bar-value">
                <span className="table-inline-bar" aria-hidden="true">
                  <span style={{ width: `${row.totalCount ? row.staleCount / row.totalCount * 100 : 0}%` }} />
                </span>
                {formatNumber(row.staleCount)}
              </span>
            ),
          },
        ]}
      />
    </PageContainer>
  );
}

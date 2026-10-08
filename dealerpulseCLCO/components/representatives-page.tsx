"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DELIVERED_STAGE, LOST, PRE_ORDER_STAGES } from "../lib/config.ts";
import { toDay } from "../lib/dates.ts";
import { formatCurrency, formatNumber, formatPercent } from "../lib/format.ts";
import { branchDetailData } from "../lib/metrics/branch-detail.ts";
import { filterLeads } from "../lib/metrics/filters.ts";
import { actNowInsights } from "../lib/metrics/insights.ts";
import { LAST_CONTACT_BUCKETS } from "../lib/metrics/last-contact.ts";
import { median, ratio } from "../lib/metrics/stats.ts";
import { EMPTY_FILTERS, type FilterState, type Lead, type Rep } from "../lib/types.ts";
import { useDataset } from "./dataset-provider.tsx";
import { InsightStrip } from "./insight-strip.tsx";
import { Card, CardHeader, PageContainer, PageHeader, PremiumTable } from "./shared-ui.tsx";

const DAY = 86_400_000;
const STALE_DAYS = LAST_CONTACT_BUCKETS[4].min - 1;

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
    to: end === null ? null : end + DAY - 1,
    branch: params.get("branch"),
    rep: params.get("rep"),
    source: params.get("source"),
    model: params.get("model"),
    timeBasis: params.get("basis") === "event" ? "event" : "created",
  };
}

function inRange(timestamp: number | null, filters: FilterState): boolean {
  return timestamp !== null &&
    (filters.from === null || timestamp >= filters.from) &&
    (filters.to === null || timestamp <= filters.to);
}

function closeTimestamp(lead: Lead): number | null {
  if (lead.status === DELIVERED_STAGE) return lead.delivery?.deliveredAt ?? null;
  if (lead.status === LOST) return lead.history.filter((event) => event.status === LOST).at(-1)?.ts ?? null;
  return null;
}

function matchesClosePeriod(lead: Lead, filters: FilterState): boolean {
  return filters.timeBasis !== "event" || inRange(closeTimestamp(lead), filters);
}

function isManager(rep: Rep): boolean {
  return rep.role.toLowerCase().includes("manager");
}

function openAndStale(lead: Lead, asOf: number, filters: FilterState): boolean {
  const isOpen = (PRE_ORDER_STAGES as readonly string[]).includes(lead.status);
  const eventMatches = filters.timeBasis !== "event" || inRange(lead.lastActivityAt, filters);
  return isOpen && eventMatches && Math.floor((asOf - lead.lastActivityAt) / DAY) > STALE_DAYS;
}

export function RepresentativesPage() {
  const { dataset } = useDataset();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const filters = useMemo(
    () => filtersFromParams(new URLSearchParams(query)),
    [query],
  );
  const view = useMemo(() => {
    const leads = filterLeads(dataset, { ...filters, timeBasis: "created" });
    const rows = dataset.reps.map((rep) => {
      const assigned = leads.filter((lead) => lead.repId === rep.id);
      const closed = assigned.filter((lead) =>
        (lead.status === DELIVERED_STAGE || lead.status === LOST) &&
        matchesClosePeriod(lead, filters));
      const delivered = closed.filter((lead) => lead.status === DELIVERED_STAGE);
      const staleCount = assigned.filter((lead) => openAndStale(lead, dataset.asOf, filters)).length;
      return {
        rep,
        repId: rep.id,
        repName: rep.name,
        branchId: rep.branchId,
        branchName: dataset.branchById[rep.branchId]?.name ?? rep.branchId,
        leadCount: assigned.length,
        winRate: ratio(delivered.length, closed.length),
        revenue: delivered.reduce((sum, lead) => sum + lead.dealValue, 0),
        staleCount,
      };
    });
    const leaderboard = rows.filter((row) => row.leadCount > 0)
      .sort((a, b) => b.staleCount - a.staleCount ||
        (a.winRate ?? Number.POSITIVE_INFINITY) - (b.winRate ?? Number.POSITIVE_INFINITY) ||
        b.leadCount - a.leadCount || a.repName.localeCompare(b.repName));
    const benchmark = median(leaderboard.map((row) => row.winRate)
      .filter((value): value is number => value !== null));
    const coaching = benchmark === null ? [] : leaderboard
      .filter((row) => row.winRate !== null && row.winRate < benchmark)
      .sort((a, b) => a.winRate! - b.winRate! || b.staleCount - a.staleCount);
    const managers = rows.filter((row) => isManager(row.rep) && row.leadCount === 0)
      .map((row) => {
        const branchLeads = leads.filter((lead) => lead.branchId === row.branchId);
        const closed = branchLeads.filter((lead) =>
          (lead.status === DELIVERED_STAGE || lead.status === LOST) &&
          matchesClosePeriod(lead, filters));
        const delivered = closed.filter((lead) => lead.status === DELIVERED_STAGE);
        const detail = branchDetailData(dataset, row.branchId, filters);
        return {
          ...row,
          winRate: ratio(delivered.length, closed.length),
          revenue: delivered.reduce((sum, lead) => sum + lead.dealValue, 0),
          staleCount: branchLeads.filter((lead) => openAndStale(lead, dataset.asOf, filters)).length,
          leadsPerRep: detail?.stats.workload ?? null,
        };
      })
      .sort((a, b) => a.branchName.localeCompare(b.branchName) || a.repName.localeCompare(b.repName));
    const openStaleCount = leads.filter((lead) => openAndStale(lead, dataset.asOf, filters)).length;
    const rankedLeaderboard = leaderboard.map((row, index) => ({ ...row, rank: index + 1 }));
    return { leads, leaderboard: rankedLeaderboard, benchmark, coaching, managers, openStaleCount };
  }, [dataset, filters]);
  const insights = useMemo(
    () => actNowInsights(dataset, filters).filter((insight) => insight.id === "cold-preorder-leads").slice(0, 3),
    [dataset, filters],
  );
  const queryString = query ? `?${query}` : "";

  function leadHref(repId: string): string {
    const params = new URLSearchParams(query);
    params.set("rep", repId);
    return `/leads?${params.toString()}`;
  }

  return (
    <PageContainer className="section-page representatives-page">
      <PageHeader eyebrow="Team" title="Who needs coaching?" className="section-page-header">
        <p className="section-verdict">
          {formatNumber(view.leaderboard.length)} reps with assigned leads handle {formatNumber(view.leads.length)} leads;
          {" "}{formatNumber(view.openStaleCount)} open leads have been idle for more than {STALE_DAYS} days.
        </p>
        <p className="section-question">
          Win rate uses closed leads only. Reps without leads are excluded from rankings; managers with no assigned leads are shown with their branch results below.
        </p>
      </PageHeader>

      <InsightStrip
        insights={insights}
        query={query}
        title="What to do"
        emptyMessage="No stale pre-order lead action matches the current filters."
      />

      <PremiumTable
        title="Rep leaderboard"
        takeaway={view.benchmark === null
          ? "Ranked by open stale leads, then win rate; no closed rep results are available for a peer benchmark."
          : `Ranked by open stale leads, then win rate. The peer median closed win rate is ${formatPercent(view.benchmark)}.`}
        rows={view.leaderboard}
        rowKey={(row) => row.repId}
        rowHref={(row) => leadHref(row.repId)}
        emptyMessage="No reps have assigned leads in this scope. Reset filters to see the full team."
        emptyAction={{ label: "Reset filters", href: "/team" }}
        columns={[
          { label: "Rank", align: "right", render: (row) => formatNumber(row.rank) },
          { label: "Representative", render: (row) => row.repName },
          { label: "Branch", render: (row) => row.branchName },
          { label: "Win rate", align: "right", render: (row) => row.winRate === null ? "—" : formatPercent(row.winRate) },
          { label: "Revenue", align: "right", render: (row) => formatCurrency(row.revenue) },
          {
            label: "Open stale leads",
            align: "right",
            render: (row) => (
              <span className="table-bar-value">
                <span className="table-inline-bar" aria-hidden="true">
                  <span style={{ width: `${row.leadCount ? row.staleCount / row.leadCount * 100 : 0}%` }} />
                </span>
                {formatNumber(row.staleCount)}
              </span>
            ),
          },
          { label: "Leads per rep", align: "right", render: (row) => formatNumber(row.leadCount) },
        ]}
      />

      <Card className="team-coaching-card">
        <CardHeader
          title="Coaching below the peer benchmark"
          takeaway={view.benchmark === null
            ? "A peer benchmark needs at least one rep with closed results."
            : `The current peer benchmark is ${formatPercent(view.benchmark)}; only reps with a measured rate below it are listed.`}
        />
        {view.coaching.length ? (
          <ul className="branch-comparison-list">
            {view.coaching.map((row) => (
              <li key={row.repId}>
                <strong>{row.repName}</strong> at {row.branchName} is at {formatPercent(row.winRate!)} versus the {formatPercent(view.benchmark!)} peer median;
                {" "}{formatNumber(row.staleCount)} open stale leads need review.{" "}
                <Link href={leadHref(row.repId)}>Review this rep&apos;s leads</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {view.benchmark === null
              ? "No peer comparison is available for this scope."
              : "No rep with closed results is below the current peer benchmark."}
          </p>
        )}
      </Card>

      <PremiumTable
        title="Branch managers"
        takeaway="Managers without assigned leads are not ranked; these figures describe their branch, not a personal win rate."
        rows={view.managers}
        rowKey={(row) => row.repId}
        rowHref={(row) => `/branch/${encodeURIComponent(row.branchId)}${queryString}`}
        emptyMessage="Every manager in this scope has assigned leads and is included in the rep leaderboard."
        columns={[
          { label: "Manager", render: (row) => row.repName },
          { label: "Branch", render: (row) => row.branchName },
          { label: "Branch win rate", align: "right", render: (row) => row.winRate === null ? "—" : formatPercent(row.winRate) },
          { label: "Branch revenue", align: "right", render: (row) => formatCurrency(row.revenue) },
          { label: "Open stale leads", align: "right", render: (row) => formatNumber(row.staleCount) },
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

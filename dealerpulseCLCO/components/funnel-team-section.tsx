"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DELIVERED_STAGE, FUNNEL_BUCKET_TABLE, LOST, ORDER_STAGE, PRE_ORDER_STAGES, THRESHOLDS } from "../lib/config.ts";
import { buildHref } from "../lib/navigation.ts";
import { overdueOpen } from "../lib/metrics/delivery.ts";
import { formatCurrency, formatNumber, formatPercent, formatSourceName } from "../lib/format.ts";
import { filterLeads } from "../lib/metrics/filters.ts";
import { filterOpenLeads, OPEN_LEAD_AGE_BUCKETS, type OpenLeadAgeBucketKey } from "../lib/metrics/open-leads.ts";
import { median, ratio } from "../lib/metrics/stats.ts";
import type { Dataset, FilterState, Lead, Rep } from "../lib/types.ts";
import { Card, CardHeader, CompactMultiSelect, PremiumTable, Tag } from "./shared-ui.tsx";

const DAY = 86_400_000;
type SortKey = "liveValue" | "liveCount" | "branch";

interface SourceCount {
  source: string;
  count: number;
}

interface CountTag {
  label: string;
  count: number;
}

interface CombinedRow {
  branchId: string;
  branch: string;
  manager: string;
  liveDeals: Lead[];
  liveValue: number;
  awaitingCount: number;
  awaitingValue: number;
  sources: SourceCount[];
  stages: CountTag[];
  inactiveCount: number;
  overdueCount: number;
}

function isManager(rep: Rep): boolean {
  return rep.role.toLowerCase().includes("manager");
}

function matchesClosePeriod(lead: Lead, filters: FilterState): boolean {
  if (filters.timeBasis !== "event") return true;
  const closeAt = lead.status === DELIVERED_STAGE
    ? lead.delivery?.deliveredAt ?? null
    : lead.status === LOST
      ? lead.history.filter((event) => event.status === LOST).at(-1)?.ts ?? null
      : null;
  return closeAt !== null &&
    (filters.from === null || closeAt >= filters.from) &&
    (filters.to === null || closeAt <= filters.to);
}

function ageBucketKey(lead: Lead, asOf: number): OpenLeadAgeBucketKey | null {
  const days = Math.floor((asOf - lead.lastActivityAt) / DAY);
  return OPEN_LEAD_AGE_BUCKETS.find((bucket) => days >= bucket.min && days <= bucket.max)?.key ?? null;
}

function compareRows(a: CombinedRow, b: CombinedRow, sortBy: SortKey): number {
  if (sortBy === "liveValue") return b.liveValue - a.liveValue || a.branch.localeCompare(b.branch);
  if (sortBy === "liveCount") return b.liveDeals.length - a.liveDeals.length || a.branch.localeCompare(b.branch);
  return a.branch.localeCompare(b.branch);
}

function leadHref(query: string, repId: string): string {
  return buildHref("/leads", query, { rep: repId });
}

const stageLabel = (stage: string) => {
  const text = stage.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** Largest first, up to `maxTags` tags, then "+n"; the tooltip lists every entry. */
function CountTags({ items }: { items: CountTag[] }) {
  if (!items.length) return <span className="cell-muted">—</span>;
  const shown = items.slice(0, FUNNEL_BUCKET_TABLE.maxTags);
  const hidden = items.length - shown.length;
  const all = items.map((item) => `${item.label} ${formatNumber(item.count)}`).join(" · ");
  return (
    <span className="cell-tags" title={all}>
      {shown.map((item) => <Tag key={item.label}>{item.label} {formatNumber(item.count)}</Tag>)}
      {hidden > 0 && <Tag>+{hidden}</Tag>}
    </span>
  );
}

function DealValue({ value, count }: { value: number; count: number }) {
  return (
    <span className="deal-value">
      <strong>{formatCurrency(value)}</strong>
      <Tag>{formatNumber(count)}</Tag>
    </span>
  );
}

export function FunnelTeamSection({
  dataset,
  filters,
  query,
}: {
  dataset: Dataset;
  filters: FilterState;
  query: string;
}) {
  const [selectedAgeBuckets, setSelectedAgeBuckets] = useState<OpenLeadAgeBucketKey[]>(
    () => OPEN_LEAD_AGE_BUCKETS.map((bucket) => bucket.key),
  );
  const [selectedOpenStatus, setSelectedOpenStatus] = useState("");
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("liveValue");

  const view = useMemo(() => {
    const leads = filterLeads(dataset, { ...filters, timeBasis: "created" });
    const allOpenLeads = filterOpenLeads(dataset, filters).filter((lead) =>
      (PRE_ORDER_STAGES as readonly string[]).includes(lead.status) ||
      (lead.status === ORDER_STAGE && lead.delivery === null));
    const openLeads = allOpenLeads.filter((lead) =>
      (!selectedOpenStatus || lead.status === selectedOpenStatus) &&
      (!selectedSources.length || selectedSources.includes(lead.source)) &&
      selectedAgeBuckets.includes(ageBucketKey(lead, dataset.asOf) as OpenLeadAgeBucketKey));
    const repRows = dataset.reps.map((rep) => {
      const assigned = leads.filter((lead) => lead.repId === rep.id);
      const closed = assigned.filter((lead) =>
        (lead.status === DELIVERED_STAGE || lead.status === LOST) && matchesClosePeriod(lead, filters));
      const delivered = closed.filter((lead) => lead.status === DELIVERED_STAGE);
      return {
        rep,
        repId: rep.id,
        repName: rep.name,
        branchId: rep.branchId,
        branchName: dataset.branchById[rep.branchId]?.name ?? rep.branchId,
        leadCount: assigned.length,
        winRate: ratio(delivered.length, closed.length),
        revenue: delivered.reduce((sum, lead) => sum + lead.dealValue, 0),
        openCount: allOpenLeads.filter((lead) => lead.repId === rep.id).length,
        inactiveCount: allOpenLeads.filter((lead) =>
          lead.repId === rep.id &&
          (lead.status === ORDER_STAGE
            ? Math.floor((dataset.asOf - lead.lastActivityAt) / DAY) > THRESHOLDS.staleOrderDays
            : Math.floor((dataset.asOf - lead.lastActivityAt) / DAY) > THRESHOLDS.coldLeadDays)).length,
        overdueCount: overdueOpen(allOpenLeads, dataset.asOf)
          .filter((lead) => lead.repId === rep.id).length,
      };
    });
    const leaderboard = repRows.filter((row) => row.leadCount > 0 && !isManager(row.rep))
      .sort((a, b) => b.openCount - a.openCount ||
        (a.winRate ?? Number.POSITIVE_INFINITY) - (b.winRate ?? Number.POSITIVE_INFINITY) ||
        b.leadCount - a.leadCount || a.repName.localeCompare(b.repName))
      .map((row, index) => ({ ...row, rank: index + 1 }));
    const benchmark = median(leaderboard.map((row) => row.winRate)
      .filter((value): value is number => value !== null));
    const coaching = benchmark === null ? [] : leaderboard
      .filter((row) => row.winRate !== null && row.winRate < benchmark)
      .sort((a, b) => a.winRate! - b.winRate! || b.openCount - a.openCount);

    const visibleBranches = dataset.branches.filter((branch) => !filters.branch || branch.id === filters.branch);
    const combinedRows = visibleBranches.map((branch): CombinedRow => {
      const branchOpen = openLeads.filter((lead) => lead.branchId === branch.id);
      const liveDeals = branchOpen.filter((lead) =>
        (PRE_ORDER_STAGES as readonly string[]).includes(lead.status));
      const awaiting = branchOpen.filter((lead) =>
        lead.status === ORDER_STAGE && lead.delivery === null);
      const stages = PRE_ORDER_STAGES
        .map((stage) => ({ label: stageLabel(stage), count: liveDeals.filter((lead) => lead.status === stage).length }))
        .filter((item) => item.count > 0)
        .sort((a, b) => b.count - a.count);
      const sources = [...liveDeals.reduce((counts, lead) => {
        counts.set(lead.source, (counts.get(lead.source) ?? 0) + 1);
        return counts;
      }, new Map<string, number>())]
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
      const managers = dataset.reps
        .filter((rep) => rep.branchId === branch.id && isManager(rep))
        .map((rep) => rep.name);
      return {
        branchId: branch.id,
        branch: branch.name,
        manager: managers.length ? managers.join(", ") : "—",
        liveDeals,
        liveValue: liveDeals.reduce((sum, lead) => sum + lead.dealValue, 0),
        awaitingCount: awaiting.length,
        awaitingValue: awaiting.reduce((sum, lead) => sum + lead.dealValue, 0),
        sources,
        stages,
        inactiveCount: branchOpen.filter((lead) =>
          lead.status === ORDER_STAGE
            ? Math.floor((dataset.asOf - lead.lastActivityAt) / DAY) > THRESHOLDS.staleOrderDays
            : Math.floor((dataset.asOf - lead.lastActivityAt) / DAY) > THRESHOLDS.coldLeadDays).length,
        overdueCount: overdueOpen(branchOpen, dataset.asOf).length,
      };
    }).sort((a, b) => compareRows(a, b, sortBy));
    const totals = combinedRows.reduce((sum, row) => ({
      liveCount: sum.liveCount + row.liveDeals.length,
      liveValue: sum.liveValue + row.liveValue,
      awaitingCount: sum.awaitingCount + row.awaitingCount,
      awaitingValue: sum.awaitingValue + row.awaitingValue,
      inactiveCount: sum.inactiveCount + row.inactiveCount,
      overdueCount: sum.overdueCount + row.overdueCount,
    }), { liveCount: 0, liveValue: 0, awaitingCount: 0, awaitingValue: 0, inactiveCount: 0, overdueCount: 0 });
    const noPipelineBranches = combinedRows.filter((row) => row.liveDeals.length === 0)
      .map((row) => row.branch);
    return {
      leaderboard,
      benchmark,
      coaching,
      combinedRows,
      totals,
      noPipelineBranches,
    };
  }, [dataset, filters, selectedAgeBuckets, selectedOpenStatus, selectedSources, sortBy]);
  const takeaway = `Unordered deal value ${formatCurrency(view.totals.liveValue)} across ${formatNumber(view.totals.liveCount)} customers; ordered deal value ${formatCurrency(view.totals.awaitingValue)} across ${formatNumber(view.totals.awaitingCount)}. ${view.noPipelineBranches.length
    ? `No unordered deals left: ${view.noPipelineBranches.join(", ")}.`
    : "Every branch still has unordered deals."}`;
  const sourceOptions = dataset.sources.map((source) => ({
    value: source,
    label: formatSourceName(source),
  }));
  const ageOptions = OPEN_LEAD_AGE_BUCKETS.map((bucket) => ({
    value: bucket.key,
    label: bucket.label,
  }));
  const liveStatusOptions = PRE_ORDER_STAGES.map((status) => ({
    value: status,
    label: status.replaceAll("_", " "),
  }));
  const bucketFilters = (
    <div className="representative-filters funnel-bucket-filters">
      <CompactMultiSelect
        label="Idle days"
        options={ageOptions}
        selected={selectedAgeBuckets}
        onChange={(values) => setSelectedAgeBuckets(values as OpenLeadAgeBucketKey[])}
      />
      <label>
        <span>Stage</span>
        <select
          aria-label="Pipeline stage filter"
          value={selectedOpenStatus}
          onChange={(event) => setSelectedOpenStatus(event.target.value)}
        >
          <option value="">All stages</option>
          {[...PRE_ORDER_STAGES, ORDER_STAGE].map((status) => (
            <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
          ))}
        </select>
      </label>
      <CompactMultiSelect
        label="Source"
        options={sourceOptions}
        selected={selectedSources}
        onChange={setSelectedSources}
      />
      <label>
        <span>Sort by</span>
        <select
          aria-label="Sort pipeline by"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as SortKey)}
        >
          <option value="liveValue">Unordered deal value</option>
          <option value="liveCount">Unordered deal count</option>
          <option value="branch">Branch</option>
        </select>
      </label>
    </div>
  );

  const totalsRow = [
    "Total",
    "",
    `${formatCurrency(view.totals.liveValue)} · ${formatNumber(view.totals.liveCount)}`,
    `${formatCurrency(view.totals.awaitingValue)} · ${formatNumber(view.totals.awaitingCount)}`,
    "",
    "",
    view.totals.inactiveCount ? `${formatNumber(view.totals.inactiveCount)} inactive` : "—",
    view.totals.overdueCount ? `${formatNumber(view.totals.overdueCount)} overdue` : "—",
  ];

  return (
    <>
      <PremiumTable
        className="wide-lead-bucket-table"
        title="Find your biggest lead bucket"
        takeaway={takeaway}
        singleLineTakeaway
        stickyFirstColumn
        toolbar={bucketFilters}
        rows={view.combinedRows}
        rowKey={(row) => row.branchId}
        totalsRow={totalsRow}
        footer={
          <p className="funnel-table-definition">
            <strong>Inactive:</strong> open pre-order leads with no activity for more than {formatNumber(THRESHOLDS.coldLeadDays)} days, or undelivered orders with no activity for more than {formatNumber(THRESHOLDS.staleOrderDays)} days.
            {" "}<strong>Overdue:</strong> open leads whose expected close date is before the dataset&apos;s as-of date.
          </p>
        }
        emptyMessage="No branch results match the current filters."
        columns={[
          {
            label: "Branch",
            minWidth: FUNNEL_BUCKET_TABLE.minWidths.branch,
            render: (row) => (
              <span className="branch-cell">
                <Link href={buildHref(`/branch/${row.branchId}`, query, { branch: row.branchId })}>{row.branch}</Link>
                {row.liveDeals.length === 0 && <Tag tone="bad">{FUNNEL_BUCKET_TABLE.noUnorderedTag}</Tag>}
              </span>
            ),
          },
          {
            label: "Manager",
            minWidth: FUNNEL_BUCKET_TABLE.minWidths.manager,
            render: (row) => row.manager === "—" ? <span className="cell-muted">—</span> : <Tag>{row.manager}</Tag>,
          },
          {
            label: "Unordered deal value",
            align: "right",
            minWidth: FUNNEL_BUCKET_TABLE.minWidths.value,
            tooltip: FUNNEL_BUCKET_TABLE.tooltips.unordered,
            render: (row) => <DealValue value={row.liveValue} count={row.liveDeals.length} />,
          },
          {
            label: "Ordered deal value",
            align: "right",
            minWidth: FUNNEL_BUCKET_TABLE.minWidths.value,
            tooltip: FUNNEL_BUCKET_TABLE.tooltips.ordered,
            render: (row) => <DealValue value={row.awaitingValue} count={row.awaitingCount} />,
          },
          {
            label: "Stage",
            minWidth: FUNNEL_BUCKET_TABLE.minWidths.stage,
            render: (row) => <CountTags items={row.stages} />,
          },
          {
            label: "Sources",
            minWidth: FUNNEL_BUCKET_TABLE.minWidths.sources,
            render: (row) => (
              <CountTags items={row.sources.map((item) => ({ label: formatSourceName(item.source), count: item.count }))} />
            ),
          },
          {
            label: "Inactive",
            minWidth: FUNNEL_BUCKET_TABLE.minWidths.overdue,
            tooltip: FUNNEL_BUCKET_TABLE.tooltips.inactive
              .replace("{cold}", formatNumber(THRESHOLDS.coldLeadDays))
              .replace("{stale}", formatNumber(THRESHOLDS.staleOrderDays)),
            render: (row) => row.inactiveCount
              ? <Tag tone="warn">{formatNumber(row.inactiveCount)} inactive</Tag>
              : <span className="cell-muted">—</span>,
          },
          {
            label: "Overdue",
            minWidth: FUNNEL_BUCKET_TABLE.minWidths.overdue,
            tooltip: "Open leads whose expected close date is before the dataset as-of date.",
            render: (row) => row.overdueCount
              ? <Tag tone="warn">{formatNumber(row.overdueCount)} overdue</Tag>
              : <span className="cell-muted">—</span>,
          },
        ]}
      />

      <PremiumTable
        title="Rep leaderboard"
        takeaway={view.benchmark === null
          ? "Ranked by open leads, then closed win rate; no closed rep results are available for a peer benchmark."
          : `Ranked by open leads, then closed win rate. The peer median closed win rate is ${formatPercent(view.benchmark)}.`}
        rows={view.leaderboard}
        rowKey={(row) => row.repId}
        rowHref={(row) => leadHref(query, row.repId)}
        emptyMessage="No reps have assigned leads in this scope. Reset filters to see the full team."
        emptyAction={{
          label: "Reset filters",
          href: buildHref("/funnel", query, {
            from: null, to: null, range: null, branch: null, source: null, model: null, basis: null,
          }),
        }}
        columns={[
          { label: "Rank", align: "right", render: (row) => formatNumber(row.rank) },
          { label: "Representative", render: (row) => row.repName },
          { label: "Branch", render: (row) => row.branchName },
          { label: "Win rate", align: "right", render: (row) => row.winRate === null ? "—" : formatPercent(row.winRate) },
          { label: "Revenue", align: "right", render: (row) => formatCurrency(row.revenue) },
          { label: "Open leads", align: "right", render: (row) => formatNumber(row.openCount) },
          {
            label: "Inactive",
            align: "right",
            tooltip: FUNNEL_BUCKET_TABLE.tooltips.inactive
              .replace("{cold}", formatNumber(THRESHOLDS.coldLeadDays))
              .replace("{stale}", formatNumber(THRESHOLDS.staleOrderDays)),
            render: (row) => row.inactiveCount
              ? <Tag tone="warn">{formatNumber(row.inactiveCount)} inactive</Tag>
              : "—",
          },
          {
            label: "Overdue",
            align: "right",
            tooltip: "Open leads whose expected close date is before the dataset as-of date.",
            render: (row) => row.overdueCount ? <Tag tone="warn">{formatNumber(row.overdueCount)} overdue</Tag> : "—",
          },
          { label: "Assigned leads", align: "right", render: (row) => formatNumber(row.leadCount) },
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
                {" "}{formatNumber(row.openCount)} live deals need review.{" "}
                <Link href={leadHref(query, row.repId)}>Review this rep&apos;s leads</Link>
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
    </>
  );
}

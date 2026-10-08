"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { EChartsCoreOption, ECElementEvent } from "echarts/core";
import { EMPTY_FILTERS } from "../lib/types.ts";
import type { FilterState } from "../lib/types.ts";
import { periodLabel } from "../lib/period.ts";
import { LAST_CONTACT_BUCKETS, lastContactByRepresentative } from "../lib/metrics/last-contact.ts";
import type { LastContactBucketKey } from "../lib/metrics/last-contact.ts";
import { Chart } from "./chart.tsx";
import { useDataset } from "./dataset-provider.tsx";

const bucketColors = ["#4f91b2", "#55a885", "#e1aa47", "#d78252", "#bc625a"] as const;

function dayStart(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function updateQuery(
  router: ReturnType<typeof useRouter>,
  params: URLSearchParams,
  key: string,
  value: string,
) {
  const next = new URLSearchParams(params.toString());
  if (value) next.set(key, value);
  else next.delete(key);
  router.replace(`/representatives?${next.toString()}`, { scroll: false });
}

export function RepresentativesPage() {
  const { dataset } = useDataset();
  const params = useSearchParams();
  const router = useRouter();
  const statuses = useMemo(() => [...new Set(dataset.leads.map((lead) => lead.status))].sort(), [dataset.leads]);
  const requestedStatus = params.get("status");
  const status = requestedStatus && statuses.includes(requestedStatus) ? requestedStatus : "all";
  const requestedBucket = params.get("bucket");
  const selectedBucket = LAST_CONTACT_BUCKETS.some((bucket) => bucket.key === requestedBucket)
    ? requestedBucket as LastContactBucketKey
    : null;
  const filters = useMemo<FilterState>(() => ({
    ...EMPTY_FILTERS,
    from: dayStart(params.get("from")),
    to: dayStart(params.get("to")) === null ? null : dayStart(params.get("to"))! + 86_400_000 - 1,
    branch: params.get("branch"),
    source: params.get("source"),
    model: params.get("model"),
    timeBasis: params.get("basis") === "event" ? "event" : "created",
  }), [params]);
  const dashboardParams = new URLSearchParams(params.toString());
  dashboardParams.delete("status");
  dashboardParams.delete("bucket");
  dashboardParams.delete("stage");
  const view = useMemo(
    () => lastContactByRepresentative(dataset, filters, status === "all" ? null : status),
    [dataset, filters, status],
  );
  const [selectedBranch, setSelectedBranch] = useState<string | null>(filters.branch);

  const ageOption: EChartsCoreOption = {
    aria: { enabled: true },
    color: [bucketColors[0]],
    tooltip: { trigger: "axis", triggerOn: "mousemove|click", axisPointer: { type: "shadow" } },
    grid: { left: 58, right: 22, top: 18, bottom: 36 },
    xAxis: { type: "category", data: view.buckets.map((bucket) => bucket.label) },
    yAxis: { type: "value", name: "Leads", min: 0, minInterval: 1 },
    series: [{
      type: "bar",
      data: view.buckets.map((bucket) => ({
        value: bucket.count,
        itemStyle: { color: selectedBucket === bucket.key ? "#245f8b" : bucketColors[0] },
      })),
      barMaxWidth: 48,
      itemStyle: { borderRadius: [5, 5, 0, 0] },
    }],
  };

  const selectedBranchData = view.branches.find((branch) => branch.branchId === selectedBranch);
  const representativeRows = selectedBranch && selectedBranchData
    ? selectedBranchData.reps.map((rep) => ({
      ...rep,
      branchId: selectedBranch,
      branchName: selectedBranchData.branchName,
    }))
    : view.reps;
  const graphBuckets = selectedBucket
    ? LAST_CONTACT_BUCKETS.filter((bucket) => bucket.key === selectedBucket)
    : LAST_CONTACT_BUCKETS;
  const representativeOption: EChartsCoreOption = {
    aria: { enabled: true },
    color: graphBuckets.map((bucket) =>
      bucketColors[LAST_CONTACT_BUCKETS.findIndex((item) => item.key === bucket.key)] ?? bucketColors[0]),
    tooltip: { trigger: "axis", triggerOn: "mousemove|click", axisPointer: { type: "shadow" } },
    legend: { bottom: 0 },
    grid: { left: 178, right: 28, top: 20, bottom: 56 },
    xAxis: { type: "value", name: "Leads", min: 0, minInterval: 1 },
    yAxis: {
      type: "category",
      inverse: true,
      data: representativeRows.map((rep) => rep.repName),
      axisLabel: { width: 158, overflow: "truncate" },
    },
    series: graphBuckets.map((bucket) => ({
      name: bucket.label,
      type: "bar",
      stack: "last-contact-age",
      barMaxWidth: 24,
      data: representativeRows.map((rep) => rep.counts[bucket.key]),
    })),
  };

  function selectAgeBucket(event: ECElementEvent) {
    const bucket = view.buckets[event.dataIndex ?? -1];
    if (!bucket) return;
    updateQuery(router, new URLSearchParams(params.toString()), "bucket",
      selectedBucket === bucket.key ? "" : bucket.key);
  }

  function selectBranch(branchId: string) {
    setSelectedBranch((current) => current === branchId ? null : branchId);
    if (filters.branch) {
      updateQuery(router, new URLSearchParams(params.toString()), "branch", "");
    }
  }

  const selectedBranchName = dataset.branches.find((branch) => branch.id === selectedBranch)?.name;
  const selectedBucketLabel = LAST_CONTACT_BUCKETS.find((bucket) => bucket.key === selectedBucket)?.label;
  const period = periodLabel(dataset, filters);
  const branchScope = selectedBranchName ??
    dataset.branches.find((branch) => branch.id === filters.branch)?.name ?? "All branches";

  return (
    <main className="dashboard representatives-page">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">DEALERPULSE · REPRESENTATIVE PERFORMANCE</p>
          <h1>Last contacted customers</h1>
          <p className="as-of">
            Leads grouped by assigned representative and days since last activity
            {status !== "all" ? ` · ${status.replaceAll("_", " ")}` : ""}
            {` · ${period} · ${branchScope} · Last activity: ${selectedBucketLabel ?? "all days"}`}
          </p>
        </div>
        <Link className="insight-link" href={dashboardParams.size ? `/?${dashboardParams.toString()}` : "/"}>
          ← Dashboard
        </Link>
      </header>

      <section className="representative-filters" aria-label="Representative chart filters">
        <label>
          <span>Latest lead status</span>
          <select aria-label="Latest lead status" value={status}
            onChange={(event) => updateQuery(router, new URLSearchParams(params.toString()), "status",
              event.target.value === "all" ? "" : event.target.value)}>
            <option value="all">All statuses</option>
            {statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <p>
          {selectedBranchName
            ? `Showing ${selectedBranchName}. Select its pie again to compare everyone.`
            : "Select a branch pie to focus the representative comparison."}
        </p>
      </section>

      <section className="representative-age-panel chart-panel" aria-label="Leads by last activity age">
        <div className="chart-heading">
          <h3>Leads by days since last activity</h3>
          <p>Select a bar to focus branch composition and representative totals on that duration. Click it again to clear.</p>
          <small className="chart-period">{period}</small>
        </div>
        <Chart option={ageOption} ariaLabel="Bar chart of lead counts by days since last activity"
          empty={!view.buckets.some((bucket) => bucket.count > 0)}
          emptyMessage="No leads match the selected status and dashboard filters."
          onClick={selectAgeBucket} />
      </section>

      <section className="branch-composition-section" aria-label="Branch lead composition">
        <div className="representative-section-heading">
          <div>
            <p className="eyebrow">BRANCH COMPOSITION</p>
            <h2>Assigned leads by branch</h2>
            <p>Each pie shows the representative share of leads in the selected duration.</p>
            <small className="chart-period">
              {period} · {branchScope} · Last activity: {selectedBucketLabel ?? "all days"}
            </small>
          </div>
        </div>
        <div className="branch-pies-grid">
          {view.branches.map((branch) => {
            const rows = branch.reps.map((rep) => ({
              name: rep.repName,
              value: selectedBucket
                ? rep.counts[selectedBucket]
                : Object.values(rep.counts).reduce((sum, count) => sum + count, 0),
            })).filter((rep) => rep.value > 0);
            const option: EChartsCoreOption = {
              aria: { enabled: true },
              tooltip: { trigger: "item", formatter: "{b}: {c} leads ({d}%)" },
              series: [{
                type: "pie",
                radius: ["34%", "68%"],
                center: ["50%", "48%"],
                label: { show: true, formatter: "{b}: {c}", fontSize: 10 },
                data: rows,
              }],
            };
            const active = selectedBranch === branch.branchId;
            return (
              <article key={branch.branchId}
                className={`chart-panel branch-pie-panel${active ? " is-selected" : ""}`}>
                <button className="branch-pie-title" type="button" aria-pressed={active}
                  onClick={() => selectBranch(branch.branchId)}>
                  {branch.branchName}{active ? " · selected" : ""}
                </button>
                <Chart option={option} ariaLabel={`${branch.branchName} representative share of assigned leads`}
                  empty={!rows.length} emptyMessage="No leads in this duration and status."
                  onClick={() => selectBranch(branch.branchId)} />
              </article>
            );
          })}
        </div>
      </section>

      <section className="representative-graph-panel chart-panel" aria-label="Representative last activity comparison">
        <div className="chart-heading">
          <h3>Last contacted customers by representative</h3>
          <p>
            {selectedBranchName ? `${selectedBranchName} · ` : "All branches · "}
            stacked counts by time since last activity. Each lead is assigned to the representative in the source data.
          </p>
          <small className="chart-period">
            {period} · {branchScope} · Last activity: {selectedBucketLabel ?? "all days"}
          </small>
        </div>
        <Chart option={representativeOption}
          ariaLabel="Stacked horizontal bar chart of last activity age by representative"
          empty={!representativeRows.some((rep) => Object.values(rep.counts).some((count) => count > 0))}
          emptyMessage="No representatives have leads matching the selected status, duration, branch and filters." />
      </section>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import type { EChartsCoreOption } from "echarts/core";
import { AlertTriangle, ArrowDown, ArrowUp, Check, ChevronDown, CircleHelp } from "lucide-react";
import { DELIVERED_STAGE, ORDER_STAGE, THRESHOLDS } from "../lib/config.ts";
import { toMonth } from "../lib/dates.ts";
import { formatCurrency, formatNumber, formatPercent } from "../lib/format.ts";
import { medianDaysToDeliver } from "../lib/metrics/delivery.ts";
import { filterLeads, inRange } from "../lib/metrics/filters.ts";
import { EMPTY_FILTERS, type Dataset, type FilterState } from "../lib/types.ts";
import { ChartPanel } from "./chart-panel.tsx";
import { useChartTokens } from "./use-chart-tokens.ts";
import { useDataset } from "./dataset-provider.tsx";
import { Card, CardHeader, PageContainer, PremiumTable } from "./shared-ui.tsx";
import { RankListCard } from "./rank-list-card.tsx";
import { useSearchParams } from "next/navigation";

const DAY = 86_400_000;

function dayStart(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function filtersFromParams(params: URLSearchParams): FilterState {
  const start = dayStart(params.get("from"));
  const end = dayStart(params.get("to"));
  return {
    ...EMPTY_FILTERS,
    from: start,
    to: end === null ? null : end + DAY - 1,
    branch: params.get("branch"),
    source: params.get("source"),
    model: params.get("model"),
    timeBasis: params.get("basis") === "event" ? "event" : "created",
  };
}

function dimensionsMatch(filters: FilterState, lead: Dataset["leads"][number]): boolean {
  return (!filters.branch || lead.branchId === filters.branch) &&
    (!filters.source || lead.source === filters.source) &&
    (!filters.model || lead.model === filters.model);
}

function monthRangeMatches(month: string, filters: FilterState): boolean {
  return (filters.from === null || month >= toMonth(filters.from)) &&
    (filters.to === null || month <= toMonth(filters.to));
}

function monthEnd(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return Date.UTC(year!, monthNumber!, 0, 23, 59, 59, 999);
}

function targetRowsForScope(ds: Dataset, filters: FilterState) {
  return ds.targets.filter((target) =>
    (!filters.branch || target.branchId === filters.branch) && monthRangeMatches(target.month, filters));
}

function monthlyTargetRows(ds: Dataset, filters: FilterState) {
  return targetRowsForScope(ds, filters).map((target) => {
    const orders = ds.leads.filter((lead) => dimensionsMatch(filters, lead) &&
      lead.branchId === target.branchId &&
      lead.reached[ORDER_STAGE] !== null &&
      inRange(lead.reached[ORDER_STAGE]!, filters) &&
      toMonth(lead.reached[ORDER_STAGE]!) === target.month);
    const actualRevenue = orders.reduce((sum, lead) => sum + lead.dealValue, 0);
    return {
      branchId: target.branchId,
      branchName: ds.branchById[target.branchId]?.name ?? target.branchId,
      month: target.month,
      targetUnits: target.units,
      actualUnits: orders.length,
      targetRevenue: target.revenue,
      actualRevenue,
      pacing: target.revenue ? actualRevenue / target.revenue : null,
    };
  });
}

function cumulativeMeters(ds: Dataset, filters: FilterState) {
  const targets = targetRowsForScope(ds, filters);
  const targetUnits = targets.reduce((sum, row) => sum + row.units, 0);
  const targetRevenue = targets.reduce((sum, row) => sum + row.revenue, 0);
  const scopedLeads = ds.leads.filter((lead) => dimensionsMatch(filters, lead));
  const orders = scopedLeads.filter((lead) => lead.reached[ORDER_STAGE] !== null &&
    inRange(lead.reached[ORDER_STAGE]!, filters));
  const deliveries = scopedLeads.filter((lead) => lead.status === DELIVERED_STAGE &&
    lead.delivery !== null && inRange(lead.delivery.deliveredAt, filters));
  const bookedRevenue = orders.reduce((sum, lead) => sum + lead.dealValue, 0);
  const deliveredRevenue = deliveries.reduce((sum, lead) => sum + lead.dealValue, 0);
  return [
    {
      key: "orders",
      label: "Orders booked vs target units",
      actual: orders.length,
      target: targetUnits,
      currency: false,
      basis: "Orders counted when they reached order_placed, using the order date, divided by target units for the selected branch-months.",
    },
    {
      key: "booked-revenue",
      label: "Revenue booked vs target revenue",
      actual: bookedRevenue,
      target: targetRevenue,
      currency: true,
      basis: "Deal value for orders that reached order_placed within the selected date range, divided by target revenue for the selected branch-months.",
    },
    {
      key: "deliveries",
      label: "Cars delivered vs target units",
      actual: deliveries.length,
      target: targetUnits,
      currency: false,
      basis: "Cars counted by delivery date within the selected date range, divided by target units for the selected branch-months.",
    },
    {
      key: "delivered-revenue",
      label: "Revenue delivered vs target revenue",
      actual: deliveredRevenue,
      target: targetRevenue,
      currency: true,
      basis: "Deal value for delivered cars within the selected delivery-date range, divided by target revenue for the selected branch-months.",
    },
  ] as const;
}

function attainmentStatus(value: number | null): "risk" | "watch" | "progress" | "good" | "neutral" {
  if (value === null) return "neutral";
  if (value < THRESHOLDS.recalibrationPct) return "risk";
  if (value < THRESHOLDS.lowAttainmentPct) return "watch";
  if (value < 1) return "progress";
  return "good";
}

function TargetMeters({ meters }: { meters: ReturnType<typeof cumulativeMeters> }) {
  return (
    <section className="target-meter-grid" aria-label="Cumulative target meters">
      {meters.map((meter) => {
        const attainment = meter.target > 0 ? meter.actual / meter.target : null;
        const status = attainmentStatus(attainment);
        const value = (amount: number) => meter.currency ? formatCurrency(amount) : formatNumber(amount);
        const tooltip = [
          meter.basis,
          attainment !== null && attainment < THRESHOLDS.lowAttainmentPct
            ? "Targets look high relative to actual sales across all branches"
            : null,
        ].filter(Boolean).join("\n");
        const StatusIcon = status === "good" ? Check :
          status === "risk" || status === "watch" ? AlertTriangle : CircleHelp;
        return (
          <Card key={meter.key} className={`target-meter-card status-${status}`} title={tooltip}>
            <div className="target-meter-heading">
              <span className="card-label">{meter.label}</span>
              <StatusIcon className="target-meter-icon" aria-hidden="true" />
            </div>
            <div className="target-meter-values">
              <strong>{value(meter.actual)}</strong>
              <span>of {value(meter.target)}</span>
            </div>
            <div
              className="target-meter-track"
              role="progressbar"
              aria-label={`${meter.label} attainment`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.max(0, Math.min(100, (attainment ?? 0) * 100))}
            >
              <span style={{ width: `${Math.max(0, Math.min(100, (attainment ?? 0) * 100))}%` }} />
            </div>
            <p className="target-meter-context">
              <span>{attainment === null ? "— achieved" : `${formatPercent(attainment)} achieved`}</span>
              <span>Gap: {value(meter.target - meter.actual)}</span>
            </p>
          </Card>
        );
      })}
    </section>
  );
}

function buildTrend(ds: Dataset, filters: FilterState) {
  const leads = filterLeads(ds, { ...filters, timeBasis: "created" });
  const cycleDays = medianDaysToDeliver(leads);
  const months = [...new Set([
    ...ds.months.filter((month) => monthRangeMatches(month, filters)),
    ...leads.map((lead) => toMonth(lead.createdAt)),
  ])].filter((month) => monthRangeMatches(month, filters)).sort();
  const data = months.map((month) => {
    const cohort = leads.filter((lead) => toMonth(lead.createdAt) === month);
    const stillMaturing = cycleDays !== null && ds.asOf - monthEnd(month) < cycleDays * DAY;
    const orders = cohort.filter((lead) => lead.reached[ORDER_STAGE] !== null).length;
    return {
      month,
      leads: cohort.length,
      orders,
      deliveries: cohort.filter((lead) => lead.status === DELIVERED_STAGE && lead.delivery !== null).length,
      orderRate: cohort.length ? orders / cohort.length : null,
      stillMaturing,
    };
  });
  const matureCohorts = data.filter((row) => !row.stillMaturing && row.orderRate !== null);
  const bestCohort = matureCohorts.reduce<typeof matureCohorts[number] | null>((best, row) =>
    best === null || row.orderRate! > best.orderRate! ? row : best, null);
  const worstCohort = matureCohorts.reduce<typeof matureCohorts[number] | null>((worst, row) =>
    worst === null || row.orderRate! < worst.orderRate! ? row : worst, null);
  const formatMonth = (month: string) => new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00.000Z`));
  const takeaway = bestCohort && worstCohort
    ? `Among mature cohorts, ${formatMonth(bestCohort.month)} has the highest order rate (${formatPercent(bestCohort.orderRate!)}); ${formatMonth(worstCohort.month)} has the lowest (${formatPercent(worstCohort.orderRate!)}).`
    : "No mature lead cohorts are available to compare by order rate.";
  return { data, cycleDays, takeaway };
}

function branchProgressRows(rows: ReturnType<typeof monthlyTargetRows>) {
  const branches = new Map<string, {
    branchId: string;
    branchName: string;
    targetUnits: number;
    orders: number;
    targetRevenue: number;
    bookedRevenue: number;
  }>();
  for (const row of rows) {
    const branch = branches.get(row.branchId) ?? {
      branchId: row.branchId,
      branchName: row.branchName,
      targetUnits: 0,
      orders: 0,
      targetRevenue: 0,
      bookedRevenue: 0,
    };
    branch.targetUnits += row.targetUnits;
    branch.orders += row.actualUnits;
    branch.targetRevenue += row.targetRevenue;
    branch.bookedRevenue += row.actualRevenue;
    branches.set(row.branchId, branch);
  }
  return [...branches.values()].map((row) => ({
    ...row,
    orderAttainment: row.targetUnits > 0 ? row.orders / row.targetUnits : null,
    revenueAttainment: row.targetRevenue > 0 ? row.bookedRevenue / row.targetRevenue : null,
  })).sort((a, b) => {
    const aLowest = Math.min(a.orderAttainment ?? Number.POSITIVE_INFINITY, a.revenueAttainment ?? Number.POSITIVE_INFINITY);
    const bLowest = Math.min(b.orderAttainment ?? Number.POSITIVE_INFINITY, b.revenueAttainment ?? Number.POSITIVE_INFINITY);
    return aLowest - bLowest ||
      (a.orderAttainment ?? Number.POSITIVE_INFINITY) - (b.orderAttainment ?? Number.POSITIVE_INFINITY) ||
      (a.revenueAttainment ?? Number.POSITIVE_INFINITY) - (b.revenueAttainment ?? Number.POSITIVE_INFINITY) ||
      a.branchName.localeCompare(b.branchName);
  });
}

function BranchProgressMeter({
  actual,
  target,
  attainment,
  currency,
}: {
  actual: number;
  target: number;
  attainment: number | null;
  currency: boolean;
}) {
  const value = (amount: number) => currency ? formatCurrency(amount) : formatNumber(amount);
  const status = attainmentStatus(attainment);
  const StatusIcon = status === "good" ? Check :
    status === "risk" || status === "watch" ? AlertTriangle : CircleHelp;
  return (
    <div className={`branch-target-metric status-${status}`} role="cell">
      <div className="branch-target-track" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, (attainment ?? 0) * 100))}%` }} />
      </div>
      <StatusIcon className="branch-target-icon" aria-hidden="true" />
      <span className="branch-target-value">
        {attainment === null ? "—" : formatPercent(attainment)} · {value(actual)} / {value(target)}
        <span className="branch-target-inline-gap"> · Gap: {value(target - actual)}</span>
      </span>
    </div>
  );
}

function OrderTargetProgress({
  rows,
  query,
}: {
  rows: ReturnType<typeof branchProgressRows>;
  query: string;
}) {
  const totals = rows.reduce((total, row) => ({
    orders: total.orders + row.orders,
    targetUnits: total.targetUnits + row.targetUnits,
    bookedRevenue: total.bookedRevenue + row.bookedRevenue,
    targetRevenue: total.targetRevenue + row.targetRevenue,
  }), { orders: 0, targetUnits: 0, bookedRevenue: 0, targetRevenue: 0 });
  return (
    <Card className="target-progress-card target-branch-progress">
      <CardHeader
        title="Order target progress by branch"
        takeaway="Orders and booked revenue against each branch's target."
      />
      {rows.length ? (
        <div className="branch-target-table" role="table" aria-label="Order and booked revenue target progress by branch">
          <div className="branch-target-header" role="row">
            <span role="columnheader">Branch</span>
            <span role="columnheader">Orders vs target</span>
            <span role="columnheader">Orders gap</span>
            <span role="columnheader">Revenue booked vs target</span>
            <span role="columnheader">Revenue gap</span>
          </div>
          <ul className="branch-target-list" role="rowgroup">
            {rows.map((row) => (
              <li key={row.branchId} role="row">
                <span className="branch-target-name" role="cell">{row.branchName}</span>
                <BranchProgressMeter
                  actual={row.orders}
                  target={row.targetUnits}
                  attainment={row.orderAttainment}
                  currency={false}
                />
                <span className="branch-target-gap" role="cell">Gap: {formatNumber(row.targetUnits - row.orders)}</span>
                <BranchProgressMeter
                  actual={row.bookedRevenue}
                  target={row.targetRevenue}
                  attainment={row.revenueAttainment}
                  currency
                />
                <span className="branch-target-gap" role="cell">Gap: {formatCurrency(row.targetRevenue - row.bookedRevenue)}</span>
              </li>
            ))}
          </ul>
          <div className="branch-target-total" role="row">
            <span className="branch-target-name" role="cell">All branches</span>
            <BranchProgressMeter
              actual={totals.orders}
              target={totals.targetUnits}
              attainment={totals.targetUnits > 0 ? totals.orders / totals.targetUnits : null}
              currency={false}
            />
            <span className="branch-target-gap" role="cell">Gap: {formatNumber(totals.targetUnits - totals.orders)}</span>
            <BranchProgressMeter
              actual={totals.bookedRevenue}
              target={totals.targetRevenue}
              attainment={totals.targetRevenue > 0 ? totals.bookedRevenue / totals.targetRevenue : null}
              currency
            />
            <span className="branch-target-gap" role="cell">Gap: {formatCurrency(totals.targetRevenue - totals.bookedRevenue)}</span>
          </div>
        </div>
      ) : (
        <p className="premium-table-empty">No order targets match the selected filters.</p>
      )}
    </Card>
  );
}

type MonthlyTargetRow = ReturnType<typeof monthlyTargetRows>[number];
type MonthlySortKey = "month" | "targetUnits" | "actualUnits" | "targetRevenue" | "actualRevenue" | "pacing";
type MonthlySort = { key: MonthlySortKey; direction: "asc" | "desc" };

const monthlySortOptions: { key: MonthlySortKey; label: string }[] = [
  { key: "month", label: "Month" },
  { key: "targetUnits", label: "Target units" },
  { key: "actualUnits", label: "Orders" },
  { key: "targetRevenue", label: "Target revenue" },
  { key: "actualRevenue", label: "Actual revenue" },
  { key: "pacing", label: "Pacing" },
];

function MultiSelectDropdown({
  label,
  summary,
  options,
  selected,
  onChange,
}: {
  label: string;
  summary: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedSet = new Set(selected);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggleValue = (value: string) => onChange(
    selectedSet.has(value) ? selected.filter((item) => item !== value) : [...selected, value],
  );
  const selectAll = () => onChange(options.map((option) => option.value));

  return (
    <div className="target-multiselect" ref={containerRef}>
      <button
        ref={triggerRef}
        className="target-filter-trigger"
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={summary}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{summary}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="target-multiselect-popover" role="dialog" aria-label={label}>
          <div className="target-multiselect-actions">
            <button type="button" onClick={selectAll}>Select all</button>
            <button type="button" onClick={() => onChange([])}>Clear</button>
          </div>
          <div className="target-multiselect-options">
            {options.map((option) => (
              <label key={option.value} className="target-multiselect-option">
                <input
                  type="checkbox"
                  checked={selectedSet.has(option.value)}
                  onChange={() => toggleValue(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function sameValues(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function MonthlyTargetTable({
  rows,
  branches,
  months,
  defaultBranches,
  defaultMonths,
  asOf,
  query,
}: {
  rows: MonthlyTargetRow[];
  branches: { id: string; name: string }[];
  months: string[];
  defaultBranches: string[];
  defaultMonths: string[];
  asOf: number;
  query: string;
}) {
  const [selectedBranches, setSelectedBranches] = useState(defaultBranches);
  const [selectedMonths, setSelectedMonths] = useState(defaultMonths);
  const [sort, setSort] = useState<MonthlySort>({ key: "month", direction: "desc" });
  const branchSet = new Set(selectedBranches);
  const monthSet = new Set(selectedMonths);
  const filteredRows = rows.filter((row) => branchSet.has(row.branchId) && monthSet.has(row.month));
  const sortedRows = [...filteredRows].sort((a, b) => {
    const left = a[sort.key];
    const right = b[sort.key];
    let comparison = 0;
    if (left === null || right === null) {
      comparison = left === right ? 0 : left === null ? 1 : -1;
    } else if (typeof left === "number" && typeof right === "number") {
      comparison = left - right;
    } else {
      comparison = String(left).localeCompare(String(right));
    }
    if (comparison !== 0) {
      if (left === null || right === null) return comparison;
      return sort.direction === "asc" ? comparison : -comparison;
    }
    return a.branchName.localeCompare(b.branchName);
  });
  const totals = filteredRows.reduce((sum, row) => ({
    targetUnits: sum.targetUnits + row.targetUnits,
    actualUnits: sum.actualUnits + row.actualUnits,
    targetRevenue: sum.targetRevenue + row.targetRevenue,
    actualRevenue: sum.actualRevenue + row.actualRevenue,
  }), { targetUnits: 0, actualUnits: 0, targetRevenue: 0, actualRevenue: 0 });
  const totalPacing = totals.targetRevenue > 0 ? totals.actualRevenue / totals.targetRevenue : null;
  const activeBranchFilter = !sameValues(selectedBranches, defaultBranches);
  const activeMonthFilter = !sameValues(selectedMonths, defaultMonths);
  const allBranchesSelected = sameValues(selectedBranches, defaultBranches);
  const allMonthsSelected = sameValues(selectedMonths, defaultMonths);
  const branchSummary = allBranchesSelected
    ? "All branches"
    : selectedBranches.length === 1
      ? branches.find((branch) => branch.id === selectedBranches[0])?.name ?? "No branches"
      : `${selectedBranches.length} branches`;
  const monthSummary = allMonthsSelected
    ? "All months"
    : selectedMonths.length === 1
      ? new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" })
        .format(new Date(`${selectedMonths[0]}-01T00:00:00.000Z`))
      : `${selectedMonths.length} months`;
  const currentMonth = toMonth(asOf);
  const currentDay = new Date(asOf).getUTCDate();
  const daysInCurrentMonth = new Date(Date.UTC(
    new Date(asOf).getUTCFullYear(),
    new Date(asOf).getUTCMonth() + 1,
    0,
  )).getUTCDate();
  const daysLeft = Math.max(0, daysInCurrentMonth - currentDay);
  const resetFilters = () => {
    setSelectedBranches(defaultBranches);
    setSelectedMonths(defaultMonths);
  };

  function changeSort(key: MonthlySortKey) {
    setSort((current) => ({
      key,
      direction: current.key === key
        ? current.direction === "asc" ? "desc" : "asc"
        : key === "month" ? "desc" : "asc",
    }));
  }

  function clearAllFilters() {
    resetFilters();
  }

  function removeBranch(id: string) {
    setSelectedBranches((current) => current.filter((branchId) => branchId !== id));
  }

  function removeMonth(month: string) {
    setSelectedMonths((current) => current.filter((item) => item !== month));
  }

  function renderPacing(month: string, pacing: number | null, total = false) {
    const status = attainmentStatus(pacing);
    const tooltip = pacing === null
      ? "No revenue target is available for this row."
      : total
        ? `Overall pacing: ${formatPercent(pacing)} of selected target revenue`
        : month < currentMonth
        ? `Closed at ${formatPercent(pacing)} of target`
        : month === currentMonth
          ? `${formatPercent(pacing)} with ${daysLeft} days left`
          : "This target month has not started.";
    const label = pacing === null ? "No target" : status === "good" ? "On target" :
      status === "risk" ? "Below threshold" : status === "watch" ? "Watch" : "In progress";
    return (
      <span className={`target-pacing status-${status}`} title={tooltip}>
        <span className="table-inline-bar" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(100, (pacing ?? 0) * 100))}%` }} />
        </span>
        <span>{pacing === null ? "—" : formatPercent(pacing)}</span>
        <span className="target-pacing-chip">{label}</span>
      </span>
    );
  }

  const columns: {
    key: MonthlySortKey | "branch";
    label: string;
    numeric?: boolean;
    tooltip?: string;
    render: (row: MonthlyTargetRow) => ReactNode;
  }[] = [
    { key: "month", label: "Month", render: (row) => row.month },
    {
      key: "branch",
      label: "Branch",
      render: (row) => (
        <span>{row.branchName}</span>
      ),
    },
    { key: "targetUnits", label: "Target units", numeric: true, render: (row) => formatNumber(row.targetUnits) },
    { key: "actualUnits", label: "Orders", numeric: true, render: (row) => formatNumber(row.actualUnits) },
    { key: "targetRevenue", label: "Target revenue", numeric: true, render: (row) => formatCurrency(row.targetRevenue) },
    {
      key: "actualRevenue",
      label: "Actual revenue",
      numeric: true,
      tooltip: "Deal value from orders that reached order_placed by order date within the selected month and date range.",
      render: (row) => formatCurrency(row.actualRevenue),
    },
    {
      key: "pacing",
      label: "Pacing",
      numeric: true,
      tooltip: "Actual order revenue divided by target revenue. Closed months show final attainment; the current month shows pacing with days left.",
      render: (row) => renderPacing(row.month, row.pacing),
    },
  ];

  return (
    <Card className="premium-table-card target-month-table">
      <CardHeader
        title="Target vs actual by branch and month"
        takeaway="Pacing compares booked order revenue with target revenue; actual revenue is based on order dates."
      />
      <div className="premium-table-toolbar target-month-toolbar">
        <label>
          <span>Branch</span>
          <MultiSelectDropdown
            label="Filter table by branch"
            summary={branchSummary}
            options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
            selected={selectedBranches}
            onChange={setSelectedBranches}
          />
        </label>
        <label>
          <span>Month</span>
          <MultiSelectDropdown
            label="Filter table by month"
            summary={monthSummary}
            options={months.map((month) => ({
              value: month,
              label: new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" })
                .format(new Date(`${month}-01T00:00:00.000Z`)),
            }))}
            selected={selectedMonths}
            onChange={setSelectedMonths}
          />
        </label>
        <label className="target-sort-control">
          <span>Sort by</span>
          <select
            aria-label="Sort by"
            value={sort.key}
            onChange={(event) => {
              const option = monthlySortOptions.find((item) => item.key === event.target.value);
              if (option) setSort((current) => ({ ...current, key: option.key }));
            }}
          >
            {monthlySortOptions.map((option) => (
              <option key={option.key} value={option.key}>{option.label}</option>
            ))}
          </select>
          <button
            className="target-sort-direction"
            type="button"
            aria-label={`Sort ${sort.direction === "asc" ? "descending" : "ascending"}`}
            title={`Sort ${sort.direction === "asc" ? "descending" : "ascending"}`}
            onClick={() => setSort((current) => ({
              ...current,
              direction: current.direction === "asc" ? "desc" : "asc",
            }))}
          >
            {sort.direction === "asc"
              ? <ArrowUp aria-hidden="true" />
              : <ArrowDown aria-hidden="true" />}
          </button>
        </label>
      </div>
      {(activeBranchFilter || activeMonthFilter) && (
        <div className="target-filter-chips" aria-label="Active table filters">
          {activeBranchFilter && (selectedBranches.length
            ? selectedBranches.map((id) => (
              <span key={id} className="target-filter-chip">
                Branch: {branches.find((branch) => branch.id === id)?.name ?? id}
                <button type="button" aria-label={`Remove branch ${branches.find((branch) => branch.id === id)?.name ?? id}`} onClick={() => removeBranch(id)}>×</button>
              </span>
            ))
            : (
              <span className="target-filter-chip">
                No branches
                <button type="button" aria-label="Restore branches" onClick={() => setSelectedBranches(defaultBranches)}>×</button>
              </span>
            ))}
          {activeMonthFilter && (selectedMonths.length
            ? selectedMonths.map((month) => (
              <span key={month} className="target-filter-chip">
                Month: {new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" })
                  .format(new Date(`${month}-01T00:00:00.000Z`))}
                <button type="button" aria-label={`Remove month ${month}`} onClick={() => removeMonth(month)}>×</button>
              </span>
            ))
            : (
              <span className="target-filter-chip">
                No months
                <button type="button" aria-label="Restore months" onClick={() => setSelectedMonths(defaultMonths)}>×</button>
              </span>
            ))}
          <button type="button" onClick={clearAllFilters}>Clear all</button>
        </div>
      )}
      <div className="premium-table-scroll target-month-table-scroll">
        <table className="premium-table">
          <thead>
            <tr>
              {columns.map((column) => {
                const sortable = column.key !== "branch";
                const activeSort = sortable && sort.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    title={column.tooltip}
                    className={column.numeric ? "is-numeric" : undefined}
                    aria-sort={activeSort ? sort.direction === "asc" ? "ascending" : "descending" : undefined}
                  >
                    {sortable ? (
                      <button
                        className="premium-table-sort-button"
                        type="button"
                        onClick={() => {
                          if (column.key !== "branch") changeSort(column.key);
                        }}
                        aria-label={`Sort by ${column.label} ${activeSort && sort.direction === "asc" ? "descending" : "ascending"}`}
                      >
                        {column.label}{activeSort && <span aria-hidden="true">{sort.direction === "asc" ? " ▲" : " ▼"}</span>}
                      </button>
                    ) : column.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={`${row.branchId}-${row.month}`}>
                {columns.map((column) => (
                  <td key={column.key} className={column.numeric ? "is-numeric" : undefined}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {!sortedRows.length && (
              <tr>
                <td colSpan={columns.length} className="premium-table-empty" role="status">
                  No rows match these filters
                  <button type="button" onClick={resetFilters}>Reset</button>
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td>Totals</td>
              <td />
              <td className="is-numeric">{formatNumber(totals.targetUnits)}</td>
              <td className="is-numeric">{formatNumber(totals.actualUnits)}</td>
              <td className="is-numeric">{formatCurrency(totals.targetRevenue)}</td>
              <td className="is-numeric">{formatCurrency(totals.actualRevenue)}</td>
              <td className="is-numeric">{renderPacing(currentMonth, totalPacing, true)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

export function SalesPage() {
  const { dataset } = useDataset();
  const searchParams = useSearchParams();
  const tokens = useChartTokens();
  const query = searchParams.toString();
  const filters = useMemo(
    () => filtersFromParams(new URLSearchParams(query)),
    [query],
  );
  const meters = useMemo(() => cumulativeMeters(dataset, filters), [dataset, filters]);
  const monthlyRows = useMemo(() => monthlyTargetRows(dataset, filters), [dataset, filters]);
  const progressRows = useMemo(() => branchProgressRows(monthlyRows), [monthlyRows]);
  const trend = useMemo(() => buildTrend(dataset, filters), [dataset, filters]);
  const modelRows = useMemo(() => {
    const leads = filterLeads(dataset, filters).filter((lead) => lead.status === DELIVERED_STAGE &&
      lead.delivery !== null &&
      (filters.timeBasis !== "event" ||
        (filters.from === null || lead.delivery.deliveredAt >= filters.from) &&
        (filters.to === null || lead.delivery.deliveredAt <= filters.to)));
    const revenueByModel = new Map<string, { revenue: number; deliveries: number }>();
    for (const lead of leads) {
      const row = revenueByModel.get(lead.model) ?? { revenue: 0, deliveries: 0 };
      row.revenue += lead.dealValue;
      row.deliveries += 1;
      revenueByModel.set(lead.model, row);
    }
    const totalRevenue = [...revenueByModel.values()].reduce((sum, row) => sum + row.revenue, 0);
    return [...revenueByModel].map(([model, row]) => ({
      model,
      ...row,
      share: totalRevenue ? row.revenue / totalRevenue : null,
    })).sort((a, b) => b.revenue - a.revenue || a.model.localeCompare(b.model));
  }, [dataset, filters]);
  const modelTotalRevenue = modelRows.reduce((sum, row) => sum + row.revenue, 0);
  const topTwoModelShare = modelTotalRevenue
    ? modelRows.slice(0, 2).reduce((sum, row) => sum + row.revenue, 0) / modelTotalRevenue
    : 0;
  const modelRankRows = modelRows.map((row) => ({
    id: row.model,
    name: row.model,
    value: formatCurrency(row.revenue),
    valueDetail: row.share === null ? "—" : formatPercent(row.share),
    secondary: `${formatNumber(row.deliveries)} cars delivered · avg ₹${row.deliveries ? (row.revenue / row.deliveries / 100_000).toFixed(1) : "0.0"} L`,
    barValue: row.share ?? 0,
  }));
  const trendOption: EChartsCoreOption = useMemo(() => ({
    aria: { enabled: true },
    tooltip: { trigger: "axis", triggerOn: "mousemove|click" },
    legend: {
      data: ["Leads", "Orders placed", "Delivered"],
      top: 8,
      left: "center",
      itemGap: 16,
      formatter: (name: string) => name,
    },
    grid: { left: 56, right: 24, top: 96, bottom: 76, containLabel: true },
    xAxis: {
      type: "category",
      data: trend.data.map((row) => row.month),
      name: "Month the leads came in",
      nameLocation: "middle",
      nameGap: 50,
      axisLabel: {
        interval: 0,
        rotate: 35,
        formatter: (month: string) => new Intl.DateTimeFormat("en", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${month}-01T00:00:00.000Z`)),
      },
    },
    yAxis: { type: "value", minInterval: 1, name: "Number of leads", nameLocation: "middle", nameGap: 42 },
    series: [
      {
        name: "Leads",
        type: "bar",
        barWidth: 30,
        barGap: "-100%",
        itemStyle: { color: tokens?.context },
        data: trend.data.map((row) => ({
          value: row.leads,
          itemStyle: { opacity: row.stillMaturing ? 0.42 : 1 },
        })),
        label: {
          show: true,
          position: "top",
          distance: 8,
          fontSize: 10,
          lineHeight: 14,
          formatter: ({ dataIndex }: { dataIndex: number }) => {
            const row = trend.data[dataIndex];
            if (!row) return "";
            const orderedLabel = `${row.orderRate === null ? "—" : formatPercent(row.orderRate, 0)} ordered`;
            return row.stillMaturing ? `${orderedLabel}\nStill maturing` : orderedLabel;
          },
        },
      },
      {
        name: "Orders placed",
        type: "bar",
        barWidth: 20,
        barGap: "-100%",
        itemStyle: { color: tokens?.accent },
        data: trend.data.map((row) => ({
          value: row.orders,
          itemStyle: { opacity: row.stillMaturing ? 0.42 : 1 },
        })),
      },
      {
        name: "Delivered",
        type: "bar",
        barWidth: 10,
        barGap: "-100%",
        itemStyle: { color: tokens?.text },
        data: trend.data.map((row) => ({
          value: row.deliveries,
          itemStyle: { opacity: row.stillMaturing ? 0.42 : 1 },
        })),
      },
    ],
  }), [tokens, trend.data]);
  const targetMonths = [...new Set(targetRowsForScope(dataset, filters).map((row) => row.month))].sort();
  const tableBranches = dataset.branches
    .filter((branch) => monthlyRows.some((row) => row.branchId === branch.id))
    .map((branch) => ({ id: branch.id, name: branch.name }));
  const defaultBranches = filters.branch
    ? tableBranches.filter((branch) => branch.id === filters.branch).map((branch) => branch.id)
    : tableBranches.map((branch) => branch.id);

  return (
    <PageContainer className="section-page section-targets">
      <div className="target-alert-model-row">
        <TargetMeters meters={meters} />
        <RankListCard
          className="target-model-rank-card"
          title="Delivered revenue by model"
          takeaway={`Top 2 models account for ${formatPercent(topTwoModelShare)} of delivered revenue.`}
          rows={modelRankRows}
          emptyMessage="No delivered revenue matches these filters."
        />
      </div>

      <OrderTargetProgress rows={progressRows} query={query} />

      <ChartPanel
        title="What happened to each month's leads"
        takeaway={trend.takeaway}
        label="Nested bars for leads, orders placed, and delivered by the month leads came in; each cohort is labeled with its order rate and maturity"
        period="Lead-creation month"
        option={trendOption}
        empty={!trend.data.length}
        emptyMessage="No monthly cohorts match the current date and branch filters."
      />

      <MonthlyTargetTable
        key={query}
        rows={monthlyRows}
        branches={tableBranches}
        months={targetMonths}
        defaultBranches={defaultBranches}
        defaultMonths={targetMonths}
        asOf={dataset.asOf}
        query={query}
      />
    </PageContainer>
  );
}

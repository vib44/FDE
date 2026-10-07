"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { FilterBar } from "./filter-bar.tsx";
import { useDataset } from "./dataset-provider.tsx";
import { DashboardCharts } from "./dashboard-charts.tsx";
import { toDay } from "../lib/dates.ts";
import { overviewVM } from "../lib/metrics/overview.ts";
import { actNowInsights } from "../lib/metrics/insights.ts";
import { EMPTY_FILTERS } from "../lib/types.ts";
import type { OverviewFormat, OverviewKPI, OverviewStatus } from "../lib/types.ts";

function dayStart(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && toDay(timestamp) === value ? timestamp : null;
}

function dayEnd(value: string | null): number | null {
  const start = dayStart(value);
  return start === null ? null : start + 86_400_000 - 1;
}

const numberFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const currencyFormat = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatValue(value: number | null, format: OverviewFormat): string {
  if (value === null) return "—";
  switch (format) {
    case "currency": return currencyFormat.format(value);
    case "number": return numberFormat.format(value);
    case "percent": return `${(value * 100).toFixed(1)}%`;
    case "days": return `${value.toFixed(1)} days`;
  }
}

function formatDelta(kpi: OverviewKPI): string {
  if (kpi.delta === null) return "No prior-period comparison";
  const sign = kpi.delta > 0 ? "+" : "";
  let amount: string;
  switch (kpi.format) {
    case "currency": amount = `${sign}${currencyFormat.format(kpi.delta)}`; break;
    case "number": amount = `${sign}${numberFormat.format(kpi.delta)}`; break;
    case "percent": amount = `${sign}${(kpi.delta * 100).toFixed(1)} pp`; break;
    case "days": amount = `${sign}${kpi.delta.toFixed(1)} days`; break;
  }
  const relative = kpi.deltaPct === null ? "" : ` (${kpi.deltaPct > 0 ? "+" : ""}${(kpi.deltaPct * 100).toFixed(1)}%)`;
  return `${amount}${relative} vs prior period`;
}

function trendPath(values: (number | null)[]): string {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (!finite.length) return "";
  const min = Math.min(...finite);
  const range = Math.max(...finite) - min || 1;
  let drawing = false;
  return values.map((value, index) => {
    if (value === null || !Number.isFinite(value)) {
      drawing = false;
      return "";
    }
    const x = (index / Math.max(1, values.length - 1)) * 88;
    const y = 21 - ((value - min) / range) * 18;
    const command = drawing ? "L" : "M";
    drawing = true;
    return `${command}${x.toFixed(1)},${y.toFixed(1)}`;
  }).filter(Boolean).join(" ");
}

const statusLabels: Record<OverviewStatus, string> = {
  good: "Favorable",
  watch: "Watch",
  risk: "At risk",
  neutral: "No comparison",
};

const severityLabels = { high: "High priority", medium: "Needs attention", low: "Monitor" } as const;

export default function Dashboard() {
  const { dataset, hash, error } = useDataset();
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

  function leadsHref(filterOverrides: Partial<typeof filters>): string {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ["branch", "source", "model"] as const) {
      if (key in filterOverrides) {
        const value = filterOverrides[key];
        if (value) params.set(key, value);
        else params.delete(key);
      }
    }
    const query = params.toString();
    return query ? `/?${query}` : "/";
  }

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">DEALERPULSE · EXECUTIVE OVERVIEW</p>
          <h1>Know where to focus today.</h1>
       {/*   <p className="as-of">Data as of {new Intl.DateTimeFormat("en-IN", {
            day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
          }).format(new Date(`${toDay(dataset.asOf)}T00:00:00.000Z`))}
           · Showing {filters.timeBasis === "created" ? "by lead created date" : "by event date"}</p> */}
        </div>
        <div className="data-status" aria-live="polite">
          {error ? "Dataset refresh failed" : "Dataset connected"}
          <span title={`SHA-256 ${hash}`}> · {hash.slice(0, 10)}</span>
        </div>
      </header>
      <section className="overview" aria-label="Filtered dataset overview">
      
        <div className="kpi-heading">
          <div>
            <p className="eyebrow">PERFORMANCE SNAPSHOT</p>
            <p className="scope-caption">All active filters applied to each metric’s event definition.</p>
          </div>
          <span className="comparison-caption">
            Change is compared with the previous equal-length date range.
            <br />Orders and delivery metrics always use event dates.
          </span>
        </div>
        <div className="kpi-strip">
          {overview.kpis.map((kpi) => (
            <article key={kpi.id} className={`kpi-card status-${kpi.status}`}>
              <div className="kpi-topline">
                <span className="card-label">{kpi.label}</span>
                <span className="kpi-status" aria-label={statusLabels[kpi.status]} title={statusLabels[kpi.status]}>
                  <span className="status-shape" aria-hidden="true" />
                </span>
              </div>
              <strong className="kpi-value">{formatValue(kpi.value, kpi.format)}</strong>
              <div className="kpi-bottomline">
                <p className="kpi-delta">{formatDelta(kpi)}</p>
                <svg className="kpi-sparkline" viewBox="0 0 88 24" role="img" aria-label={`${kpi.label} trend`}>
                  <path d={trendPath(kpi.trend)} />
                </svg>
              </div>
              <p className="kpi-note">{kpi.note}</p>
            </article>
          ))}
        </div>
      </section>
       <article className={`executive-verdict status-${overview.verdict.status}`} aria-live="polite">
          <div className="verdict-heading">
            <span className="verdict-indicator" aria-hidden="true" />
            <p className="card-label">Executive verdict</p>
            <span className="status-label">{statusLabels[overview.verdict.status]}</span>
          </div>
          <h2>{overview.verdict.title}</h2>
          <p>{overview.verdict.summary}</p>
        </article>
      <FilterBar />
      <DashboardCharts dataset={dataset} filters={filters} />
    </main>
  );
}

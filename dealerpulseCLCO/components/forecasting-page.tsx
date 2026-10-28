"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EMPTY_FILTERS } from "../lib/types.ts";
import type { FilterState } from "../lib/types.ts";
import { toDay } from "../lib/dates.ts";
import { formatCurrency, formatNumber, formatPercent } from "../lib/format.ts";
import { periodLabel } from "../lib/period.ts";
import { filterLeads } from "../lib/metrics/filters.ts";
import type { Stage } from "../lib/config.ts";
import type { StepConversionBaseline } from "../lib/metrics/forecast.ts";
import { forecastStepConversion, stepConversionBaseline } from "../lib/metrics/forecast.ts";
import { forecastLeadConversion, leadConversionBaseline } from "../lib/metrics/forecast.ts";
import { useDataset } from "./dataset-provider.tsx";
import { Card, PageContainer, PageHeader, PremiumTable } from "./shared-ui.tsx";

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
    timeBasis: "created",
  };
}

const STEP = 0.005;

function LeadConversionSlider({ baselineRatio, leadCount, averageDealValue, revenue, deliveredCount }: {
  baselineRatio: number;
  leadCount: number;
  averageDealValue: number;
  revenue: number;
  deliveredCount: number;
}) {
  const [override, setOverride] = useState<number | null>(null);
  const ratio = override ?? baselineRatio;
  const forecast = forecastLeadConversion(
    { leadCount, deliveredCount, conversionRatio: baselineRatio, averageDealValue, revenue },
    ratio,
  );
  const rows = [{ id: "lead-conversion", ...forecast }];
  const delta = `${forecast.revenueDelta >= 0 ? "+" : "−"}${formatCurrency(Math.abs(forecast.revenueDelta))}`;

  return (
    <PremiumTable
      className="forecast-scorecard"
      title="Lead conversion Forecast: New → Delivered"
      takeaway={`At a ${formatPercent(ratio)} lead conversion ratio (current ${formatPercent(baselineRatio)}), forecast revenue is ${formatCurrency(forecast.revenue)}.`}
      toolbar={(
        <div className="forecast-slider">
          <label>
            Lead Conversion Ratio: <strong>{formatPercent(ratio)}</strong>
            <input
              type="range"
              min={0}
              max={1}
              step={STEP}
              value={ratio}
              aria-label="Lead conversion ratio"
              onChange={(event) => setOverride(Number(event.target.value))}
            />
          </label>
          <button type="button" onClick={() => setOverride(null)} disabled={override === null}>
            Reset to {formatPercent(baselineRatio)}
          </button>
        </div>
      )}
      rows={rows}
      rowKey={(row) => row.id}
      emptyMessage="No forecast available."
      columns={[
        { label: "Leads in scope", align: "right", render: () => formatNumber(leadCount) },
        { label: "Estimated deliveries", align: "right", render: (row) => formatNumber(row.deliveries, 1) },
        { label: "Avg delivered deal value", align: "right", render: () => formatCurrency(averageDealValue) },
        { label: "Current delivered revenue", align: "right", render: () => formatCurrency(revenue) },
        { label: "Forecast revenue", align: "right", render: (row) => formatCurrency(row.revenue) },
        { label: "Change vs current", align: "right", render: () => delta },
      ]}
    />
  );
}

function StepConversionSlider({ title, fromLabel, toLabel, baseline }: {
  title: string;
  fromLabel: string;
  toLabel: string;
  baseline: StepConversionBaseline & { stepRatio: number; averageDealValue: number };
}) {
  const [override, setOverride] = useState<number | null>(null);
  const ratio = override ?? baseline.stepRatio;
  const forecast = forecastStepConversion(baseline, ratio);
  const delta = `${forecast.revenueDelta >= 0 ? "+" : "−"}${formatCurrency(Math.abs(forecast.revenueDelta))}`;

  return (
    <PremiumTable
      className="forecast-scorecard"
      title={title}
      takeaway={`At a ${formatPercent(ratio)} ${fromLabel} → ${toLabel} rate (current ${formatPercent(baseline.stepRatio)}), forecast revenue is ${formatCurrency(forecast.revenue)}, with all other steps unchanged.`}
      toolbar={(
        <div className="forecast-slider">
          <label>
            {fromLabel} → {toLabel} rate: <strong>{formatPercent(ratio)}</strong>
            <input
              type="range"
              min={0}
              max={1}
              step={STEP}
              value={ratio}
              aria-label={`${fromLabel} to ${toLabel} conversion rate`}
              onChange={(event) => setOverride(Number(event.target.value))}
            />
          </label>
          <button type="button" onClick={() => setOverride(null)} disabled={override === null}>
            Reset to {formatPercent(baseline.stepRatio)}
          </button>
        </div>
      )}
      rows={[{ id: title, ...forecast }]}
      rowKey={(row) => row.id}
      emptyMessage="No forecast available."
      columns={[
        { label: `Leads reaching ${fromLabel}`, align: "right", render: () => formatNumber(baseline.fromCount) },
        { label: `Estimated leads reaching ${toLabel}`, align: "right", render: (row) => formatNumber(row.toCount, 1) },
        { label: "Estimated deliveries", align: "right", render: (row) => formatNumber(row.deliveries, 1) },
        { label: "Avg delivered deal value", align: "right", render: () => formatCurrency(baseline.averageDealValue) },
        { label: "Current delivered revenue", align: "right", render: () => formatCurrency(baseline.revenue) },
        { label: "Forecast revenue", align: "right", render: (row) => formatCurrency(row.revenue) },
        { label: "Change vs current", align: "right", render: () => delta },
      ]}
    />
  );
}

const STEPS: { title: string; from: Stage; to: Stage; fromLabel: string; toLabel: string }[] = [
  { title: "Lead Conversion Forecast: Contacted → Test drive", from: "contacted", to: "test_drive", fromLabel: "Contacted", toLabel: "Test drive" },
  { title: "Lead Conversion Forecast: Test drive → Negotiation", from: "test_drive", to: "negotiation", fromLabel: "Test drive", toLabel: "Negotiation" },
  { title: "Lead Conversion Forecast: Negotiation → Order placed ", from: "negotiation", to: "order_placed", fromLabel: "Negotiation", toLabel: "Order placed" },
];

export function ForecastingPage() {
  const { dataset } = useDataset();
  const searchParams = useSearchParams();
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(searchParams.toString())), [searchParams]);
  const leads = useMemo(() => filterLeads(dataset, filters), [dataset, filters]);
  const baseline = useMemo(() => leadConversionBaseline(leads), [leads]);
  const stepBaselines = useMemo(
    () => STEPS.map((step) => stepConversionBaseline(leads, step.from, step.to)),
    [leads],
  );
  const { conversionRatio, averageDealValue } = baseline;

  return (
    <PageContainer className="section-page section-forecasting">
      <PageHeader
        eyebrow="Forecasting"
        title="Forecasting"
        tagline="What revenue could we deliver if a ratio improved?"
        className="section-page-header"
      >
        <p className="section-period">{periodLabel(dataset, filters)} · leads grouped by creation date</p>
      </PageHeader>
      {conversionRatio !== null && averageDealValue !== null ? (
        <LeadConversionSlider
          key={`${baseline.leadCount}-${baseline.deliveredCount}`}
          baselineRatio={conversionRatio}
          leadCount={baseline.leadCount}
          averageDealValue={averageDealValue}
          revenue={baseline.revenue}
          deliveredCount={baseline.deliveredCount}
        />
      ) : (
        <Card><p>No delivered leads in the selected filters, so a revenue forecast can't be estimated.</p></Card>
      )}
      {STEPS.map((step, index) => {
        const stepBaseline = stepBaselines[index]!;
        if (stepBaseline.stepRatio === null || stepBaseline.averageDealValue === null || stepBaseline.stepRatio === 0) {
          return (
            <Card key={step.title}>
              <p>{step.title}: not enough data in the selected filters to forecast.</p>
            </Card>
          );
        }
        return (
          <StepConversionSlider
            key={`${step.title}-${stepBaseline.fromCount}-${stepBaseline.toCount}-${stepBaseline.deliveredCount}`}
            title={step.title}
            fromLabel={step.fromLabel}
            toLabel={step.toLabel}
            baseline={{ ...stepBaseline, stepRatio: stepBaseline.stepRatio, averageDealValue: stepBaseline.averageDealValue }}
          />
        );
      })}
    </PageContainer>
  );
}

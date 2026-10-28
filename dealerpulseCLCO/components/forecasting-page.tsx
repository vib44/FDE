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

// Only conversion into an order changes revenue, so every forecast targets order_placed.
const STEPS: { title: string; from: Stage; to: Stage; fromLabel: string; toLabel: string }[] = [
  { title: "Lead Conversion Forecast: New → Order placed", from: "new", to: "order_placed", fromLabel: "New", toLabel: "Order placed" },
  { title: "Lead Conversion Forecast: Contacted → Order placed", from: "contacted", to: "order_placed", fromLabel: "Contacted", toLabel: "Order placed" },
  { title: "Lead Conversion Forecast: Test drive → Order placed", from: "test_drive", to: "order_placed", fromLabel: "Test drive", toLabel: "Order placed" },
  { title: "Lead Conversion Forecast: Negotiation → Order placed", from: "negotiation", to: "order_placed", fromLabel: "Negotiation", toLabel: "Order placed" },
];

export function ForecastingPage() {
  const { dataset } = useDataset();
  const searchParams = useSearchParams();
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(searchParams.toString())), [searchParams]);
  const leads = useMemo(() => filterLeads(dataset, filters), [dataset, filters]);
  const stepBaselines = useMemo(
    () => STEPS.map((step) => stepConversionBaseline(leads, step.from, step.to)),
    [leads],
  );

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

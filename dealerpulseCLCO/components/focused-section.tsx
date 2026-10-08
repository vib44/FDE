"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { EMPTY_FILTERS } from "../lib/types.ts";
import type { FilterState } from "../lib/types.ts";
import { periodLabel } from "../lib/period.ts";
import { toDay } from "../lib/dates.ts";
import {
  branchScorecard,
  conversionFunnel,
  targetActualByBranch,
} from "../lib/metrics/dashboard-charts.ts";
import { actNowInsights } from "../lib/metrics/insights.ts";
import { DashboardCharts } from "./dashboard-charts.tsx";
import { useDataset } from "./dataset-provider.tsx";
import { InsightStrip } from "./insight-strip.tsx";
import { PageContainer, PageHeader } from "./shared-ui.tsx";

type SectionView = "targets" | "funnel" | "branches";

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

export function FocusedSection({
  title,
  question,
  view,
}: {
  title: string;
  question: string;
  view: SectionView;
}) {
  const { dataset } = useDataset();
  const searchParams = useSearchParams();
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(searchParams.toString())), [searchParams]);
  const period = periodLabel(dataset, filters);
  const verdict = useMemo(() => {
    switch (view) {
      case "targets": return targetActualByBranch(dataset, filters).takeaway;
      case "funnel": return conversionFunnel(dataset, filters).takeaway;
      case "branches": return branchScorecard(dataset, filters).takeaway;
    }
  }, [dataset, filters, view]);
  const sectionInsights = useMemo(() => {
    const matchesSection = (id: string) => {
      if (view === "targets") return id === "branches-below-target";
      if (view === "funnel") return id === "cold-preorder-leads" ||
        id.startsWith("conversion-") || id.startsWith("source-quality-");
      return id.includes("branch") || id.startsWith("conversion-");
    };
    return actNowInsights(dataset, filters).filter((insight) => matchesSection(insight.id)).slice(0, 3);
  }, [dataset, filters, view]);

  return (
    <PageContainer className={`section-page section-${view}`}>
      <PageHeader eyebrow={title} title={title} className="section-page-header">
        <p className="section-question">{question}</p>
        <p className="section-verdict">{verdict}</p>
        <p className="section-period">{period}</p>
      </PageHeader>
      <InsightStrip
        insights={sectionInsights}
        query={searchParams.toString()}
        emptyMessage="No section-specific priority actions match the current filters."
      />
      <DashboardCharts dataset={dataset} filters={filters} view={view} />
      <details className="section-details">
        <summary>Details</summary>
        <p>Select a chart item to open the related filtered records in Lead Explorer.</p>
      </details>
    </PageContainer>
  );
}

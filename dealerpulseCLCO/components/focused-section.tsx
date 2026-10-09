"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { EMPTY_FILTERS } from "../lib/types.ts";
import type { FilterState } from "../lib/types.ts";
import { periodLabel } from "../lib/period.ts";
import { toDay } from "../lib/dates.ts";
import { conversionFunnel, targetActualByBranch } from "../lib/metrics/dashboard-charts.ts";
import { filterLeads } from "../lib/metrics/filters.ts";
import { filterOpenLeads } from "../lib/metrics/open-leads.ts";
import { DashboardCharts } from "./dashboard-charts.tsx";
import { useDataset } from "./dataset-provider.tsx";
import { PageContainer, PageHeader } from "./shared-ui.tsx";
import { FunnelTeamSection } from "./funnel-team-section.tsx";
import { SourceQualitySection } from "./source-quality-section.tsx";
import { DELIVERED_STAGE, LOST } from "../lib/config.ts";

type SectionView = "targets" | "funnel";

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
    }
  }, [dataset, filters, view]);
  const funnelTeamSummary = useMemo(() => {
    const leads = filterLeads(dataset, { ...filters, timeBasis: "created" });
    const openLeads = filterOpenLeads(dataset, filters);
    return `${new Set(leads.map((lead) => lead.repId)).size} representatives manage ${leads.length} leads, including ${openLeads.length} currently open.`;
  }, [dataset, filters]);
  const lostBeforeContact = useMemo(() => {
    if (view !== "funnel") return null;
    const leads = filterLeads(dataset, { ...filters, timeBasis: "created" }).filter((lead) => {
      if (lead.reached.contacted !== null) return false;
      if (filters.timeBasis !== "event") return true;
      const closedAt = lead.status === DELIVERED_STAGE
        ? lead.delivery?.deliveredAt ?? null
        : lead.status === LOST
          ? lead.history.filter((event) => event.status === LOST).at(-1)?.ts ?? null
          : null;
      return closedAt !== null &&
        (filters.from === null || closedAt >= filters.from) &&
        (filters.to === null || closedAt <= filters.to);
    });
    const closed = leads.filter((lead) => lead.status === DELIVERED_STAGE || lead.status === LOST);
    const wins = closed.filter((lead) => lead.status === DELIVERED_STAGE).length;
    const losses = closed.filter((lead) => lead.status === LOST);
    return closed.length && wins / closed.length === 0
      ? `${losses.length} leads were lost before anyone contacted them; none of them ever bought.`
      : null;
  }, [dataset, filters, view]);

  return (
    <PageContainer className={`section-page section-${view}`}>
      <PageHeader
        eyebrow={title}
        title={title}
        tagline={view === "funnel"
          ? "Find the drop-off. Focus follow-up where it can move the numbers."
          : view === "targets"
            ? "Turn every target into a clear next move."
            : "Put attention where performance has room to rise."}
        className="section-page-header"
      >
        <p className="section-question">{question}</p>
        <p className="section-verdict">
          {view === "funnel" ? `${funnelTeamSummary} ${verdict}` : verdict}
        </p>
        <p className="section-period">{period}</p>
      </PageHeader>
      <DashboardCharts dataset={dataset} filters={filters} view={view} />
      {view === "funnel" && lostBeforeContact && (
        <p className="funnel-lost-before-contact">{lostBeforeContact}</p>
      )}
      {view === "funnel" && <SourceQualitySection dataset={dataset} filters={filters} />}
      {view === "funnel" && (
        <FunnelTeamSection dataset={dataset} filters={filters} query={searchParams.toString()} />
      )}
      <details className="section-details">
        <summary>Details</summary>
        <p>Select a chart item to open the related filtered records in Lead Explorer.</p>
      </details>
    </PageContainer>
  );
}

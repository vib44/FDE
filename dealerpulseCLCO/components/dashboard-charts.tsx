"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ECElementEvent } from "echarts/core";
import { STAGES } from "../lib/config.ts";
import { conversionFunnel, leadFlowByMonth } from "../lib/metrics/dashboard-charts.ts";
import type { Dataset, FilterState } from "../lib/types.ts";
import { periodLabel } from "../lib/period.ts";
import { ChartPanel } from "./chart-panel.tsx";
import { dashboardChartOptions } from "./dashboard-chart-options.ts";
import { useChartDrills } from "./use-chart-drills.ts";
import { useChartTokens } from "./use-chart-tokens.ts";

type ChartView = "targets" | "sales" | "funnel";

export function DashboardCharts({
  dataset,
  filters,
  view,
}: {
  dataset: Dataset;
  filters: FilterState;
  view: ChartView | "team" | "all" | "overview";
}) {
  const tokens = useChartTokens();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { drillToStage, drillToLeads } = useChartDrills();
  const period = periodLabel(dataset, filters);
  const funnel = useMemo(() => conversionFunnel(dataset, filters), [dataset, filters]);
  const flow = useMemo(() => leadFlowByMonth(dataset, filters), [dataset, filters]);
  const options = dashboardChartOptions({ funnel, flow, tokens });

  if (view === "team" || view === "overview") return null;

  if (view === "funnel") {
    const handleClick = (event: ECElementEvent) => {
      const stage = STAGES[event.dataIndex ?? -1];
      if (!stage) return;
      if (stage === "contacted" || stage === "negotiation") {
        const params = new URLSearchParams(searchParams.toString());
        const anchor = stage === "contacted" ? "step-contacted-test-drive" : "step-negotiation-order";
        router.push(`/deals${params.size ? `?${params.toString()}` : ""}#${anchor}`);
        return;
      }
      drillToStage(stage);
    };
    const query = searchParams.toString();
    const dealsHref = (anchor: string) => `/deals${query ? `?${query}` : ""}#${anchor}`;
    return (
      <section className="funnel-chart-section" aria-label="Conversion funnel">
        <ChartPanel
          title={funnel.title}
          takeaway={funnel.takeaway}
          label="Lead counts at each stage of the conversion funnel"
          period={period}
          option={options.funnel}
          empty={!funnel.data.some((point) => point.count > 0)}
          emptyMessage={funnel.takeaway}
          onClick={handleClick}
        />
        <nav className="funnel-step-links" aria-label="Deal progression steps">
          <Link href={dealsHref("step-contacted-test-drive")}>Step 2 · Contacted → Test drive</Link>
          <Link href={dealsHref("step-negotiation-order")}>Step 4 · Negotiation → Order</Link>
        </nav>
      </section>
    );
  }

  return (
    <ChartPanel
      title={flow.title}
      takeaway={flow.takeaway}
      label="Monthly lead volume trend"
      period={period}
      option={options.targets}
      empty={!flow.data.length}
      emptyMessage={flow.takeaway}
    />
  );
}

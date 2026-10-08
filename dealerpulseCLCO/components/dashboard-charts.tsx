"use client";

import { useMemo } from "react";
import type { ECElementEvent } from "echarts/core";
import { STAGES } from "../lib/config.ts";
import { conversionFunnel, branchScorecard, leadFlowByMonth } from "../lib/metrics/dashboard-charts.ts";
import type { Dataset, FilterState } from "../lib/types.ts";
import { periodLabel } from "../lib/period.ts";
import { ChartPanel } from "./chart-panel.tsx";
import { dashboardChartOptions } from "./dashboard-chart-options.ts";
import { useChartDrills } from "./use-chart-drills.ts";
import { useChartTokens } from "./use-chart-tokens.ts";

type ChartView = "targets" | "sales" | "funnel" | "branches";

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
  const { drillToBranch, drillToStage, drillToLeads } = useChartDrills();
  const period = periodLabel(dataset, filters);
  const funnel = useMemo(() => conversionFunnel(dataset, filters), [dataset, filters]);
  const flow = useMemo(() => leadFlowByMonth(dataset, filters), [dataset, filters]);
  const scorecard = useMemo(() => branchScorecard(dataset, filters), [dataset, filters]);
  const options = dashboardChartOptions({ funnel, flow, scorecard, tokens });

  if (view === "team" || view === "overview") return null;

  if (view === "funnel") {
    const handleClick = (event: ECElementEvent) => {
      const stage = STAGES[event.dataIndex ?? -1];
      if (stage) drillToStage(stage);
    };
    return (
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
    );
  }

  if (view === "branches") {
    const rows = scorecard.data
      .flatMap((row) => row.values[1] === null || row.values[1] === undefined
        ? []
        : [{ branchId: row.branchId, branchName: row.branchName, winRate: row.values[1] }])
      .sort((a, b) => a.winRate - b.winRate);
    const handleClick = (event: ECElementEvent) => {
      const row = rows[event.dataIndex ?? -1];
      if (row) drillToBranch(row.branchId);
    };
    return (
      <ChartPanel
        title="Closed win rate by branch"
        takeaway={scorecard.takeaway}
        label="Branches ranked by closed win rate"
        period={period}
        option={options.branches(rows)}
        empty={!rows.length}
        emptyMessage={scorecard.takeaway}
        onClick={handleClick}
      />
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

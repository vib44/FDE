"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EChartsCoreOption, ECElementEvent } from "echarts/core";
import { STAGES } from "../lib/config.ts";
import {
  branchScorecard,
  conversionFunnel,
  delayReasonsPareto,
  funnelByBranch,
  leadFlowByMonth,
  sourceQuality,
  targetActualByBranch,
  undeliveredOrderAging,
} from "../lib/metrics/dashboard-charts.ts";
import type { Dataset, FilterState } from "../lib/types.ts";
import { AiAlertsCard } from "./ai-alerts-card.tsx";
import { Chart } from "./chart.tsx";

const colors = ["#3f83a8", "#e0a53a", "#7c6bd1", "#42a27a", "#d46c5e"] as const;
const percent = (value: number | null) => value === null ? "—" : `${Math.round(value * 100)}%`;

function ChartPanel({
  title,
  takeaway,
  label,
  option,
  empty,
  emptyMessage,
  onClick,
}: {
  title: string;
  takeaway: string;
  label: string;
  option: EChartsCoreOption;
  empty: boolean;
  emptyMessage: string;
  onClick?: (event: ECElementEvent) => void;
}) {
  return (
    <article className="chart-panel">
      <div className="chart-heading">
        <h3>{title}</h3>
        <p>{takeaway}</p>
      </div>
      <Chart option={option} ariaLabel={label} empty={empty} emptyMessage={emptyMessage} onClick={onClick} />
    </article>
  );
}

export function DashboardCharts({
  dataset,
  filters,
}: {
  dataset: Dataset;
  filters: FilterState;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const target = useMemo(() => targetActualByBranch(dataset, filters), [dataset, filters]);
  const scorecard = useMemo(() => branchScorecard(dataset, filters), [dataset, filters]);
  const funnel = useMemo(() => conversionFunnel(dataset, filters), [dataset, filters]);
  const byBranch = useMemo(() => funnelByBranch(dataset, filters), [dataset, filters]);
  const flow = useMemo(() => leadFlowByMonth(dataset, filters), [dataset, filters]);
  const aging = useMemo(() => undeliveredOrderAging(dataset, filters), [dataset, filters]);
  const delays = useMemo(() => delayReasonsPareto(dataset, filters), [dataset, filters]);
  const sources = useMemo(() => sourceQuality(dataset, filters), [dataset, filters]);

  function drillToBranch(branchId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("branch", branchId);
    router.push(`/?${params.toString()}`, { scroll: false });
  }

  function drillToStage(stage: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("stage", stage);
    router.push(`/leads?${params.toString()}`);
  }

  const targetOption: EChartsCoreOption = {
    color: [colors[0], colors[1]],
    aria: { enabled: true },
    tooltip: { trigger: "axis", triggerOn: "mousemove|click" },
    legend: { bottom: 0 },
    grid: { left: 44, right: 16, top: 18, bottom: 48 },
    xAxis: { type: "category", data: target.data.map((point) => point.branchName), axisLabel: { interval: 0, rotate: 16 } },
    yAxis: { type: "value", name: "Orders", min: 0 },
    series: [
      { name: "Actual", type: "bar", data: target.data.map((point) => point.actual), barMaxWidth: 28 },
      { name: "Target", type: "bar", data: target.data.map((point) => point.target), barMaxWidth: 28 },
    ],
  };

  const scorecardOption: EChartsCoreOption = {
    aria: { enabled: true },
    tooltip: {
      triggerOn: "mousemove|click",
      position: "top",
      formatter: (params: { data: [number, number, number] }) => {
        const [metricIndex, branchIndex, value] = params.data;
        const metric = scorecard.metrics[metricIndex];
        const point = scorecard.data[branchIndex];
        if (!metric || !point) return "";
        const shown = metric.key === "leadVolume"
          ? `${point.leadCount} leads`
          : percent(value);
        return `${point.branchName}<br/>${metric.label}: ${shown}`;
      },
    },
    grid: { left: 125, right: 18, top: 12, bottom: 48 },
    xAxis: { type: "category", data: scorecard.metrics.map((metric) => metric.label), splitArea: { show: true }, axisLabel: { interval: 0, rotate: 12 } },
    yAxis: { type: "category", data: scorecard.data.map((point) => point.branchName), splitArea: { show: true } },
    visualMap: { min: 0, max: 1, calculable: false, orient: "horizontal", left: "center", bottom: 0, inRange: { color: ["#f3f6f8", "#b4d6c6", "#23845b"] } },
    series: [{
      type: "heatmap",
      data: scorecard.data.flatMap((point, branchIndex) =>
        point.values.flatMap((value, metricIndex) =>
          value === null ? [] : [[metricIndex, branchIndex, value] as [number, number, number]])),
      label: {
        show: true,
        formatter: (params: { data: [number, number, number] }) => {
          const metric = scorecard.metrics[params.data[0]];
          return metric?.key === "leadVolume" ? String(scorecard.data[params.data[1]]?.leadCount ?? "") : percent(params.data[2]);
        },
      },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0, 0, 0, 0.25)" } },
    }],
  };

  const funnelOption: EChartsCoreOption = {
    aria: { enabled: true },
    tooltip: { trigger: "item", triggerOn: "mousemove|click", formatter: (params: { name: string; value: number }) => `${params.name.replaceAll("_", " ")}: ${params.value} leads` },
    series: [{
      type: "funnel",
      sort: "none",
      left: "12%",
      top: 12,
      bottom: 12,
      width: "76%",
      minSize: "16%",
      maxSize: "100%",
      label: { show: true, position: "inside", formatter: "{b}: {c}" },
      data: funnel.data.map((point) => ({
        name: point.stage.replaceAll("_", " "),
        value: point.count,
      })),
    }],
  };

  const branchFunnelOption: EChartsCoreOption = {
    aria: { enabled: true },
    tooltip: { trigger: "axis", triggerOn: "mousemove|click", formatter: (params: { name: string; value: number }[]) => {
      const row = params[0];
      return row ? `${row.name}: ${Math.round(Number(row.value))}% new-to-order` : "";
    } },
    grid: { left: 112, right: 24, top: 12, bottom: 12 },
    xAxis: { type: "value", min: 0, max: 100, axisLabel: { formatter: "{value}%" } },
    yAxis: { type: "category", data: byBranch.data.map((point) => point.stage), inverse: true },
    series: [{
      type: "bar",
      data: byBranch.data.map((point) => (point.conversion ?? 0) * 100),
      barMaxWidth: 24,
      itemStyle: { color: colors[2], borderRadius: [0, 5, 5, 0] },
    }],
  };

  const flowOption: EChartsCoreOption = {
    aria: { enabled: true },
    color: [colors[0]],
    tooltip: { trigger: "axis", triggerOn: "mousemove|click" },
    grid: { left: 44, right: 18, top: 20, bottom: 36 },
    xAxis: { type: "category", boundaryGap: false, data: flow.data.map((point) => point.month) },
    yAxis: { type: "value", minInterval: 1, name: "Leads" },
    series: [{
      type: "line",
      smooth: true,
      data: flow.data.map((point) => point.count),
      areaStyle: { opacity: 0.12 },
      symbolSize: 7,
    }],
  };

  const agingOption: EChartsCoreOption = {
    aria: { enabled: true },
    tooltip: { trigger: "axis", triggerOn: "mousemove|click", axisPointer: { type: "shadow" } },
    legend: { bottom: 0 },
    grid: { left: 116, right: 18, top: 12, bottom: 42 },
    xAxis: { type: "value", minInterval: 1, name: "Orders" },
    yAxis: { type: "category", data: aging.data.map((point) => point.branchName), inverse: true },
    series: [
      { name: "< 7 days", type: "bar", stack: "age", data: aging.data.map((point) => point.under7) },
      { name: "7–14 days", type: "bar", stack: "age", data: aging.data.map((point) => point.days7to14) },
      { name: "15–30 days", type: "bar", stack: "age", data: aging.data.map((point) => point.days15to30) },
      { name: "> 30 days", type: "bar", stack: "age", data: aging.data.map((point) => point.over30) },
    ],
  };

  const delayOption: EChartsCoreOption = {
    aria: { enabled: true },
    color: [colors[4], colors[2]],
    tooltip: { trigger: "axis", triggerOn: "mousemove|click" },
    legend: { bottom: 0 },
    grid: { left: 48, right: 52, top: 18, bottom: 56 },
    xAxis: { type: "category", data: delays.data.map((point) => point.reason), axisLabel: { interval: 0, rotate: 24 } },
    yAxis: [
      { type: "value", name: "Deliveries", minInterval: 1 },
      { type: "value", name: "Cumulative", min: 0, max: 1, axisLabel: { formatter: (value: number) => `${Math.round(value * 100)}%` } },
    ],
    series: [
      { name: "Delayed deliveries", type: "bar", data: delays.data.map((point) => point.count) },
      { name: "Cumulative share", type: "line", yAxisIndex: 1, data: delays.data.map((point) => point.cumulativePct), smooth: true },
    ],
  };

  const sourceOption: EChartsCoreOption = {
    aria: { enabled: true },
    tooltip: {
      triggerOn: "mousemove|click",
      formatter: (params: { data: [number, number, number, string, number | null, number] }) => {
        const [leads, winRate, , source, responseHours, revenue] = params.data;
        return `${source.replaceAll("_", " ")}<br/>Leads: ${leads}<br/>Closed win rate: ${percent(winRate / 100)}<br/>Median response: ${responseHours === null ? "—" : `${responseHours.toFixed(1)} h`}<br/>Won revenue: ₹${new Intl.NumberFormat("en-IN").format(revenue)}`;
      },
    },
    grid: { left: 54, right: 22, top: 18, bottom: 46 },
    xAxis: { type: "value", name: "Leads", min: 0, minInterval: 1 },
    yAxis: { type: "value", name: "Closed win rate", min: 0, max: 100, axisLabel: { formatter: "{value}%" } },
    series: [{
      type: "scatter",
      data: sources.data.flatMap((point) => point.winRate === null ? [] : [[
        point.leads,
        point.winRate * 100,
        point.revenue,
        point.source,
        point.medianResponseHours,
        point.revenue,
      ]]),
      symbolSize: (value: number[]) => Math.max(12, Math.min(48, Math.sqrt(value[2] ?? 0) / 180)),
      itemStyle: { color: colors[0], opacity: 0.75 },
      label: { show: true, position: "top", formatter: (params: { data: number[] }) => String(params.data[3]).replaceAll("_", " ") },
    }],
  };

  const branchClick = (rows: { branchId: string }[]) => (event: ECElementEvent) => {
    const row = rows[event.dataIndex ?? -1];
    if (row) drillToBranch(row.branchId);
  };
  const funnelClick = (event: ECElementEvent) => {
    const stageIndex = event.dataIndex ?? -1;
    const stage = STAGES[stageIndex];
    if (stage) drillToStage(stage);
  };
  const heatmapBranchIndexes = scorecard.data.flatMap((point, branchIndex) =>
    point.values.flatMap((value) => value === null ? [] : [branchIndex]));
  const heatmapClick = (event: ECElementEvent) => {
    const branchIndex = heatmapBranchIndexes[event.dataIndex ?? -1];
    if (branchIndex === undefined) return;
    const point = scorecard.data[branchIndex];
    if (point) drillToBranch(point.branchId);
  };

  return (
    <section className="charts-section" aria-label="Performance charts">
      <div className="charts-grid">
        <AiAlertsCard dataset={dataset} filters={filters} />
        <ChartPanel
          title={target.title}
          takeaway={target.takeaway}
          label="Grouped bar chart comparing actual orders and targets by branch"
          option={targetOption}
          empty={!target.data.length}
          emptyMessage={target.takeaway}
          onClick={branchClick(target.data)}
        />
        <ChartPanel
          title={scorecard.title}
          takeaway={scorecard.takeaway}
          label="Heatmap of lead volume, win rate, order attainment and on-time delivery by branch"
          option={scorecardOption}
          empty={!scorecard.data.length || scorecard.data.every((point) => !point.leadCount && point.values.slice(1).every((value) => value === null))}
          emptyMessage={scorecard.takeaway}
          onClick={heatmapClick}
        />
        <ChartPanel
          title={funnel.title}
          takeaway={funnel.takeaway}
          label="Conversion funnel from new lead through delivery"
          option={funnelOption}
          empty={!funnel.data.some((point) => point.count > 0)}
          emptyMessage={funnel.takeaway}
          onClick={funnelClick}
        />
        <ChartPanel
          title={byBranch.title}
          takeaway={byBranch.takeaway}
          label="Horizontal bar chart of new-to-order conversion rate by branch"
          option={branchFunnelOption}
          empty={!byBranch.data.some((point) => point.count > 0)}
          emptyMessage={byBranch.takeaway}
          onClick={branchClick(byBranch.data.map((point) => ({
            branchId: dataset.branches.find((branch) => branch.name === point.stage)?.id ?? point.stage,
          })))}
        />
        <ChartPanel
          title={flow.title}
          takeaway={flow.takeaway}
          label="Monthly lead creation trend"
          option={flowOption}
          empty={!flow.data.length}
          emptyMessage={flow.takeaway}
        />
        <ChartPanel
          title={aging.title}
          takeaway={aging.takeaway}
          label="Stacked bar chart of undelivered orders by age and branch"
          option={agingOption}
          empty={!aging.data.some((point) => point.under7 + point.days7to14 + point.days15to30 + point.over30 > 0)}
          emptyMessage={aging.takeaway}
          onClick={branchClick(aging.data)}
        />
        <ChartPanel
          title={delays.title}
          takeaway={delays.takeaway}
          label="Pareto chart of delivery delay reasons"
          option={delayOption}
          empty={!delays.data.length}
          emptyMessage={delays.takeaway}
        />
        <ChartPanel
          title={sources.title}
          takeaway={sources.takeaway}
          label="Bubble chart of lead sources by volume, closed win rate and won revenue"
          option={sourceOption}
          empty={!sources.data.some((point) => point.winRate !== null)}
          emptyMessage={sources.takeaway}
        />
      </div>
    </section>
  );
}

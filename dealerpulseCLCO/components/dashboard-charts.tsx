"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EChartsCoreOption, ECElementEvent } from "echarts/core";
import { STAGES } from "../lib/config.ts";
import {
  LAST_CONTACT_BUCKETS,
  lastContactByRepresentative,
} from "../lib/metrics/last-contact.ts";
import type { LastContactBucketKey } from "../lib/metrics/last-contact.ts";
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
import { periodLabel } from "../lib/period.ts";
import { AiAlertsCard } from "./ai-alerts-card.tsx";
import { Chart } from "./chart.tsx";

const colors = ["#3f83a8", "#e0a53a", "#7c6bd1", "#42a27a", "#d46c5e"] as const;
const percent = (value: number | null) => value === null ? "—" : `${Math.round(value * 100)}%`;
const scoreColor = (value: number, threshold: number) => {
  const bounded = Math.max(0, Math.min(1, value));
  const healthy = bounded >= threshold;
  const ratio = healthy
    ? threshold === 1 ? 1 : (bounded - threshold) / (1 - threshold)
    : threshold === 0 ? 1 : (threshold - bounded) / threshold;
  const start: [number, number, number] = healthy ? [216, 239, 227] : [247, 222, 220];
  const end: [number, number, number] = healthy ? [22, 116, 73] : [168, 46, 46];
  const channels = [
    Math.round(start[0] + (end[0] - start[0]) * ratio),
    Math.round(start[1] + (end[1] - start[1]) * ratio),
    Math.round(start[2] + (end[2] - start[2]) * ratio),
  ];
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
};

function ChartPanel({
  title,
  takeaway,
  label,
  period,
  option,
  empty,
  emptyMessage,
  control,
  onClick,
}: {
  title: string;
  takeaway: string;
  label: string;
  period: string;
  option: EChartsCoreOption;
  empty: boolean;
  emptyMessage: string;
  control?: ReactNode;
  onClick?: (event: ECElementEvent) => void;
}) {
  return (
    <article className="chart-panel">
      <div className="chart-heading">
        <h3>{title}</h3>
        <p>{takeaway}</p>
        <small className="chart-period">{period}</small>
        {control}
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
  const [lastContactStatus, setLastContactStatus] = useState("all");
  const [healthThreshold, setHealthThreshold] = useState(75);
  const target = useMemo(() => targetActualByBranch(dataset, filters), [dataset, filters]);
  const scorecard = useMemo(() => branchScorecard(dataset, filters), [dataset, filters]);
  const funnel = useMemo(() => conversionFunnel(dataset, filters), [dataset, filters]);
  const byBranch = useMemo(() => funnelByBranch(dataset, filters), [dataset, filters]);
  const flow = useMemo(() => leadFlowByMonth(dataset, filters), [dataset, filters]);
  const aging = useMemo(() => undeliveredOrderAging(dataset, filters), [dataset, filters]);
  const delays = useMemo(() => delayReasonsPareto(dataset, filters), [dataset, filters]);
  const sources = useMemo(() => sourceQuality(dataset, filters), [dataset, filters]);
  const lastContact = useMemo(
    () => lastContactByRepresentative(dataset, filters, lastContactStatus === "all" ? null : lastContactStatus),
    [dataset, filters, lastContactStatus],
  );
  const period = periodLabel(dataset, filters);

  function drillToBranch(branchId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("branch", branchId);
    router.push(`/?${params.toString()}`, { scroll: false });
  }

  function drillToStage(stage: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("stage", stage);
    window.open(`/leads?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  function openRepresentativeView(status: string | null = null, bucket?: LastContactBucketKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("stage");
    params.delete("branch");
    params.delete("bucket");
    params.delete("status");
    if (status) params.set("status", status);
    if (bucket) params.set("bucket", bucket);
    window.open(`/representatives?${params.toString()}`, "_blank", "noopener,noreferrer");
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

  const scorecardRoseData = scorecard.metrics.flatMap((metric, metricIndex) => {
    const metricValue = scorecard.summary.values[metricIndex];
    if (metricValue === null || metricValue === undefined) return [];
    return [{
      name: metric.label,
      value: metricValue * 100,
      branchName: scorecard.summary.branchName,
      metricValue,
      leadCount: scorecard.summary.leadCount,
      itemStyle: { color: scoreColor(metricValue, healthThreshold / 100) },
    }];
  });
  const scorecardOption: EChartsCoreOption = {
    aria: { enabled: true },
    tooltip: {
      trigger: "item",
      triggerOn: "mousemove|click",
      formatter: (params: { data: { branchName: string; name: string; metricValue: number; leadCount: number } }) => {
        const leadDetail = params.data.name === "Lead volume index"
          ? ` (${params.data.leadCount} leads)`
          : "";
        return `${params.data.branchName}<br/>${params.data.name}: ${percent(params.data.metricValue)}${leadDetail}`;
      },
    },
    series: [{
      type: "pie",
      roseType: "area",
      radius: ["18%", "72%"],
      center: ["50%", "53%"],
      label: { show: true, formatter: "{b}", fontSize: 10 },
      labelLayout: { hideOverlap: true },
      data: scorecardRoseData,
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

  const lastContactOption: EChartsCoreOption = {
    aria: { enabled: true },
    color: [colors[0]],
    tooltip: { trigger: "axis", triggerOn: "mousemove|click", axisPointer: { type: "shadow" } },
    grid: { left: 58, right: 18, top: 16, bottom: 38 },
    xAxis: { type: "category", data: lastContact.buckets.map((bucket) => bucket.label) },
    yAxis: { type: "value", name: "Leads", min: 0, minInterval: 1 },
    series: [{
      type: "bar",
      data: lastContact.buckets.map((bucket) => bucket.count),
      barMaxWidth: 42,
      itemStyle: { borderRadius: [5, 5, 0, 0] },
    }],
  };

  const branchClick = (rows: { branchId: string }[], representativeStatus: string | null = null) =>
    (event: ECElementEvent) => {
    const row = rows[event.dataIndex ?? -1];
    if (!row) return;
    if (filters.branch) openRepresentativeView(representativeStatus);
    else drillToBranch(row.branchId);
  };
  const funnelClick = (event: ECElementEvent) => {
    const stageIndex = event.dataIndex ?? -1;
    const stage = STAGES[stageIndex];
    if (!stage) return;
    drillToStage(stage);
  };
  const lastContactClick = (event: ECElementEvent) => {
    const bucket = lastContact.buckets[event.dataIndex ?? -1];
    if (bucket) openRepresentativeView(lastContactStatus === "all" ? null : lastContactStatus, bucket.key);
  };

  return (
    <section className="charts-section" aria-label="Performance charts">
      <div className="charts-grid">
        <AiAlertsCard dataset={dataset} filters={filters} period={period} />
        <ChartPanel
          title={target.title}
          takeaway={target.takeaway}
          label="Grouped bar chart comparing actual orders and targets by branch"
          period={period}
          option={targetOption}
          empty={!target.data.length}
          emptyMessage={target.takeaway}
          onClick={branchClick(target.data, "delivered")}
        />
        <ChartPanel
          title="Last contacted customers"
          takeaway="Leads grouped by days since last activity and assigned representative. Select a bar to open the representative view."
          label="Bar chart of lead counts by days since last activity"
          period={period}
          option={lastContactOption}
          empty={!lastContact.buckets.some((bucket) => bucket.count > 0)}
          emptyMessage="No leads match the selected status and dashboard filters."
          control={(
            <label className="chart-status-filter">
              <span>Latest lead status</span>
              <select aria-label="Last contacted chart lead status" value={lastContactStatus}
                onChange={(event) => setLastContactStatus(event.target.value)}>
                <option value="all">All statuses</option>
                {[...new Set(dataset.leads.map((lead) => lead.status))].sort().map((status) => (
                  <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
          )}
          onClick={lastContactClick}
        />
        <ChartPanel
          title={scorecard.title}
          takeaway={scorecard.takeaway}
          label="Nightingale chart showing aggregate lead volume, closed win rate, order target attainment and on-time delivery percentages for the selected branches"
          period={period}
          option={scorecardOption}
          empty={!scorecardRoseData.length}
          emptyMessage={scorecard.takeaway}
          control={(
            <div className="scorecard-health-legend">
              <label htmlFor="scorecard-health-threshold">
                Healthy at <output>{healthThreshold}%</output>
              </label>
              <input
                id="scorecard-health-threshold"
                type="range"
                min="0"
                max="100"
                value={healthThreshold}
                aria-label="Healthy scorecard metric threshold"
                onChange={(event) => setHealthThreshold(Number(event.target.value))}
              />
              <span className="scorecard-health-key"><i className="health-dot is-unhealthy" />Below threshold</span>
              <span className="scorecard-health-key"><i className="health-dot is-healthy" />At or above threshold</span>
              <small>Each slice is one metric for {scorecard.summary.branchName.toLowerCase()}</small>
            </div>
          )}
        />
        <ChartPanel
          title={funnel.title}
          takeaway={funnel.takeaway}
          label="Conversion funnel from new lead through delivery"
          period={period}
          option={funnelOption}
          empty={!funnel.data.some((point) => point.count > 0)}
          emptyMessage={funnel.takeaway}
          onClick={funnelClick}
        />
        <ChartPanel
          title={byBranch.title}
          takeaway={byBranch.takeaway}
          label="Horizontal bar chart of new-to-order conversion rate by branch"
          period={period}
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
          period={period}
          option={flowOption}
          empty={!flow.data.length}
          emptyMessage={flow.takeaway}
          onClick={() => openRepresentativeView()}
        />
        <ChartPanel
          title={aging.title}
          takeaway={aging.takeaway}
          label="Stacked bar chart of undelivered orders by age and branch"
          period={period}
          option={agingOption}
          empty={!aging.data.some((point) => point.under7 + point.days7to14 + point.days15to30 + point.over30 > 0)}
          emptyMessage={aging.takeaway}
          onClick={branchClick(aging.data)}
        />
        <ChartPanel
          title={delays.title}
          takeaway={delays.takeaway}
          label="Pareto chart of delivery delay reasons"
          period={period}
          option={delayOption}
          empty={!delays.data.length}
          emptyMessage={delays.takeaway}
          onClick={() => openRepresentativeView()}
        />
        <ChartPanel
          title={sources.title}
          takeaway={sources.takeaway}
          label="Bubble chart of lead sources by volume, closed win rate and won revenue"
          period={period}
          option={sourceOption}
          empty={!sources.data.some((point) => point.winRate !== null)}
          emptyMessage={sources.takeaway}
          onClick={() => openRepresentativeView()}
        />
      </div>
    </section>
  );
}

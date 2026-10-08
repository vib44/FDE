import type { EChartsCoreOption } from "echarts/core";
import type { BranchScorecardVM, FunnelVM, MonthlyLeadFlowVM } from "../lib/types.ts";
import type { ChartTokens } from "../lib/chartTheme.ts";
import { formatCurrency } from "../lib/format.ts";

export function deliveryAgingChartOption(
  rows: { label: string; count: number; value: number }[],
  tokens: ChartTokens | null,
): EChartsCoreOption {
  const data = [...rows].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return {
    aria: { enabled: true },
    tooltip: { trigger: "axis", triggerOn: "mousemove|click", axisPointer: { type: "shadow" } },
    grid: { left: 88, right: 128, top: 16, bottom: 18, containLabel: true },
    xAxis: { type: "value", minInterval: 1 },
    yAxis: { type: "category", inverse: true, data: data.map((item) => item.label) },
    series: [{
      type: "bar",
      data: data.map((item) => ({
        value: item.count,
        label: { formatter: formatCurrency(item.value) },
      })),
      barMaxWidth: 18,
      itemStyle: { color: tokens?.context, borderRadius: [0, 5, 5, 0] },
      label: { show: true, position: "right" },
    }],
  };
}

export function dashboardChartOptions({
  funnel,
  flow,
  scorecard,
  tokens,
}: {
  funnel: FunnelVM;
  flow: MonthlyLeadFlowVM;
  scorecard: BranchScorecardVM;
  tokens: ChartTokens | null;
}) {
  const targets: EChartsCoreOption = {
    aria: { enabled: true },
    color: tokens ? [tokens.accent] : undefined,
    tooltip: { trigger: "axis", triggerOn: "mousemove|click" },
    grid: { left: 40, right: 20, top: 16, bottom: 36, containLabel: true },
    xAxis: { type: "category", boundaryGap: false, data: flow.data.map((point) => point.month) },
    yAxis: { type: "value", minInterval: 1 },
    series: [{
      type: "line",
      smooth: true,
      data: flow.data.map((point) => point.count),
      areaStyle: { opacity: 0.12 },
      symbol: "none",
    }],
  };

  const funnelOption: EChartsCoreOption = {
    aria: { enabled: true },
    tooltip: {
      trigger: "item",
      triggerOn: "mousemove|click",
      formatter: (params: { name: string; value: number }) => `${params.name}: ${params.value} leads`,
    },
    series: [{
      type: "funnel",
      orient: "horizontal",
      sort: "none",
      left: "8%",
      top: 16,
      bottom: 16,
      width: "84%",
      minSize: "18%",
      maxSize: "100%",
      label: { show: true, position: "inside", formatter: "{b}: {c}" },
      data: funnel.data.map((point) => ({
        name: point.stage.replaceAll("_", " "),
        value: point.count,
      })),
    }],
  };

  const branches = (rows: { branchName: string; winRate: number }[]): EChartsCoreOption => ({
    aria: { enabled: true },
    tooltip: {
      trigger: "axis",
      triggerOn: "mousemove|click",
      axisPointer: { type: "shadow" },
      valueFormatter: (value: number) => `${Math.round(value)}%`,
    },
    grid: { left: 96, right: 42, top: 12, bottom: 12, containLabel: true },
    xAxis: { type: "value", min: 0, max: 100, axisLabel: { formatter: "{value}%" } },
    yAxis: { type: "category", inverse: true, data: rows.map((row) => row.branchName) },
    series: [{
      type: "bar",
      data: rows.map((row, index) => ({
        value: row.winRate * 100,
        itemStyle: { color: index === 0 ? tokens?.bad : tokens?.context },
      })),
      barMaxWidth: 18,
      itemStyle: { borderRadius: [0, 5, 5, 0] },
      label: { show: true, position: "right", formatter: ({ value }: { value: number }) => `${Math.round(value)}%` },
    }],
  });

  return { targets, funnel: funnelOption, branches };
}

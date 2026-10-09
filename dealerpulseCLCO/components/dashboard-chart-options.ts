import type { EChartsCoreOption } from "echarts/core";
import type { FunnelVM, MonthlyLeadFlowVM } from "../lib/types.ts";
import type { ChartTokens } from "../lib/chartTheme.ts";
import { formatCurrency } from "../lib/format.ts";

function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00.000Z`));
}

export function deliveryAgingChartOption(
  rows: { label: string; count: number; value: number; oldestDaysWaiting: number | null }[],
  tokens: ChartTokens | null,
): EChartsCoreOption {
  const data = rows;
  const maxCount = Math.max(1, ...data.map((item) => item.count));
  return {
    aria: { enabled: true },
    tooltip: {
      trigger: "item",
      triggerOn: "mousemove|click",
      formatter: (params: { dataIndex: number }) => {
        const bucket = data[params.dataIndex]!;
        return `${bucket.label}<br/>Orders: ${bucket.count}<br/>₹ at stake: ${formatCurrency(bucket.value)}<br/>Oldest order: ${bucket.oldestDaysWaiting === null ? "—" : `${bucket.oldestDaysWaiting} days`}`;
      },
    },
    grid: { top: 8, bottom: 8, left: 8, right: 140, containLabel: true },
    xAxis: {
      type: "value",
      max: maxCount,
      minInterval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: data.map((item) => item.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: tokens?.muted, fontSize: 13 },
      splitLine: { show: false },
    },
    series: [{
      type: "bar",
      showBackground: true,
      backgroundStyle: { color: tokens?.grid, opacity: 0.5, borderRadius: 12 },
      data: data.map((item, index) => {
        const oldest = index === data.length - 1;
        return {
          value: item.count,
          itemStyle: { color: oldest ? tokens?.warn : tokens?.context },
          label: {
            color: oldest ? tokens?.text : tokens?.muted,
            formatter: `${formatCurrency(item.value)} · ${item.count} order${item.count === 1 ? "" : "s"}`,
          },
        };
      }),
      barWidth: 24,
      itemStyle: { borderRadius: 12 },
      label: { show: true, position: "right", fontSize: 13 },
    }],
  };
}

export function dashboardChartOptions({
  funnel,
  flow,
  tokens,
}: {
  funnel: FunnelVM;
  flow: MonthlyLeadFlowVM;
  tokens: ChartTokens | null;
}) {
  const targets: EChartsCoreOption = {
    aria: { enabled: true },
    color: tokens ? [tokens.accent] : undefined,
    tooltip: { trigger: "axis", triggerOn: "mousemove|click" },
    grid: { left: 58, right: 20, top: 18, bottom: 62, containLabel: true },
    xAxis: {
      type: "category",
      data: flow.data.map((point) => point.month),
      name: "Month leads came in",
      nameLocation: "middle",
      nameGap: 44,
      axisLabel: { interval: 0, rotate: 30, formatter: (month: string) => monthLabel(month) },
    },
    yAxis: {
      type: "value",
      minInterval: 1,
      name: "Number of leads",
      nameLocation: "middle",
      nameGap: 42,
    },
    series: [{
      type: "line",
      name: "Monthly leads received",
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
    grid: { left: 112, right: 32, top: 20, bottom: 44, containLabel: true },
    xAxis: {
      type: "value",
      minInterval: 1,
      name: "Number of leads",
      nameLocation: "middle",
      nameGap: 28,
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: funnel.data.map((point) => point.stage.replaceAll("_", " ")),
      name: "Stage reached",
      nameLocation: "middle",
      nameGap: 96,
    },
    series: [{
      name: "Leads reaching each stage",
      type: "bar",
      barMaxWidth: 26,
      itemStyle: { color: tokens?.accent, borderRadius: [0, 5, 5, 0] },
      label: { show: true, position: "right", formatter: "{c}" },
      data: funnel.data.map((point) => point.count),
    }],
  };

  return { targets, funnel: funnelOption };
}

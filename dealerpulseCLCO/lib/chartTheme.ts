import * as echarts from "echarts/core";
import type { EChartsCoreOption } from "echarts/core";

export const CHART_THEME_NAME = "dealerpulse";

export interface ChartTokens {
  surface: string;
  border: string;
  accent: string;
  accentSoft: string;
  good: string;
  warn: string;
  bad: string;
  context: string;
  grid: string;
  text: string;
  muted: string;
}

let registered = false;

export function registerChartTheme(tokens: ChartTokens): void {
  if (registered) return;
  const theme: EChartsCoreOption = {
    backgroundColor: "transparent",
    color: [tokens.accent, tokens.context],
    textStyle: { color: tokens.text, fontFamily: "Inter, sans-serif", fontSize: 12 },
    animationDuration: 400,
    animationEasing: "cubicOut",
    categoryAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: tokens.muted, fontSize: 12, fontFamily: "Inter, sans-serif" },
      splitLine: { show: false },
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: tokens.muted, fontSize: 12, fontFamily: "Inter, sans-serif" },
      splitLine: { lineStyle: { color: tokens.grid } },
    },
    tooltip: {
      backgroundColor: tokens.surface,
      borderColor: tokens.border,
      borderWidth: 1,
      textStyle: { color: tokens.text, fontFamily: "Inter, sans-serif", fontSize: 12 },
    },
  };
  echarts.registerTheme(CHART_THEME_NAME, theme);
  registered = true;
}

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
  const label = {
    fontSize: 12,
    fontWeight: 500,
    textBorderWidth: 0,
    textBorderColor: "transparent",
    textShadowBlur: 0,
  };
  const categoryLabel = {
    ...label,
    color: tokens.muted,
    fontWeight: 400,
  };
  const valueLabel = {
    ...label,
    color: tokens.muted,
  };
  const theme: EChartsCoreOption = {
    backgroundColor: "transparent",
    color: [tokens.accent, tokens.context],
    textStyle: {
      color: tokens.text,
      fontFamily: "Inter, sans-serif",
      ...label,
    },
    animationDuration: 400,
    animationEasing: "cubicOut",
    categoryAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...categoryLabel, fontFamily: "Inter, sans-serif" },
      splitLine: { show: false },
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...valueLabel, fontFamily: "Inter, sans-serif" },
      splitLine: { lineStyle: { color: tokens.grid } },
    },
    bar: { label: valueLabel },
    line: { label: valueLabel },
    pie: { label: valueLabel },
    funnel: { label: { ...label, color: tokens.text } },
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

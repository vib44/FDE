"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import type { EChartsCoreOption, EChartsType, ECElementEvent } from "echarts/core";
import { BarChart, FunnelChart, LineChart } from "echarts/charts";
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { CHART_THEME_NAME, registerChartTheme } from "../lib/chartTheme.ts";
import { useChartTokens } from "./use-chart-tokens.ts";

const reducedMotion = typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

echarts.use([
  BarChart,
  FunnelChart,
  LineChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

interface ChartProps {
  option: EChartsCoreOption;
  ariaLabel: string;
  empty?: boolean;
  emptyMessage?: string;
  loading?: boolean;
  onClick?: (event: ECElementEvent) => void;
}

function chartOptionWithTheme(option: EChartsCoreOption): EChartsCoreOption {
  const tooltipOptions = Array.isArray(option.tooltip)
    ? option.tooltip.map((tooltip) => ({
      ...tooltip,
      appendTo: "body",
      appendToBody: true,
      confine: false,
      z: 2147483647,
      extraCssText: "z-index: 2147483647 !important; border-radius: 8px;",
    }))
    : option.tooltip
      ? {
        ...option.tooltip,
        appendTo: "body",
        appendToBody: true,
        confine: false,
        z: 2147483647,
        extraCssText: "z-index: 2147483647 !important; border-radius: 8px;",
      }
      : undefined;

  return {
    ...option,
    backgroundColor: "transparent",
    animation: !reducedMotion,
    ...(tooltipOptions ? { tooltip: tooltipOptions } : {}),
  };
}

export function Chart({
  option,
  ariaLabel,
  empty = false,
  emptyMessage = "No records match the current view. Try adjusting the dashboard filters.",
  loading = false,
  onClick,
}: ChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsType | null>(null);
  const clickHandler = useRef(onClick);
  const tokens = useChartTokens();

  useEffect(() => {
    clickHandler.current = onClick;
  }, [onClick]);

  useEffect(() => {
    const hostElement = host.current;
    if (!hostElement || !tokens) return;

    registerChartTheme(tokens);
    const instance = echarts.init(hostElement, CHART_THEME_NAME);
    chart.current = instance;
    const setChartOption = (nextOption: EChartsCoreOption) =>
      instance.setOption(chartOptionWithTheme(nextOption), true);
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(hostElement);
    const handleClick = (event: ECElementEvent) => clickHandler.current?.(event);
    instance.on("click", handleClick);
    setChartOption(option);

    return () => {
      observer.disconnect();
      instance.off("click", handleClick);
      instance.dispose();
      if (chart.current === instance) chart.current = null;
    };
  }, [tokens]);

  useEffect(() => {
    const instance = chart.current;
    if (!instance || !tokens) return;
    instance.setOption(chartOptionWithTheme(option), true);
  }, [option, tokens]);

  if (loading || !tokens) {
    return <div className="chart-skeleton" aria-hidden="true" />;
  }
  if (empty) {
    return (
      <div className="chart-empty" role="status">
        <span className="empty-state-icon" aria-hidden="true">∅</span>
        <strong>No chart data</strong>
        <p>{emptyMessage}</p>
      </div>
    );
  }
  return (
    <div
      className={`chart-canvas${onClick ? " is-interactive" : ""}`}
      ref={host}
      role="img"
      aria-label={ariaLabel}
    />
  );
}
